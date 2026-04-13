import { Router, type IRouter } from "express";
import { db, companiesTable, userCompaniesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
    country: "Singapore",
    address: "63 Ubi Avenue 1, #08-01, Singapore 408937",
    registrationNo: "201929506R",
    email: "info@rsvinfotech.com",
    phone: "+65 6123 4567",
  },
  {
    id: 2,
    name: "Netopsys Pte Ltd",
    country: "Singapore",
    address: "63 Ubi Avenue 1, #08-01, Singapore 408937",
    registrationNo: "202119506K",
    email: "info@netopsys.com",
    phone: "+65 6234 5678",
  },
  {
    id: 3,
    name: "Netopsys AI Pvt Ltd",
    country: "India",
    address: "12th Floor, DLF Cyber City, Gurugram, Haryana 122002",
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
