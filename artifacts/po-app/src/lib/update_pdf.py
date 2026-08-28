import re

with open("artifacts/po-app/src/lib/pdf.ts", "r", encoding="utf-8") as f:
    code = f.read()

# 6. Sales Order
so_old = """  let soCurrentY = soFinalY + 12;

  if (soDoc.notes) {
    if (soCurrentY + 14 > pageHeight - FOOTER_RESERVE) { doc.addPage(); soCurrentY = 20; }
    doc.setFontSize(9.5); doc.setFont(PDF_FONT, "bold"); doc.setTextColor(0, 0, 0);
    doc.text("Internal Notes:", marginLeft, soCurrentY);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    soCurrentY = drawNotesHtml(doc, soDoc.notes, marginLeft, soCurrentY + 6, marginRight - marginLeft, 5, pageHeight, FOOTER_RESERVE, PDF_FONT);
  }"""

so_new = """  const soBlocks: NoteBlock[] = [];
  if (soDoc.notes) soBlocks.push({ title: "Internal Notes:", content: soDoc.notes });
  if ((soDoc as any).customerNote?.trim()) soBlocks.push({ title: "Customer Note:", content: (soDoc as any).customerNote });
  if ((soDoc as any).deliveryInstructions?.trim()) soBlocks.push({ title: "Delivery Instructions:", content: (soDoc as any).deliveryInstructions });
  if (settings?.bankDetails) soBlocks.push({ title: "Bank Details:", content: settings.bankDetails, shaded: true });
  if (((soDoc as any).termsAndConditions || settings?.termsAndConditions)?.trim()) soBlocks.push({ title: "Terms & Conditions:", content: ((soDoc as any).termsAndConditions || settings?.termsAndConditions) });"""

code = code.replace(so_old, so_new, 1)

so_old2 = """  const soCombinedH = Math.max(soBoxH, soBankBlockH);
  let soTotalsOnNewPage = false;
  if (soCurrentY + soCombinedH + FOOTER_RESERVE - 2 > pageHeight) { doc.addPage(); soCurrentY = 20; soTotalsOnNewPage = true; }

  const soPinnedY = pageHeight - FOOTER_RESERVE - soCombinedH - 4;
  const totalsY = soTotalsOnNewPage ? soCurrentY + 4 : Math.max(soCurrentY + 4, soPinnedY);"""

so_new2 = """  const soBankBlockH = calcBlockHeight(doc, soBlocks, 125);
  const soCombinedH = Math.max(soBoxH, soBankBlockH);
  const soSigH = (soDoc as any).authorisedSignature ? 25 : 0;
  let soTotalsOnNewPage = false;
  if (soFinalY + 12 + soCombinedH + soSigH + FOOTER_RESERVE - 2 > pageHeight) { doc.addPage(); soTotalsOnNewPage = true; }

  const soPinnedY = pageHeight - FOOTER_RESERVE - soCombinedH - 4;
  const totalsY = soTotalsOnNewPage ? 20 : Math.max(soFinalY + 12, soPinnedY);"""

code = code.replace(so_old2, so_new2, 1)

so_old3 = """  // Left: bank details + T&C inline (same Y, left of totals)
  renderInlineDocInfo(doc, settings, marginLeft, totalsY, 125, FOOTER_RESERVE, (soDoc as any).termsAndConditions);"""

so_new3 = """  // Left: notes inline (same Y, left of totals)
  renderInlineDocInfo(doc, soBlocks, marginLeft, totalsY, 125, FOOTER_RESERVE);

  // Bottom Right: Authorised Signature (if uploaded)
  const sigImg = (soDoc as any).authorisedSignature;
  if (sigImg) {
    const sigW = 45;
    const sigH = 15;
    const sigX = marginRight - sigW;
    const sigY = ty + 10;
    doc.addImage(sigImg, "PNG", sigX, sigY, sigW, sigH, "", "FAST");
    doc.setFont(PDF_FONT, "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text("Authorised Signature", sigX + sigW / 2, sigY + sigH + 4, { align: "center" });
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
    doc.line(sigX, sigY + sigH, sigX + sigW, sigY + sigH);
  }"""

code = code.replace(so_old3, so_new3, 1)

# And remove calcBlockHeight call before the table for Sales Order
so_old4 = """  const soBankBlockH = calcBlockHeight(doc, settings, 125, (soDoc as any).termsAndConditions);"""
so_new4 = """"""
code = code.replace(so_old4, so_new4, 1)


with open("artifacts/po-app/src/lib/pdf.ts", "w", encoding="utf-8") as f:
    f.write(code)

print("Sales Order updated")
