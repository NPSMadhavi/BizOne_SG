import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth, type AppModule, MODULE_GROUPS } from "@/contexts/auth-context";
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
  Clock,
  CreditCard,
  Wallet,
  HandCoins,
  Scale,
  Calculator,
  FileMinus,
  UserCheck,
  FileDiff,
  Building,
  BookMarked,
  Banknote,
  Archive,
  ChevronDown,
  ChevronUp,
  ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logo from "@assets/logo_1776054030755.png";
import { AgentPanel } from "@/components/agent-panel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGroupForRoute(loc: string): string | null {
  if (
    loc.startsWith("/purchase-orders") ||
    loc.startsWith("/vendor-invoices") ||
    loc.startsWith("/quotations") ||
    loc.startsWith("/invoices") ||
    loc.startsWith("/delivery-orders") ||
    loc.startsWith("/grn")
  ) return "documents";
  if (loc.startsWith("/stock")) return "inventory";
  if (
    loc.startsWith("/vendors") ||
    loc.startsWith("/customers") ||
    loc.startsWith("/address-book")
  ) return "directory";
  if (loc.startsWith("/accounting")) return "accounting";
  if (
    loc.startsWith("/admin") ||
    loc.startsWith("/audit-log") ||
    loc.startsWith("/settings")
  ) return "system";
  return null;
}

// ── NavItem ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
  active?: boolean;
  inGroup?: boolean;
}

function NavItem({ href, icon: Icon, children, active, inGroup = false }: NavItemProps) {
  return (
    <Link href={href} className="block">
      <div
        className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
          inGroup ? "px-2 py-1.5" : "px-3 py-2"
        } ${
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

// ── NavGroup (accordion) ──────────────────────────────────────────────────────

interface NavGroupProps {
  id: string;
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
  visible?: boolean;
}

function NavGroup({ id, label, icon: Icon, children, isOpen, onToggle, visible = true }: NavGroupProps) {
  if (!visible) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isOpen
            ? "text-foreground bg-muted/50"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* CSS grid animation for smooth open/close */}
      <div
        className={`grid transition-all duration-200 ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="ml-4 pl-3 border-l border-border/40 space-y-0.5 py-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CompanyBadge ──────────────────────────────────────────────────────────────

function CompanyBadge() {
  const { selectedCompany } = useAuth();

  if (!selectedCompany) return null;

  return (
    <div className="mx-3 mb-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
      <div className="flex items-center gap-2">
        <Building2 className="h-3 w-3 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground">{selectedCompany.country}</p>
      </div>
    </div>
  );
}

// ── UserMenu ───────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const hasMultiple = (user?.companies?.length ?? 0) > 1;
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors outline-none">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <div className="text-sm font-medium leading-tight">{user.username}</div>
              {isAdmin && <div className="text-[11px] text-muted-foreground leading-tight capitalize">{user.role}</div>}
            </div>
          </div>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {hasMultiple && (
          <>
            <DropdownMenuItem
              onClick={() => setLocation("/select-company")}
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Switch Company
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => logout()}
          className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAdmin, hasModuleAccess, selectedCompany } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);

  // Auto-expand the group that contains the current route
  React.useEffect(() => {
    const group = getGroupForRoute(location);
    if (group) setOpenGroup(group);
  }, [location]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const toggleGroup = (id: string) => {
    setOpenGroup(prev => (prev === id ? null : id));
  };

  if (!user) {
    return <>{children}</>;
  }

  const isSingapore = selectedCompany?.country?.toLowerCase() === "singapore";
  const accountingGroupModules = MODULE_GROUPS.find(g => g.id === "accounting")?.modules ?? [];
  const hasAnyAccounting = isAdmin || accountingGroupModules.some(m => hasModuleAccess(m as AppModule));
  const hasDocuments =
    hasModuleAccess("purchase_orders") ||
    hasModuleAccess("quotations") ||
    hasModuleAccess("invoices") ||
    hasModuleAccess("credit_notes") ||
    hasModuleAccess("delivery_orders");
  const hasDirectory =
    isAdmin ||
    hasModuleAccess("purchase_orders") ||
    hasModuleAccess("invoices") ||
    hasModuleAccess("quotations") ||
    hasModuleAccess("delivery_orders");

  const navItems = (
    <div className="space-y-0.5">
      {/* ── Dashboard (standalone) ──────────────────────────── */}
      {(isAdmin || hasModuleAccess("dashboard")) && (
        <NavItem
          href="/dashboard"
          icon={LayoutDashboard}
          active={location === "/dashboard" || location === "/"}
        >
          Dashboard
        </NavItem>
      )}

      {/* ── DOCUMENTS ──────────────────────────────────────── */}
      <NavGroup
        id="documents"
        label="Documents"
        icon={FileText}
        isOpen={openGroup === "documents"}
        onToggle={toggleGroup}
        visible={hasDocuments}
      >
        {hasModuleAccess("purchase_orders") && (
          <NavItem href="/purchase-orders" icon={FileText} active={location.startsWith("/purchase-orders")} inGroup>
            Purchase Orders
          </NavItem>
        )}
        {hasModuleAccess("purchase_orders") && (
          <NavItem href="/vendor-invoices" icon={FileInput} active={location.startsWith("/vendor-invoices")} inGroup>
            Vendor Invoices
          </NavItem>
        )}
        {hasModuleAccess("quotations") && (
          <NavItem href="/quotations" icon={FileSpreadsheet} active={location.startsWith("/quotations")} inGroup>
            Quotations
          </NavItem>
        )}
        {hasModuleAccess("invoices") && (
          <NavItem href="/invoices" icon={Receipt} active={location.startsWith("/invoices") && !location.startsWith("/invoices/")} inGroup>
            Invoices
          </NavItem>
        )}
        {hasModuleAccess("credit_notes") && (
          <NavItem href="/credit-notes" icon={FileMinus} active={location.startsWith("/credit-notes")} inGroup>
            Credit Notes
          </NavItem>
        )}
        {hasModuleAccess("delivery_orders") && (
          <NavItem href="/delivery-orders" icon={Truck} active={location.startsWith("/delivery-orders")} inGroup>
            Delivery Orders
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("grn")) && (
          <NavItem href="/grn" icon={ClipboardList} active={location.startsWith("/grn")} inGroup>
            Goods Receipt
          </NavItem>
        )}
      </NavGroup>

      {/* ── INVENTORY ──────────────────────────────────────── */}
      <NavGroup
        id="inventory"
        label="Inventory"
        icon={Package}
        isOpen={openGroup === "inventory"}
        onToggle={toggleGroup}
        visible={isAdmin || hasModuleAccess("stock_items")}
      >
        <NavItem href="/stock" icon={Package} active={location.startsWith("/stock")} inGroup>
          Stock Items
        </NavItem>
      </NavGroup>

      {/* ── DIRECTORY ──────────────────────────────────────── */}
      <NavGroup
        id="directory"
        label="Directory"
        icon={Building2}
        isOpen={openGroup === "directory"}
        onToggle={toggleGroup}
        visible={hasDirectory}
      >
        {(isAdmin || hasModuleAccess("purchase_orders")) && (
          <NavItem href="/vendors" icon={Building2} active={location.startsWith("/vendors")} inGroup>
            Vendors
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("invoices") || hasModuleAccess("quotations")) && (
          <NavItem href="/customers" icon={Users2} active={location.startsWith("/customers")} inGroup>
            Customers
          </NavItem>
        )}
        {hasDirectory && (
          <NavItem href="/address-book" icon={Mail} active={location.startsWith("/address-book")} inGroup>
            Address Book
          </NavItem>
        )}
      </NavGroup>

      {/* ── ACCOUNTING (Singapore only, module-gated) ───────── */}
      <NavGroup
        id="accounting"
        label="Accounting"
        icon={BookOpen}
        isOpen={openGroup === "accounting"}
        onToggle={toggleGroup}
        visible={isSingapore && hasAnyAccounting}
      >
        {/* ─ Core Books ─ */}
        <div className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400/80 select-none">Core Books</div>
        {hasModuleAccess("accounting_coa") && (
          <NavItem href="/accounting/chart-of-accounts" icon={BookOpen} active={location.startsWith("/accounting/chart-of-accounts")} inGroup>
            Chart of Accounts
          </NavItem>
        )}
        {hasModuleAccess("accounting_je") && (
          <NavItem href="/accounting/journal-entries" icon={ScrollText} active={location.startsWith("/accounting/journal-entries")} inGroup>
            Journal Entries
          </NavItem>
        )}
        {hasModuleAccess("accounting_gl") && (
          <NavItem href="/accounting/general-ledger" icon={BookMarked} active={location === "/accounting/general-ledger"} inGroup>
            General Ledger
          </NavItem>
        )}
        {hasModuleAccess("accounting_tb") && (
          <NavItem href="/accounting/trial-balance" icon={Calculator} active={location === "/accounting/trial-balance"} inGroup>
            Trial Balance
          </NavItem>
        )}
        {hasModuleAccess("accounting_bs") && (
          <NavItem href="/accounting/balance-sheet" icon={Scale} active={location === "/accounting/balance-sheet"} inGroup>
            Balance Sheet
          </NavItem>
        )}
        {hasModuleAccess("accounting_pl") && (
          <NavItem href="/accounting/profit-loss" icon={TrendingUp} active={location === "/accounting/profit-loss"} inGroup>
            Profit & Loss
          </NavItem>
        )}
        {hasModuleAccess("accounting_cf") && (
          <NavItem href="/accounting/cash-flow" icon={Banknote} active={location === "/accounting/cash-flow"} inGroup>
            Cash Flow
          </NavItem>
        )}

        {/* ─ Tax & Compliance ─ */}
        <div className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400/80 select-none">Tax & Compliance</div>
        {hasModuleAccess("accounting_gst_f5") && (
          <NavItem href="/accounting/gst-f5" icon={Receipt} active={location === "/accounting/gst-f5"} inGroup>
            GST F5 Return
          </NavItem>
        )}
        {hasModuleAccess("accounting_gst_f7") && (
          <NavItem href="/accounting/gst-f7" icon={FileDiff} active={location === "/accounting/gst-f7"} inGroup>
            GST F7 (Amended)
          </NavItem>
        )}
        {hasModuleAccess("accounting_gst_io") && (
          <NavItem href="/accounting/gst-io" icon={ListFilter} active={location === "/accounting/gst-io"} inGroup>
            GST IO Listing
          </NavItem>
        )}
        {hasModuleAccess("accounting_wht") && (
          <NavItem href="/accounting/wht" icon={Receipt} active={location === "/accounting/wht"} inGroup>
            Withholding Tax
          </NavItem>
        )}
        {hasModuleAccess("accounting_eci") && (
          <NavItem href="/accounting/eci" icon={Calculator} active={location === "/accounting/eci"} inGroup>
            ECI
          </NavItem>
        )}
        {hasModuleAccess("accounting_formcs") && (
          <NavItem href="/accounting/form-cs" icon={FileText} active={location === "/accounting/form-cs"} inGroup>
            Form C-S
          </NavItem>
        )}
        {hasModuleAccess("accounting_iaf") && (
          <NavItem href="/accounting/iaf" icon={Archive} active={location === "/accounting/iaf"} inGroup>
            IRAS Audit File
          </NavItem>
        )}

        {/* ─ Receivables ─ */}
        <div className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400/80 select-none">Receivables</div>
        {hasModuleAccess("accounting_ar") && (
          <NavItem href="/accounting/ar" icon={Wallet} active={location === "/accounting/ar"} inGroup>
            AR Collections
          </NavItem>
        )}
        {hasModuleAccess("accounting_ar_aging") && (
          <NavItem href="/accounting/ar-aging" icon={Clock} active={location === "/accounting/ar-aging"} inGroup>
            AR Aging
          </NavItem>
        )}
        {hasModuleAccess("accounting_cust_stmt") && (
          <NavItem href="/accounting/customer-statement" icon={UserCheck} active={location === "/accounting/customer-statement"} inGroup>
            Customer Statement
          </NavItem>
        )}

        {/* ─ Payables ─ */}
        <div className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400/80 select-none">Payables</div>
        {hasModuleAccess("accounting_ap") && (
          <NavItem href="/accounting/ap" icon={HandCoins} active={location === "/accounting/ap"} inGroup>
            AP Payments
          </NavItem>
        )}
        {hasModuleAccess("accounting_ap_aging") && (
          <NavItem href="/accounting/ap-aging" icon={CreditCard} active={location === "/accounting/ap-aging"} inGroup>
            AP Aging
          </NavItem>
        )}
        {hasModuleAccess("accounting_vendor_stmt") && (
          <NavItem href="/accounting/vendor-statement" icon={Building} active={location === "/accounting/vendor-statement"} inGroup>
            Vendor Statement
          </NavItem>
        )}
      </NavGroup>

      {/* ── SYSTEM (admin only) ─────────────────────────────── */}
      <NavGroup
        id="system"
        label="System"
        icon={Settings}
        isOpen={openGroup === "system"}
        onToggle={toggleGroup}
        visible={isAdmin}
      >
        <NavItem href="/admin" icon={Users} active={location === "/admin"} inGroup>
          User Management
        </NavItem>
        <NavItem href="/audit-log" icon={ShieldCheck} active={location === "/audit-log"} inGroup>
          Audit Log
        </NavItem>
        <NavItem href="/settings" icon={Settings} active={location === "/settings"} inGroup>
          Settings
        </NavItem>
      </NavGroup>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/20">
      {/* ── Mobile header ────────────────────────────────────── */}
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
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {navItems}
            </div>
            <div className="shrink-0 border-t border-border/50 bg-muted/10 pt-2">
              <CompanyBadge />
              <UserMenu />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0 shrink-0">
        <div className="p-6 border-b border-border/50">
          <img src={logo} alt="RSV Infotech" className="h-8" />
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          {navItems}
        </div>
        <div className="border-t border-border/50 bg-muted/10 pt-2">
          <CompanyBadge />
          <UserMenu />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 p-4 md:p-6 xl:p-8 overflow-auto">
        {children}
      </main>
      <AgentPanel />
    </div>
  );
}
