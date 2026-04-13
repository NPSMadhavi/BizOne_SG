import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
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
  ChevronDown,
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

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
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

      <div className="mt-4">
        <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Documents
        </h4>
        <div className="space-y-1">
          <NavItem href="/purchase-orders" icon={FileText} active={location.startsWith("/purchase-orders")}>
            Purchase Orders
          </NavItem>
          <NavItem href="/quotations" icon={FileSpreadsheet} active={location.startsWith("/quotations")}>
            Quotations
          </NavItem>
          <NavItem href="/invoices" icon={Receipt} active={location.startsWith("/invoices")}>
            Invoices
          </NavItem>
          <NavItem href="/delivery-orders" icon={Truck} active={location.startsWith("/delivery-orders")}>
            Delivery Orders
          </NavItem>
        </div>
      </div>

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
              <div className="pt-4 border-t border-border mt-auto">
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
        <div className="p-4 border-t border-border/50 bg-muted/10">
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
      </aside>

      <main className="flex-1 p-4 md:p-8 w-full max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
