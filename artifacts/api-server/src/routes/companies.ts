import { Router, type IRouter } from "express";
import { db, companiesTable, userCompaniesTable, usersTable, settingsTable, financialYearsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getUserCompanies } from "./auth";
import { loginPasswordMatches } from "../lib/login-password.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
  }
}

const router: IRouter = Router();

export const COMPANIES_SEED = [
  {
    id: 1,
    name: "RSV Infotech Pte Ltd",
    country: "SG",
    address: "#07-52, 10 UBI Crescent, UBI Techpark Lobby C, Singapore 408564",
    registrationNo: "200812581D",
    email: "info@rsvinfotech.com",
    phone: "+65 6123 4567",
  },
  {
    id: 2,
    name: "Netopsys Pte Ltd",
    country: "SG",
    address: "#07-52, 10 UBI Crescent, UBI Techpark Lobby C, Singapore 408564",
    registrationNo: "202119506K",
    email: "info@netopsys.com",
    phone: "+65 6234 5678",
  },
  {
    id: 3,
    name: "Netopsys AI Pvt Ltd",
    country: "IN",
    address: "Door No 39-6-36, Madhavadhara Main Road, Visakhapatnam - 530007",
    registrationNo: "U72900HR2023PTC400123",
    email: "info@netopsys.ai",
    phone: "+91 98765 43210",
  },
];

export async function seedCompanies() {
  for (const company of COMPANIES_SEED) {
    const existing = await db.select().from(companiesTable).where(eq(companiesTable.id, company.id));
    if (existing.length === 0) {
      await db.insert(companiesTable).values(company);
    }
  }
}

router.post("/companies", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const { name, country, address, phone, email, registrationNo, adminPassword } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Company name is required" }); return; }
  if (!country?.trim()) { res.status(400).json({ error: "Country is required" }); return; }
  if (!adminPassword) { res.status(400).json({ error: "Password confirmation is required" }); return; }

  const passwordOk = await loginPasswordMatches(user.id, adminPassword);
  if (!passwordOk) { res.status(401).json({ error: "Incorrect password. Please try again." }); return; }

  try {
    const [created] = await db.insert(companiesTable).values({
      name: name.trim(),
      country: country.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      registrationNo: registrationNo?.trim() || null,
    }).returning();

    // Auto-assign the creating user to the new company
    await db.insert(userCompaniesTable).values({ userId: user.id, companyId: created.id }).onConflictDoNothing();

    // Initialise default settings for the new company
    const defaultGst = country.trim() === "IN" ? "18" : "9";
    await db.insert(settingsTable).values({
      companyId: created.id,
      gstRate: defaultGst,
      poPrefix: "PO", poCounter: 1, poSuffix: "",
      invPrefix: "INV", invCounter: 1, invSuffix: "",
      qtPrefix: "QT", qtCounter: 1, qtSuffix: "",
      doPrefix: "DO", doCounter: 1, doSuffix: "",
      grnPrefix: "GRN", grnCounter: 1, grnSuffix: "",
    });

    res.status(201).json(created);
  } catch (err: any) {
    req.log.error({ err }, "POST /companies failed");
    res.status(500).json({ error: err?.message || "Failed to create company" });
  }
});

router.delete("/companies/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const accessible = await getUserCompanies(req.session.userId);
  if (!accessible.some((company) => company.id === id)) {
    res.status(403).json({ error: "You can only change your own company" });
    return;
  }

  const [existing] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Company not found" }); return; }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) { res.status(400).json({ error: "Password is required" }); return; }
  const passwordOk = await loginPasswordMatches(req.session.userId, password);
  if (!passwordOk) { res.status(401).json({ error: "Incorrect password" }); return; }

  // Clean related rows that may not cascade (settings has no FK)
  await db.delete(settingsTable).where(eq(settingsTable.companyId, id));
  await db.delete(userCompaniesTable).where(eq(userCompaniesTable.companyId, id));

  const [deleted] = await db.delete(companiesTable).where(eq(companiesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Company not found" }); return; }

  if (req.session.companyId === id) {
    req.session.companyId = undefined;
  }

  res.json({ success: true, name: deleted.name });
});

router.put("/companies/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const accessible = await getUserCompanies(req.session.userId);
  if (!accessible.some((company) => company.id === id)) {
    res.status(403).json({ error: "You can only change your own company" });
    return;
  }

  const { name, address, phone, email, registrationNo, gstRegNo, logoUrl } = req.body;
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (address !== undefined) updateData.address = address;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (registrationNo !== undefined) updateData.registrationNo = registrationNo;
  if (gstRegNo !== undefined) updateData.gstRegNo = gstRegNo || null;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl || null;

  const [updated] = await db.update(companiesTable).set(updateData).where(eq(companiesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(updated);
});

router.get("/companies", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const companies = await getUserCompanies(req.session.userId);
  const ids = companies.map((company) => company.id);
  const years = ids.length
    ? await db.select().from(financialYearsTable).where(inArray(financialYearsTable.companyId, ids))
    : [];
  res.json(companies.map(({ modules: _modules, ...company }) => {
    const companyYears = years.filter((year) => year.companyId === company.id);
    const active = companyYears.find((year) => year.status === "active")
      ?? [...companyYears].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return {
      ...company,
      financialYear: active
        ? { label: active.label, startDate: active.startDate, endDate: active.endDate }
        : null,
    };
  }));
});

export default router;
