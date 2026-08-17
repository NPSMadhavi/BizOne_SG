import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormStickyActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="h-16 shrink-0" aria-hidden />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 flex justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-[var(--app-sidebar-width,16rem)] md:px-8",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
