import { Router, type IRouter } from "express";
import express from "express";
import { db, invoicesTable, quotationsTable, customersTable, stockItemsTable, settingsTable } from "@workspace/db";
import { eq, and, ilike, or, desc } from "drizzle-orm";
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
    content: `You are Aria, a proactive and efficient AI invoice assistant for RSV Infotech's document management system. Your job is to get things done — search, gather data, and create invoices with minimal back-and-forth.

## Capabilities
- Create invoices from existing quotations (all items, pricing, customer details auto-imported)
- Create standalone invoices with custom items
- Search the customer directory, quotations list, and stock catalogue
- Apply discounts and calculate GST/tax automatically

## Rules

### Always act first, ask less
1. When the user mentions a customer name, IMMEDIATELY call searchCustomers to look them up. Do not ask the user to type in address or contact info — find it yourself.
2. When creating from a quotation, IMMEDIATELY call searchQuotations then getQuotation. Never ask the user to describe what's in the quotation.
3. Call getCompanySettings early to get the correct GST rate.
4. If searchCustomers returns no results, proceed with whatever name the user gave and leave address/contact blank — do NOT ask the user to fill in a template.
5. Gather ALL needed info using tools first. Only ask the user for something if it is absolutely impossible to proceed without it (e.g. item descriptions for a standalone invoice with no stock items mentioned).

### Confirmation before creating
6. Before calling createInvoice, present ONE clear summary and ask "Shall I create this invoice?" — include: customer, items (description · qty × price), subtotal, GST, total, currency.
7. If the user says yes/ok/sure/go ahead/create it or any affirmative, call createInvoice immediately. Do not ask again.

### After creation
8. After createInvoice succeeds, report the invoice number and offer to open it or email it.

### Formatting
9. Use plain text with simple bullet points (•) for lists. Do not use markdown headers or code blocks.
10. Keep responses short and scannable.

Today's date: ${today}.`,
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
    // Use the dedicated TTS API (tts-1-hd) for natural, non-robotic speech.
    // Strip markdown symbols that would be read aloud literally.
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/`/g, "")
      .replace(/•\s*/g, "")
      .trim()
      .slice(0, 4096);

    // Use gpt-audio via chat completions (the /audio/speech REST endpoint
    // is not available through the Replit AI proxy).
    const response = await openai.chat.completions.create({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: "nova", format: "mp3" },
      messages: [
        {
          role: "system",
          content:
            "You are a natural-sounding voice assistant. Speak the user's message naturally and clearly. Do not add any words, preamble, or commentary — speak only what is given to you.",
        },
        { role: "user", content: cleanText },
      ],
    } as any);

    const audioData = ((response.choices[0]?.message as any)?.audio?.data) ?? "";
    const audioBuffer = Buffer.from(audioData, "base64");
    res.json({ audio: audioBuffer.toString("base64") });
  } catch (e: any) {
    req.log?.error({ err: e }, "TTS failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
