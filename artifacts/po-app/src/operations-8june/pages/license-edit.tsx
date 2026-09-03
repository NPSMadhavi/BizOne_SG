import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { License } from "@shared/schema";
import { FormPageShell } from "@/operations-8june/components/layout/FormPageShell";
import { ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import LicenseForm from "@/operations-8june/components/forms/LicenseForm";
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
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

export default function LicenseEditPage() {
  const [, params] = useRoute("/licenses/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const licenseId = params?.id ? Number(params.id) : undefined;
  const goBack = () => setLocation("/licenses");

  const { data: licenses = [] } = useQuery<License[]>({
    queryKey: ["/api/licenses"],
    enabled: !authLoading && !!selectedCompany && !!licenseId,
  });

  const license = licenses.find((l) => l.id === licenseId);

  const deleteLicenseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/licenses/${id}`);
    },
    onSuccess: async () => {
      toast({
        title: "License deleted",
        description: "The license has been deleted successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/licenses"] });
      setDeleteOpen(false);
      goBack();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the license. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!licenseId || Number.isNaN(licenseId)) {
    setLocation("/licenses");
    return null;
  }

  if (!license) {
    return (
      <FormPageShell title="Edit License" backHref="/licenses">
        <p className="text-sm text-[#6B7280]">Loading license…</p>
      </FormPageShell>
    );
  }

  return (
    <>
      <FormPageShell
        title="Edit License"
        description="Update license details."
        backHref="/licenses"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteLicenseMutation.isPending}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex gap-3">
              <ModalCancelButton onClick={goBack} />
              <ModalSaveButton
                form="license-form"
                loading={pending}
                label="Save"
                loadingLabel="Saving..."
              />
            </div>
          </div>
        }
      >
        <LicenseForm
          key={license.id}
          isOpen
          hideShell
          formId="license-form"
          license={license}
          onPendingChange={setPending}
          onClose={goBack}
        />
      </FormPageShell>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the license and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (licenseId && !deleteLicenseMutation.isPending) {
                  deleteLicenseMutation.mutate(licenseId);
                }
              }}
            >
              {deleteLicenseMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
