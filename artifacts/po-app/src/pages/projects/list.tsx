import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, FolderKanban, ChevronRight, TrendingUp, Receipt,
  Trash2, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface Project {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  budget: number | null;
  spent: number;
  startDate: string | null;
  endDate: string | null;
  createdByUsername: string | null;
  createdAt: string;
}

interface Item {
  description: string;
  category: string;
  amount: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  "on-hold": "bg-amber-100 text-amber-700 border-amber-200",
};

const VOUCHER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  pending_verification: "bg-amber-100 text-amber-700 border-amber-200",
  pending_approval: "bg-orange-100 text-orange-700 border-orange-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

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

function fmt(n: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const EMPTY_ITEM = (): Item => ({ description: "", category: "", amount: "" });

export default function ProjectList() {
  const [, setLocation] = useLocation();
  const { isAdmin, hasModuleAccess } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Voucher creation dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [vType, setVType] = useState("payment");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [payee, setPayee] = useState("");
  const [payeeContact, setPayeeContact] = useState("");
  const [currency, setCurrency] = useState("SGD");
  const [selectedProject, setSelectedProject] = useState("none");
  const [items, setItems] = useState<Item[]>([EMPTY_ITEM()]);
  const [notes, setNotes] = useState("");

  const resetDialog = () => {
    setVType("payment");
    setIssueDate(new Date().toISOString().split("T")[0]);
    setPayee("");
    setPayeeContact("");
    setCurrency("SGD");
    setSelectedProject("none");
    setItems([EMPTY_ITEM()]);
    setNotes("");
  };

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch projects");
      return r.json();
    },
  });

  const { data: unassignedVouchers = [], isLoading: unassignedLoading } = useQuery<any[]>({
    queryKey: ["unassigned-vouchers"],
    queryFn: async () => {
      const r = await fetch("/api/vouchers", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createVoucherMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0);
      const body: any = {
        type: vType,
        payee: payee.trim(),
        payeeContact: payeeContact.trim() || undefined,
        issueDate: issueDate || undefined,
        currency,
        items: validItems.map(it => ({
          description: it.description.trim(),
          category: it.category,
          amount: parseFloat(it.amount) || 0,
        })),
        notes: notes.trim() || undefined,
      };
      if (selectedProject !== "none") body.projectId = Number(selectedProject);

      const r = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed to create voucher");
      }
      return r.json();
    },
    onSuccess: (voucher) => {
      qc.invalidateQueries({ queryKey: ["unassigned-vouchers"] });
      qc.invalidateQueries({ queryKey: ["project", selectedProject] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      resetDialog();
      toast({ title: `Voucher ${voucher.voucherNumber} created` });
      // Navigate to the voucher view
      const pid = voucher.projectId ?? 0;
      setLocation(`/projects/${pid}/vouchers/${voucher.id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const setItem = (i: number, field: keyof Item, val: string) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  const canCreate = payee.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground">Track project expenses with vouchers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(true); }} className="gap-2">
            <Receipt className="h-4 w-4" />
            New Voucher
          </Button>
          {(isAdmin || hasModuleAccess("projects")) && (
            <Button onClick={() => setLocation("/projects/new")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          )}
        </div>
      </div>

      {/* Projects list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
          <FolderKanban className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first project to start tracking expenses</p>
          <Button className="mt-4 gap-2" onClick={() => setLocation("/projects/new")}>
            <Plus className="h-4 w-4" />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => {
            const pct = p.budget && p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 100) : null;
            const over = p.budget && p.spent > p.budget;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => setLocation(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-semibold text-foreground text-base truncate">{p.name}</h2>
                      {p.code && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {p.code}
                        </span>
                      )}
                      <Badge className={`text-xs border shrink-0 ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"}`}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </Badge>
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{p.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {p.startDate && <span>Start: {fmtDate(p.startDate)}</span>}
                      {p.endDate && <span>End: {fmtDate(p.endDate)}</span>}
                      {p.createdByUsername && <span>By: {p.createdByUsername}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={`text-sm font-semibold ${over ? "text-red-600" : "text-foreground"}`}>
                          {fmt(p.spent)}
                        </span>
                      </div>
                      {p.budget !== null && (
                        <div className="text-xs text-muted-foreground mt-0.5">of {fmt(p.budget)} budget</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
                {p.budget !== null && p.budget > 0 && pct !== null && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% used</span>
                      {over && <span className="text-[10px] text-red-600 font-medium">Over budget!</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned Vouchers section */}
      {(unassignedLoading || unassignedVouchers.length > 0) && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-foreground">Unassigned Vouchers</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {unassignedVouchers.length}
            </span>
            <span className="text-xs text-muted-foreground">— not linked to any project</span>
          </div>
          {unassignedLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="bg-card border border-amber-200 rounded-xl divide-y divide-border">
              {unassignedVouchers.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() => setLocation(`/projects/0/vouchers/${v.id}`)}
                >
                  <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{v.voucherNumber}</span>
                      <Badge className={`text-[10px] border ${VOUCHER_STATUS_COLORS[v.status] || ""}`}>
                        {v.status?.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {v.type === "petty-cash" ? "Petty Cash" : v.type === "reimbursement" ? "Reimbursement" : "Payment"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>Pay to: <span className="text-foreground">{v.payee}</span></span>
                      {v.issueDate && <span>{fmtDate(v.issueDate)}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm">{fmt(v.totalAmount, v.currency)}</div>
                    <div className="text-xs text-muted-foreground">{v.currency}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Voucher Creation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              New Voucher
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Row 1: Type + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher Type</Label>
                <Select value={vType} onValueChange={setVType}>
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
                <Input
                  className="mt-1"
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Payee + Payee Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pay To (Payee) *</Label>
                <Input
                  className="mt-1"
                  placeholder="Vendor / person name"
                  value={payee}
                  onChange={e => setPayee(e.target.value)}
                />
              </div>
              <div>
                <Label>Payee Contact</Label>
                <Input
                  className="mt-1"
                  placeholder="Email or phone"
                  value={payeeContact}
                  onChange={e => setPayeeContact(e.target.value)}
                />
              </div>
            </div>

            {/* Row 3: Currency + Project */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Project <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No project / Unassigned</span>
                    </SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}{p.code ? ` (${p.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProject === "none" && (
                  <p className="text-xs text-muted-foreground mt-1">Voucher will be saved as unassigned — you can move it to a project later.</p>
                )}
              </div>
            </div>

            {/* Items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Expense Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5 h-7 text-xs">
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_160px_100px_32px] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                  <span>Description</span>
                  <span>Category</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                <div className="divide-y divide-border">
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[1fr_160px_100px_32px] gap-0 items-center px-3 py-2">
                      <Input
                        className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-8"
                        placeholder="What was purchased"
                        value={it.description}
                        onChange={e => setItem(i, "description", e.target.value)}
                      />
                      <Select value={it.category} onValueChange={v => setItem(i, "category", v)}>
                        <SelectTrigger className="border-0 shadow-none focus-visible:ring-0 text-sm h-8">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm text-right h-8"
                        type="text" inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={it.amount}
                        onChange={e => setItem(i, "amount", e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(i)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end px-3 py-2 bg-muted/30 border-t border-border">
                  <span className="text-sm font-semibold">
                    Total: {fmt(total, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Any additional notes or remarks…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => createVoucherMutation.mutate()}
              disabled={!canCreate || createVoucherMutation.isPending}
              className="gap-2"
            >
              {createVoucherMutation.isPending ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Receipt className="h-3.5 w-3.5" />
                  Create Voucher
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
