import { useState } from "react";
import {
  LayoutDashboard, FileText, Settings, LogOut, RefreshCw,
  Building2, Users, ChevronDown,
} from "lucide-react";

export function OptionB() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start justify-center min-h-screen bg-muted/30 p-6">
      <div className="flex flex-col w-[520px] border rounded-xl bg-card shadow-lg h-[560px] overflow-hidden relative">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">RSV Infotech</span>
          </div>

          {/* Avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 hover:bg-muted px-2 py-1.5 rounded-lg transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs">
                A
              </div>
              <div className="text-left">
                <div className="text-xs font-medium leading-tight">admin</div>
                <div className="text-[10px] text-muted-foreground leading-tight">RSV Infotech · SG</div>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="text-xs font-medium">admin</div>
                  <div className="text-[10px] text-muted-foreground">Admin</div>
                </div>
                <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  Switch Company
                </button>
                <div className="h-px bg-border mx-2 my-1" />
                <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-destructive/10 text-destructive text-left">
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-52 border-r border-border/50 p-3 space-y-0.5 flex flex-col shrink-0">
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

          {/* Main content stub */}
          <div className="flex-1 p-5 bg-muted/10">
            <div className="h-5 w-32 bg-muted rounded mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-card border rounded-lg p-4">
                  <div className="h-3 w-16 bg-muted rounded mb-2" />
                  <div className="h-6 w-10 bg-muted/60 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
          Option B
        </div>
      </div>
    </div>
  );
}
