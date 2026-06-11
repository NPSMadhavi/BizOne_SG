---
name: Item image feature
description: Per-line-item image upload/paste field across all 8 document forms, 4 view pages, and PDF rendering
---

## What was built

A 100×80 image zone per line item on all document forms (QT, INV, PO, DO — new and edit), view pages, and PDFs.

## Schema

`itemImage: z.string().default("")` added to `itemSchema` in all 8 form files. Stored in the items JSONB column. No DB migration needed (JSONB absorbs new keys automatically).

**Why:** Images are base64 data-URLs (JPEG, ~400×300 at quality 0.75) so they fit in the existing JSONB without a separate table.

## Component

`artifacts/po-app/src/components/item-image-field.tsx` — paste from clipboard or click-to-upload. Canvas-resizes to max 400×300 JPEG before storing. Shows thumbnail + remove button.

## Section items

All `{ type: "section" ... }` blank objects also need `itemImage: ""` since the schema applies to both item and section rows. Miss this and TypeScript will error on `append()` calls.

## DO form quirk

`DOItem` from the generated API client doesn't include `itemImage`. Cast `filledItems as any` when calling `createMutation.mutate` / `updateMutation.mutate` in DO new/edit. DO append calls also need `partNumber: ""` even though the auto-append originally omitted it.

## PDF rendering

`autoTableRich` in `pdf.ts` accepts a 5th optional param `itemImages?: (string | null | undefined)[]` (one entry per table row). When an image is present for a row, 26mm is reserved at the right of the description cell (`IMG_RESERVE`), text wraps within the narrower `maxW`, and a 24×(max 18)mm image is drawn after the border pass. Section rows pass `null` in the images array.

**How to apply:** Any future table that uses `autoTableRich` and wants images just passes the images array as the 5th arg. Build it as `items.map(item => item.type === "section" ? null : (item.itemImage || null))`.
