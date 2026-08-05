import * as React from "react";
import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function formatViewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function formatViewDate(value?: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatViewStatus(status?: string | null): string {
  if (!status) return "-";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface EntityViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export function EntityViewDialog({
  open,
  onOpenChange,
  title,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: EntityViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden border-0 p-0 shadow-xl sm:rounded-xl [&>button]:hidden",
          maxWidth
        )}
      >
        <div className="flex items-center justify-between bg-[#0f172a] px-6 py-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm text-white/90 transition-opacity hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-white px-6 py-6">{children}</div>

        <div className="flex justify-end border-t border-[#e2e8f0] bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#2563eb] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EntityViewFieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">{children}</dl>
  );
}

export function EntityViewField({
  label,
  value,
  children,
  fullWidth = false,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}) {
  const display =
    children ??
    (value === null || value === undefined || value === "" ? "-" : value);

  return (
    <div className={cn(fullWidth && "sm:col-span-2", className)}>
      <dt className="text-xs font-medium text-[#64748b]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#1e293b]">{display}</dd>
    </div>
  );
}

export function EntityViewTypeBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-medium capitalize text-[#2563eb]">
      {children}
    </span>
  );
}

export function EntityViewStatusBadge({
  status,
  variant = "valid",
}: {
  status: string;
  variant?: "valid" | "warning" | "danger" | "neutral";
}) {
  const colors = {
    valid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    danger: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
    neutral: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  };
  const c = colors[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        c.bg,
        c.text
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
      {status}
    </span>
  );
}

export function EntityViewCopyField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const display = value?.trim() || "-";

  const handleCopy = async () => {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <div className="sm:col-span-2">
      <dt className="text-xs font-medium text-[#64748b]">{label}</dt>
      <dd className="mt-1">
        <div className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
          <span className="truncate font-mono text-sm font-semibold text-[#1e293b]">
            {display}
          </span>
          {value?.trim() ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="ml-2 shrink-0 text-[#2563eb] hover:text-[#1d4ed8]"
              aria-label="Copy to clipboard"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </dd>
    </div>
  );
}
