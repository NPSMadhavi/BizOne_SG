import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import { parsePdf, type ImportedItem } from "@/lib/import-items";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface ItemMasterImportRow {
  code: string;
  name: string;
  barcode: string;
  category: string;
  brand: string;
  uom: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQty: number;
  isActive: boolean;
  purchasePriceDate?: string;
}

type Field =
  | "code"
  | "name"
  | "barcode"
  | "category"
  | "brand"
  | "uom"
  | "purchasePrice"
  | "sellingPrice"
  | "stockQty"
  | "status"
  | "effectiveFrom";

type ColumnMap = Record<number, Field | "ignore">;

const FIELD_PATTERNS: Array<{ field: Field; pats: RegExp[] }> = [
  { field: "barcode", pats: [/bar[\s\-_]?code/i, /^ean$/i, /^upc$/i] },
  { field: "code", pats: [/item[\s\-_]?code/i, /part[\s\-_]?(no|number|#)/i, /product[\s\-_]?code/i, /^sku$/i, /^code$/i, /^p\/n$/i] },
  { field: "category", pats: [/categor/i] },
  { field: "brand", pats: [/^brand$/i, /brand[\s\-_]?name/i] },
  { field: "uom", pats: [/^u\.?o\.?m\.?$/i, /unit[\s\-_]?of[\s\-_]?meas/i] },
  { field: "purchasePrice", pats: [/purchase[\s\-_]?price/i, /unit[\s\-_]?cost/i, /buying[\s\-_]?price/i, /^cost$/i] },
  { field: "sellingPrice", pats: [/selling[\s\-_]?price/i, /unit[\s\-_]?price/i, /^price$/i, /^rate$/i, /^mrp$/i] },
  { field: "stockQty", pats: [/stock[\s\-_]?qty/i, /^qty\.?$/i, /quantit/i, /^stock$/i, /^pcs\.?$/i] },
  { field: "status", pats: [/^status$/i, /is[\s\-_]?active/i] },
  { field: "effectiveFrom", pats: [/effective/i, /price[\s\-_]?date/i, /^date$/i] },
  { field: "name", pats: [/item[\s\-_]?name/i, /product[\s\-_]?name/i, /descri/i, /particular/i, /^name$/i, /^item$/i, /^product$/i] },
];

const JUNK_NAME = /^(total|sub[\s\-]?total|grand total|amount|page \d+|thank you|remarks?)\b/i;

function detectField(header: string): Field | "ignore" {
  const h = header.trim();
  if (!h) return "ignore";
  for (const { field, pats } of FIELD_PATTERNS) {
    if (pats.some((p) => p.test(h))) return field;
  }
  return "ignore";
}

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<Field>();
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

function recognisedCount(map: ColumnMap) {
  return Object.values(map).filter((f) => f !== "ignore").length;
}

function parseAmount(raw: string): number {
  const n = parseFloat(String(raw ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toYmd(raw: string): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "—") return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!dmy) return undefined;
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function parseActive(raw: string): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return true;
  return !["inactive", "in-active", "no", "false", "0", "disabled", "n"].includes(s);
}

function cell(row: string[], map: ColumnMap, field: Field): string {
  const entry = Object.entries(map).find(([, f]) => f === field);
  if (!entry) return "";
  return String(row[Number(entry[0])] ?? "").trim();
}

export function rowsToItemMasterItems(matrix: string[][]): { items: ItemMasterImportRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows = matrix
    .map((r) => r.map((c) => String(c ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));

  if (rows.length === 0) {
    return { items: [], warnings: ["The file is empty."] };
  }

  let headerIdx = -1;
  let columnMap: ColumnMap = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const map = buildColumnMap(rows[i]);
    const count = recognisedCount(map);
    const hasName = Object.values(map).includes("name") || Object.values(map).includes("code");
    if (count >= 2 && hasName) {
      headerIdx = i;
      columnMap = map;
      break;
    }
  }

  if (headerIdx === -1) {
    headerIdx = 0;
    columnMap = buildColumnMap(rows[0]);
    if (recognisedCount(columnMap) < 1) {
      return {
        items: [],
        warnings: ["Could not find item columns. Use headers such as Item Name, Item Code, Purchase Price, Selling Price, and Stock Qty."],
      };
    }
    warnings.push("Column headers were not detected clearly. Check that the first row contains column names.");
  }

  const hasSelling = Object.values(columnMap).includes("sellingPrice");
  const hasPurchase = Object.values(columnMap).includes("purchasePrice");
  const items: ItemMasterImportRow[] = [];

  for (const row of rows.slice(headerIdx + 1)) {
    const code = cell(row, columnMap, "code");
    const named = cell(row, columnMap, "name");
    const name = named || code;
    if (!name || JUNK_NAME.test(name)) continue;
    if (detectField(name) !== "ignore" && row.filter(Boolean).length <= 2) continue;

    const selling = parseAmount(cell(row, columnMap, "sellingPrice"));
    const purchase = parseAmount(cell(row, columnMap, "purchasePrice"));
    const singlePrice = hasSelling ? selling : purchase;

    items.push({
      code,
      name,
      barcode: cell(row, columnMap, "barcode"),
      category: cell(row, columnMap, "category"),
      brand: cell(row, columnMap, "brand"),
      uom: cell(row, columnMap, "uom") || "Pcs",
      purchasePrice: hasPurchase ? purchase : singlePrice,
      sellingPrice: hasSelling ? selling : singlePrice,
      stockQty: parseAmount(cell(row, columnMap, "stockQty")),
      isActive: parseActive(cell(row, columnMap, "status")),
      purchasePriceDate: toYmd(cell(row, columnMap, "effectiveFrom")),
    });
  }

  if (items.length === 0) {
    warnings.push("No item rows were found under the table header.");
  }
  return { items, warnings };
}

function sheetToMatrix(rows: unknown[][]): string[][] {
  return rows.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "")));
}

export async function parseItemMasterExcel(file: File): Promise<{ items: ItemMasterImportRow[]; warnings: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  let best: { items: ItemMasterImportRow[]; warnings: string[] } = { items: [], warnings: ["The workbook has no sheets."] };

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    const parsed = rowsToItemMasterItems(sheetToMatrix(allRows as unknown[][]));
    if (parsed.items.length > best.items.length) best = parsed;
    if (parsed.items.length > 0) break;
  }
  return best;
}

interface PdfToken {
  x: number;
  pageY: number;
  text: string;
}

function segmentHeader(tokens: PdfToken[]): PdfToken[] {
  const out: PdfToken[] = [];
  let i = 0;
  while (i < tokens.length) {
    let bestLen = 1;
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      if (i + len > tokens.length) continue;
      const joined = tokens.slice(i, i + len).map((t) => t.text).join(" ");
      if (detectField(joined) !== "ignore") {
        bestLen = len;
        matched = true;
        break;
      }
    }
    if (!matched) bestLen = 1;
    const slice = tokens.slice(i, i + bestLen);
    out.push({ x: slice[0].x, pageY: slice[0].pageY, text: slice.map((t) => t.text).join(" ") });
    i += bestLen;
  }
  return out;
}

function splitLooseLine(line: string): string[] {
  if (line.includes("|")) return line.split("|").map((s) => s.trim()).filter((s) => s !== "");
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((s) => s.trim()).filter((s) => s !== "");
  return [line];
}

async function pdfTables(file: File): Promise<{ aligned: string[][]; loose: string[][] }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const allItems: PdfToken[] = [];
  let pageYOffset = 0;

  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const raw of tc.items) {
      if (!("str" in raw) || !(raw as { str?: string }).str?.trim()) continue;
      const t = raw as { str: string; transform: number[] };
      allItems.push({
        x: t.transform[4],
        pageY: pageYOffset + (vp.height - t.transform[5]),
        text: t.str.trim(),
      });
    }
    pageYOffset += vp.height + 30;
  }

  if (allItems.length === 0) return { aligned: [], loose: [] };

  const Y_TOL = 4;
  const rowBuckets = new Map<number, PdfToken[]>();
  for (const item of allItems) {
    let matched: number | null = null;
    for (const key of rowBuckets.keys()) {
      if (Math.abs(key - item.pageY) <= Y_TOL) {
        matched = key;
        break;
      }
    }
    if (matched !== null) rowBuckets.get(matched)!.push(item);
    else rowBuckets.set(item.pageY, [item]);
  }

  const sortedRows = [...rowBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => items.sort((a, b) => a.x - b.x));

  let headerRowIdx = -1;
  let columnXs: number[] = [];
  for (let i = 0; i < Math.min(sortedRows.length, 60); i++) {
    const segmented = segmentHeader(sortedRows[i]);
    const map = buildColumnMap(segmented.map((t) => t.text));
    const hasName = Object.values(map).includes("name") || Object.values(map).includes("code");
    if (recognisedCount(map) >= 2 && hasName) {
      headerRowIdx = i;
      columnXs = segmented.map((t) => t.x);
      sortedRows[i] = segmented;
      break;
    }
  }

  const loose = sortedRows
    .map((row) => splitLooseLine(row.map((t) => t.text).join(" ")))
    .filter((r) => r.some((c) => c.trim()));

  if (headerRowIdx === -1) return { aligned: [], loose };

  const header = sortedRows[headerRowIdx].map((t) => t.text);
  const aligned: string[][] = [header];
  for (let i = headerRowIdx + 1; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    if (!row.length) continue;
    const cells = new Array<string>(columnXs.length).fill("");
    for (const item of row) {
      let best = 0;
      let bestDist = Math.abs(item.x - (columnXs[0] ?? item.x));
      for (let c = 1; c < columnXs.length; c++) {
        const d = Math.abs(item.x - columnXs[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      cells[best] = cells[best] ? `${cells[best]} ${item.text}` : item.text;
    }
    if (cells.some((c) => c.trim())) aligned.push(cells);
  }
  return { aligned, loose };
}

function fromInvoiceItems(items: ImportedItem[]): ItemMasterImportRow[] {
  return items
    .map((it) => {
      const name = (it.description || it.partNumber || "").trim();
      return {
        code: (it.partNumber || "").trim(),
        name,
        barcode: "",
        category: "",
        brand: "",
        uom: (it.uom || "").trim() || "Pcs",
        purchasePrice: Number(it.unitPrice) || 0,
        sellingPrice: Number(it.unitPrice) || 0,
        stockQty: Number(it.qty) || 0,
        isActive: true,
      };
    })
    .filter((it) => it.name !== "");
}

export async function parseItemMasterPdf(file: File): Promise<{ items: ItemMasterImportRow[]; warnings: string[] }> {
  const tables = await pdfTables(file);
  for (const matrix of [tables.aligned, tables.loose]) {
    if (matrix.length === 0) continue;
    const parsed = rowsToItemMasterItems(matrix);
    if (parsed.items.length > 0) return parsed;
  }

  const fallback = await parsePdf(file);
  const items = fromInvoiceItems(fallback.items);
  if (items.length > 0) {
    return { items, warnings: fallback.warnings };
  }
  return {
    items: [],
    warnings: fallback.warnings.length
      ? fallback.warnings
      : ["No item table was found in this PDF."],
  };
}

export async function parseItemMasterFile(file: File): Promise<{ items: ItemMasterImportRow[]; warnings: string[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return parseItemMasterPdf(file);
  return parseItemMasterExcel(file);
}
