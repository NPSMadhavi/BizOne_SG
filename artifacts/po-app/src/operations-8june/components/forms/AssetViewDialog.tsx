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
          label="Type"
          value={<EntityViewTypeBadge>{formatLabel(asset.type)}</EntityViewTypeBadge>}
        />
        <EntityViewField label="Category" value={formatLabel(asset.category)} />
        <EntityViewField label="Serial Number" value={asset.serial} />
        <EntityViewField label="Model" value={asset.model || "-"} />
        <EntityViewField label="Manufacturer" value={formatLabel(asset.manufacturer)} />
        <EntityViewField
          label="Status"
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
      </EntityViewFieldGrid>
    </EntityViewDialog>
  );
}
