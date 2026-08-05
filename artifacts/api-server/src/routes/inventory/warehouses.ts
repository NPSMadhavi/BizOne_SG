import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  warehousesTable,
  openingStockTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  goodsIssuesTable,
  goodsIssueItemsTable,
  stockTransfersTable,
  stockTransferItemsTable,
  stockAdjustmentsTable,
  stockMovementsTable,
  stockItemsTable,
  warehouseStockTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { logAudit } from "../../lib/audit";
import {
  applyMovement,
  ensureDefaultWarehouse,
  itemHasTransactions,
  warehouseHasStock,
} from "../../lib/inventory-service";

const router: IRouter = Router();

function requireSession(req: Request, res: Response): { companyId: number; userId: number; username?: string } | null {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return null; }
  return { companyId, userId: req.session.userId, username: req.session.username };
}

// ─── Warehouses ───────────────────────────────────────────────────────────────

router.get("/warehouses", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  // Always ensure Main Warehouse exists so pickers can show it
  await ensureDefaultWarehouse(ctx.companyId);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  let rows = await db.select().from(warehousesTable)
    .where(eq(warehousesTable.companyId, ctx.companyId))
    .orderBy(warehousesTable.code);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

router.post("/warehouses", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { code, name, description, address, city, state, pinCode, country, contactPerson, contactNumber, email, remarks, isDefault, isActive } = req.body;
  if (!code?.trim() || !name?.trim()) { res.status(400).json({ error: "Code and name are required" }); return; }

  const existing = await db.select({ id: warehousesTable.id }).from(warehousesTable)
    .where(and(eq(warehousesTable.companyId, ctx.companyId), eq(warehousesTable.code, code.trim())));
  if (existing.length) { res.status(409).json({ error: "Warehouse code already exists" }); return; }

  try {
    const [wh] = await db.transaction(async (tx) => {
      if (isDefault) {
        await tx.update(warehousesTable).set({ isDefault: false })
          .where(eq(warehousesTable.companyId, ctx.companyId));
      }
      return tx.insert(warehousesTable).values({
        companyId: ctx.companyId,
        code: code.trim(),
        name: name.trim(),
        description: description || null,
        address: address || null,
        city: city || null,
        state: state || null,
        pinCode: pinCode || null,
        country: country || null,
        contactPerson: contactPerson || null,
        contactNumber: contactNumber || null,
        email: email || null,
        remarks: remarks || null,
        isDefault: Boolean(isDefault),
        isActive: isActive !== false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();
    });
    logAudit({ req, action: "create", entityType: "warehouse", entityId: wh.id, entityLabel: wh.name });
    res.status(201).json(wh);
  } catch {
    res.status(500).json({ error: "Failed to create warehouse" });
  }
});

router.put("/warehouses/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { code, name, description, address, city, state, pinCode, country, contactPerson, contactNumber, email, remarks, isDefault, isActive } = req.body;
  try {
    const [updated] = await db.transaction(async (tx) => {
      if (isDefault) {
        await tx.update(warehousesTable).set({ isDefault: false })
          .where(eq(warehousesTable.companyId, ctx.companyId));
      }
      return tx.update(warehousesTable).set({
        code: code?.trim(),
        name: name?.trim(),
        description: description ?? undefined,
        address: address ?? undefined,
        city: city ?? undefined,
        state: state ?? undefined,
        pinCode: pinCode ?? undefined,
        country: country ?? undefined,
        contactPerson: contactPerson ?? undefined,
        contactNumber: contactNumber ?? undefined,
        email: email ?? undefined,
        remarks: remarks ?? undefined,
        isDefault: isDefault !== undefined ? Boolean(isDefault) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      }).where(and(eq(warehousesTable.id, id), eq(warehousesTable.companyId, ctx.companyId))).returning();
    });
    if (!updated) { res.status(404).json({ error: "Warehouse not found" }); return; }
    logAudit({ req, action: "update", entityType: "warehouse", entityId: id, entityLabel: updated.name });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update warehouse" });
  }
});

router.delete("/warehouses/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const hasStock = await warehouseHasStock(db, id);
  if (hasStock) { res.status(409).json({ error: "Cannot delete warehouse with existing stock" }); return; }

  await db.delete(warehousesTable).where(and(eq(warehousesTable.id, id), eq(warehousesTable.companyId, ctx.companyId)));
  logAudit({ req, action: "delete", entityType: "warehouse", entityId: id });
  res.json({ success: true });
});

// ─── Opening Stock ────────────────────────────────────────────────────────────

router.get("/opening-stock", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const rows = await db.select({
    id: openingStockTable.id,
    warehouseId: openingStockTable.warehouseId,
    stockItemId: openingStockTable.stockItemId,
    quantity: openingStockTable.quantity,
    unitCost: openingStockTable.unitCost,
    entryDate: openingStockTable.entryDate,
    remarks: openingStockTable.remarks,
    warehouseName: warehousesTable.name,
    warehouseCode: warehousesTable.code,
    itemCode: stockItemsTable.code,
    itemName: stockItemsTable.name,
  })
    .from(openingStockTable)
    .innerJoin(warehousesTable, eq(openingStockTable.warehouseId, warehousesTable.id))
    .innerJoin(stockItemsTable, eq(openingStockTable.stockItemId, stockItemsTable.id))
    .where(eq(openingStockTable.companyId, ctx.companyId))
    .orderBy(desc(openingStockTable.entryDate));
  res.json(rows);
});

router.post("/opening-stock", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const { warehouseId, stockItemId, quantity, unitCost, entryDate, remarks } = req.body;
  const qty = Number(quantity);
  if (!warehouseId || !stockItemId || !qty || qty <= 0) {
    res.status(400).json({ error: "Warehouse, item and positive quantity are required" });
    return;
  }

  try {
    const record = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: openingStockTable.id }).from(openingStockTable)
        .where(and(eq(openingStockTable.warehouseId, warehouseId), eq(openingStockTable.stockItemId, stockItemId)));
      if (existing) throw new Error("Opening stock already exists for this item in this warehouse");

      const [row] = await tx.insert(openingStockTable).values({
        companyId: ctx.companyId,
        warehouseId,
        stockItemId,
        quantity: String(qty),
        unitCost: String(unitCost ?? 0),
        entryDate: entryDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      }).returning();

      await applyMovement(tx, {
        companyId: ctx.companyId,
        warehouseId,
        stockItemId,
        transactionType: "opening_stock",
        documentNumber: `OS-${row.id}`,
        referenceType: "opening_stock",
        referenceId: row.id,
        quantityIn: qty,
        reference: remarks,
        userId: ctx.userId,
        username: ctx.username,
        movementDate: new Date(entryDate || Date.now()),
      });

      return row;
    });
    logAudit({ req, action: "create", entityType: "opening_stock", entityId: record.id });
    res.status(201).json(record);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Failed to create opening stock" });
  }
});

router.put("/opening-stock/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const id = parseInt(req.params.id);
  const { quantity, unitCost, entryDate, remarks } = req.body;

  const [existing] = await db.select().from(openingStockTable)
    .where(and(eq(openingStockTable.id, id), eq(openingStockTable.companyId, ctx.companyId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const hasOther = await db.select({ id: stockMovementsTable.id }).from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.stockItemId, existing.stockItemId),
      eq(stockMovementsTable.warehouseId, existing.warehouseId),
      sql`${stockMovementsTable.referenceType} != 'opening_stock'`,
    )).limit(1);
  if (hasOther.length) { res.status(409).json({ error: "Cannot edit opening stock after other transactions exist" }); return; }

  res.status(409).json({ error: "Delete and recreate opening stock to change quantity" });
});

router.delete("/opening-stock/:id", async (req, res) => {
  const ctx = requireSession(req, res); if (!ctx) return;
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(openingStockTable)
    .where(and(eq(openingStockTable.id, id), eq(openingStockTable.companyId, ctx.companyId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const hasOther = await db.select({ id: stockMovementsTable.id }).from(stockMovementsTable)
    .where(and(
      eq(stockMovementsTable.stockItemId, existing.stockItemId),
      eq(stockMovementsTable.warehouseId, existing.warehouseId),
      sql`${stockMovementsTable.referenceType} != 'opening_stock'`,
    )).limit(1);
  if (hasOther.length) { res.status(409).json({ error: "Cannot delete opening stock after other transactions exist" }); return; }

  await db.transaction(async (tx) => {
    await applyMovement(tx, {
      companyId: ctx.companyId,
      warehouseId: existing.warehouseId,
      stockItemId: existing.stockItemId,
      transactionType: "adjustment_out",
      documentNumber: `OS-DEL-${id}`,
      referenceType: "opening_stock",
      referenceId: id,
      quantityOut: Number(existing.quantity),
      reference: "Opening stock deleted",
      userId: ctx.userId,
      username: ctx.username,
    });
    await tx.delete(openingStockTable).where(eq(openingStockTable.id, id));
  });
  res.json({ success: true });
});

export default router;
