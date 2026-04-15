import { Router, type IRouter } from "express";
import { db, purchaseOrdersTable, quotationsTable, invoicesTable, deliveryOrdersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

router.get("/contacts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { type } = req.query;
  const companyId = req.session.companyId;

  if (type === "vendor") {
    const rows = companyId
      ? await db.select({
          name: purchaseOrdersTable.vendorName,
          address: purchaseOrdersTable.vendorAddress,
          contact: purchaseOrdersTable.vendorContact,
          email: (purchaseOrdersTable as any).vendorContactEmail,
          deliveryAddress: purchaseOrdersTable.deliveryAddress,
        }).from(purchaseOrdersTable)
          .where(eq(purchaseOrdersTable.companyId, companyId))
          .orderBy(desc(purchaseOrdersTable.id))
      : await db.select({
          name: purchaseOrdersTable.vendorName,
          address: purchaseOrdersTable.vendorAddress,
          contact: purchaseOrdersTable.vendorContact,
          email: (purchaseOrdersTable as any).vendorContactEmail,
          deliveryAddress: purchaseOrdersTable.deliveryAddress,
        }).from(purchaseOrdersTable)
          .orderBy(desc(purchaseOrdersTable.id));

    const seen = new Set<string>();
    const unique = rows.filter(r => {
      const key = (r.name || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json(unique);
    return;
  }

  if (type === "customer") {
    const [qtRows, invRows, doRows] = await Promise.all([
      companyId
        ? db.select({
            name: quotationsTable.customerName,
            address: quotationsTable.customerAddress,
            contact: quotationsTable.customerContact,
            email: (quotationsTable as any).customerContactEmail,
            deliveryAddress: quotationsTable.deliveryAddress,
          }).from(quotationsTable).where(eq(quotationsTable.companyId, companyId)).orderBy(desc(quotationsTable.id))
        : db.select({
            name: quotationsTable.customerName,
            address: quotationsTable.customerAddress,
            contact: quotationsTable.customerContact,
            email: (quotationsTable as any).customerContactEmail,
            deliveryAddress: quotationsTable.deliveryAddress,
          }).from(quotationsTable).orderBy(desc(quotationsTable.id)),

      companyId
        ? db.select({
            name: invoicesTable.customerName,
            address: invoicesTable.customerAddress,
            contact: invoicesTable.customerContact,
            email: (invoicesTable as any).customerContactEmail,
            deliveryAddress: invoicesTable.deliveryAddress,
          }).from(invoicesTable).where(eq(invoicesTable.companyId, companyId)).orderBy(desc(invoicesTable.id))
        : db.select({
            name: invoicesTable.customerName,
            address: invoicesTable.customerAddress,
            contact: invoicesTable.customerContact,
            email: (invoicesTable as any).customerContactEmail,
            deliveryAddress: invoicesTable.deliveryAddress,
          }).from(invoicesTable).orderBy(desc(invoicesTable.id)),

      companyId
        ? db.select({
            name: deliveryOrdersTable.customerName,
            address: deliveryOrdersTable.customerAddress,
            contact: deliveryOrdersTable.customerContact,
            email: sql<string | null>`null`.as("email"),
            deliveryAddress: sql<string | null>`null`.as("deliveryAddress"),
          }).from(deliveryOrdersTable).where(eq(deliveryOrdersTable.companyId, companyId)).orderBy(desc(deliveryOrdersTable.id))
        : db.select({
            name: deliveryOrdersTable.customerName,
            address: deliveryOrdersTable.customerAddress,
            contact: deliveryOrdersTable.customerContact,
            email: sql<string | null>`null`.as("email"),
            deliveryAddress: sql<string | null>`null`.as("deliveryAddress"),
          }).from(deliveryOrdersTable).orderBy(desc(deliveryOrdersTable.id)),
    ]);

    const all = [...qtRows, ...invRows, ...doRows];
    const seen = new Set<string>();
    const unique = all.filter(r => {
      const key = (r.name || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json(unique);
    return;
  }

  res.status(400).json({ error: "type must be 'vendor' or 'customer'" });
});

export default router;
