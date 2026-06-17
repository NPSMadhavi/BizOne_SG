import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PurchaseOrder, Quotation, Invoice, DeliveryOrder, Company } from "@workspace/api-client-react";
import logoRsvUrl from "@assets/logo_1776054030755.png";
import logoNetopsysUrl from "@assets/Netopsys_logo_Dark_1776066608427.png";
import { fmtDate } from "./utils";

// ── Unicode font (Roboto) — supports ₹, €, £ and all PDF currency symbols ───
let PDF_FONT = "helvetica";
type FontCache = { regular: string; bold: string; italic: string; bolditalic: string };
let _fontCache: FontCache | null = null;
let _fontPromise: Promise<void> | null = null;

function _bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 32768;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // Use apply to avoid spread-operator stack limits on large TypedArrays
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}

function _loadFonts(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}fonts/`;
  const load = (name: string) =>
    fetch(`${base}${name}`).then(r => {
      if (!r.ok) throw new Error(`Font ${name} not found (${r.status})`);
      return r.arrayBuffer();
    });
  return Promise.all([
    load("Roboto-Regular.ttf"),
    load("Roboto-Bold.ttf"),
    load("Roboto-Italic.ttf"),
    load("Roboto-BoldItalic.ttf"),
  ]).then(([reg, bold, ital, boldItal]) => {
    _fontCache = {
      regular: _bufToB64(reg),
      bold: _bufToB64(bold),
      italic: _bufToB64(ital),
      bolditalic: _bufToB64(boldItal),
    };
    // PDF_FONT is set only after successful addFont in attachPdfFonts
  }).catch((e) => { console.warn("Roboto fonts failed to load, using Helvetica:", e); });
}

function ensurePdfFonts(): Promise<void> {
  if (!_fontPromise) _fontPromise = _loadFonts();
  return _fontPromise;
}

function attachPdfFonts(doc: jsPDF): void {
  if (!_fontCache) return;
  try {
    doc.addFileToVFS("Roboto-Regular.ttf", _fontCache.regular);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFileToVFS("Roboto-Bold.ttf", _fontCache.bold);
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    doc.addFileToVFS("Roboto-Italic.ttf", _fontCache.italic);
    doc.addFont("Roboto-Italic.ttf", "Roboto", "italic");
    doc.addFileToVFS("Roboto-BoldItalic.ttf", _fontCache.bolditalic);
    doc.addFont("Roboto-BoldItalic.ttf", "Roboto", "bolditalic");
    PDF_FONT = "Roboto"; // Only mark as active after every variant is registered
  } catch (e) {
    console.warn("Roboto font registration failed, falling back to Helvetica:", e);
    PDF_FONT = "helvetica"; // Ensure fallback is used for this generation
    _fontCache = null;     // Clear cache so next attempt re-downloads
    _fontPromise = null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function getLogoUrl(company: Company | null | undefined): string {
  if (!company || company.id === 1) return logoRsvUrl;
  return logoNetopsysUrl;
}

function tableHtmlToText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));
  return rows
    .map((row) =>
      Array.from(row.querySelectorAll("td, th"))
        .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("   ")
    )
    .filter((line) => line.trim())
    .join("\n");
}

function htmlToText(html: string): string {
  if (!html) return "";
  if (/<table/i.test(html)) {
    const parts: string[] = [];
    let remaining = html;
    const tableRe = /<table[\s\S]*?<\/table>/gi;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    while ((match = tableRe.exec(html)) !== null) {
      const before = html.slice(lastIdx, match.index);
      if (before.trim()) parts.push(htmlToText(before));
      parts.push(tableHtmlToText(match[0]));
      lastIdx = match.index + match[0].length;
    }
    const after = html.slice(lastIdx);
    if (after.trim()) parts.push(htmlToText(after));
    return parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return html
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
      let n = 0;
      return inner.replace(/<li[^>]*>/gi, () => `<li data-n="${++n}">`);
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li data-n="(\d+)">/gi, (_, n) => `${n}. `)
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface RichLine { text: string; bold: boolean; italic: boolean; cols?: string[]; }

function htmlToRichLines(html: string): RichLine[] {
  if (!html) return [];

  // Use a real DOM parser so bold/italic context is tracked accurately.
  // The old regex approach (`/<strong/i.test(rawLine)`) matched empty
  // <strong></strong> tags that Tiptap inserts when a bold mark carries over
  // on Enter, making every subsequent line appear bold.
  const dom = new DOMParser().parseFromString(html, "text/html");
  const body = dom.body;
  const out: RichLine[] = [];

  // --- helpers ---

  // Walk a subtree collecting text runs, tracking bold/italic from ancestor tags.
  type Run = { t: string; b: boolean; i: boolean };
  function collectRuns(node: Node, b: boolean, i: boolean): Run[] {
    if (node.nodeType === Node.TEXT_NODE) {
      // Normalize non-breaking spaces (from Word/pasted content) to regular spaces
      const t = (node.textContent ?? "").replace(/\u00a0/g, " ");
      return t ? [{ t, b, i }] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return [{ t: "\n", b, i }]; // hard-break sentinel
    const nb = b || tag === "strong" || tag === "b";
    const ni = i || tag === "em" || tag === "i";
    const acc: Run[] = [];
    for (const ch of Array.from(el.childNodes)) acc.push(...collectRuns(ch, nb, ni));
    return acc;
  }

  // Convert a run array into a finished RichLine.
  // Bold/italic = true when more than half the characters carry that mark.
  function runsToLine(rr: Run[], prefix = ""): RichLine | null {
    const text = (prefix + rr.map(r => r.t).join("")).replace(/[ \t]+/g, " ").trim();
    if (!text) return null;
    const tot = rr.reduce((s, r) => s + r.t.length, 0);
    const boldLen = rr.filter(r => r.b).reduce((s, r) => s + r.t.length, 0);
    const italLen = rr.filter(r => r.i).reduce((s, r) => s + r.t.length, 0);
    return {
      text,
      bold: tot > 0 && boldLen > tot / 2,
      italic: tot > 0 && italLen > tot / 2,
    };
  }

  // Add lines from a block element, splitting on <br> sentinels, with optional prefix.
  function addBlock(el: Element, prefix = "") {
    const rr = collectRuns(el, false, false);
    // Empty block (<p></p> or <p><br></p>) → blank line representing a paragraph gap
    const onlyBreak = rr.length === 1 && rr[0].t === "\n";
    if ((rr.length === 0 || onlyBreak) && !prefix) {
      out.push({ text: "", bold: false, italic: false });
      return;
    }
    // Split on hard-break sentinels
    let seg: Run[] = [];
    let firstSeg = true;
    for (const r of rr) {
      if (r.t === "\n") {
        const line = runsToLine(seg, firstSeg ? prefix : "");
        if (line) out.push(line);
        else if (!firstSeg) out.push({ text: "", bold: false, italic: false }); // hard-break gap
        seg = [];
        firstSeg = false;
      } else {
        seg.push(r);
      }
    }
    const line = runsToLine(seg, firstSeg ? prefix : "");
    if (line) out.push(line);
  }

  // --- walk body ---
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      const t = (child.textContent ?? "").trim();
      if (t) out.push({ text: t, bold: false, italic: false });
      continue;
    }
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "p" || /^h[1-6]$/.test(tag) || tag === "div") {
      addBlock(el);

    } else if (tag === "ul" || tag === "ol") {
      let n = 0;
      for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
        n++;
        const prefix = tag === "ol" ? `${n}. ` : "• ";
        // Tiptap wraps list-item content in a nested <p>
        const inner = (li.querySelector(":scope > p") ?? li) as Element;
        addBlock(inner, prefix);
      }

    } else if (tag === "table") {
      for (const row of Array.from(el.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("td, th")).map(
          c => (c.textContent ?? "").replace(/\s+/g, " ").trim(),
        );
        if (cells.some(c => c)) {
          out.push({ text: cells.join("   "), bold: false, italic: false, cols: cells });
        }
      }

    } else {
      // Any other element (span, etc.) at root — treat as inline block
      addBlock(el);
    }
  }

  // Trim leading/trailing blank entries
  let s = 0, e = out.length - 1;
  while (s <= e && !out[s].text) s++;
  while (e >= s && !out[e].text) e--;
  return out.slice(s, e + 1);
}

/**
 * Smart column width allocator.
 *
 * Fixed columns (# row counter, Qty, UOM, Disc%, Unit Price, Amount, Part No)
 * keep their reserved widths. The description column gets everything that
 * remains, but we also measure the actual widest header/content value so we
 * can warn when a fixed column is too narrow (currently just clamps to min).
 *
 * Returns a Record<colIndex, { cellWidth: number|"auto", halign?: string }>
 * identical in shape to what jspdf-autotable expects for columnStyles.
 */
function smartColWidths(
  doc: jsPDF,
  headers: string[],
  rows: any[][],
  tableWidth: number, // marginRight - marginLeft
  fixedMap: Array<{ halign?: string; fixed?: number; auto?: true; [key: string]: any }>
): Record<number, any> {
  // Sum of all fixed widths
  const fixedTotal = fixedMap.reduce((s, c) => s + (c.fixed ?? 0), 0);
  const autoIdx = fixedMap.findIndex(c => c.auto);

  // Measure description content: longest plain-text line across all rows
  let maxDescPx = 0;
  if (autoIdx !== -1) {
    doc.setFontSize(9.5);
    for (const row of rows) {
      const cell = row[autoIdx];
      const text = typeof cell === "string" ? cell : String(cell ?? "");
      for (const line of text.split("\n")) {
        const w = doc.getTextWidth(line.trim());
        if (w > maxDescPx) maxDescPx = w;
      }
    }
  }

  const descWidth = Math.max(tableWidth - fixedTotal, 30); // always at least 30 mm

  const styles: Record<number, any> = {};
  for (let i = 0; i < fixedMap.length; i++) {
    const { fixed, halign, auto, ...extra } = fixedMap[i];
    if (auto) {
      styles[i] = { cellWidth: descWidth, ...(halign ? { halign } : {}), ...extra };
    } else {
      styles[i] = { cellWidth: fixed!, ...(halign ? { halign } : {}), ...extra };
    }
  }
  return styles;
}

function autoTableRich(
  doc: jsPDF,
  opts: any,
  descColIdx: number,
  richDescRows: RichLine[][],
  itemImages?: (string | null | undefined)[]
): void {
  const IMG_RESERVE = 26; // mm reserved at right of description cell when image present
  const IMG_W = 24;       // mm image width
  const IMG_H_MAX = 18;   // mm max image height

  const { headStyles: hs, bodyStyles: bs, didParseCell: userDidParseCell, ...restOpts } = opts;
  (doc as any).autoTable({
    styles: { font: PDF_FONT },
    ...restOpts,
    headStyles: { font: PDF_FONT, ...(hs ?? {}) },
    bodyStyles: { font: PDF_FONT, ...(bs ?? {}) },
    // Pre-set minCellHeight for description cells AND full-width section rows
    didParseCell: (data: any) => {
      if (userDidParseCell) userDidParseCell(data);
      if (data.section !== "body") return;
      const isSection = (data.cell.colSpan ?? 1) > 1 && data.column.index === 0;
      const isDesc = data.column.index === descColIdx && !isSection;
      if (!isSection && !isDesc) return;
      const richLines = richDescRows[data.row.index];
      if (!richLines || richLines.length === 0) return;
      const scaleFactor = (doc.internal as any).scaleFactor || 2.8346;
      const LINE_H = (9.5 * 1.15) / scaleFactor;
      const padding = 4;
      const maxW = data.cell.width - padding * 2;
      doc.setFontSize(9.5);
      let totalH = 0;
      for (const rl of richLines) {
        if (!rl.text) {
          totalH += LINE_H;
        } else {
          const st = rl.bold && rl.italic ? "bolditalic" : rl.bold ? "bold" : rl.italic ? "italic" : "normal";
          doc.setFont(PDF_FONT, st);
          totalH += doc.splitTextToSize(rl.text, maxW).length * LINE_H;
        }
      }
      const needed = totalH + padding * 2;
      if (!data.cell.minCellHeight || data.cell.minCellHeight < needed) {
        data.cell.minCellHeight = needed;
      }
    },
    willDrawCell: (data: any) => {
      if (data.section !== "body") return;
      const isSection = (data.cell.colSpan ?? 1) > 1 && data.column.index === 0;
      if (isSection || data.column.index === descColIdx) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data: any) => {
      if (data.section !== "body") return;
      const isSection = (data.cell.colSpan ?? 1) > 1 && data.column.index === 0;
      const isDesc = data.column.index === descColIdx && !isSection;
      if (!isSection && !isDesc) return;

      const richLines = richDescRows[data.row.index];
      const rowImg = (!isSection && itemImages?.[data.row.index]) ? itemImages![data.row.index] : null;
      const imgReserve = rowImg ? IMG_RESERVE : 0;

      const jdoc = data.doc as jsPDF;
      const cell = data.cell;
      const padding = 4;
      const x = cell.x + padding;
      const maxW = cell.width - padding * 2 - imgReserve;

      if (!richLines || richLines.length === 0) {
        if (rowImg) {
          const imgH = Math.min(IMG_H_MAX, cell.height - padding * 2);
          const imgX = cell.x + cell.width - IMG_W - 1;
          const imgY = cell.y + (cell.height - imgH) / 2;
          try {
            const fmt = rowImg.startsWith("data:image/png") ? "PNG" : "JPEG";
            jdoc.addImage(rowImg, fmt, imgX, imgY, IMG_W, imgH, "", "FAST");
          } catch (_e) { /* ignore corrupt/unsupported image */ }
        }
        return;
      }

      const scaleFactor = (jdoc.internal as any).scaleFactor || 2.8346;
      const LINE_H = (9.5 * 1.15) / scaleFactor;
      const BASELINE_OFFSET = (9.5 * 0.8) / scaleFactor;
      jdoc.setFontSize(9.5);

      // Build rendering plan — each line gets its baseline y coordinate
      type Plan = { y: number; richLine: RichLine };
      const plan: Plan[] = [];
      let ty = (cell as any).textPos?.y ?? (cell.y + padding + BASELINE_OFFSET);
      for (const rl of richLines) {
        plan.push({ y: ty, richLine: rl });
        if (rl.cols) {
          ty += LINE_H;
        } else if (!rl.text) {
          ty += LINE_H; // blank line — advance spacing, nothing drawn
        } else {
          const measStyle = rl.bold && rl.italic ? "bolditalic" : rl.bold ? "bold" : rl.italic ? "italic" : "normal";
          jdoc.setFont(PDF_FONT, measStyle);
          ty += jdoc.splitTextToSize(rl.text, maxW).length * LINE_H;
        }
      }

      // Render text pass
      for (const { y, richLine } of plan) {
        const { text, bold, italic, cols } = richLine;
        jdoc.setTextColor(60, 60, 60);
        if (cols && cols.length > 0) {
          const colW = maxW / cols.length;
          jdoc.setFont(PDF_FONT, "normal");
          cols.forEach((col, ci) => {
            const colText = jdoc.splitTextToSize(col, colW - 3);
            jdoc.text(colText[0] ?? "", x + ci * colW + 2, y);
          });
        } else if (text) {
          const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
          jdoc.setFont(PDF_FONT, style);
          jdoc.text(jdoc.splitTextToSize(text, maxW), x, y);
        }
      }

      // Border pass for inline tables (description cells only, not section rows)
      if (isDesc) {
        jdoc.setDrawColor(160, 160, 160);
        jdoc.setLineWidth(0.3);
        let groupStart = -1;
        for (let i = 0; i <= plan.length; i++) {
          const isCol = i < plan.length && plan[i].richLine.cols && plan[i].richLine.cols!.length > 0;
          if (isCol && groupStart === -1) { groupStart = i; }
          if (!isCol && groupStart !== -1) {
            const group = plan.slice(groupStart, i);
            const numCols = group[0].richLine.cols!.length;
            const colW = maxW / numCols;
            const topY = group[0].y - BASELINE_OFFSET;
            const botY = group[group.length - 1].y - BASELINE_OFFSET + LINE_H;
            jdoc.rect(x, topY, maxW, botY - topY);
            for (let ci = 1; ci < numCols; ci++) {
              jdoc.line(x + ci * colW, topY, x + ci * colW, botY);
            }
            for (let ri = 0; ri < group.length - 1; ri++) {
              jdoc.line(x, group[ri].y - BASELINE_OFFSET + LINE_H, x + maxW, group[ri].y - BASELINE_OFFSET + LINE_H);
            }
            groupStart = -1;
          }
        }
        // Draw item image (right side of description cell)
        if (rowImg) {
          const imgH = Math.min(IMG_H_MAX, cell.height - padding * 2);
          const imgX = cell.x + cell.width - IMG_W - 1;
          const imgY = cell.y + (cell.height - imgH) / 2;
          jdoc.setFillColor(255, 255, 255);
          jdoc.rect(cell.x + cell.width - IMG_RESERVE, cell.y + 1, IMG_RESERVE, cell.height - 2, "F");
          try {
            const fmt = rowImg.startsWith("data:image/png") ? "PNG" : "JPEG";
            jdoc.addImage(rowImg, fmt, imgX, imgY, IMG_W, imgH, "", "FAST");
          } catch (_e) { /* ignore corrupt/unsupported image */ }
        }
      }
    },
  });
}

interface LogoData { dataUrl: string; natW: number; natH: number; }

async function getLogoData(imageUrl: string): Promise<LogoData> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const { natW, natH } = await new Promise<{ natW: number; natH: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ natW: img.naturalWidth, natH: img.naturalHeight });
    img.onerror = () => resolve({ natW: 260, natH: 56 });
    img.src = dataUrl;
  });
  return { dataUrl, natW, natH };
}

function fitInBox(natW: number, natH: number, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / natW, maxH / natH);
  return { w: natW * scale, h: natH * scale };
}

interface CompanyInfo {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  registrationNo?: string;
  gstNo?: string;
  phone?: string;
  email?: string;
}

function companyToInfo(company: Company | null | undefined): CompanyInfo {
  if (!company) {
    return {
      name: "RSV Infotech Pte. Ltd.",
      addressLine1: "#07-52, 10 UBI Crescent, UBI Techpark Lobby C,",
      addressLine2: "Singapore 408564",
      registrationNo: "200812581D",
      gstNo: "200812581D",
    };
  }
  const addr = company.address || "";
  const lines = addr.split(",").map(s => s.trim()).filter(Boolean);
  const midpoint = Math.ceil(lines.length / 2);
  const line1 = lines.slice(0, midpoint).join(", ");
  const line2 = lines.slice(midpoint).join(", ");
  return {
    name: company.name,
    addressLine1: line1 || addr,
    addressLine2: line2 || undefined,
    registrationNo: company.registrationNo,
    phone: company.phone,
    email: company.email,
  };
}

function renderEntityBlock(
  doc: jsPDF,
  name: string,
  rest: (string | null | undefined)[],
  x: number,
  startY: number,
  maxWidth: number
): number {
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(60, 60, 60);
  doc.text(name, x, startY);
  const restText = rest.filter(Boolean).join("\n");
  let bottomY = startY;
  if (restText) {
    doc.setFont(PDF_FONT, "normal");
    const lines = doc.splitTextToSize(restText, maxWidth) as string[];
    doc.text(lines, x, startY + 5);
    const lineH = (doc.getLineHeight() / doc.internal.scaleFactor);
    bottomY = startY + 5 + (lines.length - 1) * lineH;
  }
  return bottomY;
}

function fmtMoney(currency: string, amount: number): string {
  const SYMBOLS: Record<string, string> = {
    SGD: "S$", USD: "US$", EUR: "\u20AC", GBP: "\u00A3", MYR: "RM ",
    INR: PDF_FONT === "Roboto" ? "\u20B9" : "Rs.",
  };
  const symbol = SYMBOLS[currency] ?? (currency + " ");
  const num = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return symbol + num;
}

function fmtMoneyTotal(currency: string, amount: number): string {
  return fmtMoney(currency, amount);
}

// Plain number formatter — no currency symbol (used in line-item cells when the currency is already in the column header)
function fmtNum(amount: number): string {
  return new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(d: string | null | undefined): string {
  return fmtDate(d);
}

function buildDocHeader(
  doc: jsPDF,
  logo: LogoData,
  title: string,
  docNumber: string,
  date: string,
  _status: string,
  info: CompanyInfo
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;

  const { w: lw, h: lh } = fitInBox(logo.natW, logo.natH, 65, 18);
  doc.addImage(logo.dataUrl, "PNG", marginLeft, 12, lw, lh);

  doc.setFontSize(26);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(24, 33, 47);
  doc.text(title, marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Number: ${docNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${date}`, marginRight, 36, { align: "right" });

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(100, 100, 100);

  let companyY = 46;
  if (info.addressLine1) {
    doc.text(info.addressLine1, marginLeft, companyY);
    companyY += 5;
  }
  if (info.addressLine2) {
    doc.text(info.addressLine2, marginLeft, companyY);
    companyY += 5;
  }
  if (info.registrationNo) {
    doc.text(`Co. Reg. No.: ${info.registrationNo}`, marginLeft, companyY);
    companyY += 5;
  }
  if (info.gstNo) {
    doc.text(`GST Reg. No.: ${info.gstNo}`, marginLeft, companyY);
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);
}

const FOOTER_RESERVE = 14; // mm from page bottom reserved for the footer bar

function buildDocFooter(doc: jsPDF, docType: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc as any).internal.pages.length - 1;
  const sepY = pageHeight - FOOTER_RESERVE + 2;
  const textY = pageHeight - 5;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.line(marginLeft, sepY, marginRight, sepY);
    doc.setFontSize(6.5);
    doc.setFont(PDF_FONT, "italic");
    doc.setTextColor(175, 175, 175);
    doc.text(
      `This is a computer-generated ${docType} document and does not require a physical signature.`,
      pageWidth / 2,
      textY,
      { align: "center" }
    );
    doc.text(`Page ${p} of ${totalPages}`, marginRight, textY, { align: "right" });
  }
}

function buildDoFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 10;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p === totalPages) {
      const sigY = pageHeight - 62;

      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, sigY, marginLeft + 130, sigY);

      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "italic");
      doc.setTextColor(60, 60, 60);
      doc.text("Customer Authorised Signature(s) & Company official stamp/NRIC", marginLeft, sigY + 5);

      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(60, 60, 60);
      const ackLines = doc.splitTextToSize(
        "Received above goods in good order & condition. No further claim for damage, shortage or errors will be entertained after acceptance of goods.",
        pageWidth - marginLeft * 2
      );
      doc.text(ackLines, marginLeft, sigY + 20);
    }

    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Confidential", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }
}

// ── PURCHASE ORDER PDF ────────────────────────────────────────────────────────

export async function generatePO_PDF(po: PurchaseOrder, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const col2 = 108;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  const { w: lw, h: lh } = fitInBox(logo.natW, logo.natH, 65, 18);
  doc.addImage(logo.dataUrl, "PNG", marginLeft, 12, lw, lh);

  doc.setFontSize(26);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(24, 33, 47);
  doc.text("PURCHASE ORDER", marginRight, 22, { align: "right" });

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`PO Number: ${po.poNumber}`, marginRight, 30, { align: "right" });
  doc.text(`Date: ${fmtDate((po as any).issueDate || po.createdAt)}`, marginRight, 36, { align: "right" });

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(info.name, marginLeft, 40);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(100, 100, 100);
  let companyY = 46;
  if (info.addressLine1) { doc.text(info.addressLine1, marginLeft, companyY); companyY += 5; }
  if (info.addressLine2) { doc.text(info.addressLine2, marginLeft, companyY); companyY += 5; }
  if (info.registrationNo) { doc.text(`Co. Reg. No.: ${info.registrationNo}`, marginLeft, companyY); companyY += 5; }
  if (info.gstNo) doc.text(`GST Reg. No.: ${info.gstNo}`, marginLeft, companyY);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, 58, marginRight, 58);

  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Vendor:", marginLeft, 67);
  doc.text("Delivery To:", col2, 67);

  renderEntityBlock(doc, po.vendorName, [po.vendorAddress, po.vendorContact ? `\nAttn: ${po.vendorContact}` : null], marginLeft, 74, 85);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(doc.splitTextToSize(po.deliveryAddress || `${info.name} Office`, 82), col2, 74);

  const formatDeliveryDate = (d: string | null | undefined): string => fmtDate(d);

  if ((po as any).quoteRefNo) {
    doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text("Sales Ref No.:", col2, 96);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
    doc.text((po as any).quoteRefNo, col2 + 30, 96);
  }

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.text("Payment Terms:", col2, 105);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDeliveryDate(po.deliveryDate), marginLeft + 32, 105);
  doc.text(po.paymentTerms || "Standard", col2 + 33, 105);

  const poCurrency = (po as any).currency || "SGD";
  // Strip trailing/empty item rows that have no description and no part number
  const filteredPOItems = po.items.filter((item: any) => {
    const hasDesc = htmlToText(item.description || "").trim() !== "";
    const hasPart = (item.partNumber || "").trim() !== "";
    return hasDesc || hasPart;
  });
  const hasPOUom = filteredPOItems.some((item: any) => item.uom && String(item.uom).trim() !== "");

  const poHeaderArr: string[] = ["#", "Item / Part Number", "Description", "Qty"];
  if (hasPOUom) poHeaderArr.push("UOM");
  poHeaderArr.push(`Unit Price (${poCurrency})`, `Amount (${poCurrency})`);
  const poHeaders = poHeaderArr;

  const poRichDesc = filteredPOItems.map((item: any) => htmlToRichLines(item.description));
  const tableData = filteredPOItems.map((item, index) => {
    const row: any[] = [index + 1, item.partNumber, htmlToText(item.description), item.qty];
    if (hasPOUom) row.push((item as any).uom || "");
    row.push(fmtNum(Number(item.unitPrice)), fmtNum(Number(item.amount)));
    return row;
  });

  const poTableWidth = marginRight - marginLeft;
  const poFixedMap: Array<{ halign?: string; fixed?: number; auto?: true }> = [
    { fixed: 13, halign: "center" }, // #
    { fixed: hasPOUom ? 26 : 32 },   // part no
    { auto: true },                   // description
    { fixed: 18, halign: "center" }, // qty
    ...(hasPOUom ? [{ fixed: 18, halign: "center" as const }] : []), // uom
    { fixed: 27, halign: "right" },  // unit price
    { fixed: 27, halign: "right" },  // amount
  ];
  const poColStyles = smartColWidths(doc, poHeaders, tableData, poTableWidth, poFixedMap);

  const pageHeight = doc.internal.pageSize.getHeight();
  const totalsBlockH = 28; // subtotal + tax + rule + total ≈ 28 mm
  const notesLineH = 5;

  autoTableRich(doc, {
    startY: 113,
    head: [poHeaders],
    body: tableData,
    theme: "plain",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9.5, valign: "top" },
    styles: { cellPadding: 4, lineColor: [210, 215, 220], lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 } },
    columnStyles: poColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
  }, 2, poRichDesc, filteredPOItems.map((item: any) => (item as any).itemImage || null));

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // Notes — check if they fit on this page; if not, new page
  if (po.notes) {
    const noteLines = doc.splitTextToSize(po.notes, 120);
    const notesH = 8 + noteLines.length * notesLineH;
    if (currentY + notesH + totalsBlockH + FOOTER_RESERVE > pageHeight) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, currentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, currentY + 6);
    currentY += notesH + 4;
  }

  // Totals — if they don't fit on this page, push to a new page
  if (currentY + totalsBlockH + FOOTER_RESERVE > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  // Pin totals to bottom of whichever page they land on
  const labelX = 146;
  const valueX = marginRight - 4;
  const totalsY = Math.max(currentY, pageHeight - FOOTER_RESERVE - totalsBlockH - 4);

  doc.setFontSize(9.5); doc.setTextColor(0, 0, 0); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, totalsY);
  doc.text(fmtMoneyTotal(poCurrency, Number(po.subtotal)), valueX, totalsY, { align: "right" });
  const taxAmount = Number(po.totalAmount) - Number(po.subtotal);
  doc.text("Tax:", labelX, totalsY + 7);
  doc.text(fmtMoneyTotal(poCurrency, taxAmount), valueX, totalsY + 7, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, totalsY + 10, marginRight, totalsY + 10);
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, totalsY + 17);
  doc.text(fmtMoneyTotal(poCurrency, Number(po.totalAmount)), valueX, totalsY + 17, { align: "right" });

  const totalPages = (doc as any).internal.pages.length - 1;
  const footerY = pageHeight - 12;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(160, 160, 160);
    doc.text("This is a computer-generated Purchase Order document and does not require a physical signature.", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${p} of ${totalPages}`, marginRight, footerY, { align: "right" });
  }

  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${po.poNumber}.pdf`);
}

function calcBlockHeight(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  maxW: number
): number {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return 0;
  // Must measure at the same font size renderInlineDocInfo uses (7.5pt)
  const prevSize = doc.getFontSize();
  doc.setFontSize(7.5);
  const lineH = 3.8;
  let h = 0;
  if (bank) {
    h += 4; // "Bank Details:" header
    bank.split("\n").filter(l => l.trim()).forEach(l => {
      h += doc.splitTextToSize(l.trim(), maxW).length * lineH;
    });
    h += 3.5; // bottom gap after bank box (boxPad + 1 = 3.5 in renderer)
    if (tnc) h += 4; // gap between bank box and T&C
  }
  if (tnc) {
    h += 4; // "Terms & Conditions:" header
    tnc.split("\n").filter(l => l.trim()).forEach(l => {
      h += doc.splitTextToSize(`\u2022 ${l.trim()}`, maxW).length * lineH;
    });
  }
  doc.setFontSize(prevSize);
  return h + 2; // bottom margin
}

/**
 * Render Bank Details + T&C block starting at an explicit Y position.
 * Used for the inline (side-by-side with totals) layout.
 */
function renderInlineDocInfo(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  x: number,
  startY: number,
  maxW: number
): void {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return;

  const lineH = 3.8;
  let y = startY;

  doc.setFontSize(7.5);

  if (bank) {
    const bankContentLines: string[] = [];
    bank.split("\n").filter(l => l.trim()).forEach(l => {
      doc.splitTextToSize(l.trim(), maxW).forEach((row: string) => bankContentLines.push(row));
    });
    const bankTextH = bankContentLines.length * lineH;
    const boxPad = 2.5;
    const boxH = 4 + bankTextH + boxPad * 2 + 1;

    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x - 2, y - boxPad, maxW + 4, boxH, 1.5, 1.5, "F");

    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Bank Details:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    bankContentLines.forEach(row => {
      doc.text(row, x, y);
      y += lineH;
    });
    y += boxPad + 1;
    if (tnc) y += 4;
  }

  if (tnc) {
    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Terms & Conditions:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    tnc.split("\n").filter(l => l.trim()).forEach(line => {
      const wrapped = doc.splitTextToSize(`\u2022 ${line.trim()}`, maxW);
      doc.text(wrapped, x, y);
      y += wrapped.length * lineH;
    });
  }
}

// renderBottomDocInfo kept for backwards compatibility but no longer called
function renderBottomDocInfo(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  x: number,
  pageHeight: number,
  maxW: number
): void {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return;

  const lineH = 3.8;
  const footerSepY = pageHeight - FOOTER_RESERVE + 1;
  const blockH = calcBlockHeight(doc, settings, maxW);
  let y = footerSepY - blockH;

  doc.setFontSize(7.5);

  if (bank) {
    const bankContentLines: string[] = [];
    bank.split("\n").filter(l => l.trim()).forEach(l => {
      doc.splitTextToSize(l.trim(), maxW).forEach((row: string) => bankContentLines.push(row));
    });
    const bankTextH = bankContentLines.length * lineH;
    const boxPad = 2.5;
    const boxH = 4 + bankTextH + boxPad * 2 + 1;

    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x - 2, y - boxPad, maxW + 4, boxH, 1.5, 1.5, "F");

    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Bank Details:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    bankContentLines.forEach(row => {
      doc.text(row, x, y);
      y += lineH;
    });
    y += boxPad + 1;
    if (tnc) y += 4;
  }

  if (tnc) {
    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Terms & Conditions:", x, y); y += 4;
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(110, 110, 110);
    tnc.split("\n").filter(l => l.trim()).forEach(line => {
      const wrapped = doc.splitTextToSize(`\u2022 ${line.trim()}`, maxW);
      doc.text(wrapped, x, y);
      y += wrapped.length * lineH;
    });
  }
}

// ── QUOTATION PDF ─────────────────────────────────────────────────────────────

export async function generateQuotation_PDF(qt: Quotation, company?: Company | null, settings?: { bankDetails?: string; termsAndConditions?: string; quotationTerms?: string } | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "QUOTATION", qt.qtNumber, fmtDate((qt as any).issueDate || qt.createdAt), qt.status, info);

  // Payment Terms + Delivery Date — top-right, below Date (y=36), same grey/normal style as Invoice
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`Payment Terms: ${qt.paymentTerms || "Standard"}`, marginRight, 42, { align: "right" });
  const qtDeliveryDate = (qt as any).deliveryDate;
  if (qtDeliveryDate) {
    doc.text(`Delivery Date: ${fmtDate(qtDeliveryDate)}`, marginRight, 48, { align: "right" });
  }

  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Quote To:", marginLeft, 67);

  const qtEntityBottom = renderEntityBlock(
    doc,
    qt.customerName,
    [qt.customerAddress, qt.customerContact ? `\nAttn: ${qt.customerContact}` : null],
    marginLeft,
    74,
    85
  );
  const qtTableStartY = Math.max(qtEntityBottom + 10, 100);

  const qtCurrency = (qt as any).currency || "SGD";
  const qtDocDiscount = Number((qt as any).discountAmount) || 0;
  // Strip trailing/empty item rows that have no description and no part number
  const allQtItems = (qt.items as any[]).filter((item: any) => {
    if (item.type === "section") return htmlToText(item.sectionLabel || "").trim() !== "";
    const hasDesc = htmlToText(item.description || "").trim() !== "";
    const hasPart = (item.partNumber || "").trim() !== "";
    return hasDesc || hasPart;
  });
  const regularQtItems = allQtItems.filter((item: any) => item.type !== "section");
  const hasQtPartNo = regularQtItems.some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const hasItemDiscount = regularQtItems.some((item: any) => Number(item.discount) > 0);
  const hasQtUom = regularQtItems.some((item: any) => item.uom && String(item.uom).trim() !== "");

  const qtHeaderArr: string[] = ["#"];
  if (hasQtPartNo) qtHeaderArr.push("Item / Part Number");
  qtHeaderArr.push("Description", "Qty");
  if (hasQtUom) qtHeaderArr.push("UOM");
  qtHeaderArr.push(`Unit Price (${qtCurrency})`);
  if (hasItemDiscount) qtHeaderArr.push("Disc %");
  qtHeaderArr.push(`Amount (${qtCurrency})`);
  const qtHeaders = qtHeaderArr;
  const qtTotalCols = qtHeaders.length;

  const qtRichDesc: RichLine[][] = [];
  let qtItemCounter = 0;
  const qtTableData = allQtItems.map((item: any) => {
    if (item.type === "section") {
      qtRichDesc.push(htmlToRichLines(item.sectionLabel || ""));
      const halign = item.sectionAlign === "center" ? "center" : "left";
      return [{ content: htmlToText(item.sectionLabel || ""), colSpan: qtTotalCols, styles: { halign } }];
    }
    qtItemCounter++;
    qtRichDesc.push(htmlToRichLines(item.description));
    const disc = Number(item.discount) || 0;
    const row: any[] = [qtItemCounter];
    if (hasQtPartNo) row.push(item.partNumber || "");
    row.push(htmlToText(item.description), item.qty);
    if (hasQtUom) row.push(item.uom || "");
    row.push(fmtNum(Number(item.unitPrice)));
    if (hasItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(fmtNum(Number(item.amount)));
    return row;
  });

  const qtTableWidth = marginRight - marginLeft;
  const qtDescColIdx = hasQtPartNo ? 2 : 1;
  const qtFixedMap: Array<{ halign?: string; fixed?: number; auto?: true }> = [
    { fixed: 13, halign: "center" },                                  // #
    ...(hasQtPartNo ? [{ fixed: 25 }] : []),                          // part no (conditional)
    { auto: true },                                                    // description
    { fixed: 18, halign: "center" },                                   // qty
    ...(hasQtUom ? [{ fixed: 18, halign: "center" as const }] : []),  // uom
    { fixed: hasQtPartNo ? 27 : 30, halign: "right" as const, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },  // unit price
    ...(hasItemDiscount ? [{ fixed: 18, halign: "right" as const }] : []), // disc %
    { fixed: hasQtPartNo ? 27 : 30, halign: "right" as const, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },  // amount
  ];
  const qtColStyles = smartColWidths(doc, qtHeaders, qtTableData, qtTableWidth, qtFixedMap);

  // For quotations, use quotationTerms (not invoice termsAndConditions)
  const qtSettings = settings
    ? { bankDetails: "", termsAndConditions: (settings as any).quotationTerms || "" }
    : null;

  const qtExtraRows = qtDocDiscount > 0 ? 1 : 0;
  const qtBoxH = (3 + qtExtraRows) * 7 + 16;
  const qtBankBlockH = calcBlockHeight(doc, qtSettings, 125);

  const qtUnitPriceIdx = qtHeaders.indexOf(`Unit Price (${qtCurrency})`);
  const qtAmountIdx = qtHeaders.indexOf(`Amount (${qtCurrency})`);
  autoTableRich(doc, {
    startY: qtTableStartY,
    head: [qtHeaders],
    body: qtTableData,
    theme: "plain",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9.5, valign: "top" },
    styles: { cellPadding: 4, lineColor: [210, 215, 220], lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 } },
    columnStyles: qtColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    didParseCell: (data: any) => {
      if (data.section === "head" && (data.column.index === qtUnitPriceIdx || data.column.index === qtAmountIdx)) {
        data.cell.styles.halign = "right";
      }
    },
  }, qtDescColIdx, qtRichDesc, allQtItems.map((item: any) => item.type === "section" ? null : ((item as any).itemImage || null)));

  let qtCurrentY = (doc as any).lastAutoTable.finalY + 8;

  if (qt.notes) {
    const noteLines = doc.splitTextToSize(qt.notes, 120);
    const notesH = 8 + noteLines.length * 5;
    const qtCombinedH = Math.max(qtBoxH, qtBankBlockH);
    if (qtCurrentY + notesH + qtCombinedH + FOOTER_RESERVE > pageHeight) { doc.addPage(); qtCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, qtCurrentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, qtCurrentY + 6);
    qtCurrentY += notesH + 4;
  }

  // ── Totals + Bank/T&C side-by-side ───────────────────────────────────────────
  const qtCombinedH = Math.max(qtBoxH, qtBankBlockH);
  if (qtCurrentY + qtCombinedH + FOOTER_RESERVE > pageHeight) { doc.addPage(); qtCurrentY = 20; }

  // Pin footer to bottom of whichever page it lands on
  const qtTaxableAmount = Number(qt.subtotal) - qtDocDiscount;
  const qtTaxRate = qtTaxableAmount > 0 ? Math.round((Number(qt.tax) / qtTaxableAmount) * 100) : 0;
  const qtGstLabel = qtTaxRate > 0 ? `GST (${qtTaxRate}%):` : "GST:";
  const labelX = 146;
  const valueX = marginRight - 4;
  const qtSepY = pageHeight - FOOTER_RESERVE + 2;
  const totalsY = Math.max(qtCurrentY + 4, qtSepY - qtCombinedH);

  // Right: totals box
  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, qtBoxH, 2, 2, "F");

  let ty = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.subtotal)), valueX, ty, { align: "right" });
  ty += 7;
  if (qtDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ty);
    doc.text(`-${fmtMoneyTotal(qtCurrency, qtDocDiscount)}`, valueX, ty, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ty += 7;
  }
  doc.text(qtGstLabel, labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.tax)), valueX, ty, { align: "right" });
  ty += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ty, marginRight, ty);
  ty += 7;
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.totalAmount)), valueX, ty, { align: "right" });

  // Left: bank details + quotation T&C inline (same Y, left of totals)
  renderInlineDocInfo(doc, qtSettings, marginLeft, totalsY, 125);

  buildDocFooter(doc, "Quotation");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${qt.qtNumber}.pdf`);
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────

export async function generateInvoice_PDF(inv: Invoice, company?: Company | null, settings?: { bankDetails?: string; termsAndConditions?: string } | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "TAX INVOICE", inv.invNumber, fmtDate((inv as any).issueDate || inv.createdAt), inv.status, info);

  // Payment Terms + PO Ref — same style as Number / Date (normal, grey, 6 mm apart)
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`Payment Terms: ${inv.paymentTerms || "Standard"}`, marginRight, 42, { align: "right" });
  const invPoRefNo = (inv as any).poRefNo;
  if (invPoRefNo) {
    doc.text(`PO Ref No: ${invPoRefNo}`, marginRight, 48, { align: "right" });
  }

  // Bill To (left) + optional Ship To (right, only when different from billing address)
  const invShipToAddr = ((inv as any).deliveryAddress || "").trim();
  const invBillAddr = (inv.customerAddress || "").trim();
  const showInvShipTo = invShipToAddr && invShipToAddr !== invBillAddr;
  // Ship To block: left-aligned, anchored so its right edge meets marginRight
  const invShipColW = 58; // mm wide column for ship-to — starts close to right margin
  const shipStartX = marginRight - invShipColW;
  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);
  if (showInvShipTo) doc.text("Ship To:", shipStartX, 67);

  const invBillToMaxW = showInvShipTo ? shipStartX - marginLeft - 6 : 85;
  const invEntityBottom = renderEntityBlock(doc, inv.customerName, [inv.customerAddress, inv.customerContact ? `\nAttn: ${inv.customerContact}` : null], marginLeft, 74, invBillToMaxW);

  let invShipToBottom = 67;
  if (showInvShipTo) {
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
    const shipLines = doc.splitTextToSize(invShipToAddr, invShipColW);
    doc.text(shipLines, shipStartX, 74);
    invShipToBottom = 74 + shipLines.length * 5;
  }

  // Dynamic table start
  const invTableStartY = Math.max(invEntityBottom, invShipToBottom) + 10;

  const invCurrency = (inv as any).currency || "SGD";
  const invDocDiscount = Number((inv as any).discountAmount) || 0;

  // Pre-compute totals box height and bank+tnc block height — used AFTER
  // the autoTable to decide whether to add a page before drawing totals.
  const invExtraRowsEarly = invDocDiscount > 0 ? 1 : 0;
  const invBoxH = (3 + invExtraRowsEarly) * 7 + 16;
  const invBankBlockH = calcBlockHeight(doc, settings, 125);

  // Strip trailing/empty item rows that have no description and no part number
  const allInvItems = (inv.items as any[]).filter((item: any) => {
    if (item.type === "section") return htmlToText(item.sectionLabel || "").trim() !== "";
    const hasDesc = htmlToText(item.description || "").trim() !== "";
    const hasPart = (item.partNumber || "").trim() !== "";
    return hasDesc || hasPart;
  });
  const regularInvItems = allInvItems.filter(item => item.type !== "section");
  const hasInvPartNo = regularInvItems.some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const hasInvItemDiscount = regularInvItems.some(item => Number(item.discount) > 0);
  const hasInvUom = regularInvItems.some((item: any) => item.uom && String(item.uom).trim() !== "");

  // Build headers and column styles dynamically to handle all combinations
  const invHeaderArr: string[] = ["#"];
  if (hasInvPartNo) invHeaderArr.push("Item / Part Number");
  invHeaderArr.push("Description", "Qty");
  if (hasInvUom) invHeaderArr.push("UOM");
  invHeaderArr.push(`Unit Price (${invCurrency})`);
  if (hasInvItemDiscount) invHeaderArr.push("Disc %");
  invHeaderArr.push(`Amount (${invCurrency})`);
  const invHeaders = invHeaderArr;
  const invTotalCols = invHeaders.length;

  const invTableWidth = marginRight - marginLeft;

  const invRichDesc: RichLine[][] = [];
  let invItemCounter = 0;
  const tableData = allInvItems.map((item: any) => {
    if (item.type === "section") {
      invRichDesc.push(htmlToRichLines(item.sectionLabel || ""));
      const halign = item.sectionAlign === "center" ? "center" : "left";
      return [{ content: htmlToText(item.sectionLabel || ""), colSpan: invTotalCols, styles: { halign } }];
    }
    invItemCounter++;
    invRichDesc.push(htmlToRichLines(item.description));
    const disc = Number(item.discount) || 0;
    const row: any[] = [invItemCounter];
    if (hasInvPartNo) row.push(item.partNumber || "");
    row.push(htmlToText(item.description), item.qty);
    if (hasInvUom) row.push(item.uom || "");
    row.push(fmtNum(Number(item.unitPrice)));
    if (hasInvItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(fmtNum(Number(item.amount)));
    return row;
  });

  const invDescColIdx = hasInvPartNo ? 2 : 1;

  const invFixedMap: Array<{ halign?: string; fixed?: number; auto?: true }> = [
    { fixed: 13, halign: "center" },                               // #
    ...(hasInvPartNo ? [{ fixed: 25 }] : []),                      // part no
    { auto: true },                                                 // description
    { fixed: 18, halign: "center" },                               // qty
    ...(hasInvUom ? [{ fixed: 18, halign: "center" as const }] : []),  // uom
    { fixed: hasInvPartNo ? 27 : 30, halign: "right" as const, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },   // unit price
    ...(hasInvItemDiscount ? [{ fixed: 18, halign: "right" as const }] : []), // disc %
    { fixed: hasInvPartNo ? 27 : 30, halign: "right" as const, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },   // amount
  ];
  const invColumnStyles = smartColWidths(doc, invHeaders, tableData, invTableWidth, invFixedMap);

  const invUnitPriceIdx = invHeaders.indexOf(`Unit Price (${invCurrency})`);
  const invAmountIdx = invHeaders.indexOf(`Amount (${invCurrency})`);
  autoTableRich(doc, {
    startY: invTableStartY,
    head: [invHeaders],
    body: tableData,
    theme: "plain",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9.5, valign: "top" },
    styles: { cellPadding: 4, lineColor: [210, 215, 220], lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 } },
    columnStyles: invColumnStyles,
    margin: { top: 12, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    didParseCell: (data: any) => {
      if (data.section === "head" && (data.column.index === invUnitPriceIdx || data.column.index === invAmountIdx)) {
        data.cell.styles.halign = "right";
      }
    },
  }, invDescColIdx, invRichDesc, allInvItems.map((item: any) => (item as any).type === "section" ? null : ((item as any).itemImage || null)));

  let invCurrentY = (doc as any).lastAutoTable.finalY + 8;

  if (inv.notes) {
    const noteLines = doc.splitTextToSize(inv.notes, 120);
    const notesH = 8 + noteLines.length * 5;
    if (invCurrentY + notesH + invBoxH + FOOTER_RESERVE + invBankBlockH > pageHeight) { doc.addPage(); invCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, invCurrentY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(noteLines, marginLeft, invCurrentY + 6);
    invCurrentY += notesH + 4;
  }

  // ── Totals + Bank/T&C side-by-side ───────────────────────────────────────────
  const invCombinedH = Math.max(invBoxH, invBankBlockH);
  if (invCurrentY + invCombinedH + FOOTER_RESERVE > pageHeight) { doc.addPage(); invCurrentY = 20; }

  // Pin footer to bottom of whichever page it lands on
  const invTaxableAmount = Number(inv.subtotal) - invDocDiscount;
  const invTaxRate = invTaxableAmount > 0 ? Math.round((Number(inv.tax) / invTaxableAmount) * 100) : 0;
  const invGstLabel = invTaxRate > 0 ? `GST (${invTaxRate}%):` : "GST:";
  const labelX = 146;
  const valueX = marginRight - 4;
  // Anchor bottom of block exactly to the footer separator line
  const invSepY = pageHeight - FOOTER_RESERVE + 2;
  const totalsY = Math.max(invCurrentY + 4, invSepY - invCombinedH);

  // Right: totals box
  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, invBoxH, 2, 2, "F");

  let ity = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.subtotal)), valueX, ity, { align: "right" });
  ity += 7;
  if (invDocDiscount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount:", labelX, ity);
    doc.text(`-${fmtMoneyTotal(invCurrency, invDocDiscount)}`, valueX, ity, { align: "right" });
    doc.setTextColor(60, 60, 60);
    ity += 7;
  }
  doc.text(invGstLabel, labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.tax)), valueX, ity, { align: "right" });
  ity += 3;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(labelX, ity, marginRight, ity);
  ity += 7;
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(24, 33, 47);
  doc.text("Total Amount:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.totalAmount)), valueX, ity, { align: "right" });

  // Left: bank details + T&C inline (same Y, left of totals)
  renderInlineDocInfo(doc, settings, marginLeft, totalsY, 125);

  buildDocFooter(doc, "Invoice");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${inv.invNumber}.pdf`);
}

// ── DELIVERY ORDER PDF ────────────────────────────────────────────────────────

export async function generateDO_PDF(doDoc: DeliveryOrder, company?: Company | null, options?: { returnBase64?: boolean }): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);

  const logo = await getLogoData(getLogoUrl(company));
  buildDocHeader(doc, logo, "DELIVERY ORDER", doDoc.doNumber, fmtDate((doDoc as any).issueDate || doDoc.createdAt), doDoc.status, info);

  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Deliver To:", marginLeft, 67);

  renderEntityBlock(doc, doDoc.customerName, [doDoc.customerAddress, doDoc.customerContact ? `Attn: ${doDoc.customerContact}` : null], marginLeft, 74, 85);

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Delivery Date:", marginLeft, 105);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
  doc.text(formatDate(doDoc.deliveryDate), marginLeft + 32, 105);

  // Strip trailing/empty item rows that have no description and no part number
  const filteredDOItems = (doDoc.items as any[]).filter((item: any) => {
    const hasDesc = htmlToText(item.description || "").trim() !== "";
    const hasPart = (item.partNumber || "").trim() !== "";
    return hasDesc || hasPart;
  });
  const hasPartNo = filteredDOItems.some((item: any) => item.partNumber && String(item.partNumber).trim() !== "");
  const hasDOUom = filteredDOItems.some((item: any) => item.uom && String(item.uom).trim() !== "");

  const doHeaderArr: string[] = ["#"];
  if (hasPartNo) doHeaderArr.push("Item No.");
  doHeaderArr.push("Description", "Qty");
  if (hasDOUom) doHeaderArr.push("UOM");
  const doHeaders = doHeaderArr;
  const doDescColIdx = hasPartNo ? 2 : 1;

  const doRichDesc = filteredDOItems.map((item: any) => htmlToRichLines(item.description));
  const doTableData = filteredDOItems.map((item, i) => {
    const row: any[] = [i + 1];
    if (hasPartNo) row.push(item.partNumber || "");
    row.push(htmlToText(item.description), item.qty);
    if (hasDOUom) row.push(item.uom || "");
    return row;
  });

  const doTableWidth = marginRight - marginLeft;
  const doFixedMap: Array<{ halign?: string; fixed?: number; auto?: true }> = [
    { fixed: 13, halign: "center" },                          // #
    ...(hasPartNo ? [{ fixed: 28, halign: "left" as const }] : []), // item no
    { auto: true },                                            // description
    { fixed: hasDOUom ? 18 : 22, halign: "center" },         // qty
    ...(hasDOUom ? [{ fixed: 18, halign: "center" as const }] : []), // uom
  ];
  const doColStyles = smartColWidths(doc, doHeaders, doTableData, doTableWidth, doFixedMap);

  autoTableRich(doc, {
    startY: 113,
    head: [doHeaders],
    body: doTableData,
    theme: "plain",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9.5, valign: "top" },
    styles: { cellPadding: 4, lineColor: [210, 215, 220], lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 } },
    columnStyles: doColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
  }, doDescColIdx, doRichDesc, filteredDOItems.map((item: any) => (item as any).itemImage || null));

  if (doDoc.notes) {
    const notesY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, notesY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
    doc.text(doc.splitTextToSize(doDoc.notes, 120), marginLeft, notesY + 6);
  }

  buildDoFooter(doc);
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${doDoc.doNumber}.pdf`);
}
