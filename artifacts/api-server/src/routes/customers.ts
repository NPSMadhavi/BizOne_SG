import { Router } from "express";
import { db, customersTable, pool } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function pgDetail(err: unknown): string {
  const e = err as { cause?: { detail?: string; message?: string; code?: string }; detail?: string; message?: string };
  return String(e?.cause?.detail || e?.detail || e?.cause?.message || e?.message || "");
}

async function ensureCompanyStub(companyId: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO companies (id, name, country)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [companyId, `Company ${companyId}`, "Singapore"],
    );
  } catch {
    // Older schemas / missing table — ignore; insert will surface the real error.
  }
}

router.get("/customers", async (req, res) => {
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });
  try {
    const customers = await db.select().from(customersTable)
      .where(eq(customersTable.companyId, companyId))
      .orderBy(desc(customersTable.createdAt), desc(customersTable.id));
    return res.json(customers);
  } catch (e: any) {
    console.error("[customers] list failed:", e?.message || e);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.post("/customers", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const { name, address, postalCode, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, currency, shipToAddress, quotationTerms, creditLimitEnabled, creditLimit } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const limitEnabled = creditLimitEnabled === true || creditLimitEnabled === "true" || creditLimitEnabled === 1 || creditLimitEnabled === "1";
  const gstOn = gstRegistered === true || gstRegistered === "true" || gstRegistered === 1 || gstRegistered === "1";
  const parsedLimit = limitEnabled && creditLimit != null && creditLimit !== ""
    ? Number(creditLimit)
    : null;
  const creditLimitValue = parsedLimit != null && Number.isFinite(parsedLimit) && parsedLimit >= 0
    ? String(parsedLimit)
    : null;

  const values = {
    companyId,
    name: String(name).trim(),
    address: address ? String(address).trim() || null : null,
    postalCode: postalCode ? String(postalCode).trim() || null : null,
    country: country ? String(country).trim() || null : null,
    contactPerson: contactPerson ? String(contactPerson).trim() || null : null,
    contactEmail: contactEmail ? String(contactEmail).trim() || null : null,
    phone: phone ? String(phone).trim() || null : null,
    currency: currency ? String(currency).trim() || null : null,
    gstRegistered: gstOn,
    gstNo: gstOn && gstNo && String(gstNo).trim() ? String(gstNo).trim() : null,
    creditLimitEnabled: limitEnabled,
    creditLimit: creditLimitValue,
    shipToAddress: shipToAddress ? String(shipToAddress).trim() || null : null,
    quotationTerms: quotationTerms ? String(quotationTerms).trim() || null : null,
  };

  try {
    const [customer] = await db.insert(customersTable).values(values).returning();
    return res.status(201).json(customer);
  } catch (e: any) {
    const detail = pgDetail(e);
    const msg = String(e?.message || "Failed to create customer");
    console.error("[customers] create failed:", msg, detail);

    // Missing company stub / FK — heal once and retry.
    if (/foreign key|company_id|23503/i.test(`${msg} ${detail}`)) {
      try {
        await ensureCompanyStub(companyId);
        const [customer] = await db.insert(customersTable).values(values).returning();
        return res.status(201).json(customer);
      } catch (retryErr: any) {
        console.error("[customers] create retry failed:", retryErr?.message || retryErr, pgDetail(retryErr));
        return res.status(500).json({
          error: "Company database is out of sync. Log out, sign in again, then retry creating the customer.",
        });
      }
    }

    if (/credit_limit|invalid input syntax|22P02/i.test(`${msg} ${detail}`)) {
      return res.status(400).json({ error: "Invalid credit limit value." });
    }
    if (/does not exist|42703/i.test(`${msg} ${detail}`)) {
      return res.status(500).json({
        error: "Customer table is missing columns. Restart the API server so company database schema can heal, then retry.",
      });
    }

    // Prefer Postgres detail over raw "Failed query: ..." dump
    const friendly = detail && !/^Failed query:/i.test(detail) ? detail : msg;
    return res.status(500).json({
      error: /^Failed query:/i.test(friendly)
        ? "Failed to create customer. Check company database and try again."
        : friendly,
    });
  }
});

router.put("/customers/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  const { name, address, postalCode, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, isActive, currency, shipToAddress, quotationTerms, creditLimitEnabled, creditLimit } = req.body;

  const limitEnabled = creditLimitEnabled === true || creditLimitEnabled === "true" || creditLimitEnabled === 1 || creditLimitEnabled === "1";
  const gstOn = gstRegistered === true || gstRegistered === "true" || gstRegistered === 1 || gstRegistered === "1";
  const parsedLimit = limitEnabled && creditLimit != null && creditLimit !== ""
    ? Number(creditLimit)
    : null;
  const creditLimitValue = parsedLimit != null && Number.isFinite(parsedLimit) && parsedLimit >= 0
    ? String(parsedLimit)
    : null;

  try {
    const [customer] = await db.update(customersTable).set({
      name,
      address: address || null,
      postalCode: postalCode || null,
      country: country || null,
      contactPerson: contactPerson || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      currency: currency || null,
      gstRegistered: gstOn,
      gstNo: gstOn && gstNo ? String(gstNo) : null,
      creditLimitEnabled: limitEnabled,
      creditLimit: creditLimitValue,
      shipToAddress: shipToAddress || null,
      quotationTerms: quotationTerms !== undefined ? (quotationTerms || null) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    }).where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId))).returning();

    if (!customer) return res.status(404).json({ error: "Customer not found" });
    return res.json(customer);
  } catch (e: any) {
    console.error("[customers] update failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to update customer" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  try {
    await db.delete(customersTable).where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
