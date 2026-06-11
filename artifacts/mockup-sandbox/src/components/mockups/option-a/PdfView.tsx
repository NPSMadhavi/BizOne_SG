const TURNSTILE_IMG = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=160&fit=crop&auto=format";

export function PdfView() {
  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Option A — PDF View</p>
        <h2 className="text-xl font-bold text-gray-900 mb-6">How it renders in the generated PDF</h2>

        {/* PDF simulation */}
        <div className="bg-white shadow-xl rounded border border-gray-300" style={{ fontFamily: "Arial, sans-serif" }}>
          {/* PDF Header */}
          <div className="border-b-2 border-gray-800 px-8 py-5 flex justify-between items-start">
            <div>
              <p className="text-2xl font-bold text-red-600">RSV InfoTech Pte Ltd</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Blk 10, Ubi Crescent, #07-52, Ubi Techpark, Singapore 408564</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-600">Quotation No: <strong>QT2606103</strong></p>
              <p className="text-[10px] text-gray-600">Date: <strong>11/06/2026</strong></p>
              <p className="text-[10px] text-gray-600">GST Reg No: <strong>200812581D</strong></p>
            </div>
          </div>

          <div className="px-8 py-3 border-b border-gray-200">
            <p className="text-[11px]"><strong>To:</strong> NatSteel Holdings Pte Ltd</p>
            <p className="text-[10px] text-gray-500">22, Tanjong Kling Road, Singapore 628048</p>
          </div>

          {/* PDF Table */}
          <div className="px-8 pb-6">
            {/* Table header */}
            <table className="w-full border-collapse mt-4" style={{ fontSize: "10px" }}>
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="border border-gray-700 px-2 py-1.5 text-left w-8">S.No</th>
                  <th className="border border-gray-700 px-2 py-1.5 text-left" style={{ width: "55%" }}>DESCRIPTION</th>
                  <th className="border border-gray-700 px-2 py-1.5 text-center w-10">QTY</th>
                  <th className="border border-gray-700 px-2 py-1.5 text-right" style={{ width: "12%" }}>UNIT PRICE</th>
                  <th className="border border-gray-700 px-2 py-1.5 text-right" style={{ width: "12%" }}>TOTAL PRICE</th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1 — WITH image: description left ~65%, image right ~35% */}
                <tr>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">1</td>
                  <td className="border border-gray-200 px-0 py-0 align-top">
                    {/* This is the key: description cell split into left text + right image */}
                    <div className="flex">
                      <div className="flex-1 px-2 py-2">
                        <p className="font-bold mb-0.5">Heavy Duty Stainless Steel Tripod Turnstile Gate with Bi-directional Access Control</p>
                        <p>304L Tripod Turnstile</p>
                        <p>Arm Length: 510 mm (outside the cabinet) • Arm Drive Force: 3 kg</p>
                        <p>• LED Indicator: Directional indication for passage</p>
                        <p>• Arm Transmission: Digital control, Auto-Reset</p>
                        <p>Warranty: 1 Year standard warranty.</p>
                      </div>
                      {/* Image on the right of the same cell */}
                      <div className="flex-shrink-0 flex items-center justify-center border-l border-gray-200" style={{ width: "110px", padding: "6px" }}>
                        <img src={TURNSTILE_IMG} alt="Turnstile" className="max-w-full max-h-24 object-contain rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">1</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right">$2,400.00</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right font-medium">$2,400.00</td>
                </tr>

                {/* Row 2 — NO image: plain text, no image column shown */}
                <tr>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">2</td>
                  <td className="border border-gray-200 px-2 py-2 align-top">
                    Dismantle existing faulty Speed barrier gate. Accessories and Power Components.
                    Removal of Existing 2x Hikvision FR Devices.
                  </td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">1</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right">$650.00</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right font-medium">$650.00</td>
                </tr>

                {/* Row 3 — NO image */}
                <tr>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">3</td>
                  <td className="border border-gray-200 px-2 py-2 align-top">
                    Supply Mounting Brackets / Pedestal for Face Terminals and Customised hardware mounting.
                    2x FR devices will be used back from previous barrier gate.
                  </td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-center">2</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right">$800.00</td>
                  <td className="border border-gray-200 px-2 py-2 align-top text-right font-medium">$1,600.00</td>
                </tr>

                {/* Totals */}
                <tr className="bg-gray-50">
                  <td colSpan={4} className="border border-gray-200 px-2 py-1.5 text-right font-semibold">Subtotal</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-semibold">$4,650.00</td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="border border-gray-200 px-2 py-1.5 text-right text-gray-600">GST (9%)</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right text-gray-600">$418.50</td>
                </tr>
                <tr className="bg-gray-800 text-white">
                  <td colSpan={4} className="border border-gray-700 px-2 py-1.5 text-right font-bold">TOTAL</td>
                  <td className="border border-gray-700 px-2 py-1.5 text-right font-bold">$5,068.50</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Call-out */}
        <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="font-semibold text-indigo-800 mb-1">✦ How jsPDF renders this</p>
            <p className="text-indigo-700">Row 1 has an image → <code className="bg-indigo-100 px-1 rounded">didDrawCell</code> hook draws text on the left 65% and calls <code className="bg-indigo-100 px-1 rounded">doc.addImage()</code> on the right 35%.</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="font-semibold text-green-800 mb-1">✦ Rows without images</p>
            <p className="text-green-700">Rows 2 & 3 have no image → description cell uses the full width, exactly as today. No wasted space.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
