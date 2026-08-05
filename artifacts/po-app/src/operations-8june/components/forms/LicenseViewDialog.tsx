import { useQuery } from "@tanstack/react-query";
import { License, Asset } from "@shared/schema";
import { isBefore, addDays } from "date-fns";
import {
  EntityViewDialog,
  EntityViewField,
  EntityViewFieldGrid,
  EntityViewTypeBadge,
  EntityViewStatusBadge,
  EntityViewCopyField,
  formatViewDate,
  formatViewStatus,
} from "@/operations-8june/components/ui/entity-view-dialog";

interface LicenseViewDialogProps {
  open: boolean;
  onClose: () => void;
  license: License | null;
}

export default function LicenseViewDialog({ open, onClose, license }: LicenseViewDialogProps) {
  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: open && !!license,
  });

  const { data: vendors = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/vendors"],
    enabled: open && !!license,
  });

  if (!license) return null;

  const linkedAsset = assets.find((asset) => asset.id === license.assetId);
  const linkedVendor = vendors.find((vendor) => vendor.id === license.vendorId);

  const statusInfo = (() => {
    if (!license.expiryDate) {
      return { label: formatViewStatus(license.status) || "Active", variant: "neutral" as const };
    }
    const expiryDate = new Date(license.expiryDate);
    const now = new Date();
    if (isBefore(expiryDate, now)) {
      return { label: "Expired", variant: "danger" as const };
    }
    if (isBefore(expiryDate, addDays(now, 90))) {
      return { label: "Expiring Soon", variant: "warning" as const };
    }
    return { label: "Valid", variant: "valid" as const };
  })();

  const renewalCycle =
    license.renewalCycle && license.renewalCycle !== "none"
      ? license.renewalCycle.replace(/_/g, " ")
      : "None";

  return (
    <EntityViewDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title="License Details"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <EntityViewFieldGrid>
        <EntityViewField label="Name" value={license.name} />
        <EntityViewField
          label="Type"
          value={<EntityViewTypeBadge>{license.type}</EntityViewTypeBadge>}
        />
        <EntityViewField
          label="Status"
          value={
            <EntityViewStatusBadge status={statusInfo.label} variant={statusInfo.variant} />
          }
        />
        <EntityViewField
          label="Seats"
          value={license.seats != null ? String(license.seats) : "-"}
        />
        <EntityViewCopyField label="License Key" value={license.licenseKey} />
        <EntityViewField label="Purchase date" value={formatViewDate(license.purchaseDate)} />
        <EntityViewField
          label="Expiry date"
          value={license.expiryDate ? formatViewDate(license.expiryDate) : "-"}
        />
        <EntityViewField
          label="Cost"
          value={license.cost ? `$${license.cost}` : "-"}
        />
        <EntityViewField label="Renewal cycle" value={renewalCycle} />
        <EntityViewField
          label="Vendor ID"
          value={linkedVendor?.name || (license.vendorId ? String(license.vendorId) : "-")}
        />
        <EntityViewField
          label="Asset ID"
          value={
            linkedAsset
              ? `${linkedAsset.tag} - ${linkedAsset.type}`
              : license.assetId
                ? String(license.assetId)
                : "-"
          }
        />
        {license.notes ? (
          <EntityViewField label="Notes" value={license.notes} fullWidth />
        ) : null}
      </EntityViewFieldGrid>
    </EntityViewDialog>
  );
}
