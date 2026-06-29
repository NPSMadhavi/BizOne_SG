import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface ImportedItem {
  partNumber: string;
  description: string;
  qty: number;
  unitPrice: number;
  uom: string;
}

export type ColumnField =
  | "partNumber"
  | "description"
  | "qty"
  | "unitPrice"
  | "uom"
  | "ignore";

export type ColumnMap = Record<number, ColumnField>;

export interface ParseResult {
  items: ImportedItem[];
  warnings: string[];
  rawHeaders: string[];
  rawRows: string[][];
  columnMap: ColumnMap;
}

const FIELD_PATTERNS: Array<{ field: ColumnField; pats: RegExp[] }> = [
  {
    field: "partNumber",
    pats: [/part[\s\-_]?n[o#]?/i, /item[\s\-_]?code/i, /p\/n/i, /^sku$/i, /^model[\s\-_]?no?\.?$/i, /^pn$/i, /^code$/i, /part[\s\-_]?number/i],
  },
  {
    field: "description",
    pats: [/descri?p?t?i?o?n?/i, /product[\s\-_]?name/i, /item[\s\-_]?name/i, /^name$/i, /specification/i, /particulars/i, /^item$/i, /^product$/i],
  },
  {
    field: "qty",
    pats: [/^qty\.?$/i, /quantity/i, /^pcs\.?$/i, /^units?$/i, /^q'?ty$/i],
  },
  {
    field: "unitPrice",
    pats: [/unit[\s\-_]?price/i, /u[\s\-_]?price/i, /^price$/i, /unit[\s\-_]?cost/i, /^rate$/i, /^up$/i, /selling[\s\-_]?price/i],
  },
  {
    field: "uom",
    pats: [/^uom$/i, /unit[\s\-_]?of[\s\-_]?measure/i, /^unit\.?$/i],
  },
];

function detectField(header: string): ColumnField {
  const h = header.trim();
  for (const { field, pats } of FIELD_PATTERNS) {
    if (pats.some((p) => p.test(h))) return field;
  }
  return "ignore";
}

export function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<ColumnField>();
  for (let i = 0; i < headers.length; i++) {
    const field = detectField(headers[i]);
    if (field !== "ignore" && !used.has(field)) {
      map[i] = field;
      used.add(field);
    } else {
      map[i] = "ignore";
    }
  }
  return map;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function colIdx(columnMap: ColumnMap, field: ColumnField): number {
  const entry = Object.entries(columnMap).find(([, f]) => f === field);
  return entry ? Number(entry[0]) : -1;
}

/**
 * Merge "continuation" rows into the previous row's description.
 * A continuation row has content only in the description column — the
 * qty, unitPrice, and partNumber columns are all blank. This happens when
 * a PDF renders a long description across two physical lines.
 */
function mergeRowContinuations(rows: string[][], columnMap: ColumnMap): string[][] {
  const descIdx = colIdx(columnMap, "description");
  const qtyIdx  = colIdx(columnMap, "qty");
  const upIdx   = colIdx(columnMap, "unitPrice");
  const pnIdx   = colIdx(columnMap, "partNumber");

  // Nothing to merge if we can't identify the description column
  if (descIdx < 0) return rows;

  const merged: string[][] = [];

  for (const row of rows) {
    const desc  = (row[descIdx] ?? "").trim();
    const qty   = qtyIdx  >= 0 ? (row[qtyIdx]  ?? "").trim() : "x";
    const price = upIdx   >= 0 ? (row[upIdx]   ?? "").trim() : "x";
    const part  = pnIdx   >= 0 ? (row[pnIdx]   ?? "").trim() : "x";

    const isContinuation =
      desc !== "" && qty === "" && price === "" && part === "" && merged.length > 0;

    if (isContinuation) {
      const prev = merged[merged.length - 1];
      prev[descIdx] = ((prev[descIdx] ?? "") + " " + desc).trim();
    } else {
      merged.push([...row]);
    }
  }

  return merged;
}

/**
 * Returns true for rows that are clearly PDF boilerplate (footers, URLs,
 * watermarks) rather than genuine line items.
 *
 * Conservative heuristics — chosen to avoid false positives:
 *  1. Description is a bare URL (www.* or http*)
 *  2. Part-number field contains ≥4 whitespace-separated tokens — real product
 *     codes don't read like sentences ("This is a computer generated …")
 *  3. Part-number field starts with a known boilerplate keyword phrase
 */
function isLikelyFooterItem(item: ImportedItem): boolean {
  const desc = item.description.trim();
  const part = item.partNumber.trim();

  // 1. Description is a URL
  if (/^(https?:\/\/|www\.)\S+$/i.test(desc)) return true;

  // 2. Part-number is a sentence (≥4 whitespace-delimited tokens)
  if (part.split(/\s+/).length >= 4) return true;

  // 3. Common boilerplate phrases in part-number or description
  const boilerplate = [
    "this is a computer",
    "computer generated",
    "thank you for your",
    "bank details",
    "terms and conditions",
    "authorised signatory",
    "authorized signatory",
    "e. & o.e.",
    "e&oe",
  ];
  const partLow = part.toLowerCase();
  const descLow = desc.toLowerCase();
  if (boilerplate.some((kw) => partLow.startsWith(kw) || descLow.startsWith(kw))) return true;

  return false;
}

export function applyColumnMap(
  rows: string[][],
  columnMap: ColumnMap,
): ImportedItem[] {
  const processedRows = mergeRowContinuations(rows, columnMap);
  const items: ImportedItem[] = [];
  for (const row of processedRows) {
    const item: ImportedItem = { partNumber: "", description: "", qty: 1, unitPrice: 0, uom: "" };
    for (const [idxStr, field] of Object.entries(columnMap)) {
      const idx = Number(idxStr);
      const val = (row[idx] ?? "").toString().trim();
      if (!val || field === "ignore") continue;
      if (field === "qty") item.qty = parseNum(val) || 1;
      else if (field === "unitPrice") item.unitPrice = parseNum(val);
      else if (field === "partNumber") item.partNumber = val;
      else if (field === "description") item.description = val;
      else if (field === "uom") item.uom = val;
    }
    const hasContent =
      item.description.trim() !== "" || item.partNumber.trim() !== "";
    if (!hasContent) continue;
    if (isLikelyFooterItem(item)) continue;
    items.push(item);
  }
  return items;
}

// ─── Excel ──────────────────────────────────────────────────────────────────

export async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: "",
  });

  // Find header row — first row (within first 25) with ≥2 recognised fields
  let headerIdx = -1;
  let columnMap: ColumnMap = {};
  for (let i = 0; i < Math.min(allRows.length, 25); i++) {
    const row = allRows[i].map(String);
    const cm = buildColumnMap(row);
    const recognised = Object.values(cm).filter((f) => f !== "ignore").length;
    if (recognised >= 2) {
      headerIdx = i;
      columnMap = cm;
      break;
    }
  }

  const warnings: string[] = [];
  if (headerIdx === -1) {
    // Fall back: treat first row as headers
    headerIdx = 0;
    columnMap = buildColumnMap(allRows[0]?.map(String) ?? []);
    warnings.push(
      "Could not auto-detect column headers. Please review the column mapping below.",
    );
  }

  const rawHeaders = allRows[headerIdx].map(String);
  const rawRows = allRows
    .slice(headerIdx + 1)
    .map((r) => r.map(String))
    .filter((r) => r.some((c) => c.trim() !== ""));

  if (!Object.values(columnMap).includes("description")) {
    warnings.push(
      "No Description column detected. Please assign it in the mapping below.",
    );
  }

  return {
    items: applyColumnMap(rawRows, columnMap),
    warnings,
    rawHeaders,
    rawRows,
    columnMap,
  };
}

// ─── PDF ────────────────────────────────────────────────────────────────────

interface PdfTextItem {
  x: number;
  pageY: number;
  text: string;
}

export async function parsePdf(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const allItems: PdfTextItem[] = [];
  let pageYOffset = 0;

  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    for (const raw of tc.items) {
      if (!("str" in raw) || !(raw as any).str.trim()) continue;
      const t = raw as any;
      const x: number = t.transform[4];
      const y: number = vp.height - t.transform[5]; // flip: pdf y is from bottom
      allItems.push({ x, pageY: pageYOffset + y, text: (t.str as string).trim() });
    }
    pageYOffset += vp.height + 30;
  }

  if (allItems.length === 0) {
    return {
      items: [],
      warnings: [
        "No text found in this PDF — it may be a scanned image. Please use a text-based PDF or switch to Excel.",
      ],
      rawHeaders: [],
      rawRows: [],
      columnMap: {},
    };
  }

  // Group into rows by pageY (tolerance 4pt)
  const Y_TOL = 4;
  const rowBuckets = new Map<number, PdfTextItem[]>();
  for (const item of allItems) {
    let matched: number | null = null;
    for (const key of rowBuckets.keys()) {
      if (Math.abs(key - item.pageY) <= Y_TOL) {
        matched = key;
        break;
      }
    }
    if (matched !== null) {
      rowBuckets.get(matched)!.push(item);
    } else {
      rowBuckets.set(item.pageY, [item]);
    }
  }

  // Sort rows top-to-bottom; sort items in each row left-to-right
  const sortedRows = [...rowBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => items.sort((a, b) => a.x - b.x));

  // Find header row (first row within 50 rows with ≥2 recognised fields)
  let headerRowIdx = -1;
  let columnMap: ColumnMap = {};
  let columnXs: number[] = [];

  for (let i = 0; i < Math.min(sortedRows.length, 50); i++) {
    const texts = sortedRows[i].map((t) => t.text);
    const cm = buildColumnMap(texts);
    const recognised = Object.values(cm).filter((f) => f !== "ignore").length;
    if (recognised >= 2) {
      headerRowIdx = i;
      columnMap = cm;
      columnXs = sortedRows[i].map((t) => t.x);
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      items: [],
      warnings: [
        "Could not detect a table header row in the PDF. The layout may be too complex — try Excel import instead.",
      ],
      rawHeaders: [],
      rawRows: [],
      columnMap: {},
    };
  }

  const rawHeaders = sortedRows[headerRowIdx].map((t) => t.text);

  // Map each subsequent row's text items to the nearest header column
  const rawRows: string[][] = [];
  for (let i = headerRowIdx + 1; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    if (!row.length) continue;
    const cells = new Array<string>(columnXs.length).fill("");
    for (const item of row) {
      // Find closest header column by x
      let best = 0;
      let bestDist = Math.abs(item.x - columnXs[0]);
      for (let c = 1; c < columnXs.length; c++) {
        const d = Math.abs(item.x - columnXs[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      cells[best] = cells[best] ? cells[best] + " " + item.text : item.text;
    }
    if (cells.some((c) => c.trim())) rawRows.push(cells);
  }

  const items = applyColumnMap(rawRows, columnMap);
  const warnings: string[] =
    items.length === 0
      ? [
          "No items extracted. The table structure may be complex — try adjusting the column mapping.",
        ]
      : [];

  return { items, warnings, rawHeaders, rawRows, columnMap };
}
