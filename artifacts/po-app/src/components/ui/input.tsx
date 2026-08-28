import * as React from "react"
import { Calendar } from "lucide-react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

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
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
        ref={innerRef}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
