import { Router, type IRouter } from "express";
import express from "express";
import {
  db, invoicesTable, quotationsTable, customersTable, stockItemsTable,
  settingsTable, purchaseOrdersTable, vendorsTable, deliveryOrdersTable,
  vendorInvoicesTable, grnTable,
} from "@workspace/db";
import { eq, and, ilike, or, desc, SQL, gte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { nextDocNumber } from "../lib/running-numbers.js";

const router: IRouter = Router();
router.use(express.json({ limit: "50mb" }));

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected." }); return false; }
  return true;
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "searchCustomers",
      description: "Search the customer directory by name (partial or full — pass all words the user says). Returns address and contact details.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Name or partial name. Pass the FULL name as spoken, including spaces." } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchVendors",
      description: "Search the vendor/supplier directory by name (partial or full). Returns address, contact, GST info.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Name or partial name. Pass the FULL name as spoken." } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchQuotations",
      description: "Search quotations by QT number (e.g. QT-0042) or customer name.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getQuotation",
      description: "Get full details of a specific quotation including all line items, pricing, and terms.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchStockItems",
      description: "Search the product/service catalogue by name or part code.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchPurchaseOrders",
      description: "Search purchase orders by PO number or vendor/supplier name (partial ok). Returns a list.",
      parameters: { type: "object", properties: { query: { type: "string", description: "PO number or full/partial vendor name" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getPurchaseOrder",
      description: "Get full details of a specific purchase order. Use after searchPurchaseOrders.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchInvoices",
      description: "Search invoices by invoice number or customer name (partial ok).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getInvoice",
      description: "Get full details of a specific invoice including all line items, pricing, and status.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchDeliveryOrders",
      description: "Search delivery orders by DO number or customer name (partial ok).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getDeliveryOrder",
      description: "Get full details of a specific delivery order.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchVendorInvoices",
      description: "Search vendor/supplier invoices (AP) by PI number or vendor name (partial ok).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchGRN",
      description: "Search Goods Received Notes by GRN number, PO number, or vendor name.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getCompanySettings",
      description: "Get the current company GST/tax rate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getFinancialStats",
      description: "Get financial analytics for a period: invoice totals, paid/pending amounts, PO count, top customers by revenue. Always call this immediately when user asks about stats, revenue, figures, or performance.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["this-week", "this-month", "last-month", "this-quarter", "last-quarter", "this-year", "all-time"],
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigateTo",
      description: "Navigate the application to any page, module, document, or form. Use for 'open', 'show', 'go to', 'edit', 'preview', or 'take me to'. Also use to open edit forms for specific documents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "App route. Pages: /dashboard, /settings, /customers, /vendors, /stock, /grn, /vendor-invoices, /accounting, /expenses, /accounting/gst-f5. Document lists: /invoices, /quotations, /purchase-orders, /delivery-orders. New forms: /invoices/new, /quotations/new, /purchase-orders/new, /delivery-orders/new. View specific doc: /invoices/:id, /quotations/:id, /purchase-orders/:id, /delivery-orders/:id. Edit specific doc: /invoices/:id/edit, /quotations/:id/edit, /purchase-orders/:id/edit, /delivery-orders/:id/edit. Admin: /admin/users.",
          },
          prefill: {
            type: "object",
            description: "Form pre-fill data for /new pages. Shape: { customerName, customerAddress, customerContact, customerContactEmail, currency, paymentTerms, notes, items: [{description, partNumber, qty, unitPrice}] }",
          },
          reason: { type: "string", description: "Brief description shown while navigating, e.g. 'Opening new invoice for SP Systems'" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoice",
      description: "Create a new invoice draft via API. Fast path — use when user confirms. Prefer navigateTo for complex invoices with serials.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerAddress: { type: "string" },
          customerContact: { type: "string" },
          customerContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          paymentTerms: { type: "string" },
          deliveryDate: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          discountAmount: { type: "number" },
          gstRate: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string", description: "Item / Part Number (stock code). Always include when known." },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
          fromQuotationId: { type: "integer" },
        },
        required: ["customerName", "items", "currency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createQuotation",
      description: "Create a new quotation draft via API. Fast path — use when user confirms.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerAddress: { type: "string" },
          customerContact: { type: "string" },
          customerContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          paymentTerms: { type: "string" },
          deliveryDate: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          discountAmount: { type: "number" },
          gstRate: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string" },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
        },
        required: ["customerName", "items", "currency"],
      },
    },
  },
] as const;

function queryTokens(raw: string): string[] {
  const full = raw.trim();
  const words = full.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return [...new Set([full, ...words])].filter(s => s.length > 0);
}

function tokenOr(col: any, raw: string): SQL {
  const tokens = queryTokens(raw);
  const conds = tokens.map(t => ilike(col, `%${t}%`));
  return conds.length === 1 ? conds[0] : or(...conds) as SQL;
}

function periodStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "this-week": { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0,0,0,0); return d; }
    case "this-month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "last-month": return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "this-quarter": { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
    case "last-quarter": { const q = Math.floor(now.getMonth() / 3) - 1; const y = q < 0 ? now.getFullYear() - 1 : now.getFullYear(); return new Date(y, ((q + 4) % 4) * 3, 1); }
    case "this-year": return new Date(now.getFullYear(), 0, 1);
    default: return new Date(0);
  }
}

async function executeTool(name: string, args: any, companyId: number, userId: number): Promise<any> {
  switch (name) {

    case "searchCustomers": {
      const rows = await db.select({
        id: customersTable.id, name: customersTable.name, address: customersTable.address,
        contactPerson: customersTable.contactPerson, contactEmail: customersTable.contactEmail,
        country: customersTable.country, gstRegistered: customersTable.gstRegistered,
      }).from(customersTable).where(and(
        eq(customersTable.companyId, companyId),
        eq(customersTable.isActive, true),
        tokenOr(customersTable.name, args.query),
      )).limit(8);
      return rows.length > 0 ? rows : { message: "No customers found matching that name." };
    }

    case "searchVendors": {
      const rows = await db.select({
        id: vendorsTable.id, name: vendorsTable.name, address: vendorsTable.address,
        contactPerson: vendorsTable.contactPerson, contactEmail: vendorsTable.contactEmail,
        country: vendorsTable.country, gstRegistered: vendorsTable.gstRegistered, gstNo: vendorsTable.gstNo,
        phone: vendorsTable.phone, currency: vendorsTable.currency,
      }).from(vendorsTable).where(and(
        eq(vendorsTable.companyId, companyId),
        eq(vendorsTable.isActive, true),
        tokenOr(vendorsTable.name, args.query),
      )).limit(8);
      return rows.length > 0 ? rows : { message: "No vendors found matching that name." };
    }

    case "searchDeliveryOrders": {
      const rows = await db.select({
        id: deliveryOrdersTable.id, doNumber: deliveryOrdersTable.doNumber,
        customerName: deliveryOrdersTable.customerName, status: deliveryOrdersTable.status,
        deliveryDate: deliveryOrdersTable.deliveryDate, createdAt: deliveryOrdersTable.createdAt,
        invNumber: deliveryOrdersTable.invNumber,
      }).from(deliveryOrdersTable).where(and(
        eq(deliveryOrdersTable.companyId, companyId),
        or(tokenOr(deliveryOrdersTable.doNumber, args.query), tokenOr(deliveryOrdersTable.customerName, args.query)),
      )).orderBy(desc(deliveryOrdersTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No delivery orders found." };
    }

    case "getDeliveryOrder": {
      const [doc] = await db.select().from(deliveryOrdersTable)
        .where(and(eq(deliveryOrdersTable.companyId, companyId), eq(deliveryOrdersTable.id, args.id)));
      return doc ?? { error: "Delivery order not found" };
    }

    case "searchVendorInvoices": {
      const rows = await db.select({
        id: vendorInvoicesTable.id, piNumber: vendorInvoicesTable.piNumber,
        vendorName: vendorInvoicesTable.vendorName, status: vendorInvoicesTable.status,
        poNumbers: vendorInvoicesTable.poNumbers, currency: vendorInvoicesTable.currency,
        createdAt: vendorInvoicesTable.createdAt,
      }).from(vendorInvoicesTable).where(and(
        eq(vendorInvoicesTable.companyId, companyId),
        or(tokenOr(vendorInvoicesTable.piNumber, args.query), tokenOr(vendorInvoicesTable.vendorName, args.query)),
      )).orderBy(desc(vendorInvoicesTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No vendor invoices found." };
    }

    case "searchGRN": {
      const rows = await db.select({
        id: grnTable.id, grnNumber: grnTable.grnNumber,
        poNumber: grnTable.poNumber, vendorName: grnTable.vendorName,
        status: grnTable.status, createdAt: grnTable.createdAt,
      }).from(grnTable).where(and(
        eq(grnTable.companyId, companyId),
        or(
          tokenOr(grnTable.grnNumber, args.query),
          tokenOr(grnTable.poNumber, args.query),
          tokenOr(grnTable.vendorName, args.query),
        ),
      )).orderBy(desc(grnTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No GRN records found." };
    }

    case "searchQuotations": {
      const rows = await db.select({
        id: quotationsTable.id, qtNumber: quotationsTable.qtNumber,
        customerName: quotationsTable.customerName, status: quotationsTable.status,
        totalAmount: quotationsTable.totalAmount, currency: quotationsTable.currency,
        createdAt: quotationsTable.createdAt, subtotal: quotationsTable.subtotal,
        discountAmount: quotationsTable.discountAmount, tax: quotationsTable.tax,
        paymentTerms: quotationsTable.paymentTerms,
      }).from(quotationsTable).where(and(
        eq(quotationsTable.companyId, companyId),
        or(tokenOr(quotationsTable.qtNumber, args.query), tokenOr(quotationsTable.customerName, args.query)),
      )).orderBy(desc(quotationsTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No quotations found matching that search." };
    }

    case "getQuotation": {
      const [qt] = await db.select().from(quotationsTable)
        .where(and(eq(quotationsTable.companyId, companyId), eq(quotationsTable.id, args.id)));
      return qt ?? { error: "Quotation not found" };
    }

    case "searchStockItems": {
      const rows = await db.select({
        id: stockItemsTable.id, code: stockItemsTable.code, name: stockItemsTable.name,
        description: stockItemsTable.description, unitPrice: stockItemsTable.unitPrice,
        uom: stockItemsTable.uom, type: stockItemsTable.type, stockQty: stockItemsTable.stockQty,
      }).from(stockItemsTable).where(and(
        eq(stockItemsTable.companyId, companyId),
        eq(stockItemsTable.isActive, true),
        or(tokenOr(stockItemsTable.name, args.query), tokenOr(stockItemsTable.code, args.query)),
      )).limit(10);
      return rows.length > 0 ? rows : { message: "No stock items found matching that search." };
    }

    case "searchPurchaseOrders": {
      const rows = await db.select({
        id: purchaseOrdersTable.id, poNumber: purchaseOrdersTable.poNumber,
        vendorName: purchaseOrdersTable.vendorName, status: purchaseOrdersTable.status,
        totalAmount: purchaseOrdersTable.totalAmount, currency: purchaseOrdersTable.currency,
        createdAt: purchaseOrdersTable.createdAt,
      }).from(purchaseOrdersTable).where(and(
        eq(purchaseOrdersTable.companyId, companyId),
        or(tokenOr(purchaseOrdersTable.poNumber, args.query), tokenOr(purchaseOrdersTable.vendorName, args.query)),
      )).orderBy(desc(purchaseOrdersTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No purchase orders found." };
    }

    case "getPurchaseOrder": {
      const [po] = await db.select().from(purchaseOrdersTable)
        .where(and(eq(purchaseOrdersTable.companyId, companyId), eq(purchaseOrdersTable.id, args.id)));
      return po ?? { error: "Purchase order not found" };
    }

    case "searchInvoices": {
      const rows = await db.select({
        id: invoicesTable.id, invNumber: invoicesTable.invNumber,
        customerName: invoicesTable.customerName, status: invoicesTable.status,
        totalAmount: invoicesTable.totalAmount, currency: invoicesTable.currency,
        createdAt: invoicesTable.createdAt,
      }).from(invoicesTable).where(and(
        eq(invoicesTable.companyId, companyId),
        or(tokenOr(invoicesTable.invNumber, args.query), tokenOr(invoicesTable.customerName, args.query)),
      )).orderBy(desc(invoicesTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No invoices found matching that search." };
    }

    case "getInvoice": {
      const [inv] = await db.select().from(invoicesTable)
        .where(and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.id, args.id)));
      return inv ?? { error: "Invoice not found" };
    }

    case "getCompanySettings": {
      const [s] = await db.select({ gstRate: settingsTable.gstRate })
        .from(settingsTable).where(eq(settingsTable.companyId, companyId));
      return { gstRate: parseFloat(s?.gstRate ?? "9") };
    }

    case "getFinancialStats": {
      const start = periodStartDate(args.period || "this-month");
      const [invs, pos, qts] = await Promise.all([
        db.select().from(invoicesTable).where(and(eq(invoicesTable.companyId, companyId), gte(invoicesTable.createdAt, start))),
        db.select().from(purchaseOrdersTable).where(and(eq(purchaseOrdersTable.companyId, companyId), gte(purchaseOrdersTable.createdAt, start))),
        db.select().from(quotationsTable).where(and(eq(quotationsTable.companyId, companyId), gte(quotationsTable.createdAt, start))),
      ]);

      const nonVoid = invs.filter(i => i.status !== "void");
      const totalInvValue = nonVoid.reduce((s, i) => s + parseFloat(i.totalAmount), 0);
      const paidValue = invs.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount), 0);
      const pendingValue = invs.filter(i => i.status === "confirmed").reduce((s, i) => s + parseFloat(i.totalAmount), 0);

      const custMap: Record<string, number> = {};
      for (const inv of nonVoid) {
        custMap[inv.customerName] = (custMap[inv.customerName] || 0) + parseFloat(inv.totalAmount);
      }
      const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

      return {
        period: args.period,
        invoices: {
          total: invs.length, totalValue: Math.round(totalInvValue * 100) / 100,
          paid: invs.filter(i => i.status === "paid").length,
          confirmed: invs.filter(i => i.status === "confirmed").length,
          draft: invs.filter(i => i.status === "draft").length,
          void: invs.filter(i => i.status === "void").length,
          paidValue: Math.round(paidValue * 100) / 100,
          pendingValue: Math.round(pendingValue * 100) / 100,
        },
        purchaseOrders: {
          total: pos.length,
          totalValue: Math.round(pos.reduce((s, p) => s + parseFloat(p.totalAmount), 0) * 100) / 100,
          confirmed: pos.filter(p => p.status === "confirmed").length,
          draft: pos.filter(p => p.status === "draft").length,
        },
        quotations: {
          total: qts.length,
          confirmed: qts.filter(q => q.status === "confirmed").length,
          draft: qts.filter(q => q.status === "draft").length,
        },
        topCustomers,
      };
    }

    case "navigateTo": {
      return { _navigate: true, path: args.path, prefill: args.prefill || null, reason: args.reason || "" };
    }

    case "createInvoice": {
      const { items, gstRate = 0, discountAmount = 0, fromQuotationId, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxAmount = (subtotal - discAmt) * (Number(gstRate) / 100);
      const totalAmount = (subtotal - discAmt) + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const invNumber = await nextDocNumber("inv", companyId);
      const [inv] = await db.insert(invoicesTable).values({
        companyId, invNumber, status: "draft", createdBy: userId,
        items: items as any,
        subtotal: subtotal.toFixed(2), discountAmount: discAmt.toFixed(2),
        tax: taxAmount.toFixed(2), totalAmount: totalAmount.toFixed(2),
        issueDate: issueDate ?? today,
        ...(fromQuotationId ? { salesQuoteRefNo: String(fromQuotationId) } : {}),
        ...rest,
      }).returning();
      return { success: true, invoice: { id: inv.id, invNumber: inv.invNumber, customerName: inv.customerName, totalAmount: inv.totalAmount, currency: inv.currency, status: inv.status } };
    }

    case "createQuotation": {
      const { items, gstRate = 0, discountAmount = 0, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxAmount = (subtotal - discAmt) * (Number(gstRate) / 100);
      const totalAmount = (subtotal - discAmt) + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const qtNumber = await nextDocNumber("qt", companyId);
      const [qt] = await db.insert(quotationsTable).values({
        companyId, qtNumber, status: "draft", createdBy: userId,
        items: items as any,
        subtotal: subtotal.toFixed(2), discountAmount: discAmt.toFixed(2),
        tax: taxAmount.toFixed(2), totalAmount: totalAmount.toFixed(2),
        issueDate: issueDate ?? today,
        ...rest,
      }).returning();
      return { success: true, quotation: { id: qt.id, qtNumber: qt.qtNumber, customerName: qt.customerName, totalAmount: qt.totalAmount, currency: qt.currency, status: qt.status } };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

router.post("/agent/chat", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { messages, memory } = req.body;

  if (!Array.isArray(messages)) { res.status(400).json({ error: "messages must be an array" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const today = new Date().toISOString().split("T")[0];
  const memoryBlock = Array.isArray(memory) && memory.length > 0
    ? `\n\nRecent session memory (use to understand user preferences and context):\n${memory.map((m: any) => `• ${m}`).join("\n")}`
    : "";

  const systemPrompt = `You are Maya, the AI assistant for RSV Infotech's document management system. You're sharp, warm, and speak like a knowledgeable colleague — not a chatbot. You know this business inside out and you take action immediately.

## Your capabilities (full app access)
- CREATE invoices and quotations via API (fast path)
- NAVIGATE to any page, module, form, or document — including edit forms (/invoices/:id/edit), view pages, accounting, admin
- SEARCH & RETRIEVE from every module: customers, vendors, quotations, purchase orders, invoices, delivery orders, vendor invoices (AP), GRN, stock items
- SHOW financial statistics and analytics
- ANSWER anything about documents, vendors, customers, or orders — always look it up first, never guess

## Core rules — follow these exactly

### Always search before answering
- User mentions a vendor → searchVendors immediately (pass all words as spoken)
- User mentions a customer → searchCustomers immediately
- User asks about a PO → searchPurchaseOrders → getPurchaseOrder → navigateTo /purchase-orders/:id
- User asks about an invoice → searchInvoices → getInvoice → navigateTo /invoices/:id
- User asks about a quotation → searchQuotations → getQuotation → navigateTo /quotations/:id
- User asks about a DO or delivery order → searchDeliveryOrders → getDeliveryOrder → navigateTo /delivery-orders/:id
- User asks about a vendor/supplier invoice or PI → searchVendorInvoices
- User asks about GRN or goods received → searchGRN
- Stats question → getFinancialStats immediately
- Never ask "what's the PO/invoice/DO number?" — search for it yourself
- "Open", "show", "take me to", "edit" X → navigate directly to the right path

### Name matching — critical
- Always pass the FULL name exactly as the user says it (including spaces): "Micro United Network" not just "Micro"
- The search is fuzzy and matches partial names — pass as many words as the user gives
- If voice input gives you "SP Systems" pass "SP Systems" exactly — do not shorten or abbreviate
- If first search returns nothing, try a shorter subset of words from the name

### Opening specific documents
When a user asks "what was the last PO for Westcon?" or "show me the SP SYSNET invoice":
1. Search for it
2. Get the full record (getPurchaseOrder / getInvoice)
3. Navigate to it: navigateTo with path=/purchase-orders/{id} (real id number)
4. Then summarise it conversationally: vendor, date, amount, status, key items

### Creating documents
- Use createInvoice / createQuotation (API) for simple/fast creation
- Use navigateTo with prefill for complex docs or when user wants to review the form
- Before creating: give ONE compact summary. Ask "Shall I go ahead?"
- Any affirmative (yes, ok, sure, do it, go ahead) → act immediately, no second confirmation
- After creation: state the document number, offer to open or email it

### Writing item descriptions
- Keep each description concise and professional — max 2 short lines
- Never pad descriptions unnecessarily
- If the user gives a long description, distil it to the essential product/service name + key spec
- Good: "Cisco ISR 1100 8-Port Router" — Bad: "This is a Cisco brand ISR 1100 series router with 8 ports for WAN"

### Stats
- Format with totals, counts, collection rate (paid/total %). Use bullets. Be conversational.

### Style
- Sound like a smart, friendly accountant colleague — warm but efficient
- Short sentences. Bullets only for lists of 3+. No markdown headers. No code blocks.
- For voice replies: keep it to 2-3 sentences max — it will be spoken aloud
- Never say "Certainly!" or "Of course!" — just get to the point

Today: ${today}.${memoryBlock}`;

  const chatMessages: any[] = [{ role: "system", content: systemPrompt }, ...messages];

  try {
    for (let iteration = 0; iteration < 10; iteration++) {
      const stream = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 8192,
        messages: chatMessages,
        tools: AGENT_TOOLS as any,
        stream: true,
      });

      let fullContent = "";
      const toolCalls: any[] = [];
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

        if (delta?.content) {
          fullContent += delta.content;
          res.write(`data: ${JSON.stringify({ type: "text", content: delta.content })}\n\n`);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCalls[tc.index].id += tc.id;
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }

      if (toolCalls.length === 0) break;

      for (const tc of toolCalls) {
        res.write(`data: ${JSON.stringify({ type: "tool_call", name: tc.function.name })}\n\n`);
      }

      chatMessages.push({ role: "assistant", content: fullContent || null, tool_calls: toolCalls });

      for (const tc of toolCalls) {
        let toolResult: any;
        try {
          const args = JSON.parse(tc.function.arguments);
          toolResult = await executeTool(tc.function.name, args, companyId, userId);
        } catch (e: any) {
          toolResult = { error: e.message };
        }

        if (toolResult && toolResult._navigate) {
          res.write(`data: ${JSON.stringify({
            type: "navigate",
            path: toolResult.path,
            prefill: toolResult.prefill || null,
            reason: toolResult.reason || "",
          })}\n\n`);
          toolResult = { navigated: true, path: toolResult.path };
        }

        chatMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
      }
    }
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

router.post("/agent/transcribe", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { audio } = req.body;
  if (!audio) { res.status(400).json({ error: "audio (base64) is required" }); return; }
  try {
    const buffer = Buffer.from(audio, "base64");
    const { buffer: compatBuffer, format } = await ensureCompatibleFormat(buffer);
    const transcript = await speechToText(compatBuffer, format as any);
    res.json({ text: transcript });
  } catch (e: any) {
    req.log?.error({ err: e }, "Transcription failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/agent/speak", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { text } = req.body;
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  try {
    const cleanText = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "")
      .replace(/`/g, "").replace(/•\s*/g, "").trim().slice(0, 4096);
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: cleanText,
    } as any);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.json({ audio: buffer.toString("base64") });
  } catch (e: any) {
    req.log?.error({ err: e }, "TTS failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
