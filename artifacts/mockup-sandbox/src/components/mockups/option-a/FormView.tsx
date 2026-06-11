import { useState } from "react";
import { ImageIcon, X } from "lucide-react";

const TURNSTILE_IMG = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=160&fit=crop&auto=format";

export function FormView() {
  const [hasImage, setHasImage] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Option A — Form View</p>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Quotation Line Items — with separate Item Image field</h2>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 grid text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ gridTemplateColumns: "2rem 10rem 1fr 5rem 4rem 6rem 5rem 6rem 2rem" }}>
            <span>#</span>
            <span>Part No.</span>
            <span>Description + Image</span>
            <span className="text-right">Qty</span>
            <span className="text-center">UOM</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Disc %</span>
            <span className="text-right">Amount</span>
            <span></span>
          </div>

          {/* Row 1 — with image */}
          <div className="border-b border-gray-100 px-4 py-3 grid gap-3 items-start"
            style={{ gridTemplateColumns: "2rem 10rem 1fr 5rem 4rem 6rem 5rem 6rem 2rem" }}>
            <span className="text-sm text-gray-400 pt-2">1</span>
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 w-full" defaultValue="TG-1001" />

            {/* Description + Image zone */}
            <div className="flex gap-2">
              {/* Rich-text description */}
              <div className="flex-1 border border-gray-200 rounded-md overflow-hidden">
                <div className="flex gap-1 bg-gray-50 border-b border-gray-100 px-1 py-1">
                  {["B","I","U"].map(f => (
                    <button key={f} className="text-xs font-bold w-5 h-5 rounded hover:bg-gray-200 text-gray-600">{f}</button>
                  ))}
                </div>
                <div className="px-2 py-1.5 text-xs text-gray-700 min-h-[60px]">
                  <p className="font-semibold">Heavy Duty Stainless Steel Tripod Turnstile Gate</p>
                  <p className="text-gray-500 mt-0.5">304L Tripod Turnstile</p>
                  <p className="text-gray-500">Arm Length: 510mm • Drive Force: 3kg</p>
                </div>
              </div>

              {/* Separate image zone */}
              <div className="flex-shrink-0 w-[100px]">
                {hasImage ? (
                  <div className="relative group w-[100px] h-[80px] rounded-md overflow-hidden border border-gray-200">
                    <img src={TURNSTILE_IMG} alt="item" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setHasImage(false)}
                      className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] text-center py-0.5">
                      Item Image
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setHasImage(true)}
                    className="w-[100px] h-[80px] border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-400 hover:text-indigo-400 transition-colors"
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[9px] font-medium">Paste / Upload</span>
                  </button>
                )}
              </div>
            </div>

            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="1" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-center w-full" defaultValue="Nos" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="2,400.00" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="0" />
            <div className="text-xs text-right py-2 font-medium text-gray-800">$2,400.00</div>
            <button className="text-gray-300 hover:text-red-400 pt-2">✕</button>
          </div>

          {/* Row 2 — no image */}
          <div className="border-b border-gray-100 px-4 py-3 grid gap-3 items-start"
            style={{ gridTemplateColumns: "2rem 10rem 1fr 5rem 4rem 6rem 5rem 6rem 2rem" }}>
            <span className="text-sm text-gray-400 pt-2">2</span>
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 w-full" defaultValue="" placeholder="Part no." />

            <div className="flex gap-2">
              <div className="flex-1 border border-gray-200 rounded-md overflow-hidden">
                <div className="flex gap-1 bg-gray-50 border-b border-gray-100 px-1 py-1">
                  {["B","I","U"].map(f => (
                    <button key={f} className="text-xs font-bold w-5 h-5 rounded hover:bg-gray-200 text-gray-600">{f}</button>
                  ))}
                </div>
                <div className="px-2 py-1.5 text-xs text-gray-400 min-h-[60px]">
                  Dismantle existing faulty Speed barrier gate...
                </div>
              </div>
              <div className="flex-shrink-0 w-[100px]">
                <button className="w-[100px] h-[80px] border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-400 hover:text-indigo-400 transition-colors">
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">Paste / Upload</span>
                </button>
              </div>
            </div>

            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="1" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-center w-full" defaultValue="Lot" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="650.00" />
            <input className="text-xs border border-gray-200 rounded px-2 py-1.5 text-right w-full" defaultValue="0" />
            <div className="text-xs text-right py-2 font-medium text-gray-800">$650.00</div>
            <button className="text-gray-300 hover:text-red-400 pt-2">✕</button>
          </div>
        </div>

        {/* Key points */}
        <div className="mt-6 grid grid-cols-3 gap-4 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="font-semibold text-indigo-800 mb-1">✦ Separate image zone</p>
            <p className="text-indigo-700">100×80px paste/upload area sits <em>alongside</em> the description — image never pushes text down.</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="font-semibold text-green-800 mb-1">✦ Optional per row</p>
            <p className="text-green-700">Image slot is empty by default — only rows that need an image show one. Others look clean.</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-semibold text-amber-800 mb-1">✦ No schema change</p>
            <p className="text-amber-700">Image stored as base64 inside the existing JSONB items array — no DB migration needed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
