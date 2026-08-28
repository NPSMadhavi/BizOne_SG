import re

with open("artifacts/po-app/src/lib/pdf.ts", "r", encoding="utf-8") as f:
    code = f.read()

new_funcs = """export interface NoteBlock {
  title: string;
  content: string;
  shaded?: boolean;
}

function calcBlockHeight(
  doc: jsPDF,
  blocks: NoteBlock[],
  maxW: number
): number {
  if (blocks.length === 0) return 0;
  const prevSize = doc.getFontSize();
  doc.setFontSize(7.5);
  const lineH = 3.8;
  const boxPad = 2.5;
  let h = 0;
  for (const b of blocks) {
    const text = (b.content || "").trim();
    if (!text) continue;
    if (b.shaded) {
      const bLines = countHtmlLines(doc, text, maxW);
      h += boxPad;
      if (b.title) h += 4;
      h += bLines * lineH;
      h += boxPad * 2 + 1;
    } else {
      if (b.title) h += 4;
      h += countHtmlLines(doc, text, maxW) * lineH;
    }
    h += 4;
  }
  doc.setFontSize(prevSize);
  return h + 12;
}

function renderInlineDocInfo(
  doc: jsPDF,
  blocks: NoteBlock[],
  x: number,
  startY: number,
  maxW: number,
  footerReserve = 0
): void {
  if (blocks.length === 0) return;
  const lineH = 3.8;
  let y = startY;
  const pageH = doc.internal.pageSize.getHeight();

  for (const b of blocks) {
    const text = (b.content || "").trim();
    if (!text) continue;
    
    if (y + 14 > pageH - footerReserve) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(7.5);
    if (b.shaded) {
      const bLines = countHtmlLines(doc, text, maxW);
      const bTextH = bLines * lineH;
      const boxPad = 2.5;
      const boxH = (b.title ? 4 : 0) + bTextH + boxPad * 2 + 1;

      doc.setFillColor(245, 246, 248);
      doc.roundedRect(x - 2, y - boxPad, maxW + 4, boxH, 1.5, 1.5, "F");

      if (b.title) {
        doc.setFont(PDF_FONT, "bold"); doc.setTextColor(80, 80, 80);
        doc.text(b.title, x, y); y += 4;
      }
      doc.setTextColor(110, 110, 110);
      y = drawNotesHtml(doc, text, x, y, maxW, lineH, pageH, footerReserve, PDF_FONT);
      y += boxPad + 1 + 4;
    } else {
      if (b.title) {
        doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
        doc.text(b.title, x, y); y += 4;
      }
      doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      y = drawNotesHtml(doc, text, x, y, maxW, 5, pageH, footerReserve, PDF_FONT);
      y += 4;
    }
  }
}
"""

start_idx = code.find("function calcBlockHeight(")
end_idx = code.find("// renderBottomDocInfo kept")
code = code[:start_idx] + new_funcs + "\n" + code[end_idx:]


def patch_function(
    func_name,
    prefix,
    obj_name,
    has_totals=True,
    has_bank=False,
    terms_expr=""
):
    global code
    # Find the function body
    func_start = code.find(f"export async function {func_name}(")
    if func_start == -1:
        print(f"Failed to find {func_name}")
        return
    func_end = code.find("export async function", func_start + 10)
    if func_end == -1:
        func_end = len(code)
    
    func_body = code[func_start:func_end]
    
    # 1. Blocks generation logic
    blocks_logic = f"""  const {prefix}Blocks: NoteBlock[] = [];
  if ({obj_name}.notes) {prefix}Blocks.push({{ title: "Internal Notes:", content: {obj_name}.notes }});
  if (({obj_name} as any).customerNote?.trim()) {prefix}Blocks.push({{ title: "Customer Note:", content: ({obj_name} as any).customerNote }});
  if (({obj_name} as any).deliveryInstructions?.trim()) {prefix}Blocks.push({{ title: "Delivery Instructions:", content: ({obj_name} as any).deliveryInstructions }});
"""
    if has_bank:
        blocks_logic += f"  if (settings?.bankDetails) {prefix}Blocks.push({{ title: \"Bank Details:\", content: settings.bankDetails, shaded: true }});\n"
    if terms_expr:
        blocks_logic += f"  if ({terms_expr}?.trim()) {prefix}Blocks.push({{ title: \"Terms & Conditions:\", content: {terms_expr} }});\n"
    
    # 2. Replace old calcBlockHeight if exists
    old_calc_regex = rf"const {prefix}BankBlockH = calcBlockHeight\([^;]+\);"
    new_calc = blocks_logic + f"  const {prefix}BankBlockH = calcBlockHeight(doc, {prefix}Blocks, 125);"
    func_body = re.sub(old_calc_regex, new_calc, func_body)
    
    # 3. Remove old notes drawing logic
    old_notes_regex = rf"  if \({obj_name}\.notes\) \{{\s*if \({prefix}CurrentY \+ 14 > pageHeight - FOOTER_RESERVE\) \{{\s*doc\.addPage\(\);\s*{prefix}CurrentY = 20;\s*\}}\s*doc\.setFontSize\(9\.5\);\s*doc\.setFont\(PDF_FONT, \"bold\"\);\s*doc\.setTextColor\(0, 0, 0\);\s*doc\.text\(\"(Internal )?Notes:\", marginLeft, {prefix}CurrentY\);\s*doc\.setFontSize\(9\);\s*doc\.setTextColor\(60, 60, 60\);\s*{prefix}CurrentY = drawNotesHtml[^;]+;\s*\}}\s*"
    func_body = re.sub(old_notes_regex, "", func_body, flags=re.MULTILINE)
    
    # Also if it's DO where pageH and notesW are defined:
    old_do_notes_regex = r"  if \(doDoc\.notes\) \{[\s\S]*?drawNotesHtml[^;]+;\s*\}"
    func_body = re.sub(old_do_notes_regex, "", func_body)

    # 4. Modify Totals and Signature
    sig_logic = f"""
  // Bottom Right: Authorised Signature
  const sigImg = ({obj_name} as any).authorisedSignature;
  if (sigImg) {{
    const sigW = 45;
    const sigH = 15;
    const sigX = marginRight - sigW;
    const sigY = totalsY;
    doc.addImage(sigImg, "PNG", sigX, sigY, sigW, sigH, "", "FAST");
    doc.setFont(PDF_FONT, "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text("Authorised Signature", sigX + sigW / 2, sigY + sigH + 4, {{ align: "center" }});
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
    doc.line(sigX, sigY + sigH, sigX + sigW, sigY + sigH);
  }}
"""
    if has_totals:
        # replace `let XXTotalsOnNewPage = false;` to include `sigH` in height calculation
        # Example: if (qtCurrentY + qtCombinedH + FOOTER_RESERVE - 2 > pageHeight)
        old_totals_page_regex = rf"if \({prefix}CurrentY \+ {prefix}CombinedH \+ FOOTER_RESERVE - 2 > pageHeight\)"
        new_totals_page = f"const {prefix}SigH = ({obj_name} as any).authorisedSignature ? 25 : 0;\n  if ({prefix}FinalY + 12 + {prefix}CombinedH + {prefix}SigH + FOOTER_RESERVE - 2 > pageHeight)"
        func_body = re.sub(old_totals_page_regex, new_totals_page, func_body)
        
        # adjust totalsY
        old_totals_y = rf"const totalsY = {prefix}TotalsOnNewPage \? {prefix}CurrentY \+ 4 : Math\.max\({prefix}CurrentY \+ 4, {prefix}PinnedY\);"
        new_totals_y = f"const totalsY = {prefix}TotalsOnNewPage ? 20 : Math.max({prefix}FinalY + 12, {prefix}PinnedY);"
        func_body = re.sub(old_totals_y, new_totals_y, func_body)

        # For CN/DN:
        old_cndn_y = rf"const totalsY = {prefix}TotalsOnNewPage \? {prefix}CurrentY \+ 4 : {prefix}CurrentY \+ 4;"
        new_cndn_y = f"const totalsY = {prefix}TotalsOnNewPage ? 20 : {prefix}FinalY + 12;"
        func_body = re.sub(old_cndn_y, new_cndn_y, func_body)
        
        # replace renderInlineDocInfo
        old_render_regex = rf"renderInlineDocInfo\([^;]+\);"
        new_render = f"renderInlineDocInfo(doc, {prefix}Blocks, marginLeft, totalsY, 125, FOOTER_RESERVE);"
        func_body = re.sub(old_render_regex, new_render + "\n" + sig_logic.replace("totalsY", "ty + 10"), func_body)
        
        # Some functions CN/DN don't have renderInlineDocInfo initially, append to end of totals
        if "renderInlineDocInfo" not in func_body:
            totals_end_regex = rf"doc\.text\(fmtMoneyTotal\({prefix}Currency, Number\({obj_name}\.totalAmount\)\), valueX, ty, {{ align: \"right\" }}\);"
            if re.search(totals_end_regex, func_body):
                func_body = re.sub(totals_end_regex, f"doc.text(fmtMoneyTotal({prefix}Currency, Number({obj_name}.totalAmount)), valueX, ty, {{ align: \"right\" }});\n\n  " + new_render + "\n" + sig_logic.replace("totalsY", "ty + 10"), func_body)
    else:
        # DO doesn't have totals
        func_body = func_body.replace("buildDoFooter(doc);", blocks_logic + f"""
  const {prefix}BankBlockH = calcBlockHeight(doc, {prefix}Blocks, 125);
  const {prefix}SigH = ({obj_name} as any).authorisedSignature ? 25 : 0;
  let totalsY = {prefix}FinalY + 12;
  const doPageH = doc.internal.pageSize.getHeight();
  if (totalsY + {prefix}BankBlockH + {prefix}SigH + FOOTER_RESERVE - 2 > doPageH) {{ doc.addPage(); totalsY = 20; }}

  renderInlineDocInfo(doc, {prefix}Blocks, marginLeft, totalsY, 125, FOOTER_RESERVE);
  
""" + sig_logic + "\n  buildDoFooter(doc);")
    
    # We must ensure calcBlockHeight isn't called twice for those who don't have it initially like CN/DN
    if not has_bank and has_totals:
        # For CN/DN, we add `const cnBankBlockH = calcBlockHeight...` before `cnCombinedH`
        old_combined_regex = rf"const {prefix}CombinedH = Math\.max\({prefix}BoxH, 0\);"
        new_combined = blocks_logic + f"  const {prefix}BankBlockH = calcBlockHeight(doc, {prefix}Blocks, 125);\n  const {prefix}CombinedH = Math.max({prefix}BoxH, {prefix}BankBlockH);"
        func_body = re.sub(old_combined_regex, new_combined, func_body)

    code = code[:func_start] + func_body + code[func_end:]
    print(f"Patched {func_name}")


patch_function("generateQuotation_PDF", "qt", "qt", True, True, "((qt as any).customerQuotationTerms || (qt as any).termsAndConditions || qtSettings?.quotationTerms)")
patch_function("generateSalesOrder_PDF", "so", "soDoc", True, True, "((soDoc as any).termsAndConditions || settings?.termsAndConditions)")
patch_function("generateInvoice_PDF", "inv", "inv", True, True, "((inv as any).termsAndConditions || settings?.termsAndConditions)")
patch_function("generateCreditNote_PDF", "cn", "cn", True, False, "(cn as any).termsAndConditions")
patch_function("generateDebitNote_PDF", "dn", "dn", True, False, "(dn as any).termsAndConditions")
patch_function("generateDO_PDF", "do", "doDoc", False, False, "(doDoc as any).termsAndConditions")

with open("artifacts/po-app/src/lib/pdf.ts", "w", encoding="utf-8") as f:
    f.write(code)
