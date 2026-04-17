import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, PackageCheck, ClipboardList, PackagePlus } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface GrnItem {
  partNumber?: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  received: boolean;
  serialNumbers: string;
}

interface Grn {
  id: number;
  grnNumber: string;
  poId: number;
  poNumber: string;
  vendorName: string;
  companyId: number;
  status: string;
  items: GrnItem[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchGrn(id: string): Promise<Grn> {
  const res = await fetch(`/api/grn/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("GRN not found");
  return res.json();
}

async function receiveGrn(id: number, items: GrnItem[]): Promise<Grn> {
  const res = await fetch(`/api/grn/${id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to confirm goods received");
  }
  return res.json();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "complete":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Complete</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>;
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function GrnView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ["grn", params.id],
    queryFn: () => fetchGrn(params.id!),
    enabled: !!params.id,
  });

  const [items, setItems] = useState<GrnItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (grn) {
      setItems(grn.items.map((item) => ({ ...item })));
      setIsDirty(false);
    }
  }, [grn]);

  const mutation = useMutation({
    mutationFn: (updatedItems: GrnItem[]) => receiveGrn(grn!.id, updatedItems),
    onSuccess: (updated) => {
      queryClient.setQueryData(["grn", params.id], updated);
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      setIsDirty(false);
      setConfirmOpen(false);
      toast({ title: "Goods Received", description: "GRN confirmed and stock updated successfully." });
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const allReceived = items.length > 0 && items.every((i) => i.received);
  const someReceived = items.some((i) => i.received) && !allReceived;

  const handleSelectAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, received: checked })));
    setIsDirty(true);
  };

  const handleToggleReceived = (index: number, checked: boolean) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], received: checked };
      return next;
    });
    setIsDirty(true);
  };

  const handleSerialNumbers = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], serialNumbers: value };
      return next;
    });
    setIsDirty(true);
  };

  const handleReceiveClick = () => {
    const receivedItems = items.filter((i) => i.received);
    if (receivedItems.length === 0) {
      toast({ title: "No items selected", description: "Please check at least one item as received.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  const receivedItems = items.filter((i) => i.received);
  const missingSerials = receivedItems.filter((i) => !i.serialNumbers.trim());

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !grn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">GRN not found.</p>
        <Button variant="outline" onClick={() => setLocation("/grn")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to GRN List
        </Button>
      </div>
    );
  }

  const receivedCount = items.filter((i) => i.received).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/grn")} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{grn.grnNumber}</h1>
            {getStatusBadge(grn.status)}
          </div>
          <p className="text-muted-foreground mt-1">
            Goods Receipt Note for <strong>{grn.poNumber}</strong>
          </p>
        </div>
        <Button
          onClick={handleReceiveClick}
          disabled={!isDirty || mutation.isPending}
          className="gap-2"
        >
          <PackagePlus className="h-4 w-4" />
          {mutation.isPending ? "Confirming..." : "Goods Received"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Reference</p>
          <p className="font-semibold">{grn.poNumber}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vendor</p>
          <p className="font-semibold">{grn.vendorName}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</p>
          <p className="font-semibold">{fmtDate(grn.createdAt)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-5 w-5 text-primary" />
              Items
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {receivedCount} of {items.length} received
              {isDirty && <span className="ml-2 text-amber-500 font-medium">· Unsaved changes</span>}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-t">
                <tr>
                  <th className="px-4 py-3 font-medium w-12 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Checkbox
                        checked={allReceived}
                        data-state={someReceived ? "indeterminate" : allReceived ? "checked" : "unchecked"}
                        onCheckedChange={(checked) => handleSelectAll(checked === true)}
                        className={allReceived ? "border-emerald-600 data-[state=checked]:bg-emerald-600" : ""}
                        aria-label="Select all"
                      />
                      <span>Recv</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium">Part No.</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-center w-16">Qty</th>
                  <th className="px-4 py-3 font-medium">Serial Numbers</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, index) => (
                  <tr
                    key={index}
                    className={`transition-colors ${
                      item.received
                        ? "bg-emerald-50 hover:bg-emerald-100/80"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <Checkbox
                        checked={item.received}
                        onCheckedChange={(checked) =>
                          handleToggleReceived(index, checked === true)
                        }
                        className={item.received ? "border-emerald-600 data-[state=checked]:bg-emerald-600" : ""}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      {item.partNumber || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={item.received ? "font-medium text-emerald-800" : ""}>
                        {item.description}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{item.qty}</td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <Textarea
                        value={item.serialNumbers}
                        onChange={(e) => handleSerialNumbers(index, e.target.value)}
                        placeholder={`Enter serial numbers (1 per line)\nQty: ${item.qty}`}
                        className="text-xs font-mono resize-none min-h-[64px]"
                        rows={Math.max(2, item.qty)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No items found in this GRN.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-emerald-600" />
              Confirm Goods Received
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You are confirming receipt of <strong className="text-foreground">{receivedItems.length} item{receivedItems.length !== 1 ? "s" : ""}</strong> from <strong className="text-foreground">{grn.vendorName}</strong>. Stock quantities will be updated for matched items.
                </p>
                {missingSerials.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="font-medium text-amber-800 mb-1">⚠ Serial numbers not entered</p>
                    <p className="text-amber-700 text-xs">
                      {missingSerials.length === 1
                        ? `1 item has no serial numbers:`
                        : `${missingSerials.length} items have no serial numbers:`}
                    </p>
                    <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                      {missingSerials.map((i, idx) => (
                        <li key={idx}>{i.partNumber || i.description} (Qty: {i.qty})</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 mt-1">You can continue without serial numbers.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mutation.mutate(items)}
              disabled={mutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {mutation.isPending ? "Confirming..." : "Goods Received"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
