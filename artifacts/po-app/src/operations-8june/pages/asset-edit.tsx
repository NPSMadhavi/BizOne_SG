import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Trash2 } from "lucide-react";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import AssetForm from "@/operations-8june/components/forms/AssetForm";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseApiResponse } from "@/operations-8june/lib/queryClient";

export default function AssetEditPage() {
  const [, params] = useRoute("/assets/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const assetId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/assets");
  const invalid = !assetId || Number.isNaN(assetId);

  const { data: asset } = useQuery({
    queryKey: ["/api/assets", assetId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/${assetId}`);
      const json = await res.json();
      return parseApiResponse(json) as Record<string, unknown>;
    },
    enabled: !invalid,
  });

  const recordPayment = () => {
    const params = new URLSearchParams();
    params.set("category", "fixed_assets");
    const vendor = String(asset?.vendor ?? "").trim();
    const tag = String(asset?.tag ?? "").trim();
    const invoiceNumber = String(asset?.invoiceNumber ?? asset?.invoice_number ?? "").trim();
    if (vendor) params.set("vendor", vendor);
    if (tag) params.set("description", `Asset payment - ${tag}`);
    if (invoiceNumber) params.set("reference", invoiceNumber);
    setLocation(`/accounting/expenses/new?${params.toString()}`);
  };

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/assets/${id}`);
      const json = await res.json();
      return parseApiResponse(json);
    },
    onSuccess: async () => {
      toast({
        title: "Asset deleted",
        description: "The asset has been deleted successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setDeleteOpen(false);
      goBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (invalid) setLocation("/assets");
  }, [invalid, setLocation]);

  if (invalid) return null;

  return (
    <>
      <FormPageShell
        title="Edit Asset"
        description="Update asset details."
        backHref="/assets"
        headerAction={
          <Button
            type="button"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={recordPayment}
          >
            <CreditCard className="h-4 w-4" />
            Record Payment
          </Button>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteAssetMutation.isPending}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex gap-3">
              <ModalCancelButton onClick={goBack} />
              <ModalSaveButton
                form="asset-form"
                loading={pending}
                label="Save"
                loadingLabel="Saving..."
              />
            </div>
          </div>
        }
      >
        <AssetForm
          key={assetId}
          assetId={assetId}
          formId="asset-form"
          hideFooter
          onPendingChange={setPending}
          onSuccess={goBack}
        />
      </FormPageShell>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the asset and remove all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (assetId && !deleteAssetMutation.isPending) {
                  deleteAssetMutation.mutate(assetId);
                }
              }}
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
