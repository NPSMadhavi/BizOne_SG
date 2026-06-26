import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { FileMinus, Edit, ArrowLeft, Printer, Ban, Lock } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generateCreditNote_PDF } from "@/lib/pdf";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface CreditNote {
  id: number; cnNumber: string; customerName: string; customerAddress: string | null;
  contactPerson: string | null; contactEmail: string | null;
  refInvNumber: string | null; reason: string | null;
  issueDate: string | null; currency: string;
  subtotal: number; discountAmount: number; taxRate: number; tax: number; totalAmount: number;
  status: string; voidReason: string | null; notes: string | null; isPrivate: boolean;
  items: any[]; createdByUsername: string | null; createdAt: string; paymentTerms: string | null;
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-sm px-3 py-1">Confirmed</Badge>;
  if (status === "void")      return <Badge className="bg-red-100 text-red-700 border-0 text-sm px-3 py-1">Void</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-0 text-sm px-3 py-1">Draft</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}

function fmt(currency: string, n: number) {
  return `${currency} ${new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(n)}`;
}

export default function CreditNoteView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin, selectedCompany } = useAuth();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data: doc, isLoading, refetch } = useQuery<CreditNote>({
    queryKey: ["credit-note", id],
    queryFn: async () => {
      const r = await fetch(`/api/credit-notes/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  async function handleConfirm() {
    const r = await fetch(`/api/credit-notes/${id}/confirm`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Credit note confirmed" }); refetch(); }
    else { const e = await r.json().catch(() => ({})); toast({ title: "Error", description: e.error, variant: "destructive" }); }
  }

  async function handleVoid() {
    const r = await fetch(`/api/credit-notes/${id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ reason: voidReason.trim() || null }),
    });
    if (r.ok) { toast({ title: "Credit note voided" }); setShowVoid(false); refetch(); }
    else { const e = await r.json().catch(() => ({})); toast({ title: "Error", description: e.error, variant: "destructive" }); }
  }

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>;
  if (!doc) return <div className="text-center py-16 text-red-500">Credit note not found</div>;

  const regularItems = doc.items.filter((i: any) => i.type !== "section");
  const hasPartNo = regularItems.some((i: any) => i.partNumber && String(i.partNumber).trim());

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <Link href="/credit-notes" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" />Back to Credit Notes
          </Link>
          <div className="flex items-center gap-3">
            <FileMinus className="h-6 w-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">{doc.cnNumber}</h1>
            {doc.isPrivate && <Lock className="h-4 w-4 text-gray-400" />}
            {statusBadge(doc.status)}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setShowPreview(true)}>
            <Printer className="h-4 w-4" />PDF Preview
          </Button>
          {(doc.status === "draft") && (
            <Button variant="outline" className="gap-2" onClick={() => setLocation(`/credit-notes/${id}/edit`)}>
              <Edit className="h-4 w-4" />Edit
            </Button>
          )}
          {doc.status === "draft" && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleConfirm}>
              Confirm Credit Note
            </Button>
          )}
          {doc.status !== "void" && isAdmin && (
            <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowVoid(true)}>
              <Ban className="h-4 w-4" />Void
            </Button>
          )}
        </div>
      </div>

      {/* Void banner */}
      {doc.status === "void" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-semibold">This credit note has been voided.</p>
          {doc.voidReason && <p className="text-red-600 text-sm mt-1">Reason: {doc.voidReason}</p>}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-600">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            <p className="font-semibold text-gray-900">{doc.customerName}</p>
            {doc.customerAddress && <p className="text-sm text-gray-600 whitespace-pre-wrap">{doc.customerAddress}</p>}
            {doc.contactPerson && <p className="text-sm text-gray-500">Attn: {doc.contactPerson}</p>}
            {doc.contactEmail && <p className="text-sm text-gray-500">{doc.contactEmail}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-600">Credit Note Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">Issue Date</dt><dd className="font-medium">{fmtDate(doc.issueDate)}</dd>
              {doc.refInvNumber && <><dt className="text-gray-500">Ref Invoice</dt><dd className="font-mono font-medium text-gray-900">{doc.refInvNumber}</dd></>}
              <dt className="text-gray-500">Currency</dt><dd className="font-medium">{doc.currency}</dd>
              <dt className="text-gray-500">GST Rate</dt><dd className="font-medium">{Number(doc.taxRate).toFixed(1)}%</dd>
              {doc.paymentTerms && <><dt className="text-gray-500">Payment Terms</dt><dd className="font-medium">{doc.paymentTerms}</dd></>}
              <dt className="text-gray-500">Created By</dt><dd className="font-medium">{doc.createdByUsername || "—"}</dd>
            </dl>
            {doc.reason && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason for Credit</p>
                <p className="text-sm text-gray-700">{doc.reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-sm text-gray-600">Line Items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">#</th>
                  {hasPartNo && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Part No.</th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Qty</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Unit Price</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Disc %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item: any, idx: number) => {
                  if (item.type === "section") {
                    return (
                      <tr key={idx} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={hasPartNo ? 7 : 6} className="px-4 py-2 font-bold text-gray-700">
                          {item.sectionLabel}
                        </td>
                      </tr>
                    );
                  }
                  let lineNum = 0;
                  doc.items.slice(0, idx + 1).forEach((i: any) => { if (i.type !== "section") lineNum++; });
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{lineNum}</td>
                      {hasPartNo && <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.partNumber || "—"}</td>}
                      <td className="px-4 py-2.5 text-gray-700">{item.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{item.qty}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(Number(item.unitPrice))}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">{Number(item.discount) > 0 ? `${item.discount}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-800">{new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(Number(item.amount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Totals */}
          <div className="flex justify-end p-4 border-t border-gray-200">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span className="font-mono">{fmt(doc.currency, doc.subtotal)}</span>
              </div>
              {Number(doc.discountAmount) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount</span><span className="font-mono text-red-600">- {fmt(doc.currency, Number(doc.discountAmount))}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>GST ({Number(doc.taxRate).toFixed(1)}%)</span><span className="font-mono">{fmt(doc.currency, doc.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 text-gray-900">
                <span>Credit Total</span><span className="font-mono">{fmt(doc.currency, doc.totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {doc.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-600">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700">{doc.notes}</p></CardContent>
        </Card>
      )}

      {/* Void dialog */}
      <Dialog open={showVoid} onOpenChange={setShowVoid}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-600" />Void Credit Note</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">Are you sure you want to void <strong>{doc.cnNumber}</strong>? This cannot be undone.</p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for voiding…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoid(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid}>Void Credit Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPreview && (
        <PdfPreviewModal
          open={showPreview}
          onOpenChange={setShowPreview}
          title={doc.cnNumber}
          generatePdf={(opts) => generateCreditNote_PDF(doc as any, selectedCompany, opts)}
          pdfFilename={`${doc.cnNumber}.pdf`}
          defaultEmailTo={doc.contactEmail || ""}
          defaultEmailSubject={`Credit Note ${doc.cnNumber}`}
          defaultEmailBody={`Dear ${doc.contactPerson || "Sir/Madam"},\n\nPlease find attached Credit Note ${doc.cnNumber}.\n\nThank you.`}
          onEdit={doc.status === "draft" ? () => setLocation(`/credit-notes/${id}/edit`) : undefined}
        />
      )}
    </div>
  );
}
