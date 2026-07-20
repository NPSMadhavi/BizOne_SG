import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are an invoice line-item formatting assistant for a B2B IT/tech services company.

You receive a JSON array of invoice line items and return a cleaner, more professional restructured version.

WHAT YOU SHOULD DO:
- Insert section header rows (type="section") to group related items under clear headings
- Improve description clarity — make each item concise, specific, and professional
- If a description covers multiple distinct services, you may split it into separate item rows
  → When splitting: keep qty and unitPrice on the FIRST sub-item only; set qty=0, unitPrice=0 on any additional rows you create

WHAT YOU MUST NOT CHANGE:
- qty and unitPrice on original items (you may add NEW rows with qty=0, unitPrice=0 when splitting)
- partNumber, uom, discount, isFoc, isStockItem, selectedSerials, selectedSerialIds, itemImage

SECTION ROW SHAPE (copy exactly, fill in sectionLabel):
{ "type": "section", "sectionLabel": "...", "sectionAlign": "left", "description": "", "partNumber": "", "qty": 0, "unitPrice": 0, "discount": 0, "uom": "", "isFoc": false, "isStockItem": false, "selectedSerials": [], "selectedSerialIds": [], "itemImage": "" }

ITEM ROW SHAPE (keep all fields, only improve description text):
{ "type": "item", "sectionLabel": "", "sectionAlign": "left", "description": "...", "partNumber": "...", "qty": number, "unitPrice": number, "discount": number, "uom": "...", "isFoc": false, "isStockItem": false, "selectedSerials": [], "selectedSerialIds": [], "itemImage": "..." }

Return ONLY a valid JSON array — no markdown, no code fences, no explanation.`;

router.post("/ai/format-invoice", async (req: any, res: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { items } = req.body as { items?: any[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(items) },
      ],
    });

    const raw = (completion.choices[0]?.message?.content || "").trim();
    let formattedItems: any[];
    try {
      formattedItems = JSON.parse(raw);
      if (!Array.isArray(formattedItems)) throw new Error("Not an array");
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    return res.json({ formattedItems });
  } catch (err) {
    req.log.error({ err }, "AI format-invoice failed");
    return res.status(500).json({ error: "AI formatting failed. Please try again." });
  }
});

export default router;
