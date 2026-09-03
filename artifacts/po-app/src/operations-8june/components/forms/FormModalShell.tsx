import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type FormModalShellProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  className?: string;
  bodyClassName?: string;
};

export function FormModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = "max-w-4xl",
  className,
  bodyClassName,
}: FormModalShellProps) {
  return (
    <DialogContent
      className={cn(
        "gap-0 overflow-hidden border-0 p-0 shadow-lg sm:rounded-lg [&>button]:hidden",
        maxWidth,
        className
      )}
    >
      <div
        className="flex w-full shrink-0 items-start border-0 bg-[#0B1220]"
        style={{ padding: "20px 20px 20px 30px", justifyContent: "space-between" }}
      >
        <div>
          <DialogTitle className="text-lg font-semibold capitalize text-white">{title}</DialogTitle>
          {description ? (
            <p className="mt-1 text-sm text-white/70">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-sm text-white opacity-90 transition-opacity hover:opacity-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div
        className={cn(
          "max-h-[75vh] overflow-y-auto px-8 py-6",
          "[&_input:not([type=checkbox]):not([type=radio])]:h-10 [&_input:not([type=checkbox]):not([type=radio])]:border-[#E5E7EB] [&_input:not([type=checkbox]):not([type=radio])]:bg-white [&_input:not([type=checkbox]):not([type=radio])]:text-[#111827] [&_input:not([type=checkbox]):not([type=radio])]:shadow-sm [&_input:not([type=checkbox]):not([type=radio])]:placeholder:text-[#9CA3AF]",
          "[&_textarea]:border-[#E5E7EB] [&_textarea]:bg-white [&_textarea]:text-[#111827] [&_textarea]:placeholder:text-[#9CA3AF]",
          "[&_[role=combobox]]:h-10 [&_[role=combobox]]:border-[#E5E7EB] [&_[role=combobox]]:bg-white [&_[role=combobox]]:text-[#111827] [&_[role=combobox]]:shadow-sm [&_[role=combobox][data-placeholder]]:text-[#9CA3AF]",
          bodyClassName,
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="flex shrink-0 justify-end gap-3 border-t border-[#E5E7EB] bg-white px-8 py-4">
          {footer}
        </div>
      ) : null}
    </DialogContent>
  );
}

export function ModalSectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-5 w-5 text-[#2563EB]" /> : null}
        <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export const modalFormClass = "space-y-8";
export const modalModuleGridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
export const modalModuleItemClass =
  "flex flex-row items-center space-x-3 space-y-0 rounded-md border border-[#E5E7EB] bg-white px-3 py-2.5";
export const modalModuleCheckboxClass =
  "data-[state=checked]:bg-[#0E9F6E] data-[state=checked]:border-[#0E9F6E]";
export const modalSectionBoxClass = "space-y-3 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-4";
export const modalDeselectAllClass = "text-sm font-medium text-[#2563EB] hover:underline";

export function ModalCancelButton({ onClick, label = "Cancel" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[#E5E7EB] bg-white px-5 py-2 text-sm font-medium text-[#111827] transition-colors hover:bg-[#F9FAFB]"
    >
      {label}
    </button>
  );
}

export function ModalSaveButton({
  type = "submit",
  disabled,
  loading,
  label,
  loadingLabel,
  form,
  onClick,
}: {
  type?: "submit" | "button";
  disabled?: boolean;
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  form?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      className="rounded-md bg-[#2563EB] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-95 disabled:opacity-50"
    >
      {loading ? loadingLabel ?? label : label}
    </button>
  );
}
