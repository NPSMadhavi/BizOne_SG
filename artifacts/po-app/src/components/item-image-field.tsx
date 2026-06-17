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
      <div className="relative group w-20 h-16 flex-shrink-0 rounded border border-border overflow-hidden">
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
    <>
      <button
        type="button"
        title="Attach image to this line item"
        onClick={() => inputRef.current?.click()}
        onPaste={(e) => {
          const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
          if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) handleFile(f); }
        }}
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
      >
        <ImageIcon className="w-3.5 h-3.5" />
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </>
  );
}
