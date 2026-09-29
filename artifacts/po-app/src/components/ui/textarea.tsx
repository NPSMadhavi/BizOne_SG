import * as React from "react"

import { cn } from "@/lib/utils"
import { blockBrowserSuggestions } from "@/lib/block-browser-suggestions"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, autoComplete, ...props }, ref) => {
  return (
    <textarea
      {...props}
      autoComplete={!autoComplete || autoComplete === "on" || autoComplete === "off" ? "new-password" : autoComplete}
      autoCorrect="off"
      data-1p-ignore="true"
      data-lpignore="true"
      onFocus={(event) => {
        blockBrowserSuggestions(event.currentTarget)
        props.onFocus?.(event)
      }}
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
