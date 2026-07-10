import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeft, FolderKanban, Plus, Edit, Trash2, Receipt,
  TrendingUp, Calendar, DollarSign, CheckCircle, FileText,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  "on-hold": "bg-amber-100 text-amber-700 border-amber-200",
};
const VOUCHER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};
const TYPE_LABELS: Record<string, string> = {
  payment: "Payment",
  reimbursement: "Reimbursement",
  "petty-cash": "Petty Cash",
};

function fmt(n: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: project, isLoading } = useQuery<any>({
    queryKey: ["project", id],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Delete failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
      setLocation("/projects");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  const vouchers: any[] = project.vouchers || [];
  const budget = project.budget;
  const spent = project.spent || 0;
  const pct = budget && budget > 0 ? Math.min((spent / budget) * 100, 100) : null;
  const over = budget && spent > budget;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{project.name}</h1>
              {project.code && (
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {project.code}
                </span>
              )}
              <Badge className={`text-xs border ${STATUS_COLORS[project.status] || ""}`}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </Badge>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-0.5 ml-7">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/projects/${id}/edit`)} className="gap-1.5">
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Total Spent</span>
          </div>
          <div className={`text-lg font-bold ${over ? "text-red-600" : "text-foreground"}`}>{fmt(spent)}</div>
        </div>
        {budget !== null && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-xs">Budget</span>
            </div>
            <div className="text-lg font-bold">{fmt(budget)}</div>
          </div>
        )}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Receipt className="h-3.5 w-3.5" />
            <span className="text-xs">Vouchers</span>
          </div>
          <div className="text-lg font-bold">{vouchers.length}</div>
        </div>
        {(project.startDate || project.endDate) && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-xs">Timeline</span>
            </div>
            <div className="text-sm font-medium">
              {fmtDate(project.startDate)} → {fmtDate(project.endDate)}
            </div>
          </div>
        )}
      </div>

      {/* Budget progress */}
      {budget !== null && budget > 0 && pct !== null && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Budget Utilisation</span>
            <span className={over ? "text-red-600 font-semibold" : "text-muted-foreground"}>
              {pct.toFixed(1)}% used {over && "— OVER BUDGET"}
            </span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>{fmt(spent)} spent</span>
            <span>{fmt(budget)} budget</span>
          </div>
        </div>
      )}

      {/* Vouchers section */}
      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Vouchers</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{vouchers.length}</span>
          </div>
          <Button size="sm" onClick={() => setLocation(`/projects/${id}/vouchers/new`)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Voucher
          </Button>
        </div>

        {vouchers.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No vouchers yet</p>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setLocation(`/projects/${id}/vouchers/new`)}>
              <Plus className="h-3.5 w-3.5" />
              Create First Voucher
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {vouchers.map((v: any) => (
              <div
                key={v.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => setLocation(`/projects/${id}/vouchers/${v.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">{v.voucherNumber}</span>
                    <Badge className={`text-[10px] border ${VOUCHER_STATUS_COLORS[v.status] || ""}`}>
                      {v.status === "paid" ? (
                        <span className="flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" /> Paid</span>
                      ) : "Draft"}
                    </Badge>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {TYPE_LABELS[v.type] || v.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>Pay to: <span className="text-foreground">{v.payee}</span></span>
                    {v.issueDate && <span>{fmtDate(v.issueDate)}</span>}
                    {v.createdByUsername && <span>by {v.createdByUsername}</span>}
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

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{project.name}</strong> and all{" "}
            <strong>{vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""}</strong> under it. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
