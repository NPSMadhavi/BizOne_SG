import { useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Receipt, Paperclip, X, FileImage, Upload, Users, Info } from "lucide-react";

interface Item {
  description: string;
  category: string;
  amount: string;
}

interface AttachFile {
  data: string;
  mimeType: string;
  name: string;
  sizeKB: number;
}

const EXPENSE_CATEGORIES = [
  "Labour / Wages",
  "Software / Subscriptions",
  "Materials / Supplies",
  "Travel & Transport",
  "Professional Fees",
  "Equipment / Hardware",
  "Office Expenses",
  "Communication",
  "Accommodation",
  "Miscellaneous",
];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR", "INR"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;

export default function VoucherNew() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    type: "payment",
    payee: "",
    payeeContact: "",
    issueDate: today,
    description: "",
    currency: "SGD",
    notes: "",
  });
  const [items, setItems] = useState<Item[]>([{ description: "", category: "", amount: "" }]);
  const [attachments, setAttachments] = useState<AttachFile[]>([]);
  const [verifierId, setVerifierId] = useState<string>("");
  const [approverId, setApproverId] = useState<string>("");
  const [paidById, setPaidById] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || "");

  const { data: project } = useQuery<any>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.projects ?? []);
    },
  });

  const { data: settings } = useQuery<any>({
    queryKey: ["settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: companyUsers = [] } = useQuery<any[]>({
    queryKey: ["company-users"],
    queryFn: async () => {
      const r = await fetch("/api/company-users", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: me } = useQuery<any>({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
  });

  // Pre-fill signatory defaults from settings once loaded
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  if (settings && !defaultsApplied && companyUsers.length > 0) {
    if (settings.defaultVerifierId) setVerifierId(String(settings.defaultVerifierId));
    if (settings.defaultApproverId) setApproverId(String(settings.defaultApproverId));
    if (settings.defaultPaidById) setPaidById(String(settings.defaultPaidById));
    setDefaultsApplied(true);
  }

  const isDifferentProject = selectedProjectId && selectedProjectId !== projectId;
  const selectedProject = allProjects.find((p: any) => String(p.id) === selectedProjectId);

  const mutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0);
      const body: Record<string, any> = {
        ...form,
        items: validItems.map(it => ({
          description: it.description.trim(),
          category: it.category,
          amount: parseFloat(it.amount) || 0,
        })),
        verifierId: verifierId ? Number(verifierId) : null,
        approverId: approverId ? Number(approverId) : null,
        paidById: paidById ? Number(paidById) : null,
      };
      if (isDifferentProject) body.targetProjectId = Number(selectedProjectId);

      const r = await fetch(`/api/projects/${projectId}/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed to create voucher");
      }
      const voucher = await r.json();

      for (const att of attachments) {
        await fetch(`/api/vouchers/${voucher.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileName: att.name, mimeType: att.mimeType, fileData: att.data }),
        });
      }

      return voucher;
    },
    onSuccess: (voucher) => {
      const targetProjId = isDifferentProject ? selectedProjectId : projectId;
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      if (isDifferentProject) qc.invalidateQueries({ queryKey: ["project", selectedProjectId] });
      qc.invalidateQueries({ queryKey: ["vouchers-pending-action"] });
      toast({ title: "Voucher created" });
      setLocation(`/projects/${targetProjId}/vouchers/${voucher.id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));
  const setItem = (i: number, field: keyof Item, val: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };
  const addItem = () => setItems(prev => [...prev, { description: "", category: "", amount: "" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: form.currency, minimumFractionDigits: 2 }).format(n);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_FILES - attachments.length;
    if (remaining <= 0) { toast({ title: `Max ${MAX_FILES} files`, variant: "destructive" }); return; }
    files.slice(0, remaining).forEach(file => {
      if (!file.type.startsWith("image/")) { toast({ title: `${file.name}: only images supported`, variant: "destructive" }); return; }
      if (file.size > MAX_FILE_SIZE) { toast({ title: `${file.name}: max 5 MB`, variant: "destructive" }); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setAttachments(prev => [...prev, { data: base64, mimeType: file.type, name: file.name, sizeKB: Math.round(file.size / 1024) }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeAttachment = (i: number) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  const currentUsername = me?.username || "You";

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">New Voucher</h1>
            {project && <p className="text-xs text-muted-foreground">{project.name}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Basic Info */}
          {isDifferentProject && selectedProject && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-blue-800">Cross-project voucher — </span>
                <span className="text-blue-700">
                  You are creating this voucher inside <strong>{project?.name}</strong> but it will be saved under <strong>{selectedProject.name}</strong>.
                </span>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold mb-4">Voucher Details</h2>
            <div className="mb-4">
              <Label>Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select project…" /></SelectTrigger>
                <SelectContent>
                  {allProjects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}{p.code ? ` (${p.code})` : ""}
                      {String(p.id) === projectId ? " — current" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher Type</Label>
                <Select value={form.type} onValueChange={v => set("type", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Payment Voucher</SelectItem>
                    <SelectItem value="reimbursement">Reimbursement Voucher</SelectItem>
                    <SelectItem value="petty-cash">Petty Cash Voucher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Issue Date</Label>
                <Input className="mt-1" type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} />
              </div>
              <div>
                <Label>Pay To (Payee) *</Label>
                <Input className="mt-1" placeholder="Vendor / Employee name" value={form.payee} onChange={e => set("payee", e.target.value)} />
              </div>
              <div>
                <Label>Payee Contact</Label>
                <Input className="mt-1" placeholder="Email or phone" value={form.payeeContact} onChange={e => set("payeeContact", e.target.value)} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => set("currency", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Label>Purpose / Description</Label>
              <Textarea className="mt-1" rows={2} placeholder="Brief purpose of this voucher..." value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Expense Items</h2>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-5">Description *</div>
                <div className="col-span-4">Category</div>
                <div className="col-span-2">Amount *</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input placeholder="What was purchased/paid" value={it.description} onChange={e => setItem(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-4">
                    <Select value={it.category} onValueChange={v => setItem(i, "category", v)}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={it.amount}
                      onChange={e => setItem(i, "amount", e.target.value)}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <Label>Notes (optional)</Label>
            <Textarea className="mt-1" rows={2} placeholder="Any additional notes..." value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* Workflow Signatories */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Approval Workflow</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Assign who needs to verify, approve, and process payment for this voucher.
              Defaults are loaded from your company settings. If a signatory is the same as the creator, that step is skipped automatically.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prepared By</Label>
                <Input className="mt-1" value={currentUsername} disabled />
              </div>
              <div />
              <div>
                <Label>Verified By</Label>
                <Select value={verifierId || "none"} onValueChange={v => setVerifierId(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select verifier…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None (skip verification) —</SelectItem>
                    {companyUsers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.username}{u.role === "admin" ? " (admin)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Approved By</Label>
                <Select value={approverId || "none"} onValueChange={v => setApproverId(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select approver…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None (skip approval) —</SelectItem>
                    {companyUsers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.username}{u.role === "admin" ? " (admin)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Paid By</Label>
                <Select value={paidById || "none"} onValueChange={v => setPaidById(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select payer…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Anyone (or self) —</SelectItem>
                    {companyUsers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.username}{u.role === "admin" ? " (admin)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Bills / Receipts */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Bills / Receipts</h2>
                {attachments.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {attachments.length}
                  </span>
                )}
              </div>
              {attachments.length < MAX_FILES && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Add Files
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Attach bills, receipts, or payment screenshots. Images only (JPG, PNG, WebP), max 5 MB each, up to {MAX_FILES} files.
            </p>
            {attachments.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <FileImage className="h-8 w-8" />
                <span className="text-sm font-medium">Click to upload bills / receipts</span>
                <span className="text-xs">JPG, PNG, WebP — max 5 MB each</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {attachments.map((att, i) => (
                  <div key={i} className="relative group border border-border rounded-lg overflow-hidden bg-muted/20">
                    <img src={`data:${att.mimeType};base64,${att.data}`} alt={att.name} className="w-full h-32 object-cover" />
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{att.name}</p>
                      <p className="text-xs text-muted-foreground">{att.sizeKB} KB</p>
                    </div>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {attachments.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs">Add more</span>
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Right column — summary */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 sticky top-6">
            <h2 className="font-semibold mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{form.type === "payment" ? "Payment Voucher" : form.type === "reimbursement" ? "Reimbursement" : "Petty Cash"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payee</span>
                <span className="font-medium truncate ml-4">{form.payee || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{items.filter(it => it.description.trim()).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attachments</span>
                <span className={attachments.length > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {attachments.length > 0 ? `${attachments.length} file${attachments.length > 1 ? "s" : ""}` : "None"}
                </span>
              </div>
              <div className="h-px bg-border my-2" />

              {/* Workflow summary */}
              {(verifierId || approverId || paidById) && (
                <>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Workflow</div>
                  {verifierId && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Verifier</span>
                      <span>{companyUsers.find((u: any) => String(u.id) === verifierId)?.username || "—"}</span>
                    </div>
                  )}
                  {approverId && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Approver</span>
                      <span>{companyUsers.find((u: any) => String(u.id) === approverId)?.username || "—"}</span>
                    </div>
                  )}
                  {paidById && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Paid By</span>
                      <span>{companyUsers.find((u: any) => String(u.id) === paidById)?.username || "—"}</span>
                    </div>
                  )}
                  <div className="h-px bg-border my-1" />
                </>
              )}

              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={!form.payee.trim() || total <= 0 || mutation.isPending}
              >
                {mutation.isPending ? "Creating…" : "Save Voucher"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLocation(`/projects/${projectId}`)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
