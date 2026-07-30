import { Router } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/customers", async (req, res) => {
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });
  try {
    const customers = await db.select().from(customersTable)
      .where(eq(customersTable.companyId, companyId))
      .orderBy(customersTable.name);
    return res.json(customers);
  } catch {
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.post("/customers", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const { name, address, postalCode, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, currency, shipToAddress, quotationTerms } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

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
      gstRegistered: Boolean(gstRegistered),
      gstNo: gstRegistered && gstNo ? gstNo : null,
      shipToAddress: shipToAddress || null,
      quotationTerms: quotationTerms || null,
    } as any).returning();
    return res.status(201).json(customer);
  } catch {
    return res.status(500).json({ error: "Failed to create customer" });
  }
});

router.put("/customers/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  const { name, address, postalCode, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, isActive, currency, shipToAddress, quotationTerms } = req.body;

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
      gstRegistered: Boolean(gstRegistered),
      gstNo: gstRegistered && gstNo ? gstNo : null,
      shipToAddress: shipToAddress || null,
      quotationTerms: quotationTerms !== undefined ? (quotationTerms || null) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    } as any).where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId))).returning();

    if (!customer) return res.status(404).json({ error: "Customer not found" });
    return res.json(customer);
  } catch {
    return res.status(500).json({ error: "Failed to update customer" });
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
