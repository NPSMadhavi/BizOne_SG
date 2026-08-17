import { useState, useMemo } from "react";
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
import { Plus, Search, Eye, Trash2, Pencil, ReceiptText, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

interface Expense {
  id: number;
  companyId: number;
  expenseDate: string;
  vendorName: string;
  description: string;
  category: string;
  amount: string;
  gstAmount: string;
  gstClaimable: boolean;
  isDeductible: boolean;
  deductiblePct: number;
  currency: string;
  paymentMethod: string | null;
  status: string;
  createdBy: number;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  staff_costs: "Staff Costs",
  rental: "Rental",
  professional_fees: "Professional Fees",
  advertising: "Advertising & Marketing",
  office_supplies: "Office Supplies",
  utilities: "Utilities",
  travel: "Travel & Transport",
  entertainment: "Entertainment (S14C)",
  motor_vehicle_private: "Motor Vehicle (Private)",
  motor_vehicle_commercial: "Motor Vehicle (Commercial)",
  training: "Training & Development",
  insurance: "Insurance",
  bank_charges: "Bank Charges",
  other: "Other Expenses",
};

async function fetchExpenses(): Promise<Expense[]> {
  const res = await fetch("/api/expenses", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch expenses");
  return res.json();
}

async function deleteExpense(id: number): Promise<void> {
  const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to delete"); }
}

function fmtMoney(currency: string, amount: string) {
  return `${currency} ${parseFloat(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesList() {
  const [, setLocation] = useLocation();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: expenses = [], isLoading, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: fetchExpenses,
    refetchOnMount: "always",
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense deleted." });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => expenses.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.vendorName.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    }
    return true;
  }), [expenses, statusFilter, categoryFilter, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  const totalAmount = filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalGst = filtered.reduce((s, e) => s + (parseFloat(e.gstAmount) || 0), 0);
  const totalDeductible = filtered.reduce((s, e) => {
    const net = (parseFloat(e.amount) || 0) - (parseFloat(e.gstAmount) || 0);
    return s + (e.isDeductible ? net * e.deductiblePct / 100 : 0);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2563EB] flex items-center gap-2"><ReceiptText className="h-6 w-6" /> Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Singapore IRAS-compliant expense recording</p>
        </div>
        <Button onClick={() => setLocation("/accounting/expenses/new")}>
          <Plus className="h-4 w-4 mr-2" /> New Expense
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Expenses</p>
            <p className="text-xl font-bold mt-0.5">SGD {totalAmount.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">{filtered.length} records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">GST Claimable</p>
            <p className="text-xl font-bold mt-0.5 text-blue-600">SGD {totalGst.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Input tax recoverable</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tax Deductible Amount</p>
            <p className="text-xl font-bold mt-0.5 text-green-600">SGD {totalDeductible.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">IRAS allowable deduction</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vendor or description…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">Failed to load expenses.</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ReceiptText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No expenses found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Vendor / Payee</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">GST</th>
                  <th className="px-4 py-3 text-center font-medium">Deductible</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(exp => (
                  <tr key={exp.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => setLocation(`/accounting/expenses/${exp.id}`)}>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(exp.expenseDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{exp.vendorName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">{exp.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[exp.category] ?? exp.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(exp.currency, exp.amount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-600">
                      {parseFloat(exp.gstAmount) > 0 ? fmtMoney(exp.currency, exp.gstAmount) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {exp.isDeductible ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                          {exp.deductiblePct === 100 ? "100%" : `${exp.deductiblePct}%`}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-300 text-xs">Non-deductible</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {exp.status === "confirmed" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs">Confirmed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">Draft</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => setLocation(`/accounting/expenses/${exp.id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setLocation(`/accounting/expenses/${exp.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
