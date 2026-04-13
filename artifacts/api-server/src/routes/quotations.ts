import { Router, type IRouter } from "express";
import { db, quotationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
  }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected. Please select a company first." });
    return false;
  }
  return true;
}

function generateQtNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `QT-${year}${month}-${random}`;
}

function parseDoc(doc: any) {
  return {
    ...doc,
    subtotal: parseFloat(doc.subtotal ?? "0"),
    tax: parseFloat(doc.tax ?? "0"),
    totalAmount: parseFloat(doc.totalAmount ?? "0"),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

router.get("/quotations/stats", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const all = companyId
    ? await db.select().from(quotationsTable).where(eq(quotationsTable.companyId, companyId))
    : await db.select().from(quotationsTable);
  res.json({
    total: all.length,
    confirmed: all.filter(x => x.status === "confirmed").length,
    draft: all.filter(x => x.status === "draft").length,
    cancelled: all.filter(x => x.status === "cancelled").length,
    totalValue: all.reduce((s, x) => s + parseFloat(x.totalAmount ?? "0"), 0),
  });
});

router.get("/quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = req.session.companyId;
  const docs = companyId
    ? await db.select().from(quotationsTable).where(eq(quotationsTable.companyId, companyId)).orderBy(desc(quotationsTable.createdAt))
    : await db.select().from(quotationsTable).orderBy(desc(quotationsTable.createdAt));
  res.json(docs.map(parseDoc));
});

router.post("/quotations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const { customerName, customerAddress, customerContact, customerContactEmail, deliveryAddress, deliveryDate, paymentTerms, notes, items, tax, currency } = req.body;
  if (!customerName || !items) { res.status(400).json({ error: "customerName and items are required" }); return; }

  const subtotal = (items as any[]).reduce((s: number, item: any) => s + parseFloat(item.amount || "0"), 0);
  const taxAmt = typeof tax === "number" ? (subtotal * tax) / 100 : 0;
  const totalAmount = subtotal + taxAmt;

  let qtNumber = generateQtNumber();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select().from(quotationsTable).where(eq(quotationsTable.qtNumber, qtNumber));
    if (existing.length === 0) break;
    qtNumber = generateQtNumber();
    attempts++;
  }

  const [doc] = await db.insert(quotationsTable).values({
    qtNumber, companyId: req.session.companyId!, customerName, customerAddress, customerContact,
    customerContactEmail, deliveryAddress, deliveryDate, paymentTerms, notes, items,
    currency: currency || "SGD",
    subtotal: subtotal.toFixed(2), tax: taxAmt.toFixed(2),
    totalAmount: totalAmount.toFixed(2), status: "draft", createdBy: req.session.userId!,
  }).returning();
  res.status(201).json(parseDoc(doc));
});

router.get("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Quotation not found" }); return; }
  res.json(parseDoc(doc));
});

router.put("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  const { customerName, customerAddress, customerContact, customerContactEmail, deliveryAddress, deliveryDate, paymentTerms, notes, items, tax, status, currency } = req.body;

  const subtotal = (items as any[]).reduce((s: number, item: any) => s + parseFloat(item.amount || "0"), 0);
  const taxAmt = typeof tax === "number" ? (subtotal * tax) / 100 : 0;
  const totalAmount = subtotal + taxAmt;

  const [updated] = await db.update(quotationsTable).set({
    customerName, customerAddress, customerContact, customerContactEmail, deliveryAddress, deliveryDate, paymentTerms, notes, items,
    ...(currency ? { currency } : {}),
    subtotal: subtotal.toFixed(2), tax: taxAmt.toFixed(2), totalAmount: totalAmount.toFixed(2),
    ...(status ? { status } : {}),
  }).where(eq(quotationsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Quotation not found" }); return; }
  res.json(parseDoc(updated));
});

router.delete("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  await db.delete(quotationsTable).where(eq(quotationsTable.id, id));
  res.json({ success: true });
});

export default router;
