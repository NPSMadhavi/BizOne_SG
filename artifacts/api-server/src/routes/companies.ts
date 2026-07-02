import { Router, type IRouter } from "express";
import { db, companiesTable, userCompaniesTable, usersTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

  const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  for (const admin of adminUsers) {
    for (const company of COMPANIES_SEED) {
      const existing = await db
        .select()
        .from(userCompaniesTable)
        .where(eq(userCompaniesTable.userId, admin.id));
      const hasCompany = existing.some(uc => uc.companyId === company.id);
      if (!hasCompany) {
        await db.insert(userCompaniesTable).values({ userId: admin.id, companyId: company.id });
      }
    }
  }
}

router.post("/companies", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const { name, country, address, phone, email, registrationNo } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Company name is required" }); return; }
  if (!country?.trim()) { res.status(400).json({ error: "Country is required" }); return; }

  try {
    const [created] = await db.insert(companiesTable).values({
      name: name.trim(),
      country: country.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      registrationNo: registrationNo?.trim() || null,
    }).returning();

    // Auto-assign all admin users to the new company
    const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(userCompaniesTable).values({ userId: admin.id, companyId: created.id });
    }

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

  const [deleted] = await db.delete(companiesTable).where(eq(companiesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Company not found" }); return; }
  res.json({ success: true });
});

router.put("/companies/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { name, address, phone, email, registrationNo } = req.body;
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (address !== undefined) updateData.address = address;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (registrationNo !== undefined) updateData.registrationNo = registrationNo;

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

  if (user.role === "admin") {
    const companies = await db.select().from(companiesTable);
    res.json(companies);
    return;
  }

  const userCompanies = await db
    .select({ company: companiesTable })
    .from(userCompaniesTable)
    .innerJoin(companiesTable, eq(userCompaniesTable.companyId, companiesTable.id))
    .where(eq(userCompaniesTable.userId, req.session.userId));

  res.json(userCompanies.map(uc => uc.company));
});

export default router;
