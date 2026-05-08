import { Router, type IRouter } from "express";
import express from "express";
import {
  db, invoicesTable, quotationsTable, customersTable, stockItemsTable,
  settingsTable, purchaseOrdersTable,
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
      description: "Search the customer directory by name (partial, fuzzy). Returns address and contact details.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
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
      description: "Search purchase orders by PO number or vendor name.",
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
      description: "Navigate the application to a specific module or page, and optionally pre-fill a form. Use when the user says 'go to', 'open', 'take me to', 'show me', or when creating a complex document with serials/many items that are better handled in the UI form.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "App route: /dashboard, /invoices, /invoices/new, /quotations, /quotations/new, /purchase-orders, /purchase-orders/new, /delivery-orders, /delivery-orders/new, /stock, /grn, /settings, /vendor-invoices, /customers, /vendors",
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
                itemPartNumber: { type: "string" },
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

  const systemPrompt = `You are Aria, an intelligent AI assistant embedded in RSV Infotech's document management system. You think and act like a highly capable senior staff member — autonomous, decisive, and deeply familiar with the business.

## Your full capabilities
- CREATE invoices and quotations via API (fast, direct)
- NAVIGATE the application to any module and pre-fill forms (for complex documents)
- SEARCH customers, quotations, purchase orders, and stock items
- SHOW financial statistics (revenue, paid/pending, top customers, PO totals)
- ANSWER questions about any document, customer, or order

## How to behave
### Act first, search first — never ask for info you can find
1. Customer mentioned → immediately searchCustomers. Never ask for their address.
2. Quotation referenced → searchQuotations + getQuotation. Never ask what's in it.
3. Stats question → getFinancialStats immediately. Map natural language: "this quarter" → this-quarter, "last month" → last-month, "YTD" or "this year" → this-year.
4. Stock item mentioned → searchStockItems immediately.
5. If something isn't found, proceed with what was given — don't ask the user to re-enter it.

### Decide: API creation vs form navigation
- Use createInvoice / createQuotation (API) when: simple items, creating from a quotation, user just wants it done fast.
- Use navigateTo with prefill when: user says "open form", "fill in", "take me to", "go to invoices", or the document has serial numbers.
- Default to API creation for speed.

### One confirmation, then act
6. Before createInvoice or createQuotation: ONE compact summary (customer, items with qty×price, subtotal, GST%, total, currency). Ask "Shall I create this?"
7. Any affirmative reply (yes, ok, sure, yep, do it, go, proceed, create it) → call the tool immediately. Never ask twice.
8. After creation: state the document number and offer to open or email it.

### Stats and analytics
9. When presenting stats, format them clearly with totals, counts, and top customers. Use simple bullets. Calculate revenue collection rate (paid/total) and highlight it.

### Navigation
10. After navigateTo, tell the user what you've done and what's been pre-filled.

### Style
11. Be concise. Short sentences. Bullet points for lists. No markdown headers. No code blocks.
12. When you don't know something, look it up — don't guess.

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
    const response = await openai.chat.completions.create({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: "nova", format: "mp3" },
      messages: [
        { role: "system", content: "Speak the following text naturally and clearly. Do not add commentary — speak only what is given." },
        { role: "user", content: cleanText },
      ],
    } as any);
    const audioData = ((response.choices[0]?.message as any)?.audio?.data) ?? "";
    res.json({ audio: Buffer.from(audioData, "base64").toString("base64") });
  } catch (e: any) {
    req.log?.error({ err: e }, "TTS failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
