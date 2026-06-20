import { useState } from "react";
import {
  LayoutDashboard, FileText, Settings, LogOut, RefreshCw,
  Building2, ChevronUp, Users,
} from "lucide-react";

export function OptionA() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start justify-center min-h-screen bg-muted/30 p-6">
      <div className="flex flex-col w-64 border rounded-xl bg-card shadow-lg h-[560px] overflow-hidden relative">
        {/* Logo */}
        <div className="p-5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-semibold text-sm">RSV Infotech</span>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 p-3 space-y-0.5 overflow-hidden">
          {[
            { icon: LayoutDashboard, label: "Dashboard", active: true },
            { icon: FileText, label: "Purchase Orders" },
            { icon: FileText, label: "Quotations" },
            { icon: FileText, label: "Invoices" },
            { icon: Users, label: "Admin Panel" },
            { icon: Settings, label: "Settings" },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </div>
          ))}
        </div>

        {/* Company badge */}
        <div className="px-3 pb-1">
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <div>
              <div className="text-xs font-medium">RSV Infotech P…</div>
              <div className="text-[10px] text-muted-foreground">Singapore</div>
            </div>
            <button className="text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* User row — clickable → dropdown */}
        <div className="border-t border-border/50 relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs">
                A
              </div>
              <div className="text-left">
                <div className="text-sm font-medium leading-tight">admin</div>
                <div className="text-[11px] text-muted-foreground leading-tight">Admin</div>
              </div>
            </div>
            <ChevronUp
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`}
            />
          </button>

          {/* Popover */}
          {open && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                Switch Company
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-destructive/10 text-destructive text-left rounded-b-lg">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Label */}
        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
          Option A
        </div>
      </div>
    </div>
  );
}
