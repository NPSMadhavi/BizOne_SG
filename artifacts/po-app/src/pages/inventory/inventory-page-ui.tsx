import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function InventoryPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-[#2563EB]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function InventoryKpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "blue" | "green" | "orange" | "red" | "purple";
}) {
  const tones = {
    blue: "bg-[#EFF6FF] text-[#2563EB]",
    green: "bg-[#DEF7EC] text-[#0E9F6E]",
    orange: "bg-[#FEF3C7] text-[#D97706]",
    red: "bg-[#FDE8E8] text-[#E02424]",
    purple: "bg-[#EDE9FE] text-[#7C3AED]",
  };

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#6B7280]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#111827]">{value}</p>
        </div>
        <div className={cn("rounded-lg p-2.5", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function InventorySectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-[#E5E7EB] bg-white shadow-sm", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-[#6B7280]">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function InventoryStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "completed" || normalized === "posted" || normalized === "active"
      ? "bg-[#DEF7EC] text-[#0E9F6E]"
      : normalized === "pending"
        ? "bg-[#FEF3C7] text-[#D97706]"
        : normalized === "cancelled" || normalized === "inactive"
          ? "bg-[#FDE8E8] text-[#E02424]"
          : "bg-[#F3F4F6] text-[#6B7280]";

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", styles)}>
      {status}
    </span>
  );
}

export function formatCurrency(value: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}
