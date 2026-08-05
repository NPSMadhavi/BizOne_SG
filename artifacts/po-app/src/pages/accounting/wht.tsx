import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, CheckCircle, Clock, AlertTriangle, Trash2, Undo2, Info } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

// ─── Constants ────────────────────────────────────────────────────────────────

const WHT_TYPES = [
  { value: "interest",          label: "Interest",                              defaultRate: 15 },
  { value: "royalty",           label: "Royalties",                             defaultRate: 10 },
  { value: "technical_service", label: "Technical Service / Management Fee",    defaultRate: 17 },
  { value: "rent",              label: "Rent on Movable Property",              defaultRate: 15 },
  { value: "director_fee",      label: "Director's Fees",                       defaultRate: 22 },
  { value: "others",            label: "Other Income (Section 45)",             defaultRate: 10 },
];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR", "INR"];

const today = new Date().toISOString().slice(0, 10);

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhtRecord {
  id: number;
  vendorName: string; vendorCountry: string | null;
  paymentDate: string; nature: string; paymentType: string;
  currency: string; grossAmount: number; whtRate: number;
  whtAmount: number; netAmount: number;
  filingDeadline: string | null; status: string;
  filedDate: string | null; referenceNo: string | null; notes: string | null;
  createdAt: string;
}
interface WhtData {
  records: WhtRecord[];
  summary: { total: number; pending: number; filed: number; overdue: number; totalWht: number };
  vendors: { name: string; country: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, ccy = "SGD") {
  return new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function filingDeadline(payDate: string): string {
  const d = new Date(payDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function typeLabel(v: string) {
  return WHT_TYPES.find(t => t.value === v)?.label ?? v;
}
function statusBadge(r: WhtRecord) {
  const isOverdue = r.status === "pending" && r.filingDeadline && r.filingDeadline < today;
  if (r.status === "filed")    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Filed</Badge>;
  if (isOverdue)               return <Badge variant="destructive">Overdue</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

// ─── New Entry Form ───────────────────────────────────────────────────────────

interface FormState {
  vendorName: string; vendorCountry: string;
  paymentDate: string; nature: string; paymentType: string;
  currency: string; grossAmount: string; whtRate: string;
}

const EMPTY_FORM: FormState = {
  vendorName: "", vendorCountry: "", paymentDate: today,
  nature: "", paymentType: "", currency: "SGD", grossAmount: "", whtRate: "",
};

interface WhtFormDialogProps {
  open: boolean; onClose: () => void;
  vendors: { name: string; country: string | null }[];
  editing: WhtRecord | null;
}
function WhtFormDialog({ open, onClose, vendors, editing }: WhtFormDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (editing) {
      setForm({
        vendorName: editing.vendorName, vendorCountry: editing.vendorCountry ?? "",
        paymentDate: editing.paymentDate, nature: editing.nature,
        paymentType: editing.paymentType, currency: editing.currency,
        grossAmount: editing.grossAmount.toFixed(2), whtRate: editing.whtRate.toFixed(2),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing, open]);

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Auto-fill rate when type changes
  const setType = (v: string) => {
    const meta = WHT_TYPES.find(t => t.value === v);
    setForm(p => ({ ...p, paymentType: v, whtRate: meta ? String(meta.defaultRate) : p.whtRate }));
  };
  // Auto-fill vendor country from directory
  const pickVendor = (name: string) => {
    const v = vendors.find(v => v.name === name);
    setForm(p => ({ ...p, vendorName: name, vendorCountry: v?.country ?? p.vendorCountry }));
  };

  const gross   = parseFloat(form.grossAmount) || 0;
  const rate    = parseFloat(form.whtRate)     || 0;
  const whtAmt  = +(gross * rate / 100).toFixed(2);
  const netAmt  = +(gross - whtAmt).toFixed(2);
  const deadline = form.paymentDate ? filingDeadline(form.paymentDate) : "";

  const save = useMutation({
    mutationFn: async () => {
      const url    = editing ? `/api/wht/${editing.id}` : "/api/wht";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wht"] }); onClose(); },
  });

  const valid = form.vendorName && form.paymentDate && form.nature && form.paymentType && gross > 0 && rate > 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit WHT Record" : "New WHT Entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Vendor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Non-Resident Payee *</Label>
              <Input
                value={form.vendorName}
                onChange={e => pickVendor(e.target.value)}
                list="wht-vendor-list"
                placeholder="Vendor / payee name"
                className="mt-1"
              />
              <datalist id="wht-vendor-list">
                {vendors.map(v => <option key={v.name} value={v.name} />)}
              </datalist>
            </div>
            <div>
              <Label>Country *</Label>
              <Input value={form.vendorCountry} onChange={e => set("vendorCountry", e.target.value)} placeholder="e.g. United States" className="mt-1" />
            </div>
            <div>
              <Label>Payment Date *</Label>
              <Input type="date" value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Nature + Type */}
          <div>
            <Label>Nature of Payment *</Label>
            <Input value={form.nature} onChange={e => set("nature", e.target.value)} placeholder="e.g. Technical support services for Q1 2026" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Type *</Label>
              <Select value={form.paymentType} onValueChange={setType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {WHT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label} ({t.defaultRate}%)</SelectItem>)}
                </SelectContent>
              </Select>
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

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Gross Amount *</Label>
              <Input type="text" inputMode="decimal" value={form.grossAmount}
                onChange={e => set("grossAmount", e.target.value)}
                onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) set("grossAmount", n.toFixed(2)); }}
                placeholder="0.00" className="mt-1" />
            </div>
            <div>
              <Label>WHT Rate (%) *</Label>
              <Input type="text" inputMode="decimal" value={form.whtRate}
                onChange={e => set("whtRate", e.target.value)}
                onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) set("whtRate", n.toFixed(2)); }}
                placeholder="0" className="mt-1" />
            </div>
          </div>

          {/* Auto-calculated preview */}
          {gross > 0 && rate > 0 && (
            <div className="rounded-lg bg-muted/50 border px-4 py-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">WHT Amount</div>
                <div className="font-semibold text-red-600">{form.currency} {fmt(whtAmt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Net to Vendor</div>
                <div className="font-semibold">{form.currency} {fmt(netAmt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Filing Deadline</div>
                <div className="font-semibold">{deadline}</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editing ? "Save Changes" : "Create Record"}
          </Button>
        </DialogFooter>
        {save.isError && <p className="text-destructive text-sm px-1">{(save.error as Error).message}</p>}
      </DialogContent>
    </Dialog>
  );
}

// ─── File Dialog ──────────────────────────────────────────────────────────────

function FileDialog({ record, open, onClose }: { record: WhtRecord | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [refNo, setRefNo] = useState("");
  const [filedDate, setFiledDate] = useState(today);

  useEffect(() => { if (open) { setRefNo(""); setFiledDate(today); } }, [open]);

  const mark = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/wht/${record!.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_filed", referenceNo: refNo, filedDate }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wht"] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Mark as Filed</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Date Filed</Label>
            <Input type="date" value={filedDate} onChange={e => setFiledDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>IRAS Reference No. (optional)</Label>
            <Input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Acknowledgment / file ref" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mark.mutate()} disabled={mark.isPending}>
            {mark.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WhtRegister() {
  const { canManage } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<WhtRecord | null>(null);
  const [filing, setFiling] = useState<WhtRecord | null>(null);

  const { data, isLoading, error } = useQuery<WhtData>({
    queryKey: ["wht"],
    queryFn: () =>
      fetch("/api/wht", { credentials: "include" })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); } return r.json(); }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/wht/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wht"] }),
  });

  const unfile = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/wht/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unfile" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wht"] }),
  });

  const s = data?.summary;
  const records = data?.records ?? [];
  const vendors = data?.vendors ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Withholding Tax Register</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Singapore Section 45 WHT — track, calculate, and file WHT on payments to non-residents
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowNew(true); }} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New WHT Entry
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          Under <strong>Section 45 ITA</strong>, Singapore-resident payers must withhold tax on certain payments
          to non-residents (interest, royalties, technical service fees, director's fees, etc.) and remit to IRAS
          within <strong>1 month</strong> of the payment date using Form IR37.
        </div>
      </div>

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Records</div>
              <div className="text-2xl font-bold">{s.total}</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="text-xs text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-1">Pending Filing</div>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{s.pending}</div>
            </CardContent>
          </Card>
          <Card className={s.overdue > 0 ? "border-red-300 dark:border-red-700" : ""}>
            <CardContent className="pt-4 pb-4 px-4">
              <div className={`text-xs uppercase tracking-wider mb-1 ${s.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>Overdue</div>
              <div className={`text-2xl font-bold ${s.overdue > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{s.overdue}</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="text-xs text-green-700 dark:text-green-300 uppercase tracking-wider mb-1">Filed</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{s.filed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total WHT</div>
              <div className="text-xl font-bold">SGD {fmt(s.totalWht)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      )}
      {error && <div className="py-8 text-center text-destructive text-sm">{(error as Error).message}</div>}

      {!isLoading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Payment Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Payee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nature</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross Amt</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">WHT Amt</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Deadline</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      No WHT records yet — click "New WHT Entry" to add one
                    </td>
                  </tr>
                ) : records.map(r => {
                  const isOverdue = r.status === "pending" && r.filingDeadline && r.filingDeadline < today;
                  return (
                    <tr key={r.id} className={`hover:bg-muted/30 ${isOverdue ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.paymentDate}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.vendorName}</div>
                        {r.vendorCountry && <div className="text-xs text-muted-foreground">{r.vendorCountry}</div>}
                      </td>
                      <td className="px-4 py-2.5 max-w-[180px]">
                        <div className="truncate">{r.nature}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{typeLabel(r.paymentType)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {r.currency} {fmt(r.grossAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.whtRate}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
                        {r.currency} {fmt(r.whtAmount)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>{r.filingDeadline ?? "—"}</span>
                        {r.status === "filed" && r.filedDate && (
                          <div className="text-xs text-muted-foreground">Filed: {r.filedDate}</div>
                        )}
                        {r.referenceNo && (
                          <div className="text-xs text-muted-foreground">Ref: {r.referenceNo}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(r)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {r.status === "pending" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-green-700 hover:text-green-700 hover:bg-green-50"
                                onClick={() => setFiling(r)}>
                                <CheckCircle className="h-3.5 w-3.5" />
                                File
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                onClick={() => { setEditing(r); setShowNew(true); }}>
                                Edit
                              </Button>
                            </>
                          )}
                          {r.status === "filed" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                              onClick={() => unfile.mutate(r.id)}>
                              <Undo2 className="h-3.5 w-3.5" />
                              Unfile
                            </Button>
                          )}
                          {canManage && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { if (confirm("Delete this WHT record?")) del.mutate(r.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialogs */}
      <WhtFormDialog
        open={showNew}
        onClose={() => { setShowNew(false); setEditing(null); }}
        vendors={vendors}
        editing={editing}
      />
      <FileDialog
        record={filing}
        open={!!filing}
        onClose={() => setFiling(null)}
      />
    </div>
  );
}
