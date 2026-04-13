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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import logo from "@assets/logo_1776054030755.png";

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
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
            title="Switch company"
            onClick={() => setLocation("/select-company")}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin, hasModuleAccess } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (!user) {
    return <>{children}</>;
  }

  const navItems = (
    <>
      <div className="space-y-1">
        <NavItem href="/dashboard" icon={LayoutDashboard} active={location === "/dashboard" || location === "/"}>
          Dashboard
        </NavItem>
      </div>

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
          </div>
        </div>
      )}

      <div className="mt-4">
        <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          System
        </h4>
        <div className="space-y-1">
          {isAdmin && (
            <NavItem href="/admin" icon={Users} active={location === "/admin"}>
              User Management
            </NavItem>
          )}
          <NavItem href="/settings" icon={Settings} active={location === "/settings"}>
            Settings
          </NavItem>
        </div>
      </div>
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
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b">
              <img src={logo} alt="RSV Infotech" className="h-8" />
            </div>
            <div className="p-4 flex flex-col h-[calc(100vh-5rem)]">
              <div className="flex-1 overflow-y-auto">
                {navItems}
              </div>
              <div className="pt-4 border-t border-border mt-auto space-y-2">
                <CompanyBadge />
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user.username}</span>
                    <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
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
                <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 w-full max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
