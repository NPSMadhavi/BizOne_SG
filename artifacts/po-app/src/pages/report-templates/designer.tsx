import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ElementPalette } from "@/components/report-designer/ElementPalette";
import { PropertiesPanel } from "@/components/report-designer/PropertiesPanel";
import { ReportCanvas } from "@/components/report-designer/ReportCanvas";
import {
  createReportTemplate,
  generateInvoiceReportPdf,
  getReportCompanyData,
  getReportDefinition,
  getReportTemplate,
  listReportTemplates,
  previewReport,
  updateReportTemplate,
} from "@/lib/report-designer/api";
import {
  ELEMENT_DEFAULTS,
  newElementId,
  type ReportElement,
  type ReportElementType,
  type ReportTemplateJson,
} from "@/lib/report-designer/types";
import { ArrowLeft, Eye, FileDown, Printer, RotateCcw, Save } from "lucide-react";

function cloneTemplate(json: ReportTemplateJson): ReportTemplateJson {
  return JSON.parse(JSON.stringify(json));
}

function printHtmlInFrame(html: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const frameWindow = iframe.contentWindow;
  const doc = frameWindow?.document;
  if (!frameWindow || !doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const runPrint = () => {
    if (printed) return;
    printed = true;
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => iframe.remove(), 60_000);
  };

  const images = Array.from(doc.images || []);
  if (images.length === 0 || images.every((img) => img.complete)) {
    window.setTimeout(runPrint, 50);
    return true;
  }

  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) runPrint();
  };
  images.forEach((img) => {
    if (img.complete) done();
    else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  });
  window.setTimeout(runPrint, 2500);
  return true;
}

export default function ReportDesignerPage() {
  const params = useParams();
  const search = useSearch();
  const id = params.id === "new" ? null : Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, isAdmin, selectedCompany } = useAuth();
  const canEdit = isAdmin || hasPermission("report_templates:edit") || hasPermission("report_templates:create");

  const [name, setName] = useState("Default Invoice");
  const [template, setTemplate] = useState<ReportTemplateJson | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingNav = useRef<string | null>(null);
  const [systemJson, setSystemJson] = useState<ReportTemplateJson | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [reportType, setReportType] = useState("invoice");
  const [definitionId, setDefinitionId] = useState<number | null>(null);

  const { data: existing } = useQuery({
    queryKey: ["report-template", id],
    queryFn: () => getReportTemplate(id!),
    enabled: Number.isInteger(id) && !!id,
  });

  const { data: catalog } = useQuery({
    queryKey: ["report-templates", reportType],
    queryFn: () => listReportTemplates(reportType),
  });

  useEffect(() => {
    const system = catalog?.find((t) => t.isSystemTemplate);
    if (system?.templateJson) setSystemJson(cloneTemplate(system.templateJson));
  }, [catalog]);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setTemplate(cloneTemplate(existing.templateJson));
    const viewMode = new URLSearchParams(search).get("mode") === "view";
    setReadOnly(viewMode || !canEdit);
    setDefinitionId(existing.reportDefinitionId);
    setReportType(existing.reportType || "invoice");
    setDirty(false);
  }, [existing, canEdit, search]);

  useEffect(() => {
    if (id) return;
    if (!systemJson) return;
    setTemplate(cloneTemplate(systemJson));
    const params = new URLSearchParams(search);
    setName(params.get("name") || "New Invoice Template");
    setReportType(params.get("reportType") || "invoice");
  }, [id, systemJson, search]);

  const { data: definition } = useQuery({
    queryKey: ["report-definition", definitionId],
    queryFn: () => getReportDefinition(definitionId!),
    enabled: !!definitionId,
  });

  const invoiceDef = useQuery({
    queryKey: ["report-templates-defs"],
    queryFn: async () => {
      const list = catalog || [];
      const sys = list.find((t) => t.isSystemTemplate);
      if (!sys) return null;
      return getReportDefinition(sys.reportDefinitionId);
    },
    enabled: !definitionId && !!catalog?.length,
  });

  const { data: companyLive } = useQuery({
    queryKey: ["report-company-data", selectedCompany?.id],
    queryFn: getReportCompanyData,
    refetchOnWindowFocus: true,
  });

  const fields = definition?.fields || invoiceDef.data?.fields || [];
  const selected = useMemo(
    () => template?.elements.find((e) => e.id === selectedId) || null,
    [template, selectedId],
  );

  const mark = (next: ReportTemplateJson) => {
    setTemplate(next);
    setDirty(true);
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly || !selectedId || !template) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      mark({ ...template, elements: template.elements.filter((el) => el.id !== selectedId) });
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, selectedId, template]);

  const changeElement = (elId: string, patch: Partial<ReportElement>) => {
    if (!template || readOnly) return;
    mark({
      ...template,
      elements: template.elements.map((el) => (el.id === elId ? { ...el, ...patch } : el)),
    });
  };

  const addElement = (type: ReportElementType, at?: { x: number; y: number }, field?: string) => {
    if (!template || readOnly) return;
    const defaults = ELEMENT_DEFAULTS[type];
    const el: ReportElement = {
      id: newElementId(),
      type,
      x: at?.x ?? 12,
      y: at?.y ?? (40 + (template.elements.length % 8) * 8),
      width: defaults.width || 40,
      height: defaults.height || 8,
      ...defaults,
      ...(field ? { field } : {}),
    };
    mark({ ...template, elements: [...template.elements, el] });
    setSelectedId(el.id);
  };

  const handleDropAdd = (payload: { kind: "element" | "field"; type?: string; fieldKey?: string; dataType?: string }, x: number, y: number) => {
    if (payload.kind === "field" && payload.fieldKey) {
      const type: ReportElementType = payload.dataType === "image" ? "image" : (payload.fieldKey.startsWith("item.") ? "table" : "field");
      if (type === "table") {
        addElement("table", { x, y });
        return;
      }
      addElement(type, { x, y }, payload.fieldKey);
      return;
    }
    if (payload.kind === "element" && payload.type) addElement(payload.type as ReportElementType, { x, y });
  };

  const persist = async () => {
    if (!template || !canEdit) return;
    setSaving(true);
    try {
      if (id) {
        const saved = await updateReportTemplate(id, { name, templateJson: template });
        await queryClient.invalidateQueries({ queryKey: ["report-templates"] });
        await queryClient.invalidateQueries({ queryKey: ["report-template", id] });
        if (saved.id !== id) {
          toast({
            title: "Saved",
            description: "Your company copy is active for PDF generation.",
          });
          setLocation(`/report-templates/${saved.id}/edit`);
        } else {
          toast({ title: "Saved" });
        }
      } else {
        const created = await createReportTemplate({
          name,
          reportType,
          templateJson: template,
        });
        await queryClient.invalidateQueries({ queryKey: ["report-templates"] });
        toast({ title: "Saved", description: "Company template created." });
        setLocation(`/report-templates/${created.id}/edit`);
      }
      setDirty(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!template || !saveAsName.trim()) return;
    setSaving(true);
    try {
      const created = await createReportTemplate({
        name: saveAsName.trim(),
        reportType: existing?.reportType || reportType,
        templateJson: template,
      });
      await queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      toast({ title: "Saved as new template", description: created.name });
      setSaveAsOpen(false);
      setDirty(false);
      setLocation(`/report-templates/${created.id}/edit`);
    } catch (err: any) {
      toast({ title: "Save As failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!template) return;
    try {
      const result = await previewReport({ reportType, templateJson: template, designMode: false });
      setPreviewHtml(result.html);
      setPreviewOpen(true);
      return result;
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
      return null;
    }
  };

  const handlePrint = async () => {
    if (!template) return;
    try {
      const html = previewHtml
        || (await previewReport({ reportType, templateJson: template, designMode: false })).html;
      if (!html) {
        toast({ title: "Print failed", description: "Could not build the document preview." });
        return;
      }
      if (!printHtmlInFrame(html)) {
        toast({ title: "Print failed", description: "Could not open the print dialog." });
      }
    } catch (err: any) {
      toast({ title: "Print failed", description: err.message, variant: "destructive" });
    }
  };

  const handlePdf = async () => {
    if (!template) return;
    try {
      const result = await previewReport({ reportType, templateJson: template, designMode: false });
      const recordId = result.data?.recordId;
      if (!recordId) {
        toast({ title: "No document", description: "PDF preview uses live document data. Create a document of this type first, or use Preview." });
        return;
      }
      await generateInvoiceReportPdf(recordId, {
        filename: `${result.data.invoice?.invoice_number || reportType}.pdf`,
        templateJson: template,
      });
    } catch (err: any) {
      toast({ title: "PDF failed", description: err.message, variant: "destructive" });
    }
  };

  const handleReset = () => {
    if (!systemJson) return;
    mark(cloneTemplate(systemJson));
    setSelectedId(null);
    setResetOpen(false);
  };

  const goBack = () => {
    if (dirty) {
      pendingNav.current = "/report-templates";
      setLeaveOpen(true);
      return;
    }
    setLocation("/report-templates");
  };

  if (!template) {
    return <div className="p-8 text-sm text-muted-foreground">Loading default template…</div>;
  }

  return (
    <div className="h-[calc(100vh-5.5rem)] flex flex-col -mx-4 -mt-4">
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Report Designer · {existing?.reportTypeName || reportType}</p>
            <Input
              className="h-8 font-semibold border-none shadow-none px-0"
              value={name}
              disabled={readOnly}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
            />
          </div>
          {existing?.isSystemTemplate && canEdit && (
            <span className="text-xs border rounded px-2 py-0.5 text-muted-foreground">System default · edits save as your company template</span>
          )}
          {readOnly && <span className="text-xs border rounded px-2 py-0.5 text-muted-foreground">View only</span>}
          {saving ? <span className="text-xs text-muted-foreground">Saving…</span> : dirty ? <span className="text-xs text-amber-600">Unsaved</span> : <span className="text-xs text-emerald-600">Saved</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1" onClick={() => setResetOpen(true)} disabled={readOnly}>
            <RotateCcw className="h-4 w-4" />Reset to Default
          </Button>
          <Button variant="outline" className="gap-1" onClick={handlePreview}>
            <Eye className="h-4 w-4" />Preview
          </Button>
          <Button variant="outline" className="gap-1" onClick={handlePdf}>
            <FileDown className="h-4 w-4" />PDF
          </Button>
          <Button variant="outline" className="gap-1" onClick={handlePrint}>
            <Printer className="h-4 w-4" />Print
          </Button>
          {canEdit && (
            <Button className="gap-1" onClick={persist} disabled={saving || readOnly}>
              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => { setSaveAsName(`${name} Copy`); setSaveAsOpen(true); }}>
              Save As
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[200px_1fr_240px] min-h-0">
        <div className="border-r bg-white p-3 overflow-auto">
          <ElementPalette onAdd={addElement} disabled={readOnly} />
          <div className="mt-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-2">Fields</p>
            <p className="text-[11px] text-muted-foreground px-1 mb-3 leading-snug">
              Company name, logo, address and GST come from <span className="font-medium text-foreground">Settings → Companies</span>. This template only stores layout. Change company details there and invoices update automatically.
            </p>
            <div className="space-y-3">
              {["Company", "Invoice", "Customer", "Items"].map((group) => (
                <div key={group}>
                  <p className="text-xs font-semibold px-1 mb-1">{group}</p>
                  {fields.filter((f) => f.fieldGroup === group).map((f) => (
                    <button
                      key={f.fieldKey}
                      type="button"
                      draggable={!readOnly}
                      className="block w-full text-left text-xs px-1 py-0.5 rounded hover:bg-muted text-muted-foreground"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-bizone-report", JSON.stringify({ kind: "field", fieldKey: f.fieldKey, dataType: f.dataType }));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (readOnly) return;
                        const type: ReportElementType = f.dataType === "image" ? "image" : "field";
                        if (!template) return;
                        const defaults = ELEMENT_DEFAULTS[type];
                        const el: ReportElement = {
                          id: newElementId(),
                          type,
                          x: 12,
                          y: 40 + (template.elements.length % 8) * 8,
                          width: defaults.width || 40,
                          height: defaults.height || 8,
                          ...defaults,
                          field: f.fieldKey,
                        };
                        mark({ ...template, elements: [...template.elements, el] });
                        setSelectedId(el.id);
                      }}
                    >
                      {f.fieldLabel}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <ReportCanvas
          template={template}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChangeElement={changeElement}
          onDropAdd={readOnly ? undefined : handleDropAdd}
          fields={fields}
          company={companyLive}
        />
        <div className="border-l bg-white p-3 overflow-auto">
          <PropertiesPanel
            element={selected}
            fields={fields}
            company={companyLive}
            readOnly={readOnly}
            onChange={(patch) => selected && changeElement(selected.id, patch)}
            onDelete={() => {
              if (readOnly || !template || !selectedId) return;
              mark({ ...template, elements: template.elements.filter((el) => el.id !== selectedId) });
              setSelectedId(null);
            }}
          />
        </div>
      </div>

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save As</DialogTitle></DialogHeader>
          <Label>New template name</Label>
          <Input value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>Cancel</Button>
            <Button disabled={!saveAsName.trim() || saving} onClick={handleSaveAs}>Save As</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Preview with live company & invoice data</DialogTitle></DialogHeader>
          <iframe title="Report preview" className="w-full h-[75vh] bg-white border rounded" srcDoc={previewHtml} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              The current design will be discarded and replaced with the system Default Invoice Template. The system template itself is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>Do you want to leave without saving?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDirty(false); setLocation(pendingNav.current || "/report-templates"); }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
