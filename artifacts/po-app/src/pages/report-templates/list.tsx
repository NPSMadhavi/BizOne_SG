import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  createReportTemplate,
  deleteReportTemplate,
  duplicateReportTemplate,
  listReportDefinitions,
  listReportTemplates,
  setActiveReportTemplate,
  updateReportTemplate,
} from "@/lib/report-designer/api";
import type { ReportTemplate } from "@/lib/report-designer/types";
import { mergeReportTypeOptions } from "@/lib/report-designer/document-types";
import { Copy, Eye, FileText, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";

function statusBadge(tpl: ReportTemplate) {
  if (tpl.isSystemTemplate) return <Badge variant="outline">SYSTEM DEFAULT</Badge>;
  if (tpl.isActive) return <Badge className="bg-emerald-600 hover:bg-emerald-700">ACTIVE</Badge>;
  return <Badge variant="secondary">INACTIVE</Badge>;
}

export default function ReportTemplateList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasPermission, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canCreate = isAdmin || hasPermission("report_templates:create");
  const canEdit = isAdmin || hasPermission("report_templates:edit");
  const canDelete = isAdmin || hasPermission("report_templates:delete");

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [reportType, setReportType] = useState("invoice");
  const [pageSize, setPageSize] = useState<"A4" | "Letter">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [setAsFor, setSetAsFor] = useState<ReportTemplate | null>(null);
  const [setAsTemplateId, setSetAsTemplateId] = useState("");
  const [settingAs, setSettingAs] = useState(false);

  const { data: definitions = [] } = useQuery({
    queryKey: ["report-definitions"],
    queryFn: listReportDefinitions,
  });
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["report-templates"],
    queryFn: () => listReportTemplates(),
  });

  const rows = useMemo(() => templates, [templates]);
  const typeOptions = useMemo(() => mergeReportTypeOptions(definitions), [definitions]);
  const selectedType = typeOptions.find((d) => d.reportType === reportType);

  const refresh = () => qc.invalidateQueries({ queryKey: ["report-templates"] });

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await createReportTemplate({
        name: name.trim(),
        reportType,
        pageSize,
        orientation,
      });
      await qc.invalidateQueries({ queryKey: ["report-templates"] });
      toast({ title: "Template created", description: `Default ${selectedType?.name || "document"} layout loaded. Customize and save.` });
      setCreateOpen(false);
      setName("");
      setLocation(`/report-templates/${created.id}/edit`);
    } catch (err: any) {
      toast({ title: "Could not create template", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (tpl: ReportTemplate) => {
    try {
      const copy = await duplicateReportTemplate(tpl.id);
      toast({ title: "Duplicated", description: copy.name });
      refresh();
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: err.message, variant: "destructive" });
    }
  };

  const setAsChoices = useMemo(() => {
    if (!setAsFor) return [];
    return rows.filter((t) => t.reportDefinitionId === setAsFor.reportDefinitionId);
  }, [rows, setAsFor]);

  const openSetAs = (tpl: ReportTemplate) => {
    const sameType = rows.filter((t) => t.reportDefinitionId === tpl.reportDefinitionId);
    const inUse = sameType.find((t) => t.isActive && !t.isSystemTemplate)
      || sameType.find((t) => t.isSystemTemplate)
      || tpl;
    setSetAsFor(tpl);
    setSetAsTemplateId(String(inUse.id));
  };

  const handleSetAs = async () => {
    const chosen = rows.find((t) => String(t.id) === setAsTemplateId);
    if (!chosen) return;
    setSettingAs(true);
    try {
      if (chosen.isSystemTemplate) {
        const actives = rows.filter(
          (t) => t.reportDefinitionId === chosen.reportDefinitionId && t.isActive && !t.isSystemTemplate,
        );
        for (const active of actives) {
          await updateReportTemplate(active.id, { isActive: false });
        }
        try {
          await setActiveReportTemplate(chosen.id);
        } catch {
          // Deactivating custom templates already falls back to the system default.
        }
      } else {
        await setActiveReportTemplate(chosen.id);
      }
      toast({
        title: "Template set",
        description: `${chosen.name} will be used when generating ${chosen.reportTypeName || "this document"}.`,
      });
      setSetAsFor(null);
      refresh();
    } catch (err: any) {
      toast({ title: "Could not set template", description: err.message, variant: "destructive" });
    } finally {
      setSettingAs(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const tpl = rows.find((t) => t.id === deleteId);
      if (tpl?.isActive && !tpl.isSystemTemplate) {
        await updateReportTemplate(deleteId, { isActive: false });
      }
      await deleteReportTemplate(deleteId);
      toast({ title: "Template deleted" });
      setDeleteId(null);
      refresh();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company data comes from Settings → Companies. Templates store layout only.
          </p>
        </div>
        {canCreate && (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />Create Template
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Document templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Template Name</th>
                    <th className="py-2 pr-3 font-medium">Report Type</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tpl) => (
                    <tr key={tpl.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 pr-3 font-medium">{tpl.name}</td>
                      <td className="py-3 pr-3">{tpl.reportTypeName || "—"}</td>
                      <td className="py-3 pr-3">{statusBadge(tpl)}</td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/report-templates/${tpl.id}/edit?mode=view`)}>
                              <Eye className="h-4 w-4 mr-2" />View
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setLocation(`/report-templates/${tpl.id}/edit`)}>
                                <Pencil className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                            )}
                            {canCreate && (
                              <DropdownMenuItem onClick={() => handleDuplicate(tpl)}>
                                <Copy className="h-4 w-4 mr-2" />Duplicate
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => openSetAs(tpl)}>
                                <Star className="h-4 w-4 mr-2" />Set As
                              </DropdownMenuItem>
                            )}
                            {canDelete && !tpl.isSystemTemplate && (
                              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(tpl.id)}>
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-muted-foreground">No templates yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl max-h-[min(90vh,720px)] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground shrink-0">
            The default {selectedType?.name || "document"} layout will load automatically. You will not start from a blank canvas.
          </p>
          <div className="space-y-3 min-h-0 overflow-y-auto pr-1">
            <div>
              <Label>Template Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Modern ${selectedType?.name || "Invoice"}`} />
            </div>
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[11rem]">
                  <SelectGroup>
                    <SelectLabel>Sales</SelectLabel>
                    {typeOptions.filter((d) => d.group === "sales").map((d) => (
                      <SelectItem key={d.reportType} value={d.reportType}>{d.name}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Purchase</SelectLabel>
                    {typeOptions.filter((d) => d.group === "purchase").map((d) => (
                      <SelectItem key={d.reportType} value={d.reportType}>{d.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Page Size</Label>
                <Select value={pageSize} onValueChange={(v) => setPageSize(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Orientation</Label>
                <Select value={orientation} onValueChange={(v) => setOrientation(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || creating} onClick={handleCreate}>
              {creating ? "Creating…" : "Open Designer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={setAsFor != null} onOpenChange={(open) => { if (!open) setSetAsFor(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set As</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose which {setAsFor?.reportTypeName || "document"} template to use when generating PDFs.
          </p>
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={setAsTemplateId} onValueChange={setSetAsTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
              <SelectContent className="max-h-[11rem]">
                <SelectGroup>
                  <SelectLabel>System default</SelectLabel>
                  {setAsChoices.filter((t) => t.isSystemTemplate).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  {setAsChoices.filter((t) => !t.isSystemTemplate).length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No custom templates yet</div>
                  ) : (
                    setAsChoices.filter((t) => !t.isSystemTemplate).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}{t.isActive ? " (Active)" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetAsFor(null)}>Cancel</Button>
            <Button disabled={!setAsTemplateId || settingAs} onClick={handleSetAs}>
              {settingAs ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Printing will use another template of this type, or a new one you create.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
