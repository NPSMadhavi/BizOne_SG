import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** DOM node in the shell's fixed top chrome where page headers render. */
export const StickyHeaderSlotContext = createContext<HTMLElement | null>(null);

/**
 * Renders into the shell's fixed top bar (under GlobalSearch), outside the
 * scrolling content — so search + actions never scroll away.
 */
export function StickyPageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const slot = useContext(StickyHeaderSlotContext);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <div className={cn("pt-1 pb-3", className)}>
      {children}
    </div>
  );

  if (mounted && slot) {
    return createPortal(content, slot);
  }

  // Fallback before slot mounts / outside Shell
  return (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-4 md:-mx-6 xl:-mx-8 px-4 md:px-6 xl:px-8 py-3",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "border-b border-border/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
