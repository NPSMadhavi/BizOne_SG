import { Router, type IRouter } from "express";
import { db, purchaseOrdersTable, usersTable } from "@workspace/db";
import { eq, count, sum, desc } from "drizzle-orm";
import {
  CreatePurchaseOrderBody,
  UpdatePurchaseOrderBody,
  GetPurchaseOrderParams,
  DeletePurchaseOrderParams,
  UpdatePurchaseOrderParams,
} from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function generatePoNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `PO-${year}${month}-${random}`;
}

function parsePO(po: any) {
  return {
    ...po,
    subtotal: parseFloat(po.subtotal ?? "0"),
    tax: parseFloat(po.tax ?? "0"),
    totalAmount: parseFloat(po.totalAmount ?? "0"),
    createdAt: po.createdAt instanceof Date ? po.createdAt.toISOString() : po.createdAt,
  };
}

router.get("/purchase-orders/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const allPOs = await db.select().from(purchaseOrdersTable);
  const total = allPOs.length;
  const confirmed = allPOs.filter(p => p.status === "confirmed").length;
  const draft = allPOs.filter(p => p.status === "draft").length;
  const cancelled = allPOs.filter(p => p.status === "cancelled").length;
  const totalValue = allPOs.reduce((sum, p) => sum + parseFloat(p.totalAmount ?? "0"), 0);

  res.json({ total, confirmed, draft, cancelled, totalValue });
});

router.get("/purchase-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const pos = await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));
  res.json(pos.map(parsePO));
});

router.post("/purchase-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, tax = 0, ...rest } = parsed.data;

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.qty * item.unitPrice), 0);
  const taxAmount = (subtotal * (tax as number)) / 100;
  const totalAmount = subtotal + taxAmount;

  const itemsWithAmounts = items.map((item: any) => ({
    ...item,
    amount: item.qty * item.unitPrice,
  }));

  let poNumber = generatePoNumber();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.poNumber, poNumber));
    if (existing.length === 0) break;
    poNumber = generatePoNumber();
    attempts++;
  }

  const [po] = await db
    .insert(purchaseOrdersTable)
    .values({
      poNumber,
      ...rest,
      items: itemsWithAmounts,
      subtotal: subtotal.toFixed(2),
      tax: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      status: "confirmed",
      createdBy: req.session.userId!,
    })
    .returning();

  res.status(201).json(parsePO(po));
});

router.put("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = UpdatePurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (existing.length === 0) {
    res.status(404).json({ error: "Purchase order not found" });
    return;
  }

  const { items, tax = 0, status, ...rest } = parsed.data;

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.qty * item.unitPrice), 0);
  const taxAmount = (subtotal * (tax as number)) / 100;
  const totalAmount = subtotal + taxAmount;

  const itemsWithAmounts = items.map((item: any) => ({
    ...item,
    amount: item.qty * item.unitPrice,
  }));

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set({
      ...rest,
      items: itemsWithAmounts,
      subtotal: subtotal.toFixed(2),
      tax: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      ...(status ? { status } : {}),
    })
    .where(eq(purchaseOrdersTable.id, params.data.id))
    .returning();

  res.json(parsePO(updated));
});

router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetPurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (!po) {
    res.status(404).json({ error: "Purchase order not found" });
    return;
  }

  res.json(parsePO(po));
});

router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = DeletePurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [po] = await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id)).returning();
  if (!po) {
    res.status(404).json({ error: "Purchase order not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
