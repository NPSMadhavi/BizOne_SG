import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { CompanyLiveData, ReportElement, ReportFieldDef } from "@/lib/report-designer/types";
import { isCompanyField, liveCompanyValue } from "@/lib/report-designer/types";

export function PropertiesPanel({
  element,
  fields,
  onChange,
  onDelete,
  company,
  readOnly,
}: {
  element: ReportElement | null;
  fields: ReportFieldDef[];
  onChange: (patch: Partial<ReportElement>) => void;
  onDelete?: () => void;
  company?: CompanyLiveData | null;
  readOnly?: boolean;
}) {
  if (!element) {
    return <p className="text-sm text-muted-foreground">Select an element to edit its properties.</p>;
  }

  const groups = Array.from(new Set(fields.map((f) => f.fieldGroup)));
  const liveValue = isCompanyField(element.field) ? liveCompanyValue(element.field, company) : "";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Properties</p>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{element.type.replace("_", " ")}</p>
      </div>
      {isCompanyField(element.field) && (
        <div className="rounded-md border bg-muted/40 p-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live from Settings → Companies</p>
          {element.type === "image" && liveValue ? (
            <img src={liveValue} alt="" className="h-10 w-auto max-w-full object-contain bg-white rounded border p-1" />
          ) : (
            <p className="text-xs whitespace-pre-wrap break-words">{liveValue || "No value saved yet. Edit it in Settings → Companies."}</p>
          )}
          <p className="text-[10px] text-muted-foreground">Do not type the company name here. Change it in Settings and this field updates on the next invoice.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <div key={key}>
            <Label className="text-xs capitalize">{key}</Label>
            <Input
              type="number"
              step="0.5"
              className="h-8"
              value={element[key]}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      {(element.type === "text" || element.type === "field" || element.type === "date" || element.type === "page_number") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Font size</Label>
              <Input type="number" className="h-8" value={element.fontSize ?? 9} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Weight</Label>
              <Select value={element.fontWeight || "normal"} onValueChange={(v) => onChange({ fontWeight: v as "normal" | "bold" })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Align</Label>
            <Select value={element.textAlign || "left"} onValueChange={(v) => onChange({ textAlign: v as any })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <Input type="color" className="h-8 p-1" value={element.color || "#111827"} onChange={(e) => onChange({ color: e.target.value })} />
          </div>
        </>
      )}
      {element.type === "text" && (
        <div>
          <Label className="text-xs">Text</Label>
          <Input className="h-8" value={element.text || ""} onChange={(e) => onChange({ text: e.target.value })} />
        </div>
      )}
      {(element.type === "field" || element.type === "image" || element.type === "date") && (
        <div>
          <Label className="text-xs">Dynamic field</Label>
          <Select value={element.field || ""} onValueChange={(v) => onChange({ field: v })}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select field" /></SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{group}</div>
                  {fields.filter((f) => f.fieldGroup === group && (element.type !== "image" || f.dataType === "image")).map((f) => (
                    <SelectItem key={f.fieldKey} value={f.fieldKey}>{f.fieldLabel}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Visible</Label>
          <Select value={element.visible === false ? "hidden" : "visible"} onValueChange={(v) => onChange({ visible: v === "visible" })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="visible">Visible</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Border</Label>
          <Select value={element.borderStyle || "none"} onValueChange={(v) => onChange({ borderStyle: v as any, borderWidth: v === "none" ? 0 : (element.borderWidth || 0.2) })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {element.type === "table" && (
        <p className="text-xs text-muted-foreground">
          Table rows bind to invoice line items at print time. Column fields stay as dynamic references.
        </p>
      )}
      <div className="pt-2 border-t">
        <Button
          type="button"
          variant="destructive"
          className="w-full gap-2"
          disabled={readOnly || !onDelete}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <p className="text-[10px] text-muted-foreground mt-1.5">Removes this element from the template. You can also press Delete on the keyboard.</p>
      </div>
    </div>
  );
}
