import * as React from "react"

import { cn } from "@/lib/utils"
import {
  blockBrowserSuggestions,
  makeAutofillBlockToken,
  neutralizeAutofillName,
  resolveBlockedAutocomplete,
} from "@/lib/block-browser-suggestions"

type TextareaProps = React.ComponentProps<"textarea"> & {
  "data-allow-autofill"?: boolean | "true" | "false"
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoComplete, name, readOnly, onFocus, onMouseDown, ...props }, ref) => {
    const allowAutofill =
      props["data-allow-autofill"] === true || props["data-allow-autofill"] === "true"

    const uniqueToken = React.useMemo(
      () => (allowAutofill ? "" : makeAutofillBlockToken()),
      [allowAutofill],
    )
    const safeName = React.useMemo(
      () => (allowAutofill ? name : neutralizeAutofillName(name)),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [allowAutofill],
    )

    const [unlocked, setUnlocked] = React.useState(allowAutofill)
    const unlock = React.useCallback(() => {
      if (!allowAutofill) setUnlocked(true)
    }, [allowAutofill])

    return (
      <textarea
        {...props}
        ref={ref}
        name={safeName}
        role={allowAutofill ? props.role : "presentation"}
        readOnly={allowAutofill ? readOnly : readOnly || !unlocked}
        data-autofill-lock={allowAutofill ? undefined : "1"}
        autoComplete={resolveBlockedAutocomplete(autoComplete, {
          allowAutofill,
          uniqueToken: uniqueToken || undefined,
        })}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore={allowAutofill ? undefined : "true"}
        data-lpignore={allowAutofill ? undefined : "true"}
        data-form-type={allowAutofill ? undefined : "other"}
        data-bwignore={allowAutofill ? undefined : "true"}
        onMouseDown={(event) => {
          unlock()
          onMouseDown?.(event)
        }}
        onFocus={(event) => {
          unlock()
          if (!allowAutofill) {
            event.currentTarget.readOnly = false
            event.currentTarget.removeAttribute("readonly")
            blockBrowserSuggestions(event.currentTarget)
          }
          onFocus?.(event)
        }}
        className={cn(
          "flex min-h-[60px] w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-base shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
