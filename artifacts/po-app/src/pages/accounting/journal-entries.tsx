import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, Eye, Trash2, BookOpen } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface JournalEntry {
  id: number;
  companyId: number;
  entryDate: string;
  description: string;
  refType: string;
  refId: number | null;
  status: string;
  createdBy: number;
  createdAt: string;
}

async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const res = await fetch("/api/journal-entries", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch journal entries");
  return res.json();
}

async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`/api/journal-entries/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to delete"); }
}

export default function JournalEntriesList() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: fetchJournalEntries,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      toast({ title: "Journal entry deleted." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = entries.filter(e => {
    if (fromDate && e.entryDate < fromDate) return false;
    if (toDate && e.entryDate > toDate) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.description.toLowerCase().includes(q) || String(e.id).includes(q);
    }
    return true;
  });

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm">Failed to load journal entries.</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journal Entries</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${filtered.length} entr${filtered.length !== 1 ? "ies" : "y"}`}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setLocation("/accounting/journal-entries/new")}>
          <Plus className="h-4 w-4" /> New Journal Entry
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search description…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">From</span>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-38" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">To</span>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-38" />
            </div>
            {(fromDate || toDate || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFromDate(""); setToDate(""); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="divide-y">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-14 animate-pulse bg-muted/30 mx-6 my-2 rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {entries.length === 0
              ? "No journal entries yet. Create your first manual entry."
              : "No entries match your filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 text-left w-20">ID</th>
                  <th className="px-4 py-3 text-left w-32">Date</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left w-28">Type</th>
                  <th className="px-4 py-3 text-left w-24">Status</th>
                  <th className="px-4 py-3 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(entry => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      JE-{String(entry.id).padStart(4, "0")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(entry.entryDate)}</td>
                    <td className="px-4 py-3 font-medium max-w-xs truncate">{entry.description}</td>
                    <td className="px-4 py-3">
                      {entry.refType === "manual"
                        ? <Badge variant="secondary" className="text-xs">Manual</Badge>
                        : <Badge className="text-xs bg-violet-100 text-violet-700 hover:bg-violet-100">
                            {entry.refType}
                          </Badge>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="View entry"
                          onClick={() => setLocation(`/accounting/journal-entries/${entry.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && entry.refType === "manual" && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete entry"
                            onClick={() => setDeleteId(entry.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete journal entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete JE-{String(deleteId ?? 0).padStart(4, "0")} and all its lines. This cannot be undone.
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
