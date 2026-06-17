import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, Edit2, Trash2, BookOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: number;
  companyId: number;
  code: string;
  name: string;
  type: string;
  subType: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
type AccountType = typeof ACCOUNT_TYPES[number];

const SUB_TYPES: Record<AccountType, { value: string; label: string }[]> = {
  asset:     [{ value: "current_asset", label: "Current Asset" }, { value: "fixed_asset", label: "Fixed Asset" }],
  liability: [{ value: "current_liability", label: "Current Liability" }, { value: "long_term_liability", label: "Long-term Liability" }],
  equity:    [{ value: "share_capital", label: "Share Capital" }, { value: "retained_earnings", label: "Retained Earnings" }],
  revenue:   [{ value: "sales", label: "Sales Revenue" }, { value: "other_income", label: "Other Income" }],
  expense:   [{ value: "cost_of_sales", label: "Cost of Sales" }, { value: "operating_expense", label: "Operating Expense" }],
};

const TYPE_META: Record<AccountType, { label: string; color: string; bg: string; headerBg: string }> = {
  asset:     { label: "Assets",       color: "text-blue-700",   bg: "bg-blue-100 text-blue-700",     headerBg: "bg-blue-50 border-blue-200" },
  liability: { label: "Liabilities",  color: "text-red-700",    bg: "bg-red-100 text-red-700",       headerBg: "bg-red-50 border-red-200" },
  equity:    { label: "Equity",       color: "text-purple-700", bg: "bg-purple-100 text-purple-700", headerBg: "bg-purple-50 border-purple-200" },
  revenue:   { label: "Revenue",      color: "text-emerald-700",bg: "bg-emerald-100 text-emerald-700", headerBg: "bg-emerald-50 border-emerald-200" },
  expense:   { label: "Expenses",     color: "text-amber-700",  bg: "bg-amber-100 text-amber-700",   headerBg: "bg-amber-50 border-amber-200" },
};

function subTypeLabel(subType: string): string {
  for (const arr of Object.values(SUB_TYPES)) {
    const found = arr.find(s => s.value === subType);
    if (found) return found.label;
  }
  return subType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch chart of accounts");
  return res.json();
}

async function saveAccount(data: Partial<Account>, id?: number): Promise<Account> {
  const url = id ? `/api/accounts/${id}` : "/api/accounts";
  const res = await fetch(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save account"); }
  return res.json();
}

async function deleteAccount(id: number): Promise<void> {
  const res = await fetch(`/api/accounts/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to delete account"); }
}

const blankForm = (): Partial<Account> => ({
  code: "", name: "", type: "asset", subType: "current_asset", description: "", isActive: true,
});

export default function ChartOfAccounts() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Account>>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { data: Partial<Account>; id?: number }) => saveAccount(payload.data, payload.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setDialogOpen(false);
      toast({ title: editingId ? "Account updated." : "Account created." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    onSettled: () => setSaving(false),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Account deleted." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => saveAccount({ isActive }, id),
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: isActive ? "Account activated." : "Account deactivated." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditingId(null);
    setForm(blankForm());
    setDialogOpen(true);
  }

  function openEdit(acc: Account) {
    setEditingId(acc.id);
    setForm({ code: acc.code, name: acc.name, type: acc.type, subType: acc.subType, description: acc.description || "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.code?.trim() && !editingId) {
      toast({ title: "Account code is required", variant: "destructive" }); return;
    }
    if (!form.name?.trim()) {
      toast({ title: "Account name is required", variant: "destructive" }); return;
    }
    setSaving(true);
    saveMutation.mutate({ data: form, id: editingId ?? undefined });
  }

  const filtered = accounts.filter(a => {
    if (!showInactive && !a.isActive) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    }
    return true;
  });

  const byType = ACCOUNT_TYPES.map(type => ({
    type,
    accounts: filtered.filter(a => a.type === type),
  })).filter(g => g.accounts.length > 0);

  const totalActive = accounts.filter(a => a.isActive).length;

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      <h2 className="text-xl font-semibold">Chart of Accounts</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        {(error as any)?.message?.includes("Singapore")
          ? "Accounting features are only available for Singapore companies."
          : "Failed to load accounts. Please try again."}
      </p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${totalActive} active account${totalActive !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Account
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code or name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", ...ACCOUNT_TYPES] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    filterType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {t === "all" ? "All" : TYPE_META[t].label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">Show inactive</span>
                <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accounts grouped by type */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-48 rounded-lg bg-muted/50 animate-pulse" />)}
        </div>
      ) : byType.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No accounts match your filter.
        </div>
      ) : (
        <div className="space-y-4">
          {byType.map(({ type, accounts: group }) => {
            const meta = TYPE_META[type as AccountType];
            return (
              <Card key={type} className="overflow-hidden">
                <div className={cn("flex items-center justify-between px-6 py-3 border-b", meta.headerBg)}>
                  <div className="flex items-center gap-2">
                    <h2 className={cn("font-semibold text-sm uppercase tracking-wider", meta.color)}>
                      {meta.label}
                    </h2>
                    <Badge variant="secondary" className="text-xs">{group.length}</Badge>
                  </div>
                  <span className={cn("text-xs font-medium", meta.color)}>
                    {type.toUpperCase()}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-4 py-2.5 text-left w-24">Code</th>
                        <th className="px-4 py-2.5 text-left">Name</th>
                        <th className="px-4 py-2.5 text-left hidden sm:table-cell">Sub-type</th>
                        <th className="px-4 py-2.5 text-left hidden md:table-cell">Status</th>
                        {isAdmin && <th className="px-4 py-2.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {group.map(acc => (
                        <tr
                          key={acc.id}
                          className={cn(
                            "hover:bg-muted/20 transition-colors",
                            !acc.isActive && "opacity-50"
                          )}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-muted-foreground">
                            {acc.code}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={cn("font-medium", !acc.isActive && "line-through")}>
                                {acc.name}
                              </span>
                              {acc.isSystem && (
                                <span title="System account — cannot be deleted">
                                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                </span>
                              )}
                            </div>
                            {acc.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{acc.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", meta.bg)}>
                              {subTypeLabel(acc.subType)}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {acc.isActive
                              ? <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">Active</Badge>
                              : <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            }
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  title="Edit account"
                                  onClick={() => openEdit(acc)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  className={cn(
                                    "h-7 px-2 text-xs",
                                    acc.isActive
                                      ? "text-muted-foreground hover:text-orange-600"
                                      : "text-muted-foreground hover:text-emerald-600"
                                  )}
                                  title={acc.isActive ? "Deactivate" : "Activate"}
                                  onClick={() => toggleActiveMutation.mutate({ id: acc.id, isActive: !acc.isActive })}
                                >
                                  {acc.isActive ? "Deactivate" : "Activate"}
                                </Button>
                                {!acc.isSystem && (
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    title="Delete account"
                                    onClick={() => setDeleteId(acc.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingId && (
              <div className="space-y-1.5">
                <Label htmlFor="acc-code">Account Code <span className="text-destructive">*</span></Label>
                <Input
                  id="acc-code"
                  placeholder="e.g. 1050"
                  value={form.code || ""}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Account Name <span className="text-destructive">*</span></Label>
              <Input
                id="acc-name"
                placeholder="e.g. Cash at Bank - USD"
                value={form.name || ""}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <Label>Account Type <span className="text-destructive">*</span></Label>
                <Select
                  value={form.type || "asset"}
                  onValueChange={v => {
                    const firstSub = SUB_TYPES[v as AccountType][0].value;
                    setForm(f => ({ ...f, type: v, subType: firstSub }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Sub-type</Label>
              <Select
                value={form.subType || ""}
                onValueChange={v => setForm(f => ({ ...f, subType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(SUB_TYPES[(form.type as AccountType) || "asset"] || []).map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-desc">Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Textarea
                id="acc-desc"
                rows={2}
                placeholder="Optional notes about this account…"
                value={form.description || ""}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the account. If it has any journal entries you won't be able to delete it — deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId !== null) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
