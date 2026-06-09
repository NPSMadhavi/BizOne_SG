import { Router } from "express";
import { createRequire } from "node:module";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Uint8Array }) => {
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  };
};

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/invoices/extract-po", upload.single("file"), async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    let text = "";

    try {
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      const result = await parser.getText();
      text = result.text || "";
      await parser.destroy();
    } catch (parseErr: any) {
      req.log?.warn({ err: parseErr }, "pdf-parse failed");
      return res.status(422).json({ error: "Could not parse PDF. Please ensure it is not password-protected." });
    }

    if (!text.trim()) {
      return res.status(422).json({
        error: "No text could be extracted. This PDF may be a scanned image — please use a text-based PDF.",
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Purchase Order document parser. Extract only the line items from a PO document and return a JSON object.

Return ONLY this JSON structure:
{
  "items": [
    {
      "partNumber": "item/part number or SKU code, empty string if none",
      "description": "full item description",
      "qty": 1,
      "uom": "unit of measure e.g. Unit, Nos, Pcs, Set, Kg, L, m, Box. Default Unit.",
      "unitPrice": 0.00
    }
  ]
}

Rules:
- items must only be actual product/service line items, never headers, subtotals, tax lines, or notes
- description must be non-empty for every item
- qty must be a positive number (default 1 if unclear)
- unitPrice is a number, 0 if not shown
- Do not include shipping/freight as a line item unless explicitly priced`,
        },
        {
          role: "user",
          content: `Extract invoice data from this Purchase Order document:\n\n${text.slice(0, 14000)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return res.status(500).json({ error: "AI extraction returned no response" });

    let extracted: unknown;
    try {
      extracted = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "AI returned malformed JSON" });
    }

    return res.json(extracted);
  } catch (err: any) {
    req.log?.error({ err }, "extract-po failed");
    return res.status(500).json({ error: err?.message || "Extraction failed" });
  }
});

export default router;
