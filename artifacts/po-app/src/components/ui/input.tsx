import * as React from "react"
import { Calendar } from "lucide-react"

import { cn } from "@/lib/utils"
import { blockBrowserSuggestions } from "@/lib/block-browser-suggestions"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoComplete, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    // "off" is ignored by Chrome for address, email, and phone fields.
    const resolvedAutoComplete =
      !autoComplete || /^(on|off)$|address|email|tel|name|postal|street/i.test(autoComplete)
        ? "new-password"
        : autoComplete
    const renderedType = type === "email" || type === "tel" ? "text" : type

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
            type="date"
            autoComplete="off"
            className={cn(
              "flex h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] py-1 pl-3 pr-9 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer",
              className
            )}
            ref={innerRef}
            {...props}
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
        type={renderedType}
        inputMode={props.inputMode ?? (type === "email" ? "email" : type === "tel" ? "numeric" : undefined)}
        autoComplete={resolvedAutoComplete}
        autoCorrect="off"
        data-1p-ignore="true"
        data-lpignore="true"
        onFocus={(event) => {
          blockBrowserSuggestions(event.currentTarget)
          props.onFocus?.(event)
        }}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
        ref={innerRef}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
