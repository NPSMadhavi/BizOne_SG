import { Type, Database, Image, Table, Minus, Square, Calendar, Hash } from "lucide-react";
import type { ReportElementType } from "@/lib/report-designer/types";

const ITEMS: { type: ReportElementType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "field", label: "Field", icon: Database },
  { type: "image", label: "Image", icon: Image },
  { type: "table", label: "Table", icon: Table },
  { type: "line", label: "Line", icon: Minus },
  { type: "rectangle", label: "Rectangle", icon: Square },
  { type: "date", label: "Date", icon: Calendar },
  { type: "page_number", label: "Page Number", icon: Hash },
];

export function ElementPalette({
  onAdd,
  disabled,
}: {
  onAdd: (type: ReportElementType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">Elements</p>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            type="button"
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-bizone-report", JSON.stringify({ kind: "element", type: item.type }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(item.type)}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
