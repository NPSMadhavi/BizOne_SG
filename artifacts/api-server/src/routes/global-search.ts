import { Router, type IRouter } from "express";
import {
  db,
  invoicesTable,
  quotationsTable,
  salesOrdersTable,
  purchaseOrdersTable,
  purchaseQuotationsTable,
  vendorInvoicesTable,
  deliveryOrdersTable,
  grnTable,
  creditNotesTable,
  debitNotesTable,
  customersTable,
  vendorsTable,
  stockItemsTable,
  projectsTable,
} from "@workspace/db";
import { eq, and, or, ilike, desc, SQL } from "drizzle-orm";

const router: IRouter = Router();

export type SearchResult = {
  type: string;
  category: string;
  id: number | string;
  title: string;
  subtitle?: string;
  href: string;
  status?: string | null;
};

function requireAuth(req: any, res: any): boolean {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function requireCompany(req: any, res: any): number | null {
  const companyId = req.session?.companyId;
  if (!companyId) {
    res.status(400).json({ error: "No company selected" });
    return null;
  }
  return companyId;
}

function like(col: any, q: string): SQL {
  return ilike(col, `%${q}%`);
}

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

router.get("/search", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const companyId = requireCompany(req, res);
  if (!companyId) return;

  const q = String(req.query.q || "").trim();
  if (q.length < 1) {
    res.json({ results: [] });
    return;
  }
  if (q.length > 100) {
    res.status(400).json({ error: "Query too long" });
    return;
  }

  const limit = 5;

  const [
    invoices,
    quotations,
    salesOrders,
    purchaseOrders,
    purchaseQuotations,
    vendorInvoices,
    deliveryOrders,
    grns,
    creditNotes,
    debitNotes,
    customers,
    vendors,
    stockItems,
    projects,
  ] = await Promise.all([
    safe(() =>
      db
        .select({
          id: invoicesTable.id,
          number: invoicesTable.invNumber,
          party: invoicesTable.customerName,
          status: invoicesTable.status,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            or(like(invoicesTable.invNumber, q), like(invoicesTable.customerName, q)),
          ),
        )
        .orderBy(desc(invoicesTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: quotationsTable.id,
          number: quotationsTable.qtNumber,
          party: quotationsTable.customerName,
          status: quotationsTable.status,
        })
        .from(quotationsTable)
        .where(
          and(
            eq(quotationsTable.companyId, companyId),
            or(like(quotationsTable.qtNumber, q), like(quotationsTable.customerName, q)),
          ),
        )
        .orderBy(desc(quotationsTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: salesOrdersTable.id,
          number: salesOrdersTable.soNumber,
          party: salesOrdersTable.customerName,
          status: salesOrdersTable.status,
        })
        .from(salesOrdersTable)
        .where(
          and(
            eq(salesOrdersTable.companyId, companyId),
            or(like(salesOrdersTable.soNumber, q), like(salesOrdersTable.customerName, q)),
          ),
        )
        .orderBy(desc(salesOrdersTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: purchaseOrdersTable.id,
          number: purchaseOrdersTable.poNumber,
          party: purchaseOrdersTable.vendorName,
          status: purchaseOrdersTable.status,
        })
        .from(purchaseOrdersTable)
        .where(
          and(
            eq(purchaseOrdersTable.companyId, companyId),
            or(like(purchaseOrdersTable.poNumber, q), like(purchaseOrdersTable.vendorName, q)),
          ),
        )
        .orderBy(desc(purchaseOrdersTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: purchaseQuotationsTable.id,
          number: purchaseQuotationsTable.pqNumber,
          party: purchaseQuotationsTable.vendorName,
          status: purchaseQuotationsTable.status,
        })
        .from(purchaseQuotationsTable)
        .where(
          and(
            eq(purchaseQuotationsTable.companyId, companyId),
            or(like(purchaseQuotationsTable.pqNumber, q), like(purchaseQuotationsTable.vendorName, q)),
          ),
        )
        .orderBy(desc(purchaseQuotationsTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: vendorInvoicesTable.id,
          number: vendorInvoicesTable.piNumber,
          party: vendorInvoicesTable.vendorName,
          status: vendorInvoicesTable.status,
        })
        .from(vendorInvoicesTable)
        .where(
          and(
            eq(vendorInvoicesTable.companyId, companyId),
            or(like(vendorInvoicesTable.piNumber, q), like(vendorInvoicesTable.vendorName, q)),
          ),
        )
        .orderBy(desc(vendorInvoicesTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: deliveryOrdersTable.id,
          number: deliveryOrdersTable.doNumber,
          party: deliveryOrdersTable.customerName,
          status: deliveryOrdersTable.status,
        })
        .from(deliveryOrdersTable)
        .where(
          and(
            eq(deliveryOrdersTable.companyId, companyId),
            or(like(deliveryOrdersTable.doNumber, q), like(deliveryOrdersTable.customerName, q)),
          ),
        )
        .orderBy(desc(deliveryOrdersTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: grnTable.id,
          number: grnTable.grnNumber,
          party: grnTable.vendorName,
          status: grnTable.status,
        })
        .from(grnTable)
        .where(
          and(
            eq(grnTable.companyId, companyId),
            or(like(grnTable.grnNumber, q), like(grnTable.vendorName, q), like(grnTable.poNumber, q)),
          ),
        )
        .orderBy(desc(grnTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: creditNotesTable.id,
          number: creditNotesTable.cnNumber,
          party: creditNotesTable.customerName,
          status: creditNotesTable.status,
        })
        .from(creditNotesTable)
        .where(
          and(
            eq(creditNotesTable.companyId, companyId),
            or(like(creditNotesTable.cnNumber, q), like(creditNotesTable.customerName, q)),
          ),
        )
        .orderBy(desc(creditNotesTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: debitNotesTable.id,
          number: debitNotesTable.dnNumber,
          party: debitNotesTable.customerName,
          status: debitNotesTable.status,
        })
        .from(debitNotesTable)
        .where(
          and(
            eq(debitNotesTable.companyId, companyId),
            or(like(debitNotesTable.dnNumber, q), like(debitNotesTable.customerName, q)),
          ),
        )
        .orderBy(desc(debitNotesTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: customersTable.id,
          name: customersTable.name,
          contact: customersTable.contactPerson,
        })
        .from(customersTable)
        .where(and(eq(customersTable.companyId, companyId), like(customersTable.name, q)))
        .orderBy(desc(customersTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: vendorsTable.id,
          name: vendorsTable.name,
          contact: vendorsTable.contactPerson,
        })
        .from(vendorsTable)
        .where(and(eq(vendorsTable.companyId, companyId), like(vendorsTable.name, q)))
        .orderBy(desc(vendorsTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: stockItemsTable.id,
          code: stockItemsTable.code,
          name: stockItemsTable.name,
        })
        .from(stockItemsTable)
        .where(
          and(
            eq(stockItemsTable.companyId, companyId),
            or(like(stockItemsTable.code, q), like(stockItemsTable.name, q)),
          ),
        )
        .orderBy(desc(stockItemsTable.createdAt))
        .limit(limit),
    ),
    safe(() =>
      db
        .select({
          id: projectsTable.id,
          name: projectsTable.name,
          code: projectsTable.code,
        })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.companyId, companyId),
            or(like(projectsTable.name, q), like(projectsTable.code, q)),
          ),
        )
        .orderBy(desc(projectsTable.createdAt))
        .limit(limit),
    ),
  ]);

  const results: SearchResult[] = [];

  for (const r of invoices) {
    results.push({
      type: "invoice",
      category: "Sales",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/invoices/${r.id}`,
      status: r.status,
    });
  }
  for (const r of quotations) {
    results.push({
      type: "quotation",
      category: "Sales",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/quotations/${r.id}`,
      status: r.status,
    });
  }
  for (const r of salesOrders) {
    results.push({
      type: "sales_order",
      category: "Sales",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/sales-orders/${r.id}`,
      status: r.status,
    });
  }
  for (const r of deliveryOrders) {
    results.push({
      type: "delivery_order",
      category: "Sales",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/delivery-orders/${r.id}`,
      status: r.status,
    });
  }
  for (const r of creditNotes) {
    results.push({
      type: "credit_note",
      category: "Sales",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/credit-notes/${r.id}`,
      status: r.status,
    });
  }
  for (const r of purchaseOrders) {
    results.push({
      type: "purchase_order",
      category: "Purchases",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/purchase-orders/${r.id}`,
      status: r.status,
    });
  }
  for (const r of purchaseQuotations) {
    results.push({
      type: "purchase_quotation",
      category: "Purchases",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/purchase-quotations/${r.id}`,
      status: r.status,
    });
  }
  for (const r of vendorInvoices) {
    results.push({
      type: "vendor_invoice",
      category: "Purchases",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/vendor-invoices/${r.id}`,
      status: r.status,
    });
  }
  for (const r of grns) {
    results.push({
      type: "grn",
      category: "Purchases",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/grn/${r.id}`,
      status: r.status,
    });
  }
  for (const r of debitNotes) {
    results.push({
      type: "debit_note",
      category: "Purchases",
      id: r.id,
      title: r.number,
      subtitle: r.party,
      href: `/debit-notes/${r.id}`,
      status: r.status,
    });
  }
  for (const r of customers) {
    results.push({
      type: "customer",
      category: "Directory",
      id: r.id,
      title: r.name,
      subtitle: r.contact || "Customer",
      href: `/customers?q=${encodeURIComponent(r.name)}`,
    });
  }
  for (const r of vendors) {
    results.push({
      type: "vendor",
      category: "Directory",
      id: r.id,
      title: r.name,
      subtitle: r.contact || "Vendor",
      href: `/vendors?q=${encodeURIComponent(r.name)}`,
    });
  }
  for (const r of stockItems) {
    results.push({
      type: "stock_item",
      category: "Inventory",
      id: r.id,
      title: r.code,
      subtitle: r.name,
      href: `/stock/${r.id}/edit`,
    });
  }
  for (const r of projects) {
    results.push({
      type: "project",
      category: "Projects",
      id: r.id,
      title: r.code || r.name,
      subtitle: r.code ? r.name : "Project",
      href: `/projects/${r.id}`,
    });
  }

  res.json({ results });
});

export default router;
