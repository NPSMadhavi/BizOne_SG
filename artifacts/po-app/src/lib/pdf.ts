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
    // Tiptap wraps list-item content in <p>, producing </p></li>. Collapse to
    // a single newline so each bullet line doesn't get two newlines (one from
    // </p> and one from </li>), which was causing autotable to over-estimate row height.
    .replace(/<\/p>\s*<\/li>/gi, "\n")
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

interface RichLine { text: string; bold: boolean; italic: boolean; cols?: string[]; align?: string; }

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
  function runsToLine(rr: Run[], prefix = "", align?: string): RichLine | null {
    const text = (prefix + rr.map(r => r.t).join("")).replace(/[ \t]+/g, " ").trim();
    if (!text) return null;
    const tot = rr.reduce((s, r) => s + r.t.length, 0);
    const boldLen = rr.filter(r => r.b).reduce((s, r) => s + r.t.length, 0);
    const italLen = rr.filter(r => r.i).reduce((s, r) => s + r.t.length, 0);
    return {
      text,
      bold: tot > 0 && boldLen > tot / 2,
      italic: tot > 0 && italLen > tot / 2,
      ...(align ? { align } : {}),
    };
  }

  // Add lines from a block element, splitting on <br> sentinels, with optional prefix.
  function addBlock(el: Element, prefix = "") {
    const ta = (el as HTMLElement).style?.textAlign;
    const align = (ta === "justify" || ta === "center" || ta === "right") ? ta : undefined;
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
        const line = runsToLine(seg, firstSeg ? prefix : "", align);
        if (line) out.push(line);
        else if (!firstSeg) out.push({ text: "", bold: false, italic: false }); // hard-break gap
        seg = [];
        firstSeg = false;
      } else {
        seg.push(r);
      }
    }
    const line = runsToLine(seg, firstSeg ? prefix : "", align);
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
        // Walk ALL direct children of <li> so nested lists and multi-paragraph
        // list items (common in Tiptap when pressing Enter inside a bullet) are
        // fully captured — not just the first <p>.
        let isFirstBlock = true;
        for (const child of Array.from(li.childNodes)) {
          if (child.nodeType !== Node.ELEMENT_NODE) {
            const t = ((child.textContent ?? "").replace(/\u00a0/g, " ")).trim();
            if (t) { out.push({ text: (isFirstBlock ? prefix : "  ") + t, bold: false, italic: false }); isFirstBlock = false; }
            continue;
          }
          const cEl = child as Element;
          const cTag = cEl.tagName.toLowerCase();
          if (cTag === "p" || /^h[1-6]$/.test(cTag) || cTag === "div") {
            addBlock(cEl, isFirstBlock ? prefix : "  ");
            isFirstBlock = false;
          } else if (cTag === "ul" || cTag === "ol") {
            // Nested list — render with deeper indent
            let nn = 0;
            for (const nli of Array.from(cEl.querySelectorAll(":scope > li"))) {
              nn++;
              const nprefix = cTag === "ol" ? `  ${nn}. ` : "  • ";
              const ninner = (nli.querySelector(":scope > p") ?? nli) as Element;
              addBlock(ninner, nprefix);
              isFirstBlock = false;
            }
          }
        }
        // Fallback: li had no recognised block children — treat li itself as the line
        if (isFirstBlock) { addBlock(li as Element, prefix); }
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

/**
 * Draw rich HTML content (bold, italic, bullet lists, numbered lists, nesting)
 * as notes text directly in the PDF. Returns the final Y after the last line.
 */
function drawNotesHtml(
  doc: jsPDF,
  html: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineH: number,
  pageH: number,
  footerReserve: number,
  font: string,
): number {
  if (!html?.trim()) return startY;
  // Treat plain text (no HTML tags) by wrapping in <p>
  const src = /<[a-z]/i.test(html) ? html : `<p>${html.replace(/\n/g, "<br>")}</p>`;
  const dom = new DOMParser().parseFromString(src, "text/html");

  interface NSeg { text: string; b: boolean; i: boolean; }
  interface NLine { text: string; b: boolean; i: boolean; xi: number; wi: number; align?: string; segs?: NSeg[]; }
  const INDENT_MM = [0, 4, 9];

  type Run = { t: string; b: boolean; i: boolean };
  function collectRuns(node: Node, b: boolean, i: boolean): Run[] {
    if (node.nodeType === 3) {
      const t = (node.textContent ?? "").replace(/\u00a0/g, " ");
      return t ? [{ t, b, i }] : [];
    }
    if (node.nodeType !== 1) return [];
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return [{ t: "\n", b, i }];
    const nb = b || tag === "strong" || tag === "b";
    const ni = i || tag === "em" || tag === "i";
    return Array.from(el.childNodes).flatMap(c => collectRuns(c, nb, ni));
  }

  const nlines: NLine[] = [];
  function pushBlock(el: Element, prefix: string, indent: number, align?: string) {
    const rr: Run[] = [];
    for (const ch of Array.from(el.childNodes)) {
      const ct = (ch as Element).tagName?.toLowerCase();
      if (ct !== "ul" && ct !== "ol") rr.push(...collectRuns(ch, false, false));
    }
    if (!rr.length && !prefix) { nlines.push({ text: "", b: false, i: false, xi: x, wi: maxWidth, align }); return; }
    // split on hard breaks
    const segments: Run[][] = [[]];
    for (const r of rr) {
      if (r.t === "\n") segments.push([]);
      else segments[segments.length - 1].push(r);
    }
    const xi = x + (INDENT_MM[Math.min(indent, 2)] ?? 9);
    const wi = maxWidth - (INDENT_MM[Math.min(indent, 2)] ?? 9);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const rawText = seg.map(r => r.t).join("").replace(/\s+/g, " ").trim();
      const text = si === 0 ? prefix + rawText : rawText;
      if (!text.trim()) continue;
      const tot = seg.reduce((s, r) => s + r.t.length, 0);
      const boldPct = tot > 0 ? seg.filter(r => r.b).reduce((s, r) => s + r.t.length, 0) / tot : 0;
      const italPct = tot > 0 ? seg.filter(r => r.i).reduce((s, r) => s + r.t.length, 0) / tot : 0;
      // Detect mixed bold/italic within this line and build per-segment info
      const hasMixed = seg.some(r => r.b) !== seg.every(r => r.b) || seg.some(r => r.i) !== seg.every(r => r.i);
      let segs: NSeg[] | undefined;
      if (hasMixed) {
        segs = [];
        // Prepend the list prefix as a plain segment for the first line
        if (si === 0 && prefix) segs.push({ text: prefix, b: false, i: false });
        // Merge consecutive runs with identical bold/italic into segments
        for (const r of seg) {
          if (segs.length > 0 && segs[segs.length - 1].b === r.b && segs[segs.length - 1].i === r.i) {
            segs[segs.length - 1] = { ...segs[segs.length - 1], text: segs[segs.length - 1].text + r.t };
          } else {
            segs.push({ text: r.t, b: r.b, i: r.i });
          }
        }
        segs = segs.filter(s => s.text);
      }
      nlines.push({ text, b: boldPct > 0.5, i: italPct > 0.5, xi, wi, align, segs });
    }
  }

  function walkList(el: Element, indent: number) {
    const isOl = el.tagName.toLowerCase() === "ol";
    // Respect the <ol start="N"> attribute so lists split by blank paragraphs
    // continue numbering correctly in the PDF (e.g. item 8 doesn't reset to 1).
    let n = isOl ? (parseInt((el as HTMLElement).getAttribute("start") || "1", 10) - 1) : 0;
    const indentOff = INDENT_MM[Math.min(indent, 2)] ?? 4;
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      // Empty list items (from pressing Enter to create spacing) → blank line,
      // counter does NOT increment so numbering of real items stays correct.
      if (!(li.textContent ?? "").trim()) {
        nlines.push({ text: "", b: false, i: false, xi: x + indentOff, wi: maxWidth - indentOff });
        continue;
      }
      n++;
      const prefix = isOl ? `${n}. ` : indent === 1 ? "\u2022 " : "\u25E6 ";
      const paragraphs = Array.from(li.children).filter(
        (c) => c.tagName.toLowerCase() === "p"
      ) as Element[];
      if (paragraphs.length > 0) {
        // First paragraph gets the list prefix; subsequent paragraphs are
        // continuation content within the same list item (e.g. a body paragraph
        // after a bold heading) — render them with the same indent, no prefix.
        pushBlock(paragraphs[0], prefix, indent);
        for (let pi = 1; pi < paragraphs.length; pi++) {
          pushBlock(paragraphs[pi], "", indent);
        }
      } else {
        // No <p> wrapper — process the <li> element directly
        pushBlock(li as Element, prefix, indent);
      }
      for (const ch of Array.from(li.children)) {
        const ct = ch.tagName.toLowerCase();
        if (ct === "ul" || ct === "ol") walkList(ch, indent + 1);
      }
    }
  }

  for (const child of Array.from(dom.body.childNodes)) {
    if (child.nodeType !== 1) {
      const t = (child.textContent ?? "").trim();
      if (t) nlines.push({ text: t, b: false, i: false, xi: x, wi: maxWidth });
      continue;
    }
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "p" || tag === "div" || /^h\d$/.test(tag)) {
      const ta = (el as HTMLElement).style?.textAlign;
      const align = (ta === "justify" || ta === "center" || ta === "right") ? ta : undefined;
      pushBlock(el, "", 0, align);
    } else if (tag === "ul" || tag === "ol") {
      walkList(el, 1);
    } else {
      pushBlock(el, "", 0);
    }
  }

  let y = startY;
  for (const nl of nlines) {
    if (!nl.text) { y += lineH; continue; }

    if (nl.segs && nl.segs.length > 1) {
      // Inline mixed-bold/italic rendering.
      // Build a per-character style map so we can split each wrapped line
      // into styled runs (e.g. "8. " plain + "Customer Data…:" bold + rest plain).
      const charStyles: Array<{ b: boolean; i: boolean }> = [];
      for (const seg of nl.segs) {
        for (let ci = 0; ci < seg.text.length; ci++) charStyles.push({ b: seg.b, i: seg.i });
      }
      // Use normal font for word-wrap measurement (slight width inaccuracy is OK).
      doc.setFont(font, "normal");
      const wrappedLines = doc.splitTextToSize(nl.text, nl.wi) as string[];
      let charPos = 0;
      for (const wl of wrappedLines) {
        if (y + lineH > pageH - footerReserve) { doc.addPage(); y = 20; }
        let lineX = nl.xi;
        let ci = 0;
        while (ci < wl.length) {
          const cs = charStyles[Math.min(charPos + ci, charStyles.length - 1)] ?? { b: false, i: false };
          const start = ci;
          while (ci < wl.length) {
            const ccs = charStyles[Math.min(charPos + ci, charStyles.length - 1)] ?? { b: false, i: false };
            if (ccs.b !== cs.b || ccs.i !== cs.i) break;
            ci++;
          }
          const runText = wl.substring(start, ci);
          const rstyle = cs.b && cs.i ? "bolditalic" : cs.b ? "bold" : cs.i ? "italic" : "normal";
          doc.setFont(font, rstyle);
          doc.text(runText, lineX, y);
          lineX += doc.getTextWidth(runText);
        }
        // Advance charPos past this wrapped line and any whitespace separator.
        charPos += wl.length;
        while (charPos < nl.text.length && nl.text[charPos] === " ") charPos++;
        y += lineH;
      }
    } else {
      const style = nl.b && nl.i ? "bolditalic" : nl.b ? "bold" : nl.i ? "italic" : "normal";
      doc.setFont(font, style);
      const wrappedLines = doc.splitTextToSize(nl.text, nl.wi) as string[];
      for (let wi = 0; wi < wrappedLines.length; wi++) {
        const wl = wrappedLines[wi];
        const isLast = wi === wrappedLines.length - 1;
        if (y + lineH > pageH - footerReserve) { doc.addPage(); y = 20; }
        if (nl.align === "justify" && !isLast) {
          doc.text(wl, nl.xi, y, { align: "justify", maxWidth: nl.wi });
        } else if (nl.align === "center") {
          doc.text(wl, nl.xi + nl.wi / 2, y, { align: "center" });
        } else if (nl.align === "right") {
          doc.text(wl, nl.xi + nl.wi, y, { align: "right" });
        } else {
          doc.text(wl, nl.xi, y);
        }
        y += lineH;
      }
    }
  }
  doc.setFont(font, "normal");
  doc.setTextColor(0, 0, 0);
  return y + 2;
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

  // Use the pre-computed column width from columnStyles rather than data.cell.width,
  // because data.cell.width at didParseCell time reflects autotable's preliminary
  // (unfinalized) width for auto-sized columns and can be near-zero.
  const knownDescWidth: number | undefined = opts.columnStyles?.[descColIdx]?.cellWidth;

  // Clear description-column text from each body row so autotable measures 0 height
  // for those cells. Without this, autotable counts \n characters in the plain-text
  // content (including inter-element whitespace from Tiptap HTML) and allocates more
  // height than our minCellHeight predicts, leaving a blank gap below the drawn text.
  const cleanedBody = (restOpts.body ?? []).map((row: any) => {
    if (!Array.isArray(row)) return row;
    // Section rows: single object with colSpan — clear content entirely
    if (row.length === 1 && row[0] !== null && typeof row[0] === "object" && (row[0].colSpan ?? 1) > 1) {
      return [{ ...row[0], content: "" }];
    }
    // Regular rows: clear the description column
    return row.map((cell: any, ci: number) => ci === descColIdx ? "" : cell);
  });

  (doc as any).autoTable({
    styles: { font: PDF_FONT },
    ...restOpts,
    body: cleanedBody,
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
      // Resolve padding from cell styles (number = uniform, object = per-side)
      const cp = data.cell.styles?.cellPadding;
      const hPad = typeof cp === "number" ? cp * 2 : ((cp?.left ?? 4) + (cp?.right ?? 4));
      const vPad = typeof cp === "number" ? cp * 2 : ((cp?.top ?? 4) + (cp?.bottom ?? 4));
      // Use the pre-computed column width; fall back to data.cell.width only when
      // knownDescWidth is not available. Guard against near-zero values either way.
      const rawW = typeof knownDescWidth === "number" ? knownDescWidth : data.cell.width;
      const maxW = Math.max(20, rawW - hPad);
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
      const needed = totalH + vPad;
      if (!data.cell.styles.minCellHeight || data.cell.styles.minCellHeight < needed) {
        data.cell.styles.minCellHeight = needed;
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
      // Read actual cell padding from resolved styles so compact mode (cellPadding:2)
      // uses the same width for splitTextToSize as didParseCell does.
      const _cellCp = data.cell.styles?.cellPadding;
      const _lPad = typeof _cellCp === "number" ? _cellCp : (_cellCp?.left  ?? 4);
      const _rPad = typeof _cellCp === "number" ? _cellCp : (_cellCp?.right ?? 4);
      const _tPad = typeof _cellCp === "number" ? _cellCp : (_cellCp?.top   ?? 4);
      const _bPad = typeof _cellCp === "number" ? _cellCp : (_cellCp?.bottom ?? 4);
      const x = cell.x + _lPad;
      const maxW = cell.width - _lPad - _rPad - imgReserve;

      if (!richLines || richLines.length === 0) {
        if (rowImg) {
          const imgH = Math.min(IMG_H_MAX, cell.height - _tPad - _bPad);
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
      jdoc.setFontSize(9.5);

      // Compute first-line baseline using autotable's exact formula (valign:"top"):
      //   textPos.y = cell.y + topPadding + lineHeight * 0.8
      // We derive topPadding from the cell's resolved styles rather than trusting
      // textPos.y from data.cell (which autotable may recalculate after willDrawCell
      // clears cell.text to [], producing a shifted value).
      const _topPad = _tPad;
      const BASELINE_OFFSET = LINE_H * 0.8; // matches autotable's constant
      // Build rendering plan — each line gets its baseline y coordinate
      type Plan = { y: number; richLine: RichLine };
      const plan: Plan[] = [];
      let ty = cell.y + _topPad + BASELINE_OFFSET;
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
          const lines: string[] = jdoc.splitTextToSize(text, maxW);
          const alignment = richLine.align ?? "left";
          lines.forEach((line: string, li: number) => {
            const lineY = y + li * LINE_H;
            const isLast = li === lines.length - 1;
            if (alignment === "justify" && !isLast) {
              jdoc.text(line, x, lineY, { align: "justify", maxWidth: maxW });
            } else if (alignment === "center") {
              jdoc.text(line, x + maxW / 2, lineY, { align: "center" });
            } else if (alignment === "right") {
              jdoc.text(line, x + maxW, lineY, { align: "right" });
            } else {
              jdoc.text(line, x, lineY);
            }
          });
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
          const imgH = Math.min(IMG_H_MAX, cell.height - _tPad - _bPad);
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

function currSymbol(currency: string): string {
  const map: Record<string, string> = {
    SGD: "S$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM", INR: "₹",
  };
  return map[currency] ?? currency;
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
  poHeaderArr.push(`Unit Price (${currSymbol(poCurrency)})`, `Amount (${currSymbol(poCurrency)})`);
  const poHeaders = poHeaderArr;

  const poRichDesc = filteredPOItems.map((item: any) => htmlToRichLines(item.description));
  const tableData = filteredPOItems.map((item, index) => {
    const row: any[] = [index + 1, item.partNumber, htmlToText(item.description), item.qty];
    if (hasPOUom) row.push((item as any).uom || "");
    row.push(fmtNum(Number(item.unitPrice)), fmtNum(Number(item.amount)));
    return row;
  });

  const poTableWidth = marginRight - marginLeft;
  // Measure at header font so column widths are exactly as tight as needed (single-line)
  doc.setFontSize(8.5); doc.setFont(PDF_FONT, "bold");
  const _poUpW  = Math.ceil(doc.getTextWidth(`Unit Price (${currSymbol(poCurrency)})`) + 5); // 4 mm pad + 1 safety
  const _poAmtW = Math.ceil(doc.getTextWidth(`Amount (${currSymbol(poCurrency)})`)     + 5);
  const _poQtyW = Math.max(Math.ceil(doc.getTextWidth("Qty") + 5), 14); // head pad 4mm + 1 safety; min 14mm for body
  const _poPartNoHeaderW = Math.ceil(doc.getTextWidth("Item / Part Number") + 5);
  doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal");
  // Also measure widest actual part number value at body font — header text is often narrower than data
  const _poPartNoContentW = filteredPOItems.reduce((max: number, item: any) => {
    const pn = (item.partNumber || "").trim();
    return pn ? Math.max(max, Math.ceil(doc.getTextWidth(pn) + 8)) : max;
  }, 0);
  const _poPartNoW = Math.min(55, Math.max(_poPartNoHeaderW, _poPartNoContentW));
  const poFixedMap: Array<{ halign?: string; fixed?: number; auto?: true; valign?: string; cellPadding?: { top?: number; bottom?: number; left?: number; right?: number } }> = [
    { fixed: 12, halign: "left", valign: "top" }, // #
    { fixed: _poPartNoW },            // part no
    { auto: true },                   // description
    { fixed: _poQtyW, halign: "right" }, // qty
    ...(hasPOUom ? [{ fixed: 18, halign: "center" as const }] : []), // uom
    { fixed: _poUpW,  halign: "right", valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } }, // unit price
    { fixed: _poAmtW, halign: "right", valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } }, // amount
  ];
  const poColStyles = smartColWidths(doc, poHeaders, tableData, poTableWidth, poFixedMap);
  // Exact description column width — prevents minCellHeight from wrapping incorrectly
  const poKnownDescW = poTableWidth - 12 - _poPartNoW - _poQtyW - (hasPOUom ? 18 : 0) - _poUpW - _poAmtW;

  const pageHeight = doc.internal.pageSize.getHeight();
  const totalsBlockH = 28; // subtotal + tax + rule + total ≈ 28 mm
  const notesLineH = 5;

  const poUnitPriceIdx = poHeaders.indexOf(`Unit Price (${currSymbol(poCurrency)})`);
  const poAmountIdx = poHeaders.indexOf(`Amount (${currSymbol(poCurrency)})`);
  const poQtyIdx = poHeaders.indexOf("Qty");
  const poTablePages: number[] = [];

  autoTableRich(doc, {
    startY: 113,
    head: [poHeaders],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 4 },
    columnStyles: poColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    rowPageBreak: "avoid",
    didDrawPage: (_d: any) => { poTablePages.push((doc as any).internal.getCurrentPageInfo().pageNumber); },
    didParseCell: (data: any) => {
      if ([poQtyIdx, poUnitPriceIdx, poAmountIdx].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  }, 2, poRichDesc, filteredPOItems.map((item: any) => (item as any).itemImage || null));

  const poFinalY = (doc as any).lastAutoTable.finalY;
  { const _uniq = [...new Set(poTablePages)];
    if (_uniq.length > 1) {
      const _retPg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      for (const _pg of _uniq.slice(0, -1)) {
        doc.setPage(_pg);
        doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(140, 140, 140);
        doc.text("Continued on next page \u2192", marginRight, pageHeight - FOOTER_RESERVE - 2, { align: "right" });
      }
      doc.setPage(_retPg);
      doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(0, 0, 0);
    }
  }

  let currentY = poFinalY + 16;

  // Notes — rich HTML, paginated
  if (po.notes) {
    if (currentY + 14 > pageHeight - FOOTER_RESERVE) { doc.addPage(); currentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, currentY);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    currentY = drawNotesHtml(doc, po.notes, marginLeft, currentY + 6, marginRight - marginLeft, notesLineH, pageHeight, FOOTER_RESERVE, PDF_FONT);
  }

  // Totals — if they don't fit on this page, push to a new page
  let poTotalsOnNewPage = false;
  if (currentY + totalsBlockH + FOOTER_RESERVE > pageHeight) {
    doc.addPage();
    currentY = 20;
    poTotalsOnNewPage = true;
  }

  const labelX = 146;
  const valueX = marginRight - 4;
  const poPinnedY = pageHeight - FOOTER_RESERVE - totalsBlockH;
  // Only bottom-pin when on same page as items; on a fresh page, draw from top
  const totalsY = poTotalsOnNewPage ? currentY : Math.max(currentY, poPinnedY);

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

/**
 * Count the total number of wrapped text lines that drawNotesHtml would produce
 * for the given HTML string, at the current font size.  Used to pre-measure
 * block heights before rendering (e.g. for the bank-details shaded box).
 */
function countHtmlLines(doc: jsPDF, html: string, maxW: number): number {
  if (!html?.trim()) return 0;
  const src = /<[a-z]/i.test(html) ? html : `<p>${html.replace(/\n/g, "<br>")}</p>`;
  const dom = new DOMParser().parseFromString(src, "text/html");
  let count = 0;
  const INDENT_MM = [0, 4, 9];

  function measureBlock(el: Element, prefix: string, indent: number) {
    const indOff = INDENT_MM[Math.min(indent, 2)] ?? 9;
    const w = maxW - indOff;
    // Mirror drawNotesHtml: split on <br> elements, measure each segment separately
    const segments: string[][] = [[]];
    for (const ch of Array.from(el.childNodes)) {
      const ct = (ch as Element).tagName?.toLowerCase();
      if (ct === "br") { segments.push([]); continue; }
      if (ct !== "ul" && ct !== "ol") segments[segments.length - 1].push((ch.textContent ?? "").replace(/\u00a0/g, " "));
    }
    let anyText = false;
    for (let si = 0; si < segments.length; si++) {
      const text = ((si === 0 ? prefix : "") + segments[si].join("").replace(/\s+/g, " ")).trim();
      if (text) { count += (doc.splitTextToSize(text, Math.max(w, 10)) as string[]).length; anyText = true; }
      else if (si < segments.length - 1) { count += 1; } // blank line from <br><br>
    }
    if (!anyText) count += 1;
  }

  function walkHtmlListCount(el: Element, indent: number) {
    const isOl = el.tagName.toLowerCase() === "ol";
    let n = isOl ? (parseInt((el as HTMLElement).getAttribute("start") || "1", 10) - 1) : 0;
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      if (!(li.textContent ?? "").trim()) { count += 1; continue; }
      n++;
      const prefix = isOl ? `${n}. ` : indent === 1 ? "\u2022 " : "\u25E6 ";
      const paras = Array.from(li.children).filter(c => c.tagName.toLowerCase() === "p") as Element[];
      if (paras.length > 0) {
        measureBlock(paras[0], prefix, indent);
        for (let pi = 1; pi < paras.length; pi++) measureBlock(paras[pi], "", indent);
      } else {
        measureBlock(li as Element, prefix, indent);
      }
      for (const ch of Array.from(li.children)) {
        const ct = ch.tagName.toLowerCase();
        if (ct === "ul" || ct === "ol") walkHtmlListCount(ch, indent + 1);
      }
    }
  }

  for (const child of Array.from(dom.body.childNodes)) {
    if (child.nodeType !== 1) {
      const t = (child.textContent ?? "").trim();
      if (t) count += (doc.splitTextToSize(t, maxW) as string[]).length;
      continue;
    }
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "p" || tag === "div" || /^h\d$/.test(tag)) {
      measureBlock(el, "", 0);
    } else if (tag === "ul" || tag === "ol") {
      walkHtmlListCount(el, 1);
    } else {
      measureBlock(el, "", 0);
    }
  }
  return Math.max(1, count);
}

function calcBlockHeight(
  doc: jsPDF,
  settings: { bankDetails?: string; termsAndConditions?: string } | null | undefined,
  maxW: number
): number {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return 0;
  const prevSize = doc.getFontSize();
  doc.setFontSize(7.5);
  const lineH = 3.8;
  const boxPad = 2.5;
  let h = 0;
  if (bank) {
    const bankLines = countHtmlLines(doc, bank, maxW);
    h += boxPad;        // top of shaded rect starts at y - boxPad
    h += 4;             // "Bank Details:" header
    h += bankLines * lineH;
    h += boxPad * 2 + 1; // full bottom padding of shaded box
    if (tnc) h += 4;    // gap before T&C
  }
  if (tnc) {
    h += 4; // "Terms & Conditions:" header
    h += countHtmlLines(doc, tnc, maxW) * lineH;
  }
  doc.setFontSize(prevSize);
  // Add a 12mm safety buffer so estimation errors never cause overflow
  return h + 12;
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
  maxW: number,
  footerReserve = 0
): void {
  const bank = (settings?.bankDetails || "").trim();
  const tnc = (settings?.termsAndConditions || "").trim();
  if (!bank && !tnc) return;

  const lineH = 3.8;
  let y = startY;

  doc.setFontSize(7.5);

  const pageH = doc.internal.pageSize.getHeight();

  if (bank) {
    const bankLines = countHtmlLines(doc, bank, maxW);
    const bankTextH = bankLines * lineH;
    const boxPad = 2.5;
    const boxH = 4 + bankTextH + boxPad * 2 + 1;

    doc.setFillColor(245, 246, 248);
    doc.roundedRect(x - 2, y - boxPad, maxW + 4, boxH, 1.5, 1.5, "F");

    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Bank Details:", x, y); y += 4;
    doc.setTextColor(110, 110, 110);
    // Use footerReserve so content never bleeds into the footer area
    y = drawNotesHtml(doc, bank, x, y, maxW, lineH, pageH, footerReserve, PDF_FONT);
    y += boxPad + 1;
    if (tnc) y += 4;
  }

  if (tnc) {
    doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    // If we've been pushed to a new page mid-bank, reset font size
    doc.setFontSize(7.5);
    doc.text("Terms & Conditions:", x, y); y += 4;
    doc.setTextColor(110, 110, 110);
    drawNotesHtml(doc, tnc, x, y, maxW, lineH, pageH, footerReserve, PDF_FONT);
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
  qtHeaderArr.push(`Unit Price (${currSymbol(qtCurrency)})`);
  if (hasItemDiscount) qtHeaderArr.push("Disc %");
  qtHeaderArr.push(`Amount (${currSymbol(qtCurrency)})`);
  const qtHeaders = qtHeaderArr;
  const qtTotalCols = qtHeaders.length;

  const qtRichDesc: RichLine[][] = [];
  const qtFocFlags: boolean[] = [];
  let qtItemCounter = 0;
  const qtTableData = allQtItems.map((item: any) => {
    if (item.type === "section") {
      qtRichDesc.push(htmlToRichLines(item.sectionLabel || ""));
      qtFocFlags.push(false);
      const halign = item.sectionAlign === "center" ? "center" : "left";
      return [{ content: htmlToText(item.sectionLabel || ""), colSpan: qtTotalCols, styles: { halign } }];
    }
    qtItemCounter++;
    const isQtFocRow = !!(item.isFoc);
    qtFocFlags.push(isQtFocRow);
    const qtRichLines = htmlToRichLines(item.description);
    if (isQtFocRow) qtRichLines.push({ text: "  \u25b8 Free of Charge", bold: true, italic: false });
    qtRichDesc.push(qtRichLines);
    const disc = Number(item.discount) || 0;
    const qtDisplayAmt = isQtFocRow && Number(item.amount) === 0
      ? fmtNum(Number(item.qty) * Number(item.unitPrice) * (1 - disc / 100))
      : fmtNum(Number(item.amount));
    const row: any[] = [qtItemCounter];
    if (hasQtPartNo) row.push(item.partNumber || "");
    row.push(htmlToText(item.description), item.qty);
    if (hasQtUom) row.push(item.uom || "");
    row.push(fmtNum(Number(item.unitPrice)));
    if (hasItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(qtDisplayAmt);
    return row;
  });

  const qtTableWidth = marginRight - marginLeft;
  const qtDescColIdx = hasQtPartNo ? 2 : 1;
  // Measure at header font so column widths are exactly as tight as needed (single-line)
  doc.setFontSize(8.5); doc.setFont(PDF_FONT, "bold");
  const _qtUpW  = Math.ceil(doc.getTextWidth(`Unit Price (${currSymbol(qtCurrency)})`) + 5);
  const _qtAmtW = Math.ceil(doc.getTextWidth(`Amount (${currSymbol(qtCurrency)})`)     + 5);
  const _qtQtyW = Math.max(Math.ceil(doc.getTextWidth("Qty") + 5), 14); // head pad 4mm + 1 safety; min 14mm for body
  const _qtPartNoHeaderW = Math.ceil(doc.getTextWidth("Item / Part Number") + 5);
  doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal");
  const _qtPartNoContentW = regularQtItems.reduce((max: number, item: any) => {
    const pn = (item.partNumber || "").trim();
    return pn ? Math.max(max, Math.ceil(doc.getTextWidth(pn) + 8)) : max;
  }, 0);
  const _qtPartNoW = Math.min(55, Math.max(_qtPartNoHeaderW, _qtPartNoContentW));
  const qtFixedMap: Array<{ halign?: string; fixed?: number; auto?: true; valign?: string; cellPadding?: { top?: number; bottom?: number; left?: number; right?: number } }> = [
    { fixed: 12, halign: "left", valign: "top" },                     // #
    ...(hasQtPartNo ? [{ fixed: _qtPartNoW }] : []),                  // part no (conditional)
    { auto: true },                                                    // description
    { fixed: _qtQtyW, halign: "right" },                              // qty
    ...(hasQtUom ? [{ fixed: 18, halign: "center" as const }] : []),  // uom
    { fixed: _qtUpW,  halign: "right" as const, valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } }, // unit price
    ...(hasItemDiscount ? [{ fixed: 18, halign: "right" as const }] : []),                                             // disc %
    { fixed: _qtAmtW, halign: "right" as const, valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } }, // amount
  ];
  const qtColStyles = smartColWidths(doc, qtHeaders, qtTableData, qtTableWidth, qtFixedMap);
  const qtKnownDescW = qtTableWidth - 12 - (hasQtPartNo ? _qtPartNoW : 0) - _qtQtyW - (hasQtUom ? 18 : 0) - _qtUpW - (hasItemDiscount ? 18 : 0) - _qtAmtW;

  // For quotations, use quotationTerms (not invoice termsAndConditions)
  const qtSettings = settings
    ? { bankDetails: "", termsAndConditions: (settings as any).quotationTerms || "" }
    : null;

  const qtExtraRows = qtDocDiscount > 0 ? 1 : 0;
  const qtBoxH = (3 + qtExtraRows) * 7 + 16;
  const qtBankBlockH = calcBlockHeight(doc, qtSettings, 125);

  const qtUnitPriceIdx = qtHeaders.indexOf(`Unit Price (${currSymbol(qtCurrency)})`);
  const qtAmountIdx = qtHeaders.indexOf(`Amount (${currSymbol(qtCurrency)})`);
  const qtQtyIdx = qtHeaders.indexOf("Qty");
  // Compact padding heuristic: if a normal-padding table would barely push the
  // totals to page 2, switch to tighter padding to keep everything on one page.
  const qtAvailH = pageHeight - qtTableStartY - Math.max(qtBoxH, qtBankBlockH) - FOOTER_RESERVE - 12;
  const qtEstNormal = 9 + regularQtItems.length * 10;
  const qtEstCompact = 9 + regularQtItems.length * 7;
  const qtUseCompact = qtEstNormal > qtAvailH && qtEstCompact <= qtAvailH;
  const qtTablePages: number[] = [];
  autoTableRich(doc, {
    startY: qtTableStartY,
    head: [qtHeaders],
    body: qtTableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: qtUseCompact ? 2 : 4 },
    columnStyles: qtColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    rowPageBreak: "avoid",
    didDrawPage: (_d: any) => { qtTablePages.push((doc as any).internal.getCurrentPageInfo().pageNumber); },
    didParseCell: (data: any) => {
      if ([qtQtyIdx, qtUnitPriceIdx, qtAmountIdx].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "body" && qtFocFlags[data.row.index]) {
        if ([qtQtyIdx, qtUnitPriceIdx, qtAmountIdx].includes(data.column.index)) {
          data.cell.styles.textColor = [217, 119, 6]; // amber
        }
      }
    },
  }, qtDescColIdx, qtRichDesc, allQtItems.map((item: any) => item.type === "section" ? null : ((item as any).itemImage || null)));

  const qtFinalY = (doc as any).lastAutoTable.finalY;
  { const _uniq = [...new Set(qtTablePages)];
    if (_uniq.length > 1) {
      const _retPg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      for (const _pg of _uniq.slice(0, -1)) {
        doc.setPage(_pg);
        doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(140, 140, 140);
        doc.text("Continued on next page \u2192", marginRight, pageHeight - FOOTER_RESERVE - 2, { align: "right" });
      }
      doc.setPage(_retPg);
      doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(0, 0, 0);
    }
  }

  let qtCurrentY = qtFinalY + 12;

  if (qt.notes) {
    if (qtCurrentY + 14 > pageHeight - FOOTER_RESERVE) { doc.addPage(); qtCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, qtCurrentY);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    qtCurrentY = drawNotesHtml(doc, qt.notes, marginLeft, qtCurrentY + 6, marginRight - marginLeft, 5, pageHeight, FOOTER_RESERVE, PDF_FONT);
  }

  // ── Totals + Bank/T&C side-by-side ───────────────────────────────────────────
  const qtCombinedH = Math.max(qtBoxH, qtBankBlockH);
  let qtTotalsOnNewPage = false;
  if (qtCurrentY + qtCombinedH + FOOTER_RESERVE - 2 > pageHeight) { doc.addPage(); qtCurrentY = 20; qtTotalsOnNewPage = true; }

  const qtTaxableAmount = Number(qt.subtotal) - qtDocDiscount;
  const qtTaxRate = qtTaxableAmount > 0 ? Math.round((Number(qt.tax) / qtTaxableAmount) * 1000) / 10 : 0;
  const qtGstLabel = qtTaxRate > 0 ? `GST (${qtTaxRate}%):` : "GST:";
  const labelX = 146;
  const valueX = marginRight - 4;
  const qtPinnedY = pageHeight - FOOTER_RESERVE - qtCombinedH - 4;
  // Only bottom-pin when on same page as items; on a fresh page, draw from top
  const totalsY = qtTotalsOnNewPage ? qtCurrentY + 4 : Math.max(qtCurrentY + 4, qtPinnedY);

  // Right: totals box
  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, qtBoxH, 2, 2, "F");

  let ty = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ty);
  doc.text(fmtMoneyTotal(qtCurrency, Number(qt.subtotal)), valueX, ty, { align: "right" });
  ty += 7;
  if (qtDocDiscount > 0) {
    const qtDiscPct = Number(qt.subtotal) > 0 ? Math.round(qtDocDiscount / Number(qt.subtotal) * 1000) / 10 : 0;
    const qtDiscLabel = qtDiscPct > 0 ? `Discount (${qtDiscPct}%):` : "Discount:";
    doc.setTextColor(180, 0, 0);
    doc.text(qtDiscLabel, labelX, ty);
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
  renderInlineDocInfo(doc, qtSettings, marginLeft, totalsY, 125, FOOTER_RESERVE);

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
    invShipToBottom = renderEntityBlock(doc, inv.customerName, [invShipToAddr], shipStartX, 74, invShipColW);
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
  invHeaderArr.push(`Unit Price (${currSymbol(invCurrency)})`);
  if (hasInvItemDiscount) invHeaderArr.push("Disc %");
  invHeaderArr.push(`Amount (${currSymbol(invCurrency)})`);
  const invHeaders = invHeaderArr;
  const invTotalCols = invHeaders.length;

  const invTableWidth = marginRight - marginLeft;

  const invRichDesc: RichLine[][] = [];
  const invFocFlags: boolean[] = [];
  let invItemCounter = 0;
  const tableData = allInvItems.map((item: any) => {
    if (item.type === "section") {
      invRichDesc.push(htmlToRichLines(item.sectionLabel || ""));
      invFocFlags.push(false);
      const halign = item.sectionAlign === "center" ? "center" : "left";
      return [{ content: htmlToText(item.sectionLabel || ""), colSpan: invTotalCols, styles: { halign } }];
    }
    invItemCounter++;
    const isFocRow = !!(item.isFoc);
    invFocFlags.push(isFocRow);
    const richLines = htmlToRichLines(item.description);
    if (isFocRow) richLines.push({ text: "  \u25b8 Free of Charge", bold: true, italic: false });
    invRichDesc.push(richLines);
    const disc = Number(item.discount) || 0;
    // Backward-compat: if FOC and amount was stored as "0.00", compute from qty/price
    const invDisplayAmt = isFocRow && Number(item.amount) === 0
      ? fmtNum(Number(item.qty) * Number(item.unitPrice) * (1 - disc / 100))
      : fmtNum(Number(item.amount));
    const row: any[] = [invItemCounter];
    if (hasInvPartNo) row.push(item.partNumber || "");
    row.push(htmlToText(item.description), item.qty);
    if (hasInvUom) row.push(item.uom || "");
    row.push(fmtNum(Number(item.unitPrice)));
    if (hasInvItemDiscount) row.push(disc > 0 ? `${disc}%` : "");
    row.push(invDisplayAmt);
    return row;
  });

  const invDescColIdx = hasInvPartNo ? 2 : 1;

  // Measure at header font so column widths are exactly as tight as needed (single-line)
  doc.setFontSize(8.5); doc.setFont(PDF_FONT, "bold");
  const _invUpW  = Math.ceil(doc.getTextWidth(`Unit Price (${currSymbol(invCurrency)})`) + 5);
  const _invAmtW = Math.ceil(doc.getTextWidth(`Amount (${currSymbol(invCurrency)})`)     + 5);
  const _invQtyW = Math.max(Math.ceil(doc.getTextWidth("Qty") + 5), 14); // head pad 4mm + 1 safety; min 14mm for body
  const _invPartNoHeaderW = Math.ceil(doc.getTextWidth("Item / Part Number") + 5);
  doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal");
  const _invPartNoContentW = regularInvItems.reduce((max: number, item: any) => {
    const pn = (item.partNumber || "").trim();
    return pn ? Math.max(max, Math.ceil(doc.getTextWidth(pn) + 8)) : max;
  }, 0);
  const _invPartNoW = Math.min(55, Math.max(_invPartNoHeaderW, _invPartNoContentW));
  const invFixedMap: Array<{ halign?: string; fixed?: number; auto?: true; valign?: string; cellPadding?: { top?: number; bottom?: number; left?: number; right?: number } }> = [
    { fixed: 12, halign: "left", valign: "top" },                  // #
    ...(hasInvPartNo ? [{ fixed: _invPartNoW }] : []),             // part no
    { auto: true },                                                 // description
    { fixed: _invQtyW, halign: "right" },                          // qty
    ...(hasInvUom ? [{ fixed: 18, halign: "center" as const }] : []),  // uom
    { fixed: _invUpW,  halign: "right" as const, valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },  // unit price
    ...(hasInvItemDiscount ? [{ fixed: 18, halign: "right" as const }] : []),                                            // disc %
    { fixed: _invAmtW, halign: "right" as const, valign: "top", cellPadding: { top: 4, bottom: 4, left: 2, right: 2 } },  // amount
  ];
  const invColumnStyles = smartColWidths(doc, invHeaders, tableData, invTableWidth, invFixedMap);
  const invKnownDescW = invTableWidth - 12 - (hasInvPartNo ? _invPartNoW : 0) - _invQtyW - (hasInvUom ? 18 : 0) - _invUpW - (hasInvItemDiscount ? 18 : 0) - _invAmtW;

  const invUnitPriceIdx = invHeaders.indexOf(`Unit Price (${currSymbol(invCurrency)})`);
  const invAmountIdx = invHeaders.indexOf(`Amount (${currSymbol(invCurrency)})`);
  const invQtyIdx = invHeaders.indexOf("Qty");
  // Compact padding heuristic: if a normal-padding table would barely push the
  // totals to page 2, switch to tighter padding to keep everything on one page.
  const invAvailH = pageHeight - invTableStartY - Math.max(invBoxH, invBankBlockH) - FOOTER_RESERVE - 12;
  const invEstNormal = 9 + regularInvItems.length * 10;
  const invEstCompact = 9 + regularInvItems.length * 7;
  const invUseCompact = invEstNormal > invAvailH && invEstCompact <= invAvailH;
  const invTablePages: number[] = [];
  autoTableRich(doc, {
    startY: invTableStartY,
    head: [invHeaders],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: invUseCompact ? 2 : 4 },
    columnStyles: invColumnStyles,
    rowPageBreak: "avoid",
    margin: { top: 12, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    didDrawPage: (_d: any) => { invTablePages.push((doc as any).internal.getCurrentPageInfo().pageNumber); },
    didParseCell: (data: any) => {
      if ([invQtyIdx, invUnitPriceIdx, invAmountIdx].includes(data.column.index)) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "body" && invFocFlags[data.row.index]) {
        if ([invQtyIdx, invUnitPriceIdx, invAmountIdx].includes(data.column.index)) {
          data.cell.styles.textColor = [217, 119, 6]; // amber
        }
      }
    },
  }, invDescColIdx, invRichDesc, allInvItems.map((item: any) => (item as any).type === "section" ? null : ((item as any).itemImage || null)));

  const invFinalY = (doc as any).lastAutoTable.finalY;
  { const _uniq = [...new Set(invTablePages)];
    if (_uniq.length > 1) {
      const _retPg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      for (const _pg of _uniq.slice(0, -1)) {
        doc.setPage(_pg);
        doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(140, 140, 140);
        doc.text("Continued on next page \u2192", marginRight, pageHeight - FOOTER_RESERVE - 2, { align: "right" });
      }
      doc.setPage(_retPg);
      doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(0, 0, 0);
    }
  }

  let invCurrentY = invFinalY + 12;

  if (inv.notes) {
    if (invCurrentY + 14 > pageHeight - FOOTER_RESERVE) { doc.addPage(); invCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, invCurrentY);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    invCurrentY = drawNotesHtml(doc, inv.notes, marginLeft, invCurrentY + 6, marginRight - marginLeft, 5, pageHeight, FOOTER_RESERVE, PDF_FONT);
  }

  // ── Totals + Bank/T&C side-by-side ───────────────────────────────────────────
  const invCombinedH = Math.max(invBoxH, invBankBlockH);
  let invTotalsOnNewPage = false;
  if (invCurrentY + invCombinedH + FOOTER_RESERVE - 2 > pageHeight) { doc.addPage(); invCurrentY = 20; invTotalsOnNewPage = true; }

  const invTaxableAmount = Number(inv.subtotal) - invDocDiscount;
  const invTaxRate = invTaxableAmount > 0 ? Math.round((Number(inv.tax) / invTaxableAmount) * 1000) / 10 : 0;
  const invGstLabel = invTaxRate > 0 ? `GST (${invTaxRate}%):` : "GST:";
  const labelX = 146;
  const valueX = marginRight - 4;
  const invPinnedY = pageHeight - FOOTER_RESERVE - invCombinedH - 4;
  // Only bottom-pin when on same page as items; on a fresh page, draw from top
  const totalsY = invTotalsOnNewPage ? invCurrentY + 4 : Math.max(invCurrentY + 4, invPinnedY);

  // Right: totals box
  doc.setFillColor(244, 246, 250);
  doc.roundedRect(labelX - 5, totalsY - 6, marginRight - labelX + 9, invBoxH, 2, 2, "F");

  let ity = totalsY;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60); doc.setFont(PDF_FONT, "normal");
  doc.text("Subtotal:", labelX, ity);
  doc.text(fmtMoneyTotal(invCurrency, Number(inv.subtotal)), valueX, ity, { align: "right" });
  ity += 7;
  if (invDocDiscount > 0) {
    const invDiscPct = Number(inv.subtotal) > 0 ? Math.round(invDocDiscount / Number(inv.subtotal) * 1000) / 10 : 0;
    const invDiscLabel = invDiscPct > 0 ? `Discount (${invDiscPct}%):` : "Discount:";
    doc.setTextColor(180, 0, 0);
    doc.text(invDiscLabel, labelX, ity);
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
  renderInlineDocInfo(doc, settings, marginLeft, totalsY, 125, FOOTER_RESERVE);

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
  const doFixedMap: Array<{ halign?: string; fixed?: number; auto?: true; valign?: string }> = [
    { fixed: 12, halign: "left", valign: "top" },             // #
    ...(hasPartNo ? [{ fixed: 28, halign: "left" as const }] : []), // item no
    { auto: true },                                            // description
    { fixed: hasDOUom ? 18 : 22, halign: "center" },         // qty
    ...(hasDOUom ? [{ fixed: 18, halign: "center" as const }] : []), // uom
  ];
  const doColStyles = smartColWidths(doc, doHeaders, doTableData, doTableWidth, doFixedMap);
  const doTablePages: number[] = [];

  autoTableRich(doc, {
    startY: 113,
    head: [doHeaders],
    body: doTableData,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 4 },
    columnStyles: doColStyles,
    margin: { top: 20, left: marginLeft, right: 14, bottom: FOOTER_RESERVE },
    rowPageBreak: "avoid",
    didDrawPage: (_d: any) => { doTablePages.push((doc as any).internal.getCurrentPageInfo().pageNumber); },
  }, doDescColIdx, doRichDesc, filteredDOItems.map((item: any) => (item as any).itemImage || null));

  const doFinalY = (doc as any).lastAutoTable.finalY;
  { const doPageH = doc.internal.pageSize.getHeight();
    const doMR = doc.internal.pageSize.getWidth() - 14;
    const _uniq = [...new Set(doTablePages)];
    if (_uniq.length > 1) {
      const _retPg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      for (const _pg of _uniq.slice(0, -1)) {
        doc.setPage(_pg);
        doc.setFontSize(7.5); doc.setFont(PDF_FONT, "italic"); doc.setTextColor(140, 140, 140);
        doc.text("Continued on next page \u2192", doMR, doPageH - FOOTER_RESERVE - 2, { align: "right" });
      }
      doc.setPage(_retPg);
      doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(0, 0, 0);
    }
  }

  if (doDoc.notes) {
    const doPageH = doc.internal.pageSize.getHeight();
    const doNotesWidth = doc.internal.pageSize.getWidth() - 28;
    let doNotesY = doFinalY + 16;
    if (doNotesY + 14 > doPageH - FOOTER_RESERVE) { doc.addPage(); doNotesY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Notes:", marginLeft, doNotesY);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    drawNotesHtml(doc, doDoc.notes, marginLeft, doNotesY + 6, doNotesWidth, 5, doPageH, FOOTER_RESERVE, PDF_FONT);
  }

  buildDoFooter(doc);
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${doDoc.doNumber}.pdf`);
}

// ── ACCOUNTING REPORT PDF HELPERS ────────────────────────────────────────────

function drawAccountingHeader(
  doc: jsPDF,
  logo: LogoData,
  title: string,
  subtitle: string,
  rightLine2: string,
  info: CompanyInfo
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const { w: lw, h: lh } = fitInBox(logo.natW, logo.natH, 65, 18);
  doc.addImage(logo.dataUrl, "PNG", mL, 12, lw, lh);
  doc.setFontSize(22); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(24, 33, 47);
  doc.text(title, mR, 20, { align: "right" });
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(subtitle, mR, 28, { align: "right" });
  if (rightLine2) doc.text(rightLine2, mR, 34, { align: "right" });
  doc.setFontSize(11); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text(info.name, mL, 40);
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(100, 100, 100);
  let cy = 46;
  if (info.addressLine1) { doc.text(info.addressLine1, mL, cy); cy += 5; }
  if (info.addressLine2) { doc.text(info.addressLine2, mL, cy); cy += 5; }
  if (info.registrationNo) doc.text(`Co. Reg. No.: ${info.registrationNo}`, mL, cy);
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.4); doc.line(mL, 58, mR, 58);
}

// ── CUSTOMER STATEMENT PDF ────────────────────────────────────────────────────

export interface StmtPDFEntry {
  id: number; invNumber: string; issueDate: string | null;
  amount: number; status: string; paymentTerms: string | null;
}

export async function generateCustomerStatement_PDF(
  company: Company | null | undefined,
  customer: string,
  from: string | null,
  to: string | null,
  entries: StmtPDFEntry[],
  totals: { totalBilled: number; totalPaid: number; balance: number },
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : to ? `Up to ${fmtDate(to)}` : "All dates";

  drawAccountingHeader(doc, logo, "STATEMENT OF ACCOUNT", `Period: ${periodStr}`, `Prepared for: ${customer}`, info);

  // Recipient box
  let y = 64;
  doc.setFillColor(245, 247, 249);
  doc.roundedRect(mL, y, mR - mL, 16, 1, 1, "F");
  doc.setFontSize(8); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(100, 100, 100);
  doc.text("BILL TO", mL + 4, y + 6);
  doc.setFontSize(11); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(24, 33, 47);
  doc.text(customer, mL + 4, y + 13);
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(periodStr, mR - 4, y + 13, { align: "right" });

  // Invoice table
  const tStartY = y + 22;
  const tableHeaders = ["Date", "Invoice No.", "Payment Terms", "Status", "Amount (SGD)"];
  const tableBody = entries.map(e => [
    fmtDate(e.issueDate),
    e.invNumber,
    e.paymentTerms || "—",
    e.status === "paid" ? "Paid" : e.status === "active" ? "Outstanding" : e.status,
    fmtNum(e.amount),
  ]);

  (doc as any).autoTable({
    startY: tStartY,
    head: [tableHeaders],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 32 }, 2: { cellWidth: 32 }, 3: { cellWidth: 25 },
      4: { cellWidth: "auto", halign: "right" as const },
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  // Summary box
  const sY = (doc as any).lastAutoTable.finalY + 6;
  const sX = mR - 78; const sW = 78;
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal");
  const drawSRow = (label: string, val: string, ry: number, bold = false) => {
    doc.setFont(PDF_FONT, bold ? "bold" : "normal"); doc.setTextColor(80, 80, 80);
    doc.text(label, sX + 4, ry);
    doc.setTextColor(bold ? 24 : 80, bold ? 33 : 80, bold ? 47 : 80);
    doc.text(val, sX + sW - 4, ry, { align: "right" });
  };
  doc.setFillColor(245, 247, 249); doc.rect(sX, sY, sW, 20, "F");
  drawSRow("Total Billed:", `S$ ${fmtNum(totals.totalBilled)}`, sY + 7);
  drawSRow("Total Paid:", `S$ ${fmtNum(totals.totalPaid)}`, sY + 14);
  doc.setFillColor(24, 33, 47); doc.rect(sX, sY + 20, sW, 10, "F");
  doc.setFont(PDF_FONT, "bold"); doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.text("Outstanding Balance:", sX + 4, sY + 27);
  doc.text(`S$ ${fmtNum(totals.balance)}`, sX + sW - 4, sY + 27, { align: "right" });

  buildDocFooter(doc, "Statement of Account");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`SOA_${customer.replace(/[^a-z0-9]/gi, "_")}_${to || "all"}.pdf`);
}

// ── AR AGING PDF ──────────────────────────────────────────────────────────────

export interface AgingPDFRow {
  name: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number;
}
export interface AgingPDFTotals { current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number }

function buildAgingPDF(
  doc: jsPDF, logo: LogoData, info: CompanyInfo,
  title: string, nameCol: string, asOf: string,
  rows: AgingPDFRow[], totals: AgingPDFTotals
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  drawAccountingHeader(doc, logo, title, `As of: ${fmtDate(asOf)}`, "", info);

  // Summary strip
  const sY = 62;
  const buckets = [
    { l: "Current", v: totals.current }, { l: "1–30 Days", v: totals.b1_30 },
    { l: "31–60 Days", v: totals.b31_60 }, { l: "61–90 Days", v: totals.b61_90 },
    { l: "91+ Days", v: totals.b91plus }, { l: "Total Outstanding", v: totals.total },
  ];
  const colW = (mR - mL) / buckets.length;
  doc.setFillColor(245, 247, 249); doc.rect(mL, sY, mR - mL, 18, "F");
  buckets.forEach((b, i) => {
    const cx = mL + i * colW + colW / 2;
    doc.setFontSize(7); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(120, 120, 120);
    doc.text(b.l, cx, sY + 6, { align: "center" });
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(i === 5 ? 24 : 60, i === 5 ? 33 : 60, i === 5 ? 47 : 60);
    doc.text(`S$ ${fmtNum(b.v)}`, cx, sY + 14, { align: "center" });
  });

  const tableHeaders = [nameCol, "Current", "1–30 Days", "31–60 Days", "61–90 Days", "91+ Days", "Total (SGD)"];
  const tableBody = rows.map(r => [
    r.name,
    r.current > 0 ? fmtNum(r.current) : "—",
    r.b1_30 > 0 ? fmtNum(r.b1_30) : "—",
    r.b31_60 > 0 ? fmtNum(r.b31_60) : "—",
    r.b61_90 > 0 ? fmtNum(r.b61_90) : "—",
    r.b91plus > 0 ? fmtNum(r.b91plus) : "—",
    fmtNum(r.total),
  ]);
  tableBody.push([
    "GRAND TOTAL",
    totals.current > 0 ? fmtNum(totals.current) : "—",
    totals.b1_30 > 0 ? fmtNum(totals.b1_30) : "—",
    totals.b31_60 > 0 ? fmtNum(totals.b31_60) : "—",
    totals.b61_90 > 0 ? fmtNum(totals.b61_90) : "—",
    totals.b91plus > 0 ? fmtNum(totals.b91plus) : "—",
    fmtNum(totals.total),
  ]);
  const lastIdx = tableBody.length - 1;

  (doc as any).autoTable({
    startY: sY + 22,
    head: [tableHeaders],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8, font: PDF_FONT },
    bodyStyles: { fontSize: 9, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: "auto" as const },
      1: { halign: "right" as const, cellWidth: 30 }, 2: { halign: "right" as const, cellWidth: 30 },
      3: { halign: "right" as const, cellWidth: 30 }, 4: { halign: "right" as const, cellWidth: 30 },
      5: { halign: "right" as const, cellWidth: 30 }, 6: { halign: "right" as const, cellWidth: 33 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === lastIdx) {
        data.cell.styles.fillColor = [24, 33, 47];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });
}

export async function generateARAgingReport_PDF(
  company: Company | null | undefined, asOf: string,
  customers: AgingPDFRow[], totals: AgingPDFTotals,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  buildAgingPDF(doc, logo, info, "AR AGING REPORT", "Customer", asOf, customers, totals);
  buildDocFooter(doc, "AR Aging Report");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`AR_Aging_${asOf}.pdf`);
}

export async function generateAPAgingReport_PDF(
  company: Company | null | undefined, asOf: string,
  vendors: AgingPDFRow[], totals: AgingPDFTotals,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  buildAgingPDF(doc, logo, info, "AP AGING REPORT", "Vendor", asOf, vendors, totals);
  buildDocFooter(doc, "AP Aging Report");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`AP_Aging_${asOf}.pdf`);
}

// ── TRIAL BALANCE PDF ─────────────────────────────────────────────────────────

export interface TBPDFRow {
  code: string; name: string; type: string; totalDebit: number; totalCredit: number; balance: number;
}
const TB_TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const TB_TYPE_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses",
};

export async function generateTrialBalance_PDF(
  company: Company | null | undefined,
  from: string | null, to: string | null,
  rows: TBPDFRow[], grandDebit: number, grandCredit: number, balanced: boolean,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : to ? `Up to ${fmtDate(to)}` : "All periods";

  drawAccountingHeader(doc, logo, "TRIAL BALANCE", `Period: ${periodStr}`, balanced ? "Status: Balanced ✓" : "Status: Out of balance", info);

  // Build table with section header rows
  const tableHeaders = ["Code", "Account Name", "Debit (SGD)", "Credit (SGD)", "Balance (SGD)"];
  const tableBody: any[][] = [];

  TB_TYPE_ORDER.forEach(type => {
    const typeRows = rows.filter(r => r.type === type && (r.totalDebit > 0.005 || r.totalCredit > 0.005));
    if (typeRows.length === 0) return;
    // Section header row (full width via colSpan trick — we'll style it)
    tableBody.push([`— ${TB_TYPE_LABEL[type].toUpperCase()} —`, "", "", "", ""]);
    typeRows.forEach(r => {
      const bal = r.balance;
      const balStr = Math.abs(bal) < 0.005 ? "—" : bal < 0 ? `(${fmtNum(Math.abs(bal))})` : fmtNum(bal);
      tableBody.push([
        r.code, r.name,
        r.totalDebit > 0.005 ? fmtNum(r.totalDebit) : "—",
        r.totalCredit > 0.005 ? fmtNum(r.totalCredit) : "—",
        balStr,
      ]);
    });
  });
  // Grand total row
  tableBody.push([
    "GRAND TOTAL", "",
    fmtNum(grandDebit), fmtNum(grandCredit),
    !balanced ? `(${fmtNum(Math.abs(grandDebit - grandCredit))})` : "—",
  ]);
  const totalIdx = tableBody.length - 1;

  (doc as any).autoTable({
    startY: 64,
    head: [tableHeaders],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: "auto" as const },
      2: { halign: "right" as const, cellWidth: 38 },
      3: { halign: "right" as const, cellWidth: 38 },
      4: { halign: "right" as const, cellWidth: 38 },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const cell0 = data.row.cells[0]?.raw as string ?? "";
      const isSectionHdr = cell0.startsWith("—") && cell0.endsWith("—");
      if (isSectionHdr) {
        data.cell.styles.fillColor = [237, 240, 245];
        data.cell.styles.textColor = [60, 70, 90];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
      }
      if (data.row.index === totalIdx) {
        data.cell.styles.fillColor = [24, 33, 47];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "Trial Balance");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`Trial_Balance_${to || from || "all"}.pdf`);
}

// ── BALANCE SHEET PDF ─────────────────────────────────────────────────────────

export interface BSPDFAccount { code: string; name: string; subType: string | null; amount: number }

export async function generateBalanceSheet_PDF(
  company: Company | null | undefined,
  asOf: string,
  assets: BSPDFAccount[], totalAssets: number,
  liabilities: BSPDFAccount[], totalLiabilities: number,
  equity: BSPDFAccount[], retainedEarnings: number, totalEquity: number,
  totalLiabilitiesAndEquity: number, balanced: boolean,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));

  drawAccountingHeader(doc, logo, "BALANCE SHEET", `As at: ${fmtDate(asOf)}`, balanced ? "Status: Balanced ✓" : "Status: Out of balance", info);

  const fmtBsAmt = (n: number) => {
    const abs = Math.abs(n); const s = fmtNum(abs);
    return n < 0 ? `(${s})` : s;
  };

  // Build a single combined table with section labels
  const tableHeaders = ["Code", "Description", "Amount (SGD)"];
  const tableBody: any[][] = [];

  const addSection = (label: string, rows: BSPDFAccount[], subtotalLabel: string, subtotal: number, isGrand = false) => {
    tableBody.push([label, "", ""]);
    rows.filter(r => Math.abs(r.amount) > 0.005).forEach(r => {
      tableBody.push([r.code, r.name, fmtBsAmt(r.amount)]);
    });
    tableBody.push(["", isGrand ? subtotalLabel.toUpperCase() : subtotalLabel, fmtBsAmt(subtotal)]);
  };

  const ncAssets = assets.filter(a => a.subType === "non_current_asset");
  const curAssets = assets.filter(a => a.subType !== "non_current_asset");
  const curLiab = liabilities.filter(a => a.subType !== "non_current_liability");
  const ncLiab = liabilities.filter(a => a.subType === "non_current_liability");

  tableBody.push(["ASSETS", "", ""]);
  addSection("Non-Current Assets", ncAssets, "Total Non-Current Assets", ncAssets.reduce((s, a) => s + a.amount, 0));
  addSection("Current Assets", curAssets, "Total Current Assets", curAssets.reduce((s, a) => s + a.amount, 0));
  tableBody.push(["", "TOTAL ASSETS", fmtBsAmt(totalAssets)]);

  tableBody.push(["", "", ""]);
  tableBody.push(["LIABILITIES & EQUITY", "", ""]);
  addSection("Current Liabilities", curLiab, "Total Current Liabilities", curLiab.reduce((s, a) => s + a.amount, 0));
  addSection("Non-Current Liabilities", ncLiab, "Total Non-Current Liabilities", ncLiab.reduce((s, a) => s + a.amount, 0));
  tableBody.push(["", "Total Liabilities", fmtBsAmt(totalLiabilities)]);

  tableBody.push(["Equity", "", ""]);
  equity.filter(e => Math.abs(e.amount) > 0.005).forEach(e => {
    tableBody.push([e.code, e.name, fmtBsAmt(e.amount)]);
  });
  tableBody.push(["", "Retained Earnings (P&L)", fmtBsAmt(retainedEarnings)]);
  tableBody.push(["", "Total Equity", fmtBsAmt(totalEquity)]);
  tableBody.push(["", "TOTAL LIABILITIES & EQUITY", fmtBsAmt(totalLiabilitiesAndEquity)]);

  const totalLEIdx = tableBody.length - 1;
  const totalAssetsIdx = tableBody.findIndex(r => r[1] === "TOTAL ASSETS");

  (doc as any).autoTable({
    startY: 64,
    head: [tableHeaders],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: "auto" as const },
      2: { halign: "right" as const, cellWidth: 45 },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const r = data.row.index;
      const cell0 = data.row.cells[0]?.raw as string ?? "";
      const cell1 = data.row.cells[1]?.raw as string ?? "";
      const isSectionHdr = cell0 !== "" && cell1 === "" && (cell0 === "ASSETS" || cell0 === "LIABILITIES & EQUITY" || cell0 === "Equity" || cell0 === "Non-Current Assets" || cell0 === "Current Assets" || cell0 === "Current Liabilities" || cell0 === "Non-Current Liabilities");
      const isSubtotal = cell0 === "" && cell1 !== "" && !cell1.startsWith("TOTAL");
      const isGrand = r === totalLEIdx || r === totalAssetsIdx;
      const isEmpty = cell0 === "" && cell1 === "" && data.row.cells[2]?.raw === "";

      if (isSectionHdr) {
        data.cell.styles.fillColor = [237, 240, 245];
        data.cell.styles.textColor = [60, 70, 90];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
      } else if (isGrand) {
        data.cell.styles.fillColor = [24, 33, 47];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      } else if (isSubtotal) {
        data.cell.styles.fillColor = [237, 240, 245];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [40, 40, 40];
      } else if (isEmpty) {
        data.cell.styles.fillColor = [255, 255, 255];
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "Balance Sheet");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`Balance_Sheet_${asOf}.pdf`);
}

// ── GST F7 PDF ────────────────────────────────────────────────────────────────

const BOX_LABELS_PDF: Record<number, string> = {
  1: "Total value of standard-rated supplies",
  2: "Total value of zero-rated supplies",
  3: "Total value of exempt supplies",
  4: "Total value of taxable purchases",
  5: "Total value of out-of-scope supplies",
  6: "Output tax due",
  7: "Less: Input tax and refunds claimed",
  8: "Net GST to be paid / claimed",
};

export async function generateGstF7_PDF(
  company: Company | null | undefined,
  data: {
    originalPeriod: { from: string | null; to: string | null };
    amendedPeriod:  { from: string | null; to: string | null };
    company: { name: string; gstRegistrationNo: string | null };
    gstRate: number;
    original: Record<string, number>;
    amended:  Record<string, number>;
    delta:    Record<string, number>;
  },
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = `${fmtDate(data.originalPeriod.from)} – ${fmtDate(data.originalPeriod.to)}`;

  drawAccountingHeader(doc, logo, "GST F7 — AMENDED RETURN", `Original period: ${periodStr}`, `Amended period: ${fmtDate(data.amendedPeriod.from)} – ${fmtDate(data.amendedPeriod.to)}`, info);

  // Company strip
  const sY = 62;
  doc.setFillColor(245, 247, 249); doc.rect(mL, sY, mR - mL, 12, "F");
  doc.setFontSize(8); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(24, 33, 47);
  doc.text("Inland Revenue Authority of Singapore — GST Return F7 (Disclosure of Errors/Omissions)", mL + 4, sY + 5);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(`GST Reg. No.: ${data.company.gstRegistrationNo || "—"}   GST Rate: ${data.gstRate}%`, mL + 4, sY + 10);

  const sections = [
    { label: "PART I — VALUE OF SUPPLIES", boxes: [1, 2, 3, 5] },
    { label: "PART II — PURCHASES & IMPORTS", boxes: [4] },
    { label: "PART III — GST COMPUTATION", boxes: [6, 7, 8] },
  ];

  const tableBody: any[][] = [];
  for (const s of sections) {
    tableBody.push([s.label, "", "", ""]);
    for (const n of s.boxes) {
      const orig = data.original[`box${n}`] ?? 0;
      const amd  = data.amended[`box${n}`]  ?? 0;
      const diff = data.delta[`box${n}`]    ?? 0;
      const diffStr = Math.abs(diff) < 0.005 ? "—" : (diff > 0 ? `+${fmtNum(Math.abs(diff))}` : `(${fmtNum(Math.abs(diff))})`);
      tableBody.push([`Box ${n}  ${BOX_LABELS_PDF[n]}`, fmtNum(orig), fmtNum(amd), diffStr]);
    }
  }
  const lastIdx = tableBody.length; // grand-total handled via tfoot

  (doc as any).autoTable({
    startY: sY + 16,
    head: [["Description", "Original (S$)", "Amended (S$)", "Difference (S$)"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [26, 54, 93], textColor: 255, fontStyle: "bold", fontSize: 8, font: PDF_FONT },
    bodyStyles: { fontSize: 9, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: "auto" as const },
      1: { halign: "right" as const, cellWidth: 38 },
      2: { halign: "right" as const, cellWidth: 38 },
      3: { halign: "right" as const, cellWidth: 38 },
    },
    didParseCell: (data2: any) => {
      if (data2.section !== "body") return;
      const raw = data2.row.cells[0]?.raw as string ?? "";
      const isSection = raw.startsWith("PART");
      const isB8 = raw.startsWith("Box 8");
      if (isSection) {
        data2.cell.styles.fillColor = [26, 54, 93];
        data2.cell.styles.textColor = [255, 255, 255];
        data2.cell.styles.fontStyle = "bold";
        data2.cell.styles.fontSize = 8;
      }
      if (isB8) {
        data2.cell.styles.fillColor = [24, 33, 47];
        data2.cell.styles.textColor = [255, 255, 255];
        data2.cell.styles.fontStyle = "bold";
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "GST F7 Amended Return");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`GST_F7_Amended_${data.amendedPeriod.to || "all"}.pdf`);
}

// ── VENDOR STATEMENT PDF ─────────────────────────────────────────────────────

export interface VendorStmtPDFEntry {
  id: number; piNumber: string; piDate: string | null;
  amount: number; paidAmount: number; balance: number; status: string; currency: string;
}

export async function generateVendorStatement_PDF(
  company: Company | null | undefined,
  vendor: string,
  from: string | null,
  to: string | null,
  entries: VendorStmtPDFEntry[],
  totals: { totalBilled: number; totalPaid: number; balance: number },
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : to ? `Up to ${fmtDate(to)}` : "All dates";

  drawAccountingHeader(doc, logo, "VENDOR STATEMENT", `Period: ${periodStr}`, `Vendor: ${vendor}`, info);

  let y = 64;
  doc.setFillColor(245, 247, 249); doc.roundedRect(mL, y, mR - mL, 16, 1, 1, "F");
  doc.setFontSize(8); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(100, 100, 100);
  doc.text("VENDOR", mL + 4, y + 6);
  doc.setFontSize(11); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(24, 33, 47);
  doc.text(vendor, mL + 4, y + 13);
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text(periodStr, mR - 4, y + 13, { align: "right" });

  const tableHeaders = ["Date", "PI Number", "Currency", "Status", "Total", "Paid", "Balance"];
  const tableBody = entries.map(e => [
    fmtDate(e.piDate),
    e.piNumber,
    e.currency || "SGD",
    e.status === "paid" ? "Paid" : e.status === "partial" ? "Partial" : "Pending",
    fmtNum(e.amount),
    fmtNum(e.paidAmount),
    fmtNum(e.balance),
  ]);

  (doc as any).autoTable({
    startY: y + 22,
    head: [tableHeaders],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 24 }, 1: { cellWidth: 30 }, 2: { cellWidth: 18 }, 3: { cellWidth: 20 },
      4: { halign: "right" as const, cellWidth: 28 },
      5: { halign: "right" as const, cellWidth: 28 },
      6: { halign: "right" as const, cellWidth: "auto" as const },
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  const sY = (doc as any).lastAutoTable.finalY + 6;
  const sX = mR - 78; const sW = 78;
  doc.setFontSize(9); doc.setFont(PDF_FONT, "normal");
  const drawSRow = (label: string, val: string, ry: number, bold = false) => {
    doc.setFont(PDF_FONT, bold ? "bold" : "normal"); doc.setTextColor(80, 80, 80);
    doc.text(label, sX + 4, ry);
    doc.setTextColor(bold ? 24 : 80, bold ? 33 : 80, bold ? 47 : 80);
    doc.text(val, sX + sW - 4, ry, { align: "right" });
  };
  doc.setFillColor(245, 247, 249); doc.rect(sX, sY, sW, 20, "F");
  drawSRow("Total Billed:", `S$ ${fmtNum(totals.totalBilled)}`, sY + 7);
  drawSRow("Total Paid:",   `S$ ${fmtNum(totals.totalPaid)}`,   sY + 14);
  doc.setFillColor(24, 33, 47); doc.rect(sX, sY + 20, sW, 10, "F");
  doc.setFont(PDF_FONT, "bold"); doc.setTextColor(255, 255, 255); doc.setFontSize(9.5);
  doc.text("Outstanding Balance:", sX + 4, sY + 27);
  doc.text(`S$ ${fmtNum(totals.balance)}`, sX + sW - 4, sY + 27, { align: "right" });

  buildDocFooter(doc, "Vendor Statement");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`Vendor_SOA_${vendor.replace(/[^a-z0-9]/gi, "_")}_${to || "all"}.pdf`);
}

// ── PROFIT & LOSS PDF ─────────────────────────────────────────────────────────

interface PnlPDFAccount { code: string; name: string; amount: number }
interface PnlPDFData {
  period: { from: string | null; to: string | null };
  revenue: PnlPDFAccount[]; otherIncome: PnlPDFAccount[]; totalRevenue: number;
  costOfSales: PnlPDFAccount[]; totalCostOfSales: number; grossProfit: number;
  operatingExpenses: PnlPDFAccount[]; totalOperatingExpenses: number;
  operatingProfit: number; incomeTax: number; netProfit: number;
}

export async function generateProfitLoss_PDF(
  company: Company | null | undefined,
  data: PnlPDFData,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = data.period.from && data.period.to ? `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}` : "All periods";

  drawAccountingHeader(doc, logo, "PROFIT & LOSS", `Period: ${periodStr}`, "", info);

  const tableBody: any[][] = [];
  const fmtBs = (n: number) => { const s = fmtNum(Math.abs(n)); return n < 0 ? `(${s})` : s; };

  const addGroup = (label: string, rows: PnlPDFAccount[], subtotalLabel: string, subtotal: number) => {
    tableBody.push([`— ${label.toUpperCase()} —`, "", ""]);
    rows.forEach(r => tableBody.push([r.code, r.name, fmtBs(r.amount)]));
    if (rows.length === 0) tableBody.push(["", "No entries", "—"]);
    tableBody.push(["", subtotalLabel, fmtBs(subtotal)]);
  };

  addGroup("Revenue", [...data.revenue, ...data.otherIncome], "Total Revenue", data.totalRevenue);
  addGroup("Cost of Sales", data.costOfSales, "Total Cost of Sales", data.totalCostOfSales);

  // Gross profit separator
  tableBody.push(["GROSS PROFIT", "", fmtBs(data.grossProfit)]);

  addGroup("Operating Expenses", data.operatingExpenses, "Total Operating Expenses", data.totalOperatingExpenses);
  tableBody.push(["OPERATING PROFIT", "", fmtBs(data.operatingProfit)]);

  if (Math.abs(data.incomeTax) > 0.005) {
    tableBody.push(["7300", "Income Tax Expense", fmtBs(data.incomeTax)]);
  }
  tableBody.push([data.netProfit >= 0 ? "NET PROFIT" : "NET LOSS", "", fmtBs(data.netProfit)]);
  const netIdx = tableBody.length - 1;

  const grossIdx = tableBody.findIndex(r => r[0] === "GROSS PROFIT");
  const opIdx    = tableBody.findIndex(r => r[0] === "OPERATING PROFIT");

  (doc as any).autoTable({
    startY: 64,
    head: [["Code", "Account", "Amount (SGD)"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: "auto" as const },
      2: { halign: "right" as const, cellWidth: 45 },
    },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      const r = d.row.index;
      const c0 = d.row.cells[0]?.raw as string ?? "";
      const c1 = d.row.cells[1]?.raw as string ?? "";
      const isSection = c0.startsWith("—") && c0.endsWith("—");
      const isSubtotal = c0 === "" && c1.startsWith("Total");
      const isGross = r === grossIdx;
      const isOp    = r === opIdx;
      const isNet   = r === netIdx;

      if (isSection) {
        d.cell.styles.fillColor = [237, 240, 245];
        d.cell.styles.textColor = [60, 70, 90];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 8;
      } else if (isSubtotal) {
        d.cell.styles.fillColor = [237, 240, 245];
        d.cell.styles.fontStyle = "bold";
      } else if (isGross || isOp) {
        d.cell.styles.fillColor = [220, 225, 235];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 9.5;
      } else if (isNet) {
        d.cell.styles.fillColor = [24, 33, 47];
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 10;
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "Profit & Loss Statement");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`PnL_${data.period.to || "all"}.pdf`);
}

// ── GST F5 PDF ────────────────────────────────────────────────────────────────

interface F5PDFData {
  period: { from: string | null; to: string | null };
  company: { name: string; gstRegistrationNo: string | null; address: string | null };
  gstRate: number;
  box1: number; box2: number; box3: number; box4: number; box5: number;
  box6: number; box7: number; box8: number;
}

const F5_PARTS = [
  { part: "PART I — DECLARATION OF TOTAL VALUE OF SUPPLIES", boxes: [1, 2, 3, 5] },
  { part: "PART II — DECLARATION OF TOTAL VALUE OF PURCHASES AND IMPORTS", boxes: [4] },
  { part: "PART III — GST COMPUTATION", boxes: [6, 7, 8] },
] as const;

const F5_BOX_LABELS: Record<number, string> = {
  1: "Total value of standard-rated supplies",
  2: "Total value of zero-rated supplies",
  3: "Total value of exempt supplies",
  4: "Total value of taxable purchases and expenses",
  5: "Total value of out-of-scope supplies",
  6: "Output tax due",
  7: "Less: Input tax and refunds claimed",
  8: "Net GST to be paid to / claimed from Comptroller",
};

export async function generateGstF5_PDF(
  company: Company | null | undefined,
  data: F5PDFData,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = data.period.from && data.period.to ? `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}` : "All periods";

  drawAccountingHeader(doc, logo, "GST RETURN (FORM F5)", `Accounting period: ${periodStr}`, `GST Reg. No.: ${data.company.gstRegistrationNo || "—"}`, info);

  // IRAS sub-header
  const sY = 62;
  doc.setFillColor(26, 54, 93); doc.rect(mL, sY, mR - mL, 8, "F");
  doc.setFontSize(7.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(255, 255, 255);
  doc.text("Inland Revenue Authority of Singapore  ·  Computer-generated working paper — file at mytax.iras.gov.sg", mL + 4, sY + 5.5);

  const boxVal = (n: number) => (data as any)[`box${n}`] as number ?? 0;
  const b8 = boxVal(8);

  const tableBody: any[][] = [];
  for (const { part, boxes } of F5_PARTS) {
    tableBody.push([part, "", ""]);
    for (const n of boxes) {
      const val = n === 8 ? Math.abs(b8) : boxVal(n);
      const label = n === 8
        ? (b8 > 0.005 ? "Net GST payable to Comptroller" : b8 < -0.005 ? "Net GST claimable from Comptroller" : "Net GST (payable / claimable)")
        : F5_BOX_LABELS[n];
      tableBody.push([`Box ${n}`, label, fmtNum(val)]);
    }
  }
  const b8Idx = tableBody.length - 1;

  (doc as any).autoTable({
    startY: sY + 12,
    head: [["Box", "Description", `Amount (S$) — GST Rate ${data.gstRate}%`]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [26, 54, 93], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" as const },
      1: { cellWidth: "auto" as const },
      2: { halign: "right" as const, cellWidth: 45 },
    },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      const raw = d.row.cells[0]?.raw as string ?? "";
      const isPart = !raw.startsWith("Box");
      const isB8   = d.row.index === b8Idx;
      if (isPart) {
        d.cell.styles.fillColor = [26, 54, 93];
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 7.5;
      } else if (isB8) {
        d.cell.styles.fillColor = [24, 33, 47];
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 10;
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  // Declaration box
  const declY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFillColor(245, 247, 249); doc.rect(mL, declY, mR - mL, 22, "F");
  doc.setDrawColor(200, 200, 200); doc.rect(mL, declY, mR - mL, 22);
  doc.setFontSize(7.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(60, 60, 60);
  doc.text("Declaration", mL + 4, declY + 5);
  doc.setFont(PDF_FONT, "normal");
  doc.text("I declare that the information provided in this GST Return is true and correct to the best of my knowledge and belief.", mL + 4, declY + 10);
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
  const sigW = (mR - mL - 8) / 3;
  ["Signature", "Name & Designation", "Date"].forEach((f, i) => {
    const sx = mL + 4 + i * (sigW + 4);
    doc.line(sx, declY + 19, sx + sigW, declY + 19);
    doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text(f, sx, declY + 22);
  });

  buildDocFooter(doc, "GST F5 Return");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`GST_F5_${data.period.to || "all"}.pdf`);
}

// ── GENERAL LEDGER PDF ────────────────────────────────────────────────────────

interface GLTxPDF { date: string; reference: string | null; description: string | null; debit: number; credit: number; balance: number }

export async function generateGeneralLedger_PDF(
  company: Company | null | undefined,
  account: { code: string; name: string; type: string; subType: string | null },
  from: string | null,
  to: string | null,
  openingBalance: number,
  closingBalance: number,
  transactions: GLTxPDF[],
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));
  const periodStr = from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : to ? `Up to ${fmtDate(to)}` : "All periods";

  drawAccountingHeader(doc, logo, "GENERAL LEDGER", `Account: ${account.code} – ${account.name}`, `Period: ${periodStr}`, info);

  // Opening / closing balance strip
  const sY = 62;
  const colW2 = (mR - mL) / 2;
  doc.setFillColor(245, 247, 249); doc.rect(mL, sY, mR - mL, 14, "F");
  const drawBalBox = (label: string, val: number, x: number) => {
    doc.setFontSize(7); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(120, 120, 120);
    doc.text(label, x + 4, sY + 5);
    doc.setFontSize(10); doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(val < 0 ? 180 : 24, val < 0 ? 40 : 33, val < 0 ? 40 : 47);
    const s = fmtNum(Math.abs(val)); const str = val < 0 ? `(${s})` : s;
    doc.text(str, x + 4, sY + 12);
  };
  drawBalBox("Opening Balance", openingBalance, mL);
  drawBalBox("Closing Balance", closingBalance, mL + colW2);

  const fmtBalStr = (n: number) => { const s = fmtNum(Math.abs(n)); return n < 0 ? `(${s})` : s; };

  const tableBody: any[][] = [
    [fmtDate(from), "B/F", "Opening Balance", "—", "—", fmtBalStr(openingBalance)],
    ...transactions.map(tx => [
      fmtDate(tx.date),
      tx.reference || "—",
      tx.description || "—",
      tx.debit > 0.005 ? fmtNum(tx.debit) : "—",
      tx.credit > 0.005 ? fmtNum(tx.credit) : "—",
      fmtBalStr(tx.balance),
    ]),
  ];
  tableBody.push(["", "", "Closing Balance", "", "", fmtBalStr(closingBalance)]);
  const closingIdx = tableBody.length - 1;

  (doc as any).autoTable({
    startY: sY + 18,
    head: [["Date", "Reference", "Description", "Debit (S$)", "Credit (S$)", "Balance (S$)"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: 24 }, 1: { cellWidth: 28 }, 2: { cellWidth: "auto" as const },
      3: { halign: "right" as const, cellWidth: 32 },
      4: { halign: "right" as const, cellWidth: 32 },
      5: { halign: "right" as const, cellWidth: 36 },
    },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      if (d.row.index === 0) { d.cell.styles.fillColor = [237, 240, 245]; d.cell.styles.textColor = [80, 80, 80]; d.cell.styles.fontStyle = "italic"; }
      if (d.row.index === closingIdx) { d.cell.styles.fillColor = [24, 33, 47]; d.cell.styles.textColor = [255, 255, 255]; d.cell.styles.fontStyle = "bold"; }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "General Ledger");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`GL_${account.code}_${account.name.replace(/[^a-z0-9]/gi, "_")}_${to || "all"}.pdf`);
}

// ── CASH FLOW STATEMENT PDF ───────────────────────────────────────────────────

interface CfPDFData {
  period: { from: string; to: string };
  netProfit: number; addBackDepreciation: number;
  workingCapital: {
    changeAR: number; changeOtherReceivables: number; changeGstInput: number;
    changeInventory: number; changePrepayments: number; changeDeposits: number;
    changeAP: number; changeGstOutput: number; changeAccruals: number;
    changeStaffPayable: number; changeCPF: number;
  };
  totalWorkingCapitalChange: number; netOperating: number;
  investing: { equipment: number; furniture: number; renovation: number };
  netInvesting: number;
  financing: { directorsLoan: number; bankLoan: number; shareCapital: number };
  netFinancing: number;
  netChange: number; openingCash: number; closingCash: number;
}

export async function generateCashFlow_PDF(
  company: Company | null | undefined,
  data: CfPDFData,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const mL = 14; const mR = pageWidth - 14;
  const info  = companyToInfo(company);
  const logo  = await getLogoData(getLogoUrl(company));
  const periodStr = `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`;

  drawAccountingHeader(doc, logo, "CASH FLOW STATEMENT", `Period: ${periodStr}`, "Indirect Method", info);

  const fmtBs = (n: number) => { const s = fmtNum(Math.abs(n)); return n < 0 ? `(${s})` : s; };

  const tableBody: any[][] = [];

  const addSectionHeader = (label: string) => tableBody.push([`\u2014 ${label.toUpperCase()} \u2014`, ""]);
  const addRow = (label: string, amount: number, indent = false) => {
    if (Math.abs(amount) < 0.005) return;
    tableBody.push([indent ? `    ${label}` : label, fmtBs(amount)]);
  };
  const addSubtotal = (label: string, amount: number) => tableBody.push([`  ${label}`, fmtBs(amount)]);
  const addSpacer = () => tableBody.push(["", ""]);

  // A: Operating
  addSectionHeader("A  ·  Operating Activities");
  addRow("Net Profit for the period", data.netProfit);
  if (data.addBackDepreciation > 0) addRow("Add back: Depreciation (non-cash)", data.addBackDepreciation);

  addSectionHeader("Changes in Working Capital");
  addRow("Trade Receivables (AR)", data.workingCapital.changeAR, true);
  addRow("Other Receivables", data.workingCapital.changeOtherReceivables, true);
  addRow("GST Input Tax Recoverable", data.workingCapital.changeGstInput, true);
  addRow("Inventory / Stock", data.workingCapital.changeInventory, true);
  addRow("Prepayments", data.workingCapital.changePrepayments, true);
  addRow("Deposits Paid", data.workingCapital.changeDeposits, true);
  addRow("Trade Payables (AP)", data.workingCapital.changeAP, true);
  addRow("GST Output Tax Payable", data.workingCapital.changeGstOutput, true);
  addRow("Accrued Liabilities", data.workingCapital.changeAccruals, true);
  addRow("Staff Salaries Payable", data.workingCapital.changeStaffPayable, true);
  addRow("CPF Contributions Payable", data.workingCapital.changeCPF, true);
  addSubtotal("Net Cash from Operating Activities (A)", data.netOperating);
  addSpacer();

  // B: Investing
  addSectionHeader("B  ·  Investing Activities");
  addRow("Fixed Assets — Equipment (purchases / disposals)", data.investing.equipment);
  addRow("Fixed Assets — Furniture & Fittings", data.investing.furniture);
  addRow("Fixed Assets — Office Renovation", data.investing.renovation);
  addSubtotal("Net Cash from Investing Activities (B)", data.netInvesting);
  addSpacer();

  // C: Financing
  addSectionHeader("C  ·  Financing Activities");
  addRow("Director's Loan — drawdown / repayment", data.financing.directorsLoan);
  addRow("Bank Loan — proceeds / repayment", data.financing.bankLoan);
  addRow("Share Capital — new injection", data.financing.shareCapital);
  addSubtotal("Net Cash from Financing Activities (C)", data.netFinancing);
  addSpacer();

  // Totals
  tableBody.push(["NET CHANGE IN CASH (A + B + C)", fmtBs(data.netChange)]);
  const netChangeIdx = tableBody.length - 1;
  addRow("Opening Cash Balance (start of period)", data.openingCash);
  tableBody.push(["CLOSING CASH BALANCE (end of period)", `SGD ${fmtBs(data.closingCash)}`]);
  const closingIdx = tableBody.length - 1;

  const sectionHeaderIdxs = tableBody.reduce<number[]>((acc, row, i) => {
    const c = row[0] as string ?? "";
    if (c.startsWith("\u2014") && c.endsWith("\u2014")) acc.push(i);
    return acc;
  }, []);
  const subtotalIdxs = tableBody.reduce<number[]>((acc, row, i) => {
    const c = row[0] as string ?? "";
    if (c.startsWith("  ") && !c.startsWith("    ")) acc.push(i);
    return acc;
  }, []);

  (doc as any).autoTable({
    startY: 64,
    head: [["Description", `Amount (SGD)`]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [24, 33, 47], textColor: 255, fontStyle: "bold", fontSize: 8.5, font: PDF_FONT },
    bodyStyles: { fontSize: 9.5, valign: "top", fillColor: [255, 255, 255], font: PDF_FONT },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    styles: { cellPadding: 3, font: PDF_FONT },
    columnStyles: {
      0: { cellWidth: "auto" as const },
      1: { halign: "right" as const, cellWidth: 42 },
    },
    didParseCell: (d: any) => {
      if (d.section !== "body") return;
      const r = d.row.index;
      const c = d.row.cells[0]?.raw as string ?? "";
      if (sectionHeaderIdxs.includes(r)) {
        d.cell.styles.fillColor = [237, 240, 245];
        d.cell.styles.textColor = [60, 70, 90];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 8;
      } else if (subtotalIdxs.includes(r)) {
        d.cell.styles.fillColor = [220, 228, 240];
        d.cell.styles.fontStyle = "bold";
      } else if (r === netChangeIdx) {
        d.cell.styles.fillColor = [24, 33, 47];
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 10;
      } else if (r === closingIdx) {
        d.cell.styles.fillColor = [10, 20, 40];
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize  = 10.5;
      } else if (c === "") {
        d.cell.styles.fillColor = [255, 255, 255];
      }
    },
    margin: { top: 20, left: mL, right: 14, bottom: FOOTER_RESERVE },
  });

  buildDocFooter(doc, "Cash Flow Statement");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`CashFlow_${data.period.from}_to_${data.period.to}.pdf`);
}

// ── Credit Note PDF ───────────────────────────────────────────────────────────
interface CreditNote {
  id: number; cnNumber: string; customerName: string; customerAddress?: string | null;
  contactPerson?: string | null; contactEmail?: string | null;
  refInvNumber?: string | null; reason?: string | null;
  issueDate?: string | null; currency: string; paymentTerms?: string | null;
  subtotal: number; discountAmount: number; taxRate: number; tax: number; totalAmount: number;
  status: string; notes?: string | null; items: any[];
}

export async function generateCreditNote_PDF(
  cn: CreditNote,
  company?: Company | null,
  options?: { returnBase64?: boolean }
): Promise<string | void> {
  await ensurePdfFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  attachPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;
  const info = companyToInfo(company);
  const logo = await getLogoData(getLogoUrl(company));

  buildDocHeader(doc, logo, "CREDIT NOTE", cn.cnNumber, fmtDate((cn as any).issueDate || new Date().toISOString()), cn.status, info);

  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  if (cn.refInvNumber) {
    doc.text(`Ref Invoice: ${cn.refInvNumber}`, marginRight, 42, { align: "right" });
  }
  if (cn.paymentTerms) {
    doc.text(`Payment Terms: ${cn.paymentTerms}`, marginRight, cn.refInvNumber ? 48 : 42, { align: "right" });
  }

  // Bill To
  doc.setFontSize(10); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", marginLeft, 67);
  const entityBottom = renderEntityBlock(doc, cn.customerName, [cn.customerAddress, cn.contactPerson ? `\nAttn: ${cn.contactPerson}` : null], marginLeft, 74, 85);

  // Reason block
  let tableStartY = entityBottom + 10;
  if (cn.reason) {
    doc.setFontSize(9); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Reason for Credit:", marginLeft, tableStartY);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
    const reasonLines = doc.splitTextToSize(cn.reason, marginRight - marginLeft);
    doc.text(reasonLines, marginLeft, tableStartY + 5);
    tableStartY += 5 + reasonLines.length * 5 + 5;
  }

  const cnCurrency = cn.currency || "SGD";
  const allItems = (cn.items as any[]).filter(item => {
    if (item.type === "section") return (item.sectionLabel || "").trim() !== "";
    return (item.description || "").trim() !== "" || (item.partNumber || "").trim() !== "";
  });
  const regularItems = allItems.filter(i => i.type !== "section");
  const hasPartNo = regularItems.some((i: any) => i.partNumber && String(i.partNumber).trim());
  const hasDiscount = regularItems.some(i => Number(i.discount) > 0);

  const headers: string[] = ["#"];
  if (hasPartNo) headers.push("Item / Part Number");
  headers.push("Description", "Qty", `Unit Price (${currSymbol(cnCurrency)})`);
  if (hasDiscount) headers.push("Disc %");
  headers.push(`Amount (${currSymbol(cnCurrency)})`);

  const tableWidth = marginRight - marginLeft;
  const amtW = 28; const qtyW = 14; const upW = 28; const discW = hasDiscount ? 14 : 0;
  const partW = hasPartNo ? 32 : 0;
  const descW = tableWidth - 8 - partW - qtyW - upW - discW - amtW;

  const colStyles: Record<number, any> = {};
  let ci = 0;
  colStyles[ci++] = { cellWidth: 8, halign: "center" };
  if (hasPartNo) colStyles[ci++] = { cellWidth: partW };
  colStyles[ci++] = { cellWidth: descW };
  colStyles[ci++] = { cellWidth: qtyW, halign: "right" };
  colStyles[ci++] = { cellWidth: upW, halign: "right" };
  if (hasDiscount) colStyles[ci++] = { cellWidth: discW, halign: "right" };
  colStyles[ci++] = { cellWidth: amtW, halign: "right" };

  let lineNum = 0;
  const bodyRows: any[][] = allItems.map(item => {
    if (item.type === "section") {
      const row: any[] = [{ content: item.sectionLabel || "", colSpan: headers.length, styles: { fontStyle: "bold", fillColor: [240, 240, 240], textColor: [40, 40, 40] } }];
      return row;
    }
    lineNum++;
    const row: any[] = [String(lineNum)];
    if (hasPartNo) row.push(item.partNumber || "");
    row.push(item.description || "");
    row.push(String(item.qty ?? 1));
    row.push(fmtMoney(cnCurrency, Number(item.unitPrice)));
    if (hasDiscount) row.push(Number(item.discount) > 0 ? `${item.discount}%` : "");
    row.push(fmtMoney(cnCurrency, Number(item.amount)));
    return row;
  });

  (doc as any).autoTable({
    startY: tableStartY,
    head: [headers],
    body: bodyRows,
    columnStyles: colStyles,
    headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [255, 245, 245] },
    margin: { left: marginLeft, right: 14, bottom: 40 },
    didDrawPage: () => {},
  });

  const afterTable = (doc as any).lastAutoTable.finalY + 8;
  const docDiscount = Number(cn.discountAmount) || 0;
  const valueX = marginRight;
  const labelX = marginRight - 35;
  let ty = afterTable;

  doc.setFontSize(9.5); doc.setFont(PDF_FONT, "normal"); doc.setTextColor(80, 80, 80);
  doc.text("Subtotal:", labelX, ty, { align: "right" });
  doc.text(fmtMoney(cnCurrency, cn.subtotal), valueX, ty, { align: "right" });
  ty += 7;
  if (docDiscount > 0) {
    doc.text("Discount:", labelX, ty, { align: "right" });
    doc.text(`- ${fmtMoney(cnCurrency, docDiscount)}`, valueX, ty, { align: "right" });
    ty += 7;
  }
  doc.text(`GST (${Number(cn.taxRate).toFixed(1)}%):`, labelX, ty, { align: "right" });
  doc.text(fmtMoney(cnCurrency, cn.tax), valueX, ty, { align: "right" });
  ty += 2;
  doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4);
  doc.line(labelX - 10, ty, marginRight, ty);
  ty += 5;
  doc.setFontSize(11); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(220, 38, 38);
  doc.text("Credit Total:", labelX, ty, { align: "right" });
  doc.text(fmtMoney(cnCurrency, cn.totalAmount), valueX, ty, { align: "right" });

  if (cn.notes) {
    ty += 14;
    doc.setFontSize(9); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Notes:", marginLeft, ty);
    doc.setFont(PDF_FONT, "normal"); doc.setTextColor(60, 60, 60);
    const noteLines = doc.splitTextToSize(cn.notes, marginRight - marginLeft - 20);
    doc.text(noteLines, marginLeft + 18, ty);
  }

  buildDocFooter(doc, "Credit Note");
  if (options?.returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`CreditNote_${cn.cnNumber}.pdf`);
}
