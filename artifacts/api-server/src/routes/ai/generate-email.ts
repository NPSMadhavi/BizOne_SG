import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/ai/generate-email", async (req: any, res: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { docType, docNumber, customerName, companyName, items, currency, totalAmount } = req.body as {
    docType: string;
    docNumber: string;
    customerName: string;
    companyName: string;
    items: { description: string }[];
    currency: string;
    totalAmount: number;
  };

  if (!docType || !docNumber || !customerName || !companyName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const itemSummary = (items || [])
    .filter((i) => i.description && i.description.trim())
    .slice(0, 10)
    .map((i) => `- ${i.description.trim()}`)
    .join("\n");

  const prompt = `You are an assistant helping a business send a professional email to a customer.

Document details:
- Document Type: ${docType}
- Document Number: ${docNumber}
- Customer: ${customerName}
- Sending Company: ${companyName}
- Currency: ${currency}
- Total Amount: ${totalAmount}
- Line Items:
${itemSummary || "(no items provided)"}

Tasks:
1. Read the line items and infer what this document is about in 1-3 words (e.g. "IT Services", "Network Equipment", "Software Subscription"). Call this the TOPIC.
2. Generate an email subject in EXACTLY this format: "${docType} for [TOPIC] | ${companyName}"
3. Write a short, professional plain-text email body (3–5 sentences). The email should:
   - Open with a polite greeting to the customer (use their name if helpful)
   - Briefly mention what the attached document is
   - Mention the document number and amount
   - Close professionally with the sender's company name
   - Be plain text only — no HTML, no markdown, no bullet points, no headers

Return ONLY valid JSON with this exact structure, no extra keys, no markdown fences:
{"subject":"...","body":"..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    let parsed: { subject: string; body: string };
    try {
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw);
    } catch {
      return res.status(500).json({ error: "AI returned invalid response. Please try again." });
    }

    return res.json({ subject: parsed.subject || "", body: parsed.body || "" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "AI generation failed" });
  }
});

export default router;
