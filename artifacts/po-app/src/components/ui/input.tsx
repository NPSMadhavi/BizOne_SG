import * as React from "react"

import { Calendar } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  AUTOFILL_BLOCK_TOKEN,
  blockBrowserSuggestions,
  makeAutofillBlockToken,
  neutralizeAutofillName,
  resolveBlockedAutocomplete,
} from "@/lib/block-browser-suggestions"

type InputProps = React.ComponentProps<"input"> & {
  "data-allow-autofill"?: boolean | "true" | "false"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoComplete, name, id, readOnly, onFocus, onMouseDown, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    const allowAutofill =
      props["data-allow-autofill"] === true || props["data-allow-autofill"] === "true"

    const uniqueToken = React.useMemo(
      () => (allowAutofill ? "" : makeAutofillBlockToken()),
      [allowAutofill],
    )
    const safeName = React.useMemo(
      () => (allowAutofill ? name : neutralizeAutofillName(name)),
      // Remount / first render only — stable for the life of this input instance
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [allowAutofill],
    )

    const resolvedAutoComplete = resolveBlockedAutocomplete(autoComplete, {
      allowAutofill,
      uniqueToken: uniqueToken || undefined,
    })

    const renderedType = allowAutofill
      ? type
      : type === "email" || type === "tel"
        ? "text"
        : type

    // Chrome skips history/autofill UI while readonly; unlock on first interaction
    const [unlocked, setUnlocked] = React.useState(allowAutofill)
    const unlock = React.useCallback(() => {
      if (!allowAutofill) setUnlocked(true)
    }, [allowAutofill])

    const openDatePicker = () => {
      const el = innerRef.current
      if (!el) return
      try {
        el.showPicker?.()
      } catch {
        el.focus()
      }
    }

    if (type === "date") {
      return (
        <div className="relative w-full">
          <input
            {...props}
            type="date"
            id={id}
            name={safeName}
            autoComplete={AUTOFILL_BLOCK_TOKEN}
            className={cn(
              "flex h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] py-1 pl-3 pr-9 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer",
              className
            )}
            ref={innerRef}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={openDatePicker}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Open calendar"
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      )
    }

    return (
      <input
        {...props}
        ref={innerRef}
        id={id}
        type={renderedType}
        name={safeName}
        role={allowAutofill ? props.role : "presentation"}
        readOnly={allowAutofill ? readOnly : readOnly || !unlocked}
        data-autofill-lock={allowAutofill ? undefined : "1"}
        inputMode={
          props.inputMode ??
          (type === "email" ? "email" : type === "tel" ? "numeric" : undefined)
        }
        autoComplete={resolvedAutoComplete}
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
            const el = event.currentTarget
            el.readOnly = false
            el.removeAttribute("readonly")
            blockBrowserSuggestions(el)
          }
          onFocus?.(event)
        }}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
