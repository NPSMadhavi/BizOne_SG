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

/** Replace common PDF ligature characters with ASCII equivalents */
function normalizePdfText(text: string): string {
  return text
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/\uFB05/g, "st")
    .replace(/\uFB06/g, "st")
    .replace(/\u0132/g, "IJ")
    .replace(/\u0133/g, "ij")
    .replace(/\u00E6/g, "ae")
    .replace(/\u0153/g, "oe");
}

const EXTRACT_SYSTEM = `You are a Purchase Order / invoice document parser. Extract structured data from the document and return ONLY JSON.

Return this JSON structure:
{
  "customerName": "buyer/customer company name if present, else empty string",
  "customerAddress": "customer address if present, else empty string",
  "customerContact": "contact person name if present, else empty string",
  "customerContactEmail": "email if present, else empty string",
  "currency": "3-letter currency code if clear (e.g. SGD, USD), else empty string",
  "paymentTerms": "payment terms if present, else empty string",
  "poRefNo": "PO / reference number from the document, else empty string",
  "notes": "any notable notes, else empty string",
  "items": [
    {
      "partNumber": "item/part number or SKU code, empty string if none",
      "description": "COMPLETE verbatim description exactly as it appears — copy every word. Do NOT summarize.",
      "qty": 1,
      "uom": "unit of measure exactly as shown (e.g. Unit, Nos, Pcs, Set). Empty string if not specified.",
      "unitPrice": 0.00
    }
  ]
}

Rules:
- items must only be actual product/service line items, never headers, subtotals, tax lines, or notes
- description: copy the FULL text verbatim; use \\n for line breaks
- qty must be a positive number (default 1 if unclear)
- unitPrice is a number, 0 if not shown
- Do not include shipping/freight as a line item unless explicitly priced
- Never return the image or file itself — only structured field data`;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isPlaceholderKey(key?: string | null) {
  if (!key) return true;
  const k = key.trim().toLowerCase();
  return (
    k.length < 20 ||
    k.includes("your-openai") ||
    k.includes("your-api-key") ||
    k === "sk-xxx" ||
    k.endsWith("-here")
  );
}

function resolveApiKey() {
  return (
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  );
}

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok =
      file.mimetype === "application/pdf" ||
      name.endsWith(".pdf") ||
      IMAGE_TYPES.has(file.mimetype) ||
      /\.(jpe?g|png|webp|gif)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error("Only PDF or image files (JPG, PNG, WEBP) are supported"));
  },
});

router.post("/invoices/extract-po", upload.single("file"), async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const apiKey = resolveApiKey();
  if (isPlaceholderKey(apiKey)) {
    return res.status(503).json({
      error:
        "OpenAI API key is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY in artifacts/api-server/src/.env to a valid key from https://platform.openai.com/account/api-keys, then restart the API server.",
    });
  }

  try {
    const mime = req.file.mimetype || "application/octet-stream";
    const name = (req.file.originalname || "").toLowerCase();
    const isImage =
      IMAGE_TYPES.has(mime) || /\.(jpe?g|png|webp|gif)$/i.test(name);
    const isPdf = mime === "application/pdf" || name.endsWith(".pdf");

    let response;

    if (isImage) {
      const b64 = req.file.buffer.toString("base64");
      const dataUrl = `data:${mime.startsWith("image/") ? mime : "image/jpeg"};base64,${b64}`;
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract purchase order / invoice data from this image. Return JSON fields only — do not describe or return the image.",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });
    } else if (isPdf) {
      let text = "";
      try {
        const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
        const result = await parser.getText();
        text = normalizePdfText(result.text || "");
        await parser.destroy();
      } catch (parseErr: any) {
        req.log?.warn({ err: parseErr }, "pdf-parse failed");
        return res.status(422).json({
          error: "Could not parse PDF. Please ensure it is not password-protected, or upload a clear JPG/PNG photo of the PO.",
        });
      }

      if (!text.trim()) {
        return res.status(422).json({
          error:
            "No text found in this PDF (it may be a scanned image). Please upload a JPG/PNG photo of the PO instead — image text will be extracted automatically.",
        });
      }

      response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          {
            role: "user",
            content: `Extract data from this document:\n\n${text.slice(0, 28000)}`,
          },
        ],
      });
    } else {
      return res.status(400).json({ error: "Unsupported file type. Upload a PDF or image (JPG, PNG, WEBP)." });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) return res.status(500).json({ error: "AI extraction returned no response" });

    let extracted: any;
    try {
      extracted = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "AI returned malformed JSON" });
    }

    if (!Array.isArray(extracted?.items)) {
      extracted = { ...extracted, items: [] };
    }

    return res.json({
      customerName: String(extracted.customerName || ""),
      customerAddress: String(extracted.customerAddress || ""),
      customerContact: String(extracted.customerContact || ""),
      customerContactEmail: String(extracted.customerContactEmail || ""),
      currency: String(extracted.currency || ""),
      paymentTerms: String(extracted.paymentTerms || ""),
      poRefNo: String(extracted.poRefNo || ""),
      notes: String(extracted.notes || ""),
      items: extracted.items.map((it: any) => ({
        partNumber: String(it?.partNumber || ""),
        description: String(it?.description || ""),
        qty: Number(it?.qty) || 1,
        uom: String(it?.uom || ""),
        unitPrice: Number(it?.unitPrice) || 0,
      })),
    });
  } catch (err: any) {
    req.log?.error({ err }, "extract-po failed");
    const msg = String(err?.message || "Extraction failed");
    if (/incorrect api key|invalid api key|401/i.test(msg)) {
      return res.status(503).json({
        error:
          "OpenAI rejected the API key. Update AI_INTEGRATIONS_OPENAI_API_KEY in artifacts/api-server/src/.env with a valid key, then restart the API server.",
      });
    }
    return res.status(500).json({ error: msg });
  }
});

export default router;
