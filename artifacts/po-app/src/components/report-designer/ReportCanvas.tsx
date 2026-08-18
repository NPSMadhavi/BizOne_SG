import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CompanyLiveData, ReportElement, ReportFieldDef, ReportTemplateJson } from "@/lib/report-designer/types";
import { isCompanyField, liveCompanyValue, pageSizeMm } from "@/lib/report-designer/types";

const PX_PER_MM = 3.78;

function fieldPlaceholder(field: string | undefined, fields: ReportFieldDef[]) {
  if (!field) return "{{ Field }}";
  const fromCatalog = fields.find((f) => f.fieldKey === field)?.fieldLabel;
  if (fromCatalog) return `{{ ${fromCatalog} }}`;
  const label = field.replace(/\./g, " ").replace(/_/g, " ");
  return `{{ ${label.replace(/\b\w/g, (c) => c.toUpperCase())} }}`;
}

function fieldDisplay(field: string | undefined, fields: ReportFieldDef[], company?: CompanyLiveData | null) {
  if (isCompanyField(field)) {
    const live = liveCompanyValue(field, company);
    if (live) return { text: live, live: true };
  }
  return { text: fieldPlaceholder(field, fields), live: false };
}

function ElementPreview({
  el,
  fields,
  company,
}: {
  el: ReportElement;
  fields: ReportFieldDef[];
  company?: CompanyLiveData | null;
}) {
  const common = "w-full h-full overflow-hidden whitespace-pre-wrap break-words";
  const align = el.textAlign === "center" ? "text-center" : el.textAlign === "right" ? "text-right" : "text-left";
  const weight = el.fontWeight === "bold" ? "font-bold" : "font-normal";
  const style = {
    fontSize: `${el.fontSize || 9}pt`,
    color: el.color || "#111827",
    background: el.backgroundColor || "transparent",
    border: el.borderWidth && el.borderStyle !== "none" ? `${el.borderWidth}mm ${el.borderStyle || "solid"} ${el.borderColor || "#111827"}` : undefined,
  };
  switch (el.type) {
    case "text":
      return <div className={cn(common, align, weight)} style={style}>{el.text || "Text"}</div>;
    case "field":
    case "date": {
      const shown = fieldDisplay(el.field, fields, company);
      return (
        <div
          className={cn(common, align, weight, shown.live ? "" : "text-blue-700")}
          style={style}
          title={shown.live ? "Live value from Settings → Companies" : "Filled when the document is printed"}
        >
          {shown.text}
        </div>
      );
    }
    case "page_number":
      return <div className={cn(common, align, "text-muted-foreground")} style={style}>{"{{ Page Number }}"}</div>;
    case "image": {
      const src = isCompanyField(el.field) ? liveCompanyValue(el.field, company) : "";
      if (src) {
        return <img src={src} alt="Company logo" className="w-full h-full object-contain object-left" />;
      }
      return (
        <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300 text-[10px] text-muted-foreground">
          {fieldPlaceholder(el.field || "company.logo", fields)}
        </div>
      );
    }
    case "line":
      return <div className="w-full" style={{ height: Math.max(el.height, 0.4) * PX_PER_MM, background: el.backgroundColor || el.color || "#111827" }} />;
    case "rectangle":
      return <div className="w-full h-full" style={style} />;
    case "table":
      return (
        <table className="w-full border-collapse text-[8px]">
          <thead>
            <tr>
              {(el.columns || []).map((c) => (
                <th
                  key={c.field}
                  className="px-1 py-1 font-semibold"
                  style={{
                    background: el.headerBackground || "#18212F",
                    color: el.headerColor || "#fff",
                    textAlign: c.align || "left",
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-neutral-100">
              {(el.columns || []).map((c) => (
                <td key={c.field} className="px-1 py-0.5 text-blue-700">{fieldPlaceholder(c.field, fields)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      );
    default:
      return null;
  }
}

export function ReportCanvas({
  template,
  selectedId,
  onSelect,
  onChangeElement,
  onDropAdd,
  fields = [],
  company,
}: {
  template: ReportTemplateJson;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeElement: (id: string, patch: Partial<ReportElement>) => void;
  onDropAdd?: (payload: { kind: "element" | "field"; type?: string; fieldKey?: string; dataType?: string }, x: number, y: number) => void;
  fields?: ReportFieldDef[];
  company?: CompanyLiveData | null;
}) {
  const size = pageSizeMm(template.page);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; mode: "move" | "resize" } | null>(null);

  const mmFromEvent = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / PX_PER_MM,
      y: (e.clientY - rect.top) / PX_PER_MM,
    };
  };

  const elements = useMemo(
    () => [...(template.elements || [])].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
    [template.elements],
  );

  return (
    <div className="overflow-auto bg-[#E5E7EB] p-6 h-full" onClick={() => onSelect(null)}>
      <div
        ref={wrapRef}
        className="relative bg-white shadow-lg mx-auto"
        style={{ width: size.width * PX_PER_MM, height: size.height * PX_PER_MM }}
        onDragOver={(e) => {
          if (!onDropAdd) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (!onDropAdd) return;
          e.preventDefault();
          const raw = e.dataTransfer.getData("application/x-bizone-report");
          if (!raw) return;
          try {
            const payload = JSON.parse(raw);
            const pt = {
              x: (e.clientX - wrapRef.current!.getBoundingClientRect().left) / PX_PER_MM,
              y: (e.clientY - wrapRef.current!.getBoundingClientRect().top) / PX_PER_MM,
            };
            onDropAdd(payload, Math.max(0, pt.x), Math.max(0, pt.y));
          } catch {
            // ignore invalid drag payload
          }
        }}
        onPointerMove={(e) => {
          if (!drag || !wrapRef.current) return;
          const pt = mmFromEvent(e);
          if (drag.mode === "move") {
            onChangeElement(drag.id, { x: Math.max(0, pt.x - drag.dx), y: Math.max(0, pt.y - drag.dy) });
          } else {
            onChangeElement(drag.id, { width: Math.max(4, pt.x - drag.dx), height: Math.max(2, pt.y - drag.dy) });
          }
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {elements.map((el) => (
          <div
            key={el.id}
            className={cn(
              "absolute cursor-move",
              selectedId === el.id && "ring-2 ring-blue-500 ring-offset-1",
            )}
            style={{
              left: el.x * PX_PER_MM,
              top: el.y * PX_PER_MM,
              width: el.width * PX_PER_MM,
              height: el.height * PX_PER_MM,
              zIndex: el.zIndex || 1,
            }}
            onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(el.id);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const pt = mmFromEvent(e);
              setDrag({ id: el.id, dx: pt.x - el.x, dy: pt.y - el.y, mode: "move" });
            }}
          >
            <ElementPreview el={el} fields={fields} company={company} />
            {selectedId === el.id && (
              <div
                className="absolute right-0 bottom-0 h-3 w-3 bg-blue-600 cursor-se-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ id: el.id, dx: el.x, dy: el.y, mode: "resize" });
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
