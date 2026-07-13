import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeft, Receipt, Edit, Trash2, CheckCircle, FileText, Paperclip,
} from "lucide-react";
import { generateVoucherPDF } from "@/lib/voucher-pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";

const TYPE_LABELS: Record<string, string> = {
  payment: "Payment Voucher",
  reimbursement: "Reimbursement Voucher",
  "petty-cash": "Petty Cash Voucher",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

function fmt(n: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VoucherView() {
  const params = useParams<{ id: string; vid: string }>();
  const projectId = params.id;
  const voucherId = params.vid;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankRef, setBankRef] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);

  // Main voucher — excludes proofData so it stays lean and fast
  const { data: voucher, isLoading } = useQuery<any>({
    queryKey: ["voucher", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}?_t=${Date.now()}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  // Proof image — separate query so main GET stays fast
  const { data: proofInfo } = useQuery<any>({
    queryKey: ["voucher-proof", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/proof`, { credentials: "include" });
      if (!r.ok) return { proofData: null, proofMimeType: null };
      return r.json();
    },
    enabled: !!voucher?.hasProof,
    staleTime: 5 * 60 * 1000, // proof rarely changes — cache 5 min
  });

  const { data: company } = useQuery<any>({
    queryKey: ["company-info"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) return null;
      const me = await r.json();
      return me.companies?.find((c: any) => c.id === me.selectedCompanyId) ?? null;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paidDate, bankRef }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed");
      }
      return r.json();
    },
    onSuccess: async () => {
      setMarkPaidOpen(false);
      toast({ title: "Voucher marked as paid" });
      // Await the refetch so PDF opens with the fresh paid data
      await qc.refetchQueries({ queryKey: ["voucher", voucherId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setPdfOpen(true);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markDraftMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/mark-draft`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed");
      }
      return r.json();
    },
    onSuccess: async () => {
      toast({ title: "Reverted to draft" });
      await qc.refetchQueries({ queryKey: ["voucher", voucherId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Voucher deleted" });
      setLocation(`/projects/${projectId}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleGeneratePdf = async (opts?: { returnBase64?: boolean }) => {
    if (!voucher) return;
    // Fetch proof fresh if voucher has one (in case stale or not loaded yet)
    let pd: string | null = proofInfo?.proofData ?? null;
    let pm: string | null = proofInfo?.proofMimeType ?? null;
    if (voucher.hasProof && !pd) {
      try {
        const r = await fetch(`/api/vouchers/${voucherId}/proof`, { credentials: "include" });
        if (r.ok) { const j = await r.json(); pd = j.proofData; pm = j.proofMimeType; }
      } catch { /* ignore */ }
    }
    return generateVoucherPDF(
      {
        voucherNumber: voucher.voucherNumber,
        type: voucher.type,
        payee: voucher.payee,
        payeeContact: voucher.payeeContact,
        issueDate: voucher.issueDate,
        description: voucher.description,
        currency: voucher.currency,
        totalAmount: voucher.totalAmount,
        status: voucher.status,
        paidDate: voucher.paidDate,
        bankRef: voucher.bankRef,
        notes: voucher.notes,
        items: (voucher.items as any[]) || [],
        project: voucher.project,
        proofData: pd,
        proofMimeType: pm,
      },
      company,
      opts
    );
  };

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!voucher) return <div className="p-8 text-center text-muted-foreground">Voucher not found</div>;

  const items: any[] = voucher.items || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{voucher.voucherNumber}</h1>
              <Badge className={`text-xs border ${STATUS_COLORS[voucher.status] || ""}`}>
                {voucher.status === "paid" ? (
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Paid</span>
                ) : "Draft"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {TYPE_LABELS[voucher.type] || voucher.type}
              </span>
            </div>
            {voucher.project && (
              <p className="text-xs text-muted-foreground ml-7 mt-0.5">
                Project: {voucher.project.name}{voucher.project.code ? ` (${voucher.project.code})` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Preview / Print
          </Button>
          {voucher.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setLocation(`/projects/${projectId}/vouchers/${voucherId}/edit`)} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" onClick={() => setMarkPaidOpen(true)} className="gap-1.5 bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Mark as Paid
              </Button>
            </>
          )}
          {isAdmin && voucher.status === "paid" && (
            <Button variant="outline" size="sm" onClick={() => markDraftMutation.mutate()} disabled={markDraftMutation.isPending} className="gap-1.5">
              {markDraftMutation.isPending ? "Reverting…" : "Revert to Draft"}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pay To", value: voucher.payee },
          { label: "Date", value: fmtDate(voucher.issueDate) },
          { label: "Currency", value: voucher.currency },
          { label: "Created By", value: voucher.createdByUsername || "—" },
          ...(voucher.payeeContact ? [{ label: "Contact", value: voucher.payeeContact }] : []),
          ...(voucher.status === "paid" ? [
            { label: "Paid On", value: fmtDate(voucher.paidDate) },
            { label: "Bank Ref", value: voucher.bankRef || "—" },
          ] : []),
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/40 rounded-lg px-4 py-3">
            <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
            <div className="text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>

      {voucher.description && (
        <div className="bg-card border border-border rounded-lg px-5 py-4">
          <div className="text-xs text-muted-foreground mb-1">Description</div>
          <p className="text-sm">{voucher.description}</p>
        </div>
      )}

      {/* Items table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-sm">Expense Items</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Category</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any, i: number) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">{it.description}</td>
                <td className="px-4 py-3 text-muted-foreground">{it.category || "—"}</td>
                <td className="px-5 py-3 text-right font-medium">{fmt(parseFloat(it.amount) || 0, voucher.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 border-t-2 border-border">
              <td colSpan={3} className="px-5 py-3 font-bold text-right">Total</td>
              <td className="px-5 py-3 text-right font-bold text-primary text-base">
                {fmt(voucher.totalAmount, voucher.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {voucher.notes && (
        <div className="bg-card border border-border rounded-lg px-5 py-4">
          <div className="text-xs text-muted-foreground mb-1">Notes</div>
          <p className="text-sm whitespace-pre-wrap">{voucher.notes}</p>
        </div>
      )}

      {/* Bills / Receipts */}
      {voucher.hasProof && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Bills / Receipts</h2>
            {voucher.status === "paid" && (
              <span className="ml-auto text-xs text-green-600 font-medium">✓ Included as page 2 in PDF with PAID stamp</span>
            )}
          </div>
          <div className="p-5">
            {proofInfo?.proofData && proofInfo?.proofMimeType ? (
              <img
                src={`data:${proofInfo.proofMimeType};base64,${proofInfo.proofData}`}
                alt="Bill / receipt"
                className="max-w-full max-h-[500px] object-contain rounded border border-border mx-auto block"
              />
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mr-2" />
                Loading…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mark Paid dialog */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Voucher as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Payment Date</Label>
              <Input className="mt-1" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
            </div>
            <div>
              <Label>Bank Reference / UTR (optional)</Label>
              <Input className="mt-1" placeholder="e.g. TXN123456" value={bankRef} onChange={e => setBankRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
            <Button onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {markPaidMutation.isPending ? "Saving…" : "Confirm Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voucher?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete voucher <strong>{voucher.voucherNumber}</strong>. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview modal */}
      <PdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        title={`${voucher.voucherNumber} — ${TYPE_LABELS[voucher.type] || voucher.type}`}
        generatePdf={handleGeneratePdf}
        pdfFilename={`${voucher.voucherNumber}.pdf`}
        onEdit={voucher.status === "draft" ? () => { setPdfOpen(false); setLocation(`/projects/${projectId}/vouchers/${voucherId}/edit`); } : undefined}
      />
    </div>
  );
}
