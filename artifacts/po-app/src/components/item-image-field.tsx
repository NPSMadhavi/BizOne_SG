import { useRef } from "react";
import { ImageIcon, X } from "lucide-react";

interface ItemImageFieldProps {
  value: string;
  onChange: (v: string) => void;
}

function resizeToDataUrl(src: string, maxW = 400, maxH = 300, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = src;
  });
}

export function ItemImageField({ value, onChange }: ItemImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const src = e.target?.result as string;
      if (src) onChange(await resizeToDataUrl(src));
    };
    reader.readAsDataURL(file);
  };

  if (value) {
    return (
      <div className="relative group w-24 h-20 flex-shrink-0 rounded border border-border overflow-hidden">
        <img src={value} alt="" className="w-full h-full object-contain bg-muted/10" />
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-2.5 h-2.5 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-24 h-20 flex-shrink-0 border-2 border-dashed border-muted-foreground/25 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-primary/40 transition-colors"
      title="Paste or click to add an image"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onPaste={(e) => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
        if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) handleFile(f); }
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
      <span className="text-[9px] text-muted-foreground/40 font-medium">Image</span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}
