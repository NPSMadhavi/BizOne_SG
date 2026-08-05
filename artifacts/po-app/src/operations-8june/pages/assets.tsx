import { useState } from "react";
import {
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementSearchBar,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Asset } from "@shared/schema";
import { apiRequest, parseApiResponse } from "@/operations-8june/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog } from "@/components/ui/dialog";
import { FormModalShell, ModalCancelButton, ModalSaveButton } from "@/operations-8june/components/forms/FormModalShell";
import AssetForm from "@/operations-8june/components/forms/AssetForm";
import AssetViewDialog from "@/operations-8june/components/forms/AssetViewDialog";
import {
  Plus,
  Loader2,
  Trash2,
  Laptop,
  Monitor,
  Smartphone,
  HardDrive,
  Edit2,
  Eye,
  UserPlus,
} from "lucide-react";
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
import AssignAssetModal from "@/operations-8june/components/modals/AssignAssetModal";

export default function AssetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [assetFormPending, setAssetFormPending] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  
  const { data: assets = [], isLoading, isError, error } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: !authLoading && !!selectedCompany,
    staleTime: 0,
  });
  
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
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      setIsDeleteDialogOpen(false);
      setSelectedAssetId(null);
    },
    onError: (error: Error) => {
      console.error("❌ Asset deletion failed:", error);
      toast({
        title: "Failed to delete asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleViewAsset = (asset: Asset) => {
    setViewingAsset(asset);
    setIsViewDialogOpen(true);
  };

  const handleEditAsset = (asset: Asset) => {
    setEditingAsset(asset);
    setSelectedAssetId(asset.id);
    setIsFormDialogOpen(true);
  };
  
  const handleDeleteAsset = (id: number) => {
    setSelectedAssetId(id);
    setIsDeleteDialogOpen(true);
  };
  
  const handleAssignAsset = (id: number) => {
    setSelectedAssetId(id);
    setIsAssignDialogOpen(true);
  };
  
  const confirmDelete = () => {
    if (selectedAssetId && !deleteAssetMutation.isPending) {
      deleteAssetMutation.mutate(selectedAssetId);
    }
  };

  const assetList = Array.isArray(assets) ? assets : [];

  const filteredAssets = assetList.filter((asset) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return [
      asset.tag,
      asset.type,
      asset.category,
      asset.serial,
      asset.status,
      asset.assignedTo,
      asset.location,
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  });
  
  const getAssetIcon = (type: string) => {
    const typeStr = type.toLowerCase();
    if (typeStr.includes("laptop")) return <Laptop className="h-4 w-4" />;
    if (typeStr.includes("monitor")) return <Monitor className="h-4 w-4" />;
    if (typeStr.includes("phone") || typeStr.includes("mobile")) return <Smartphone className="h-4 w-4" />;
    return <HardDrive className="h-4 w-4" />;
  };

  const getStatusPillStyle = (status: string) => {
    switch (status) {
      case "available":
        return { background: "#DEF7EC", color: "#0E9F6E" };
      case "assigned":
        return { background: "#E1EFFE", color: "#2563EB" };
      case "maintenance":
        return { background: "#FDF6B2", color: "#C27803" };
      case "retired":
        return { background: "#FDE8E8", color: "#E02424" };
      default:
        return { background: "#F3F4F6", color: "#6B7280" };
    }
  };
  
  return (
    <>
      <ManagementPageHeader
        title="Assets"
        action={
          <Button
            className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
            onClick={() => {
              setEditingAsset(null);
              setSelectedAssetId(null);
              setIsFormDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Asset
          </Button>
        }
      />

      <ManagementSearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search..."
      />

      <ManagementTableCard>
          {isLoading || authLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
            </div>
          ) : isError ? (
            <ManagementEmptyState
              title="Failed to load assets"
              description={error instanceof Error ? error.message : "Please try again."}
            />
          ) : assetList.length > 0 && filteredAssets.length > 0 ? (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Tag</TableHead>
                    <TableHead>Type / Category</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Warranty Expiry</TableHead>
                    <TableHead className="w-px text-left">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium text-[#111827]">{asset.tag}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span className="mr-2 rounded bg-[#EFF6FF] p-1 text-[#2563EB]">
                            {getAssetIcon(asset.type)}
                          </span>
                          <div>
                            <div className="text-[#111827]">{asset.type}</div>
                            <div className="text-sm text-[#6B7280]">{asset.category}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#444651]">{asset.serial}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium capitalize"
                          style={getStatusPillStyle(asset.status)}
                        >
                          {asset.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#444651]">{asset.assignedTo || "—"}</TableCell>
                      <TableCell className="text-[#444651]">{asset.location || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-[#444651]">
                        {asset.warrantyExpiry 
                          ? new Date(asset.warrantyExpiry).toLocaleDateString() 
                          : "—"}
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex items-center justify-start gap-2">
                          <button
                            type="button"
                            title="View asset"
                            onClick={() => handleViewAsset(asset)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit asset"
                            onClick={() => handleEditAsset(asset)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#2563EB] transition-colors hover:bg-blue-100 active:scale-95"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {asset.status === "available" && (
                            <button
                              type="button"
                              title="Assign asset"
                              onClick={() => handleAssignAsset(asset.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 active:scale-95"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Delete asset"
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ManagementTableContainer>
          ) : (
            <ManagementEmptyState
              title={searchTerm ? "No results found" : "No assets found"}
              description={
                searchTerm
                  ? "Try adjusting your search terms."
                  : "Get started by creating a new asset."
              }
              action={
                !searchTerm ? (
                  <Button
                    className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                    onClick={() => {
                      setEditingAsset(null);
                      setSelectedAssetId(null);
                      setIsFormDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Asset
                  </Button>
                ) : undefined
              }
            />
          )}
      </ManagementTableCard>
      
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <FormModalShell
          title={selectedAssetId ? "Edit asset" : "Create new asset"}
          maxWidth="max-w-5xl"
          onClose={() => setIsFormDialogOpen(false)}
          footer={
            <>
              <ModalCancelButton onClick={() => setIsFormDialogOpen(false)} />
              <ModalSaveButton
                form="asset-form"
                loading={assetFormPending}
                label="Save"
                loadingLabel="Saving..."
              />
            </>
          }
        >
          <AssetForm
            key={selectedAssetId ?? "new"}
            assetId={selectedAssetId || undefined}
            initialAsset={editingAsset}
            onSuccess={() => setIsFormDialogOpen(false)}
            formId="asset-form"
            hideFooter
            onPendingChange={setAssetFormPending}
          />
        </FormModalShell>
      </Dialog>
      
      <AssetViewDialog
        open={isViewDialogOpen}
        onClose={() => {
          setIsViewDialogOpen(false);
          setViewingAsset(null);
        }}
        asset={viewingAsset}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteAssetMutation.isPending}
            >
              {deleteAssetMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AssignAssetModal
        open={isAssignDialogOpen}
        onClose={() => {
          setIsAssignDialogOpen(false);
          setSelectedAssetId(null);
        }}
        preSelectedAssetId={selectedAssetId}
      />
    </>
  );
}
