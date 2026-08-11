import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, Eye, Trash2, Pencil, TrendingUp } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface IncomeRecord {
  id: number;
  companyId: number;
  incomeDate: string;
  payerName: string;
  description: string;
  category: string;
  amount: string;
  gstAmount: string;
  gstTreatment: string;
  currency: string;
  paymentMethod: string | null;
  status: string;
  reference: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  rental_income:    "Rental Income",
  interest_income:  "Interest Income",
  dividend_income:  "Dividend Income",
  grant_subsidy:    "Government Grant / Subsidy",
  commission_income:"Commission Income",
  service_fee:      "Service Fee (Non-trade)",
  royalty_income:   "Royalty Income",
  gain_on_disposal: "Gain on Disposal of Asset",
  forex_gain:       "Foreign Exchange Gain",
  other_income:     "Other Income",
};

const GST_LABELS: Record<string, string> = {
  standard_rated: "Standard-Rated (9%)",
  zero_rated:     "Zero-Rated (0%)",
  exempt:         "Exempt",
  out_of_scope:   "Out of Scope",
};

const GST_COLORS: Record<string, string> = {
  standard_rated: "bg-blue-100 text-blue-700",
  zero_rated:     "bg-cyan-100 text-cyan-700",
  exempt:         "bg-gray-100 text-gray-600",
  out_of_scope:   "bg-orange-100 text-orange-700",
};

function fmtMoney(currency: string, amount: string) {
  return `${currency} ${parseFloat(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function fetchIncome(): Promise<IncomeRecord[]> {
  const res = await fetch("/api/income", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch income records");
  return res.json();
}

async function deleteIncome(id: number): Promise<void> {
  const res = await fetch(`/api/income/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to delete"); }
}

export default function IncomeList() {
  const [, setLocation] = useLocation();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: records = [], isLoading, error } = useQuery({
    queryKey: ["income"],
    queryFn: fetchIncome,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      toast({ title: "Income record deleted." });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = records.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.payerName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalGst    = filtered.reduce((s, r) => s + (parseFloat(r.gstAmount) || 0), 0);
  const totalStdRated = filtered.filter(r => r.gstTreatment === "standard_rated").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const statusBadge = (status: string) => {
    if (status === "confirmed") return <Badge className="bg-green-100 text-green-700 border-0">Confirmed</Badge>;
    if (status === "void")      return <Badge className="bg-red-100 text-red-700 border-0">Void</Badge>;
    return <Badge variant="outline">Draft</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB] flex items-center gap-2"><TrendingUp className="h-6 w-6" /> Income</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Non-trade income — Singapore IRAS-aligned</p>
        </div>
        <Button onClick={() => setLocation("/accounting/income/new")}>
          <Plus className="h-4 w-4 mr-2" /> New Income Entry
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Income</p>
            <p className="text-xl font-bold mt-0.5">SGD {totalAmount.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">{filtered.length} records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">GST Output (Box 6)</p>
            <p className="text-xl font-bold mt-0.5 text-blue-600">SGD {totalGst.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Output tax collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Standard-Rated (Box 1)</p>
            <p className="text-xl font-bold mt-0.5 text-green-600">SGD {totalStdRated.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Feeds GST F5 Box 1</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search payer or description…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Loading…</div>}
      {error && <div className="text-center py-12 text-destructive">Failed to load income records.</div>}

      {!isLoading && !error && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Payer</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">GST Treatment</th>
                <th className="text-right px-4 py-3 font-medium">Amount (Net)</th>
                <th className="text-right px-4 py-3 font-medium">GST</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No income records found.</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.incomeDate)}</td>
                  <td className="px-4 py-3 font-medium">{r.payerName}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{r.description}</td>
                  <td className="px-4 py-3">{CATEGORY_LABELS[r.category] ?? r.category}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${GST_COLORS[r.gstTreatment] ?? ""}`}>
                      {GST_LABELS[r.gstTreatment] ?? r.gstTreatment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtMoney(r.currency, r.amount)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">{fmtMoney(r.currency, r.gstAmount)}</td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setLocation(`/accounting/income/${r.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setLocation(`/accounting/income/${r.id}`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete income record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
