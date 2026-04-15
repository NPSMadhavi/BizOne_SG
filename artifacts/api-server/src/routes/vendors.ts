import { Router } from "express";
import { db, vendorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/vendors", async (req, res) => {
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });
  try {
    const vendors = await db.select().from(vendorsTable)
      .where(eq(vendorsTable.companyId, companyId))
      .orderBy(vendorsTable.name);
    res.json(vendors);
  } catch {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/vendors", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const { name, address, country, contactPerson, contactEmail, phone, gstRegistered, gstNo } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const [vendor] = await db.insert(vendorsTable).values({
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
    res.status(201).json(vendor);
  } catch {
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

router.put("/vendors/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  const { name, address, country, contactPerson, contactEmail, phone, gstRegistered, gstNo, isActive } = req.body;

  try {
    const [vendor] = await db.update(vendorsTable).set({
      name,
      address: address || null,
      country: country || null,
      contactPerson: contactPerson || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      gstRegistered: Boolean(gstRegistered),
      gstNo: gstRegistered && gstNo ? gstNo : null,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    }).where(and(eq(vendorsTable.id, id), eq(vendorsTable.companyId, companyId))).returning();

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  } catch {
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.delete("/vendors/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const id = parseInt(req.params.id);
  try {
    await db.delete(vendorsTable).where(and(eq(vendorsTable.id, id), eq(vendorsTable.companyId, companyId)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

export default router;
