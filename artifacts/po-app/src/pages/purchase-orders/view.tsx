import { useGetPurchaseOrder, getGetPurchaseOrderQueryKey, useDeletePurchaseOrder } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer, Trash2, Pencil, Calendar, MapPin, Building, CreditCard, Tag } from "lucide-react";
import { format } from "date-fns";
import { generatePO_PDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function PurchaseOrderView() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: po, isLoading } = useGetPurchaseOrder(id, {
    query: {
      queryKey: getGetPurchaseOrderQueryKey(id),
      enabled: !!id,
    }
  });

  const deleteMutation = useDeletePurchaseOrder();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD'
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-sm py-1">Confirmed</Badge>;
      case 'draft': return <Badge variant="secondary" className="text-sm py-1">Draft</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="text-sm py-1">Cancelled</Badge>;
      default: return <Badge variant="outline" className="text-sm py-1">{status}</Badge>;
    }
  };

  const handlePrint = async () => {
    if (po) {
      try {
        await generatePO_PDF(po);
        toast({
          title: "Success",
          description: "PDF generated successfully.",
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to generate PDF.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Purchase order deleted." });
        setLocation("/purchase-orders");
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!po) {
    return <div>Purchase order not found.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/purchase-orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{po.poNumber}</h1>
            {getStatusBadge(po.status)}
          </div>
          <p className="text-muted-foreground mt-1">
            Created on {format(new Date(po.createdAt), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/purchase-orders/${id}/edit`)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" className="gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Download PDF
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the purchase order {po.poNumber}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building className="h-5 w-5 text-muted-foreground" />
              Vendor Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="font-semibold text-base">{po.vendorName}</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                {po.vendorAddress || "No address provided"}
              </div>
            </div>
            {po.vendorContact && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                <span className="font-medium">{po.vendorContact}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-muted-foreground" />
              Order Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Delivery Address</div>
                <div className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">
                  {po.deliveryAddress || "RSV Infotech Office"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium">Delivery Date: </span>
                <span className="text-sm text-muted-foreground">{po.deliveryDate || "TBA"}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium">Payment Terms: </span>
                <span className="text-sm text-muted-foreground">{po.paymentTerms || "Standard"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y">
              <tr>
                <th className="px-6 py-3 font-medium w-12 text-center">#</th>
                <th className="px-6 py-3 font-medium">Part Number</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium text-center">Qty</th>
                <th className="px-6 py-3 font-medium text-right">Unit Price</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b">
              {po.items.map((item, index) => (
                <tr key={index} className="bg-card">
                  <td className="px-6 py-4 text-center text-muted-foreground">{index + 1}</td>
                  <td className="px-6 py-4 font-medium">{item.partNumber}</td>
                  <td className="px-6 py-4 text-muted-foreground">{item.description}</td>
                  <td className="px-6 py-4 text-center font-medium">{item.qty}</td>
                  <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-muted/20">
          <div className="flex justify-end">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(po.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({po.tax}%)</span>
                <span className="font-medium">{formatCurrency(po.subtotal * (po.tax / 100))}</span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Total Amount</span>
                <span>{formatCurrency(po.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
