import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { fmtDate, cn } from "@/lib/utils";

interface JournalLine {
  id: number;
  journalEntryId: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  description: string | null;
  debit: number;
  credit: number;
}

interface JournalEntryDetail {
  id: number;
  companyId: number;
  entryDate: string;
  description: string;
  refType: string;
  refId: number | null;
  status: string;
  createdBy: number;
  createdAt: string;
  lines: JournalLine[];
}

async function fetchEntry(id: number): Promise<JournalEntryDetail> {
  const res = await fetch(`/api/journal-entries/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Journal entry not found");
  return res.json();
}

async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`/api/journal-entries/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to delete"); }
}

const fmt = (n: number) =>
  n === 0 ? "—" : new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function JournalEntryView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { canManage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: () => fetchEntry(id),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      toast({ title: "Journal entry deleted." });
      setLocation("/accounting/journal-entries");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  );

  if (!entry) return <div className="text-center py-20 text-muted-foreground">Journal entry not found.</div>;

  const totalDebit  = entry.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;
  const isManual    = entry.refType === "manual";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/accounting/journal-entries")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[#2563EB] font-mono">
                JE-{String(entry.id).padStart(4, "0")}
              </h1>
              {isManual
                ? <Badge variant="secondary">Manual</Badge>
                : <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">{entry.refType}</Badge>
              }
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                {entry.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Created {fmtDate(entry.createdAt)}</p>
          </div>
        </div>
        {canManage && isManual && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="icon" className="border-red-300 text-red-700 hover:bg-red-50" title="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this journal entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete JE-{String(entry.id).padStart(4, "0")} and all {entry.lines.length} lines. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Details card */}
      <Card>
        <CardHeader><CardTitle className="text-base">Entry Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Entry Date</span>
            <p className="font-medium mt-0.5">{fmtDate(entry.entryDate)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Description</span>
            <p className="font-medium mt-0.5">{entry.description}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Reference Type</span>
            <p className="font-medium mt-0.5 capitalize">{entry.refType}</p>
          </div>
          {entry.refId && (
            <div>
              <span className="text-muted-foreground">Reference ID</span>
              <p className="font-medium mt-0.5 font-mono">#{entry.refId}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 border-b">
          <div className="flex items-center justify-between pb-4">
            <CardTitle className="text-base">Journal Lines</CardTitle>
            {isBalanced
              ? <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Balanced
                </span>
              : <span className="flex items-center gap-1.5 text-sm text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4" /> Unbalanced
                </span>
            }
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 text-left w-20">Code</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Note</th>
                <th className="px-4 py-3 text-right w-32">Debit</th>
                <th className="px-4 py-3 text-right w-32">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entry.lines.map((line, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{line.accountCode}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{line.accountName}</div>
                    <div className="text-xs text-muted-foreground capitalize">{line.accountType}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                    {line.description || "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm", line.debit > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                    {fmt(line.debit)}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm", line.credit > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                    {fmt(line.credit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/30">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold">Totals</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(totalDebit)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
