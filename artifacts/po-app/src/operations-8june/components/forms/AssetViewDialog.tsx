import { Asset } from "@shared/schema";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewStatusBadge,
  EntityViewTypeBadge,
  formatViewDate,
  formatViewStatus,
} from "@/operations-8june/components/ui/entity-view-dialog";
import { formatFileSize, loadAssetAttachments, downloadAssetAttachment, viewAssetAttachment } from "@/operations-8june/lib/asset-attachments";
import { Download } from "lucide-react";

interface AssetViewDialogProps {
  open: boolean;
  onClose: () => void;
  asset: Asset | null;
}

function formatLabel(value?: string | null): string {
  if (!value) return "-";
  return value
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusVariant(status?: string | null): "valid" | "warning" | "danger" | "neutral" {
  switch (status?.toLowerCase()) {
    case "available":
      return "valid";
    case "assigned":
      return "neutral";
    case "maintenance":
      return "warning";
    case "retired":
      return "danger";
    default:
      return "neutral";
  }
}

export default function AssetViewDialog({ open, onClose, asset }: AssetViewDialogProps) {
  if (!asset) return null;

  const attachments = loadAssetAttachments(asset.id);

  return (
    <EntityViewDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title="Asset Details"
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <EntityViewFieldGrid>
        <EntityViewField label="Asset Tag" value={asset.tag} />
        <EntityViewField
          label="Asset Name"
          value={<EntityViewTypeBadge>{formatLabel(asset.type)}</EntityViewTypeBadge>}
        />
        <EntityViewField label="Asset Category" value={formatLabel(asset.category)} />
        <EntityViewField label="Serial Number" value={asset.serial} />
        <EntityViewField label="Model" value={asset.model || "-"} />
        <EntityViewField label="Manufacturer" value={formatLabel(asset.manufacturer)} />
        <EntityViewField
          label="Assignment Status"
          value={
            <EntityViewStatusBadge
              status={formatViewStatus(asset.status)}
              variant={statusVariant(asset.status)}
            />
          }
        />
        <EntityViewField label="Condition" value={formatLabel(asset.condition)} />
        <EntityViewField label="Assigned To" value={asset.assignedTo || "-"} />
        <EntityViewField label="Location" value={formatLabel(asset.location)} />
        <EntityViewField label="Vendor" value={asset.vendor || "-"} />
        <EntityViewField label="Invoice Number" value={asset.invoiceNumber || "-"} />
        <EntityViewField label="Purchase Date" value={formatViewDate(asset.purchaseDate)} />
        <EntityViewField label="Warranty Expiry" value={formatViewDate(asset.warrantyExpiry)} />
        <EntityViewField label="Cost" value={asset.cost ? `$${asset.cost}` : "-"} />
        <EntityViewField
          label="Depreciation Start"
          value={formatViewDate(asset.depreciationStartDate)}
        />
        <EntityViewField
          label="Useful Life (Years)"
          value={asset.usefulLifeYears != null ? String(asset.usefulLifeYears) : "-"}
        />
        <EntityViewField
          label="Depreciation Method"
          value={formatLabel(asset.depreciationMethod)}
        />
        {asset.description ? (
          <EntityViewField label="Description" value={asset.description} fullWidth />
        ) : null}
        {attachments.length > 0 ? (
          <EntityViewField
            label="Attachments"
            fullWidth
            value={
              <ul className="space-y-2">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => viewAssetAttachment(attachment)}
                      className="min-w-0 flex-1 truncate text-left font-medium text-[#2563EB] hover:underline"
                      title={`View ${attachment.name}`}
                    >
                      {attachment.name}
                    </button>
                    <span className="shrink-0 text-xs text-[#6B7280]">
                      {formatFileSize(attachment.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadAssetAttachment(attachment)}
                      className="shrink-0 rounded p-1 text-[#6B7280] transition-colors hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                      aria-label={`Download ${attachment.name}`}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            }
          />
        ) : null}
      </EntityViewFieldGrid>
    </EntityViewDialog>
  );
}
