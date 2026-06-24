---
name: PDF gap root cause
description: Why invoice/quotation/PO PDFs had large blank gaps after line items and before totals, and how it was fixed.
---

## Root causes (3 found, all fixed)

### 1. Totals bottom-pinning (all three doc types)
The totals box was drawn at `Math.max(currentY + 4, invSepY - combinedH)` where `invSepY = pageHeight - FOOTER_RESERVE + 2`. When the table ended early on a page (e.g., at Y=97mm), but the totals height would fit above the footer, the `Math.max` would push totals down to Y≈235mm — creating a 138mm blank gap between the last item and the totals box.

**Fix**: Always draw totals at `currentY + 4` (immediately after the table). The page-overflow check still ensures totals never bleed into the footer.

### 2. `rowPageBreak: "avoid"` removal — blank continuation cells (invoice)
Without `rowPageBreak: "avoid"`, autotable splits long rows across pages. On page 2, the split cell body appears blank because `willDrawCell` clears the cell text and `didDrawCell` already drew the text on page 1.

**Fix**: Keep `rowPageBreak: "avoid"` on all doc types. Combined with fix #1 (no totals pinning), the only remaining "gap" is normal page-bottom whitespace when an item is pushed to the next page — which is acceptable.

### 3. htmlToText produces extra blank lines → autotable over-allocates cell height
`htmlToText(description)` is passed as the body cell content so autotable can measure its height. But Tiptap's HTML includes whitespace (newlines) between `<ul>` and `<li>` elements. `htmlToText` turns these into extra `\n` characters → autotable counts more lines → `max(autotable measured, minCellHeight)` uses autotable's larger value → cell is taller than `minCellHeight` → text drawn by `didDrawCell` ends partway through cell → blank space at bottom of cell → next item pushed to next page.

**Fix** (in `autoTableRich`): Before calling `autoTable`, pre-process the body rows to set description column content to `""` (and section row content to `""`). Autotable then measures 0 height for those cells, so `minCellHeight` (from `didParseCell`'s rich-text measurement) becomes the sole authority on cell height. The actual text is still drawn in `didDrawCell`.

**Why:** The `htmlToText` string is only needed for column width measurement (which is irrelevant for the auto-width description column) and for autotable's height estimate (which we override with `minCellHeight` anyway). Clearing it removes the conflict.

**How to apply:** The fix lives in `autoTableRich()` so it applies to all three doc types (Invoice, QT, PO) automatically.

## What was NOT the cause
- `scaleFactor` is correctly 2.8346 for mm documents
- `LINE_H = (9.5 * 1.15) / scaleFactor ≈ 3.855mm` is correct
- `knownDescWidth` vs `cell.width` mismatch — these ARE equal (same computed table width)
- `padding = 4` hardcoded in `didDrawCell` vs actual cell padding — these match when `cellPadding = 4`
