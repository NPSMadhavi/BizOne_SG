import { Router } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

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

  try {
    const [customer] = await db.insert(customersTable).values({
      companyId,
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
      quotationTerms: quotationTerms || null,
    }).returning();
    return res.status(201).json(customer);
  } catch (e: any) {
    console.error("[customers] create failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to create customer" });
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
