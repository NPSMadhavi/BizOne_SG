import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for an IT services company.
The user will describe an invoice in natural language. Extract structured invoice data and return ONLY valid JSON with no markdown, no code fences, and no explanations.

Return a JSON object with exactly this structure:
{
  "customerName": "string",
  "customerAddress": "string",
  "customerContact": "string",
  "customerContactEmail": "string",
  "currency": "SGD",
  "paymentTerms": "30 Days Net",
  "notes": "string",
  "discountAmount": 0,
  "items": [
    {
      "description": "string",
      "qty": 1,
      "unitPrice": 0,
      "uom": "",
      "partNumber": ""
    }
  ]
}

Rules:
- currency: must be one of SGD, USD, EUR, GBP, MYR, INR (default SGD if not mentioned)
- paymentTerms: prefer one of "30 Days Net", "14 Days Net", "7 Days Net", "COD", "Advance" (default "30 Days Net")
- discountAmount: total document-level discount amount in the invoice currency (0 if no discount mentioned)
- Extract ALL line items with accurate descriptions, quantities and unit prices
- unitPrice is the per-unit price; qty × unitPrice = line total
- notes: any payment instructions, bank details, or general notes mentioned
- Return ONLY valid JSON`;

router.post("/ai/generate-invoice", async (req: any, res: any) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { prompt } = req.body as { prompt?: string };
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "AI invoice generation failed");
    res.write(`data: ${JSON.stringify({ error: "AI generation failed. Please try again." })}\n\n`);
    res.end();
  }
});

export default router;
