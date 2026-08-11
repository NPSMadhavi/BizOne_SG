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
  ArrowLeft, Receipt, Edit, Trash2, CheckCircle, FileText, Paperclip, FileImage,
  ShieldCheck, ThumbsUp, Banknote, Clock, RotateCcw, FolderInput,
} from "lucide-react";
import { generateVoucherPDF } from "@/lib/voucher-pdf";
import type { VoucherAttachment } from "@/lib/voucher-pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";

const TYPE_LABELS: Record<string, string> = {
  payment: "Payment Voucher",
  reimbursement: "Reimbursement Voucher",
  "petty-cash": "Petty Cash Voucher",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  pending_verification: "bg-amber-100 text-amber-700 border-amber-200",
  pending_approval: "bg-orange-100 text-orange-700 border-orange-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_verification: "Pending Verification",
  pending_approval: "Pending Approval",
  approved: "Approved",
  paid: "Paid",
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
  const { canManage } = useAuth();
  const qc = useQueryClient();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveToProjectId, setMoveToProjectId] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankRef, setBankRef] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [previewAttUrl, setPreviewAttUrl] = useState<string | null>(null);

  const { data: me } = useQuery<any>({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const currentUserId: number | null = me?.id ?? null;
  const company = me?.companies?.find((c: any) => c.id === me?.selectedCompanyId) ?? null;

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.projects ?? []);
    },
    enabled: canManage,
  });

  const { data: voucher, isLoading } = useQuery<any>({
    queryKey: ["voucher", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}?_t=${Date.now()}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const { data: attachmentsMeta = [] } = useQuery<any[]>({
    queryKey: ["voucher-attachments", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/attachments`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!voucher?.attachmentCount && voucher.attachmentCount > 0,
  });

  const invalidate = async () => {
    await qc.refetchQueries({ queryKey: ["voucher", voucherId] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["vouchers-pending-action"] });
  };

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/verify`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async () => {
      toast({ title: "Voucher verified" });
      await invalidate();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/approve`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async () => {
      toast({ title: "Voucher approved" });
      await invalidate();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paidDate, bankRef }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async () => {
      setMarkPaidOpen(false);
      toast({ title: "Voucher marked as paid" });
      await invalidate();
      setPdfOpen(true);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markDraftMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/mark-draft`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async () => {
      setRevertOpen(false);
      toast({ title: "Workflow restarted" });
      await invalidate();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isUnassigned = projectId === "0";
  const backPath = isUnassigned ? "/projects" : `/projects/${projectId}`;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["unassigned-vouchers"] });
      toast({ title: "Voucher deleted" });
      setLocation(backPath);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const moveMutation = useMutation({
    mutationFn: async (newProjectId: string) => {
      const r = await fetch(`/api/vouchers/${voucherId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: Number(newProjectId) }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed to move voucher"); }
      return newProjectId;
    },
    onSuccess: (newProjId) => {
      setMoveOpen(false);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["project", newProjId] });
      toast({ title: "Voucher moved successfully" });
      setLocation(`/projects/${newProjId}/vouchers/${voucherId}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleGeneratePdf = async (opts?: { returnBase64?: boolean }) => {
    if (!voucher) return;
    let attachments: VoucherAttachment[] = [];
    if (attachmentsMeta.length > 0) {
      const results = await Promise.allSettled(
        attachmentsMeta.map(async (att: any) => {
          const r = await fetch(`/api/vouchers/${voucherId}/attachments/${att.id}`, { credentials: "include" });
          if (!r.ok) return null;
          return r.json();
        })
      );
      attachments = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
        .map(r => ({ fileData: r.value.fileData, mimeType: r.value.mimeType, fileName: r.value.fileName }));
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
        attachments,
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
  const status = voucher.status as string;

  // Workflow action flags
  const canVerify = status === "pending_verification" && (canManage || currentUserId === voucher.verifierId);
  const canApprove = status === "pending_approval" && (canManage || currentUserId === voucher.approverId);
  const canMarkPaid = status === "approved" && (canManage || currentUserId === voucher.paidById);
  const canEdit = (status === "pending_verification" || status === "pending_approval") || (canManage && status !== "paid");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(backPath)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-[#2563EB]">{voucher.voucherNumber}</h1>
              <Badge className={`text-xs border ${STATUS_COLORS[status] || ""}`}>
                {status === "paid" ? (
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Paid</span>
                ) : STATUS_LABELS[status] || status}
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

          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setLocation(`/projects/${projectId}/vouchers/${voucherId}/edit`)} className="gap-1.5">
              <Edit className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}

          {canVerify && (
            <Button size="sm" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
              <ShieldCheck className="h-3.5 w-3.5" />
              {verifyMutation.isPending ? "Verifying…" : "Verify"}
            </Button>
          )}

          {canApprove && (
            <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white">
              <ThumbsUp className="h-3.5 w-3.5" />
              {approveMutation.isPending ? "Approving…" : "Approve"}
            </Button>
          )}

          {canMarkPaid && (
            <Button size="sm" onClick={() => setMarkPaidOpen(true)}
              className="gap-1.5 bg-green-600 hover:bg-green-700">
              <Banknote className="h-3.5 w-3.5" />
              Mark as Paid
            </Button>
          )}

          {canManage && status !== "draft" && (
            <Button variant="outline" size="sm" onClick={() => setRevertOpen(true)}
              className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Restart Workflow
            </Button>
          )}

          {canManage && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setMoveToProjectId(""); setMoveOpen(true); }}>
              <FolderInput className="h-3.5 w-3.5" />
              Move to Project
            </Button>
          )}

          {canManage && (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Workflow status banner */}
      {status === "pending_verification" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-amber-800">Awaiting Verification</span>
            {voucher.verifierName && <span className="text-amber-700"> — assigned to <strong>{voucher.verifierName}</strong></span>}
          </div>
        </div>
      )}
      {status === "pending_approval" && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-orange-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-orange-800">Awaiting Approval</span>
            {voucher.approverName && <span className="text-orange-700"> — assigned to <strong>{voucher.approverName}</strong></span>}
            {voucher.verifierName && voucher.verifiedAt && <span className="text-orange-600 ml-2">· Verified by {voucher.verifierName} on {fmtDate(voucher.verifiedAt)}</span>}
          </div>
        </div>
      )}
      {status === "approved" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
          <ThumbsUp className="h-4 w-4 text-blue-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-blue-800">Approved — Ready for Payment</span>
            {voucher.approverName && voucher.approvedAt && <span className="text-blue-700"> — Approved by <strong>{voucher.approverName}</strong> on {fmtDate(voucher.approvedAt)}</span>}
            {voucher.paidByName && <span className="text-blue-600 ml-2">· Payment assigned to <strong>{voucher.paidByName}</strong></span>}
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pay To", value: voucher.payee },
          { label: "Date", value: fmtDate(voucher.issueDate) },
          { label: "Currency", value: voucher.currency },
          { label: "Prepared By", value: voucher.preparedByName || voucher.createdByUsername || "—" },
          ...(voucher.payeeContact ? [{ label: "Contact", value: voucher.payeeContact }] : []),
          ...(voucher.verifierName ? [{ label: "Verifier", value: voucher.verifierName }] : []),
          ...(voucher.approverName ? [{ label: "Approver", value: voucher.approverName }] : []),
          ...(voucher.paidByName ? [{ label: "Paid By", value: voucher.paidByName }] : []),
          ...(status === "paid" ? [
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
      {voucher.attachmentCount > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Bills / Receipts</h2>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {voucher.attachmentCount} file{voucher.attachmentCount > 1 ? "s" : ""}
            </span>
            {status === "paid" && (
              <span className="ml-auto text-xs text-green-600 font-medium">✓ Each image appears as a page in the PDF with PAID stamp</span>
            )}
          </div>
          <div className="p-5">
            {attachmentsMeta.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mr-2" />
                Loading…
              </div>
            ) : (
              <AttachmentGrid voucherId={voucherId} attachments={attachmentsMeta} onPreview={setPreviewAttUrl} />
            )}
          </div>
        </div>
      )}

      {/* Mark Paid dialog */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Voucher as Paid</DialogTitle></DialogHeader>
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

      {/* Restart Workflow dialog */}
      <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restart Workflow?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will clear any verification and approval recorded on this voucher and restart the workflow from the beginning.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => markDraftMutation.mutate()} disabled={markDraftMutation.isPending}>
              {markDraftMutation.isPending ? "Reverting…" : "Restart Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Voucher?</DialogTitle></DialogHeader>
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

      {/* Move to Project dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderInput className="h-5 w-5 text-primary" />
              Move Voucher to Another Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Select the project you want to move <strong>{voucher.voucherNumber}</strong> into.
              All items, attachments, and workflow state will be preserved.
            </p>
            <div>
              <Label>Target Project</Label>
              <select
                className="mt-1 w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
                value={moveToProjectId}
                onChange={e => setMoveToProjectId(e.target.value)}
              >
                <option value="">— Select a project —</option>
                {allProjects.map((p: any) => (
                  <option key={p.id} value={String(p.id)} disabled={String(p.id) === projectId}>
                    {p.name}{p.code ? ` (${p.code})` : ""}
                    {String(p.id) === projectId ? " — current project" : ""}
                  </option>
                ))}
              </select>
            </div>
            {moveToProjectId && moveToProjectId !== projectId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This voucher will be moved from <strong>{voucher.project?.name || "current project"}</strong> to{" "}
                <strong>{allProjects.find((p: any) => String(p.id) === moveToProjectId)?.name}</strong>.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button
              onClick={() => moveMutation.mutate(moveToProjectId)}
              disabled={!moveToProjectId || moveToProjectId === projectId || moveMutation.isPending}
            >
              {moveMutation.isPending ? "Moving…" : "Move Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-screen attachment preview */}
      {previewAttUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewAttUrl(null)}
        >
          <img
            src={previewAttUrl}
            alt="Attachment preview"
            className="max-w-full max-h-full object-contain rounded shadow-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80"
            onClick={() => setPreviewAttUrl(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* PDF Preview modal */}
      <PdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        title={`${voucher.voucherNumber} — ${TYPE_LABELS[voucher.type] || voucher.type}`}
        generatePdf={handleGeneratePdf}
        pdfFilename={`${voucher.voucherNumber}.pdf`}
        onEdit={canEdit ? () => { setPdfOpen(false); setLocation(`/projects/${projectId}/vouchers/${voucherId}/edit`); } : undefined}
      />
    </div>
  );
}

function AttachmentTile({ voucherId, att, onPreview }: { voucherId: string; att: any; onPreview: (url: string) => void }) {
  const { data } = useQuery<any>({
    queryKey: ["voucher-attachment-data", att.id],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/attachments/${att.id}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const imgSrc = data?.fileData ? `data:${data.mimeType};base64,${data.fileData}` : null;

  return (
    <div
      className="relative group border border-border rounded-lg overflow-hidden bg-muted/20 cursor-pointer"
      onClick={() => imgSrc && onPreview(imgSrc)}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={att.fileName} className="w-full h-36 object-cover group-hover:opacity-90 transition-opacity" />
      ) : (
        <div className="w-full h-36 flex items-center justify-center bg-muted/30">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      <div className="p-2">
        <p className="text-xs font-medium truncate">{att.fileName}</p>
        <p className="text-xs text-muted-foreground">{new Date(att.createdAt).toLocaleDateString()}</p>
      </div>
      {imgSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
          <FileImage className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
        </div>
      )}
    </div>
  );
}

function AttachmentGrid({ voucherId, attachments, onPreview }: { voucherId: string; attachments: any[]; onPreview: (url: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {attachments.map(att => (
        <AttachmentTile key={att.id} voucherId={voucherId} att={att} onPreview={onPreview} />
      ))}
    </div>
  );
}
