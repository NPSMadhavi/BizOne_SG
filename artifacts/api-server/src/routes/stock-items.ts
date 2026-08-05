import { Router, type IRouter } from "express";
import { db, stockItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { nextDocNumber } from "../lib/running-numbers.js";

const router: IRouter = Router();

router.get("/stock-items", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const search = typeof req.query.search === "string" ? req.query.search : "";
  const typeFilter = typeof req.query.type === "string" ? req.query.type : "";

  let items = await db.select().from(stockItemsTable)
    .where(eq(stockItemsTable.companyId, companyId))
    .orderBy(stockItemsTable.code);

  if (search) {
    const lower = search.toLowerCase();
    items = items.filter(i =>
      i.code.toLowerCase().includes(lower) ||
      i.name.toLowerCase().includes(lower) ||
      (i.description || "").toLowerCase().includes(lower)
    );
  }

  if (typeFilter === "product" || typeFilter === "service") {
    items = items.filter(i => i.type === typeFilter);
  }

  res.json(items);
});

router.post("/stock-items", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return; }

  const { code, name, description, uom, type, unitPrice, stockQty } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const resolvedCode = (typeof code === "string" && code.trim())
    ? code.trim()
    : await nextDocNumber("si", companyId);

  const [item] = await db.insert(stockItemsTable).values({
    companyId,
    code: resolvedCode,
    name,
    description: description || null,
    uom: uom || "pcs",
    type: type === "service" ? "service" : "product",
    unitPrice: unitPrice != null ? String(unitPrice) : "0",
    stockQty: stockQty != null ? String(stockQty) : "0",
    isActive: true,
  }).returning();

  res.status(201).json(item);
});

router.get("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.put("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { code, name, description, uom, type, unitPrice, stockQty, isActive } = req.body;
  const update: Record<string, any> = {};
  if (code !== undefined) update.code = code;
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description || null;
  if (uom !== undefined) update.uom = uom;
  if (type !== undefined) update.type = type === "service" ? "service" : "product";
  if (unitPrice !== undefined) update.unitPrice = String(unitPrice);
  if (stockQty !== undefined) update.stockQty = String(stockQty);
  if (isActive !== undefined) update.isActive = Boolean(isActive);

  const [updated] = await db.update(stockItemsTable).set(update).where(eq(stockItemsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/stock-items/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(stockItemsTable).where(eq(stockItemsTable.id, id));
  res.json({ success: true });
});

export default router;
