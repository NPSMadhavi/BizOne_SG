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
    res.json(customers);
  } catch {
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.post("/customers", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const { name, address, country, contactPerson, contactEmail, phone, gstRegistered, gstNo } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const [customer] = await db.insert(customersTable).values({
      companyId,
      name,
      address: address || null,
      country: country || null,
      contactPerson: contactPerson || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      gstRegistered: Boolean(gstRegistered),
      gstNo: gstRegistered && gstNo ? gstNo : null,
    }).returning();
    res.status(201).json(customer);
  } catch {
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.put("/customers/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  const { name, address, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, isActive } = req.body;

  try {
    const [customer] = await db.update(customersTable).set({
      name,
      address: address || null,
      country: country || null,
      contactPerson: contactPerson || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      gstRegistered: Boolean(gstRegistered),
      gstNo: gstRegistered && gstNo ? gstNo : null,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    }).where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId))).returning();

    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch {
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  try {
    await db.delete(customersTable).where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
