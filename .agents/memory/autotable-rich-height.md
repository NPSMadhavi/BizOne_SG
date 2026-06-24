---
name: autoTableRich minCellHeight bug
description: Why data.cell.width is unreliable in didParseCell and what to use instead
---

## The Bug
In jspdf-autotable v3.8+, `data.cell.width` inside `didParseCell` is the **preliminary/unfinalized** width for auto-sized columns (cellWidth: "auto" or flexible). For auto columns it can be near-zero at parse time, causing `splitTextToSize(text, ~0)` to produce thousands of lines → `minCellHeight` set to hundreds of mm → blank pages spanning the entire invoice.

## The Fix
Read the pre-computed column width from `opts.columnStyles[descColIdx].cellWidth` BEFORE calling `autoTable`, and use that instead of `data.cell.width` in `didParseCell`:

```javascript
const knownDescWidth = opts.columnStyles?.[descColIdx]?.cellWidth;
// In didParseCell:
const rawW = typeof knownDescWidth === "number" ? knownDescWidth : data.cell.width;
const maxW = Math.max(20, rawW - hPad);
```

The `Math.max(20, ...)` guard prevents runaway calculations if the fallback is also wrong.

## Also: Use data.cell.styles.minCellHeight, not data.cell.minCellHeight
autotable uses `cell.styles.minCellHeight` for row sizing. Setting `data.cell.minCellHeight` (without `.styles`) is silently ignored.

**Why:** jspdf-autotable's height calculation code: `return Math.max(height, this.styles.minCellHeight)` — it reads from styles, not the cell object directly.

## Note on data.cell.width at didDrawCell time
At `didDrawCell` time, `data.cell.width` IS the correct finalized width (rendering phase). So the existing `maxW = cell.width - padding * 2 - imgReserve` in `didDrawCell` is correct and does not need changing.
