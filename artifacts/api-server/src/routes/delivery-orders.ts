import { Router, type IRouter } from "express";
import { db, deliveryOrdersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

declare module "express-session" {
  interface SessionData { userId?: number; }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function generateDoNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `DO-${year}${month}-${random}`;
}

function parseDoc(doc: any) {
  return {
    ...doc,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

router.get("/delivery-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const docs = await db.select().from(deliveryOrdersTable).orderBy(desc(deliveryOrdersTable.createdAt));
  res.json(docs.map(parseDoc));
});

router.post("/delivery-orders", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { customerName, customerAddress, customerContact, deliveryDate, notes, items } = req.body;
  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  let doNumber = generateDoNumber();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.doNumber, doNumber));
    if (existing.length === 0) break;
    doNumber = generateDoNumber();
    attempts++;
  }

  const [doc] = await db.insert(deliveryOrdersTable).values({
    doNumber, customerName, customerAddress, customerContact, deliveryDate,
    notes, items, status: "draft", createdBy: req.session.userId!,
  }).returning();
  res.status(201).json(parseDoc(doc));
});

router.get("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const [doc] = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  if (!doc) { res.status(404).json({ error: "Delivery order not found" }); return; }
  res.json(parseDoc(doc));
});

router.put("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const { customerName, customerAddress, customerContact, deliveryDate, notes, items, status } = req.body;

  const [updated] = await db.update(deliveryOrdersTable).set({
    customerName, customerAddress, customerContact, deliveryDate, notes, items,
    ...(status ? { status } : {}),
  }).where(eq(deliveryOrdersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Delivery order not found" }); return; }
  res.json(parseDoc(updated));
});

router.delete("/delivery-orders/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  await db.delete(deliveryOrdersTable).where(eq(deliveryOrdersTable.id, id));
  res.json({ success: true });
});

export default router;
