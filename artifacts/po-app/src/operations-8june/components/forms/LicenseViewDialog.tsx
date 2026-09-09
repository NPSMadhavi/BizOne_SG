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

  const customRenewal = (() => {
    if (license.renewalCycle !== "custom" || !license.notes) return null;
    const tagged = license.notes.match(/^__CR__:(\d+):(days|weeks|months|years)$/);
    if (!tagged) return null;
    const every = Number(tagged[1]);
    const unit = tagged[2];
    const singular = unit.replace(/s$/, "");
    return `Renews every ${every} ${every === 1 ? singular : unit}`;
  })();

  const renewalCycle =
    license.renewalCycle === "custom" && customRenewal
      ? customRenewal
      : license.renewalCycle && license.renewalCycle !== "none"
        ? license.renewalCycle.replace(/_/g, " ")
        : "One-time";

  const isInternalCustomNote = !!license.notes?.startsWith("__CR__:");

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
        <EntityViewCopyField label="License Key" value={license.licenseKey} />
        <EntityViewField label="Purchase date" value={formatViewDate(license.purchaseDate)} />
        <EntityViewField
          label="Expiry date"
          value={license.expiryDate ? formatViewDate(license.expiryDate) : "-"}
        />
        <EntityViewField
          label="Purchase value"
          value={license.cost ? `$${license.cost}` : "-"}
        />
        <EntityViewField label="Renewal cycle" value={renewalCycle} />
        <EntityViewField
          label="Vendor"
          value={linkedVendor?.name || (license.vendorId ? String(license.vendorId) : "-")}
        />
        <EntityViewField
          label="Asset licenses"
          value={
            linkedAsset
              ? `${linkedAsset.tag} - ${linkedAsset.type}`
              : license.assetId
                ? String(license.assetId)
                : "-"
          }
        />
        {license.notes && !isInternalCustomNote ? (
          <EntityViewField label="Notes" value={license.notes} fullWidth />
        ) : null}
      </EntityViewFieldGrid>
    </EntityViewDialog>
  );
}
