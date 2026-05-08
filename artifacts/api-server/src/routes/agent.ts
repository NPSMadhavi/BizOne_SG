import { Router, type IRouter } from "express";
import express from "express";
import { db, invoicesTable, quotationsTable, customersTable, stockItemsTable, settingsTable } from "@workspace/db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { textToSpeech, speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { nextDocNumber } from "../lib/running-numbers.js";

const router: IRouter = Router();

router.use(express.json({ limit: "50mb" }));

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

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "searchCustomers",
      description: "Search the customer directory by name. Returns up to 5 matching customers with their address and contact details.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Customer name or partial name to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchQuotations",
      description: "Search quotations by quotation number (e.g. QT-0042) or by customer name. Returns up to 5 matches with basic details.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Quotation number (e.g. QT-0042) or customer name" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getQuotation",
      description: "Retrieve full details of a specific quotation including all line items, pricing, customer info, and payment terms. Use the numeric ID from searchQuotations results.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The numeric quotation ID (from searchQuotations result)" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchStockItems",
      description: "Search the product/service catalogue by name or part code. Returns items with unit prices.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product name or part number to search" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCompanySettings",
      description: "Get the current company settings including GST/tax rate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoice",
      description: "Create a new invoice as a draft. IMPORTANT: Only call this after the user has explicitly confirmed. Always present a clear summary first and ask 'Shall I create this invoice?' before calling this tool.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Customer company or person name" },
          customerAddress: { type: "string", description: "Customer billing address" },
          customerContact: { type: "string", description: "Contact person name" },
          customerContactEmail: { type: "string", description: "Customer email address" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"], description: "Invoice currency" },
          paymentTerms: { type: "string", description: "e.g. Net 30, COD, Advance" },
          deliveryDate: { type: "string", description: "Expected delivery date (YYYY-MM-DD)" },
          issueDate: { type: "string", description: "Invoice date (YYYY-MM-DD), defaults to today" },
          notes: { type: "string", description: "Additional notes or remarks" },
          discountAmount: { type: "number", description: "Flat discount amount in the invoice currency" },
          gstRate: { type: "number", description: "GST/tax percentage rate (e.g. 9 for 9%)" },
          items: {
            type: "array",
            description: "Line items for the invoice",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                itemPartNumber: { type: "string" },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number", description: "qty * unitPrice" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
          fromQuotationId: { type: "integer", description: "Source quotation ID if creating from a quotation" },
        },
        required: ["customerName", "items", "currency"],
      },
    },
  },
] as const;

async function executeTool(name: string, args: any, companyId: number, userId: number): Promise<any> {
  switch (name) {
    case "searchCustomers": {
      const rows = await db
        .select({
          id: customersTable.id,
          name: customersTable.name,
          address: customersTable.address,
          contactPerson: customersTable.contactPerson,
          contactEmail: customersTable.contactEmail,
          country: customersTable.country,
          gstRegistered: customersTable.gstRegistered,
        })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.companyId, companyId),
            ilike(customersTable.name, `%${args.query}%`),
            eq(customersTable.isActive, true),
          ),
        )
        .limit(5);
      return rows.length > 0 ? rows : { message: "No customers found matching that name." };
    }

    case "searchQuotations": {
      const rows = await db
        .select({
          id: quotationsTable.id,
          qtNumber: quotationsTable.qtNumber,
          customerName: quotationsTable.customerName,
          status: quotationsTable.status,
          totalAmount: quotationsTable.totalAmount,
          currency: quotationsTable.currency,
          createdAt: quotationsTable.createdAt,
          subtotal: quotationsTable.subtotal,
          discountAmount: quotationsTable.discountAmount,
          tax: quotationsTable.tax,
          paymentTerms: quotationsTable.paymentTerms,
        })
        .from(quotationsTable)
        .where(
          and(
            eq(quotationsTable.companyId, companyId),
            or(
              ilike(quotationsTable.qtNumber, `%${args.query}%`),
              ilike(quotationsTable.customerName, `%${args.query}%`),
            ),
          ),
        )
        .orderBy(desc(quotationsTable.createdAt))
        .limit(5);
      return rows.length > 0 ? rows : { message: "No quotations found matching that search." };
    }

    case "getQuotation": {
      const [qt] = await db
        .select()
        .from(quotationsTable)
        .where(and(eq(quotationsTable.companyId, companyId), eq(quotationsTable.id, args.id)));
      return qt ?? { error: "Quotation not found" };
    }

    case "searchStockItems": {
      const rows = await db
        .select({
          id: stockItemsTable.id,
          code: stockItemsTable.code,
          name: stockItemsTable.name,
          description: stockItemsTable.description,
          unitPrice: stockItemsTable.unitPrice,
          uom: stockItemsTable.uom,
          type: stockItemsTable.type,
          stockQty: stockItemsTable.stockQty,
        })
        .from(stockItemsTable)
        .where(
          and(
            eq(stockItemsTable.companyId, companyId),
            eq(stockItemsTable.isActive, true),
            or(
              ilike(stockItemsTable.name, `%${args.query}%`),
              ilike(stockItemsTable.code, `%${args.query}%`),
            ),
          ),
        )
        .limit(10);
      return rows.length > 0 ? rows : { message: "No stock items found matching that search." };
    }

    case "getCompanySettings": {
      const [settings] = await db
        .select({ gstRate: settingsTable.gstRate })
        .from(settingsTable)
        .where(eq(settingsTable.companyId, companyId));
      return { gstRate: parseFloat(settings?.gstRate ?? "9") };
    }

    case "createInvoice": {
      const { items, gstRate = 0, discountAmount = 0, fromQuotationId, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxableAmount = subtotal - discAmt;
      const taxAmount = taxableAmount * (Number(gstRate) / 100);
      const totalAmount = taxableAmount + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const invNumber = await nextDocNumber("invoice", companyId);
      const [inv] = await db
        .insert(invoicesTable)
        .values({
          companyId,
          invNumber,
          status: "draft",
          createdBy: userId,
          items: items as any,
          subtotal: subtotal.toFixed(2),
          discountAmount: discAmt.toFixed(2),
          tax: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          issueDate: issueDate ?? today,
          ...(fromQuotationId ? { salesQuoteRefNo: String(fromQuotationId) } : {}),
          ...rest,
        })
        .returning();
      return {
        success: true,
        invoice: {
          id: inv.id,
          invNumber: inv.invNumber,
          customerName: inv.customerName,
          totalAmount: inv.totalAmount,
          currency: inv.currency,
          status: inv.status,
        },
      };
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
  const { messages } = req.body;

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "messages must be an array" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const today = new Date().toISOString().split("T")[0];
  const systemMessage = {
    role: "system" as const,
    content: `You are Aria, a friendly and highly capable AI invoice assistant for RSV Infotech's document management system. You help users create invoices, search customers, look up quotations, and find products.

Your capabilities:
- Create invoices from existing quotations (import all items, pricing, and customer details automatically)
- Create standalone invoices with custom items and pricing
- Search customers, quotations, and stock items
- Apply discounts and calculate GST/tax automatically

Rules you must follow:
1. ALWAYS confirm with the user before calling createInvoice. Present a clear, formatted summary of what you will create (customer, items with qty/price, subtotal, discount if any, tax, total, currency) and ask "Shall I create this invoice?"
2. When creating from a quotation, first call searchQuotations to find it, then getQuotation for full details.
3. Always use the correct GST rate from getCompanySettings unless the user specifies otherwise.
4. Be warm, concise, and professional. Use bullet points or numbered lists for item lists.
5. After creating an invoice, always mention the invoice number and offer to open it or send it by email.
6. If you can't find a customer or quotation, say so clearly and ask the user to clarify.
7. Today's date: ${today}.`,
  };

  const chatMessages: any[] = [systemMessage, ...messages];

  try {
    for (let iteration = 0; iteration < 8; iteration++) {
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

      chatMessages.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        let toolResult: any;
        try {
          const args = JSON.parse(tc.function.arguments);
          toolResult = await executeTool(tc.function.name, args, companyId, userId);
        } catch (e: any) {
          toolResult = { error: e.message };
        }
        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
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
  if (!audio) {
    res.status(400).json({ error: "audio (base64) is required" });
    return;
  }

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
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const audioBuffer = await textToSpeech(text, "nova");
    res.json({ audio: audioBuffer.toString("base64") });
  } catch (e: any) {
    req.log?.error({ err: e }, "TTS failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
