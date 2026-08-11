import type { ReactNode } from "react";
import { Search, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ManagementPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-[36px] font-bold leading-tight text-[#2563EB]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap sm:justify-end">{action}</div> : null}
    </div>
  );
}

export function ManagementPrimaryButton({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SuperAdminPageHeading({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label={`Back to dashboard from ${title}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#2563EB] transition-opacity hover:opacity-75"
      >
        <ChevronLeft className="h-7 w-7" strokeWidth={2.25} />
      </button>
      <h2 className="text-[36px] font-bold leading-tight text-[#2563EB]">{title}</h2>
    </div>
  );
}

export function ManagementToolbarRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex min-h-11 flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function ManagementSearchBar({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mb-6 w-full max-w-md">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white pl-10 pr-3 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
      />
    </div>
  );
}

export function ManagementTableCard({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-xl border border-[#E4E4E4] shadow-sm">
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

/** Wrap shadcn Table components to match Super Admin / Company Management styling */
export function ManagementTableContainer({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto management-table">
      {children}
    </div>
  );
}

export function ManagementLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-16 text-center text-sm text-[#6B7280]">
        Loading...
      </td>
    </tr>
  );
}

export function ManagementEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h3 className="mb-1 text-lg font-medium text-[#111827]">{title}</h3>
      {description ? <p className="mb-4 text-sm text-[#6B7280]">{description}</p> : null}
      {action}
    </div>
  );
}

export function ManagementStatusPill({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        active
          ? { background: "#DEF7EC", color: "#0E9F6E" }
          : { background: "#FDE8E8", color: "#E02424" }
      }
    >
      {label ?? (active ? "Active" : "Inactive")}
    </span>
  );
}

export function ManagementIconAction({
  onClick,
  variant = "edit",
  label,
  children,
}: {
  onClick?: () => void;
  variant?: "edit" | "delete";
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
        variant === "edit"
          ? "bg-blue-50 text-[#2563EB] hover:bg-blue-100"
          : "bg-red-50 text-red-600 hover:bg-red-100"
      )}
    >
      {children}
    </button>
  );
}
