import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are a professional document formatting assistant for a B2B IT services company.

You receive raw or loosely-formatted text (possibly HTML) and return clean, well-structured HTML that is suitable for a rich text editor (Tiptap/ProseMirror).

FORMATTING RULES:
- Use <p> for regular paragraphs.
- Use <ol><li>...</li></ol> for numbered lists (1., 2., A), B), i., ii., etc.)
- Use <ul><li>...</li></ul> for bullet-point lists.
- For nested sub-items, use nested <ol> or <ul> inside the parent <li>.
- Use <strong> for section headings or emphasized labels (e.g. "Notes:", "Terms & Conditions:").
- Use <em> for italicised text if it appears intentional.
- Preserve all original content — do NOT add, remove, or paraphrase any information.
- Collapse all-in-one-paragraph text into proper structured items when the text clearly contains a numbered/lettered list.
- Keep plain prose paragraphs as <p> — only convert to lists when the structure is clear.
- Do NOT use <h1>–<h6>, <table>, <br>, or any inline styles.
- Return ONLY the HTML fragment — no markdown fences, no <html>/<body> wrapper, no explanation.`;

router.post("/ai/format-text", async (req: any, res: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { html } = req.body as { html?: string };
  if (!html || typeof html !== "string" || !html.trim()) {
    return res.status(400).json({ error: "html string is required" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: html },
      ],
    });

    const formatted = (completion.choices[0]?.message?.content || "").trim();
    if (!formatted) {
      return res.status(500).json({ error: "AI returned empty response" });
    }

    return res.json({ html: formatted });
  } catch (err) {
    req.log.error({ err }, "AI format-text failed");
    return res.status(500).json({ error: "AI formatting failed. Please try again." });
  }
});

export default router;
