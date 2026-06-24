---
name: PDF gap root cause
description: Why invoice/quotation/PO PDFs had large blank gaps after line items and before totals, and how it was fixed.
---

## The two root causes

### 1. Totals bottom-pinning (all three doc types)
The totals box was drawn at `Math.max(currentY + 4, invSepY - combinedH)` where `invSepY = pageHeight - FOOTER_RESERVE + 2`. When the table ended early on a page (e.g., at Y=97mm), but the totals height would fit above the footer, the `Math.max` would push totals down to Y≈235mm — creating a 138mm blank gap between the last item and the totals box.

**Fix**: Always draw totals at `currentY + 4` (immediately after the table). The page-overflow check (`if invCurrentY + combinedH + FOOTER_RESERVE > pageHeight → addPage`) still ensures totals never bleed into the footer.

### 2. `rowPageBreak: "avoid"` on invoice table
When an item row's minCellHeight was larger than the remaining page space, the whole row was pushed to page 2, leaving a gap at the bottom of page 1. Combined with issue #1, this caused multi-page invoices with large blank areas on each page.

**Fix**: Removed `rowPageBreak: "avoid"` from the invoice autoTable call. Items can now flow across page boundaries naturally, eliminating the gaps.

## What was NOT the cause
- `scaleFactor` is correctly 2.8346 for mm documents (confirmed at runtime via `node -e`)
- `LINE_H = (9.5 * 1.15) / scaleFactor ≈ 3.855mm` is correct
- `knownDescWidth` from `opts.columnStyles[descColIdx].cellWidth` is correctly set
- The `autoTableRich` minCellHeight calculation itself is mathematically correct

**Why:** The bottom-pinning logic was originally intended to give invoices a "professional" look with totals at the page bottom, but it backfires badly when items end partway through a page.

**How to apply:** For any new doc type that draws totals after a table, always draw immediately after `finalY + offset`. Never use `Math.max(currentY, pageBottom - height)` as it creates visible blank gaps.
