import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth, type AppModule } from "@/contexts/auth-context";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  LogOut,
  Menu,
  FileSpreadsheet,
  Receipt,
  Truck,
  Building2,
  RefreshCw,
  ClipboardList,
  Package,
  Users2,
  Mail,
  FileInput,
  ShieldCheck,
  BookOpen,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import logo from "@assets/logo_1776054030755.png";
import { AgentPanel } from "@/components/agent-panel";

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
  active?: boolean;
}

function NavItem({ href, icon: Icon, children, active }: NavItemProps) {
  return (
    <Link href={href} className="block">
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </div>
    </Link>
  );
}

function CompanyBadge() {
  const { selectedCompany, user } = useAuth();
  const [, setLocation] = useLocation();
  const hasMultiple = (user?.companies?.length ?? 0) > 1;

  if (!selectedCompany) return null;

  return (
    <div className="mx-3 mb-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-primary truncate">{selectedCompany.name}</p>
          <p className="text-xs text-muted-foreground">{selectedCompany.country}</p>
        </div>
        {hasMultiple && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 shrink-0 text-xs text-muted-foreground hover:text-primary gap-1"
            title="Switch company"
            onClick={() => setLocation("/select-company")}
          >
            <RefreshCw className="h-3 w-3" />
            <span>Switch</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin, hasModuleAccess, selectedCompany } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (!user) {
    return <>{children}</>;
  }

  const navItems = (
    <>
      {(isAdmin || hasModuleAccess("dashboard")) && (
        <div className="space-y-1">
          <NavItem href="/dashboard" icon={LayoutDashboard} active={location === "/dashboard" || location === "/"}>
            Dashboard
          </NavItem>
        </div>
      )}

      {(hasModuleAccess("purchase_orders") || hasModuleAccess("quotations") || hasModuleAccess("invoices") || hasModuleAccess("delivery_orders")) && (
        <div className="mt-4">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Documents
          </h4>
          <div className="space-y-1">
            {hasModuleAccess("purchase_orders") && (
              <NavItem href="/purchase-orders" icon={FileText} active={location.startsWith("/purchase-orders")}>
                Purchase Orders
              </NavItem>
            )}
            {hasModuleAccess("purchase_orders") && (
              <NavItem href="/vendor-invoices" icon={FileInput} active={location.startsWith("/vendor-invoices")}>
                Vendor Invoices
              </NavItem>
            )}
            {hasModuleAccess("quotations") && (
              <NavItem href="/quotations" icon={FileSpreadsheet} active={location.startsWith("/quotations")}>
                Quotations
              </NavItem>
            )}
            {hasModuleAccess("invoices") && (
              <NavItem href="/invoices" icon={Receipt} active={location.startsWith("/invoices")}>
                Invoices
              </NavItem>
            )}
            {hasModuleAccess("delivery_orders") && (
              <NavItem href="/delivery-orders" icon={Truck} active={location.startsWith("/delivery-orders")}>
                Delivery Orders
              </NavItem>
            )}
            {(isAdmin || hasModuleAccess("grn")) && (
              <NavItem href="/grn" icon={ClipboardList} active={location.startsWith("/grn")}>
                Goods Receipt
              </NavItem>
            )}
          </div>
        </div>
      )}

      {(isAdmin || hasModuleAccess("stock_items")) && (
        <div className="mt-4">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Inventory
          </h4>
          <div className="space-y-1">
            <NavItem href="/stock" icon={Package} active={location.startsWith("/stock")}>
              Stock Items
            </NavItem>
          </div>
        </div>
      )}

      {(isAdmin || hasModuleAccess("purchase_orders") || hasModuleAccess("invoices") || hasModuleAccess("quotations") || hasModuleAccess("delivery_orders")) && (
        <div className="mt-4">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Directory
          </h4>
          <div className="space-y-1">
            {(isAdmin || hasModuleAccess("purchase_orders")) && (
              <NavItem href="/vendors" icon={Building2} active={location.startsWith("/vendors")}>
                Vendors
              </NavItem>
            )}
            {(isAdmin || hasModuleAccess("invoices") || hasModuleAccess("quotations")) && (
              <NavItem href="/customers" icon={Users2} active={location.startsWith("/customers")}>
                Customers
              </NavItem>
            )}
            {(isAdmin || hasModuleAccess("purchase_orders") || hasModuleAccess("invoices") || hasModuleAccess("quotations") || hasModuleAccess("delivery_orders")) && (
              <NavItem href="/address-book" icon={Mail} active={location.startsWith("/address-book")}>
                Address Book
              </NavItem>
            )}
          </div>
        </div>
      )}

      {selectedCompany?.country?.toLowerCase() === "singapore" && (
        <div className="mt-4">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Accounting
          </h4>
          <div className="space-y-1">
            <NavItem href="/accounting/chart-of-accounts" icon={BookOpen} active={location.startsWith("/accounting/chart-of-accounts")}>
              Chart of Accounts
            </NavItem>
            <NavItem href="/accounting/journal-entries" icon={ScrollText} active={location.startsWith("/accounting/journal-entries")}>
              Journal Entries
            </NavItem>
            <NavItem href="/accounting/profit-loss" icon={TrendingUp} active={location === "/accounting/profit-loss"}>
              Profit & Loss
            </NavItem>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-4">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            System
          </h4>
          <div className="space-y-1">
            <NavItem href="/admin" icon={Users} active={location === "/admin"}>
              User Management
            </NavItem>
            <NavItem href="/audit-log" icon={ShieldCheck} active={location === "/audit-log"}>
              Audit Log
            </NavItem>
            <NavItem href="/settings" icon={Settings} active={location === "/settings"}>
              Settings
            </NavItem>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/20">
      <header className="md:hidden flex items-center justify-between px-4 h-14 border-b bg-card">
        <div className="flex items-center gap-2">
          <img src={logo} alt="RSV Infotech" className="h-6" />
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <div className="p-4 border-b shrink-0">
              <img src={logo} alt="RSV Infotech" className="h-8" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {navItems}
            </div>
            <div className="shrink-0 border-t border-border/50 bg-muted/10">
              <CompanyBadge />
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.username}</span>
                  {isAdmin && <span className="text-xs text-muted-foreground capitalize">{user.role}</span>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { logout(); }}
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0 shrink-0">
        <div className="p-6 border-b border-border/50">
          <img src={logo} alt="RSV Infotech" className="h-8" />
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          {navItems}
        </div>
        <div className="border-t border-border/50 bg-muted/10">
          <CompanyBadge />
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                {isAdmin && <span className="text-xs text-muted-foreground capitalize">{user.role}</span>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-6 xl:p-8 overflow-auto">
        {children}
      </main>
      <AgentPanel />
    </div>
  );
}
