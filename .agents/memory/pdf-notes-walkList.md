---
name: drawNotesHtml walkList multi-paragraph li
description: Bug where continuation paragraphs inside a <li> were silently dropped in PDF notes rendering.
---

## The bug

`drawNotesHtml` → `walkList` selected only the first `<p>` child of each `<li>` via `li.querySelector(":scope > p")`. If a list item had multiple paragraphs (e.g. a bold heading paragraph + a long body paragraph), the second and subsequent paragraphs were never added to `nlines` and thus never drawn in the PDF.

Real-world case: invoice notes item 8 "Customer Data & Backup Responsibility:" had a bold heading paragraph followed by a 5-sentence liability disclaimer paragraph — the disclaimer was always cropped.

## The fix

```javascript
const paragraphs = Array.from(li.children).filter(c => c.tagName.toLowerCase() === "p") as Element[];
if (paragraphs.length > 0) {
  pushBlock(paragraphs[0], prefix, indent);           // first gets list prefix
  for (let pi = 1; pi < paragraphs.length; pi++) {
    pushBlock(paragraphs[pi], "", indent);             // rest: same indent, no prefix
  }
} else {
  pushBlock(li as Element, prefix, indent);            // no <p> wrapper — use li directly
}
```

**Why:** Tiptap can generate multiple sibling `<p>` elements inside a single `<li>` when content is complex (heading + body, or pasted from Word). The previous code assumed exactly one `<p>` per `<li>`.

**How to apply:** Any time `drawNotesHtml` is updated or copied, ensure `walkList` iterates ALL paragraph children, not just the first.
