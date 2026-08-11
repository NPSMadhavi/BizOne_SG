import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormPageShell({
  title,
  description,
  backHref,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  backHref: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6 pb-8", className)}>
      <div className="flex items-start gap-3">
        <Link
          href={backHref}
          className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#2563EB] transition-opacity hover:opacity-75"
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-[#6B7280]">{description}</p>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm md:p-8",
          "[&_input:not([type=checkbox]):not([type=radio])]:h-10 [&_input:not([type=checkbox]):not([type=radio])]:border-[#E5E7EB] [&_input:not([type=checkbox]):not([type=radio])]:bg-white [&_input:not([type=checkbox]):not([type=radio])]:text-[#111827] [&_input:not([type=checkbox]):not([type=radio])]:shadow-sm [&_input:not([type=checkbox]):not([type=radio])]:placeholder:text-[#9CA3AF]",
          "[&_textarea]:border-[#E5E7EB] [&_textarea]:bg-white [&_textarea]:text-[#111827] [&_textarea]:placeholder:text-[#9CA3AF]",
          "[&_[role=combobox]]:h-10 [&_[role=combobox]]:border-[#E5E7EB] [&_[role=combobox]]:bg-white [&_[role=combobox]]:text-[#111827] [&_[role=combobox]]:shadow-sm",
        )}
      >
        {children}
      </div>

      {footer ? (
        <div className="flex justify-end gap-3">{footer}</div>
      ) : null}
    </div>
  );
}
