import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { type AppModule, MODULE_GROUPS } from "@/contexts/auth-modules";
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
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  ReceiptText,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import bizoneLogo from "@assets/bizone_logo_optimized.webp";
import bizoneSgLogo from "@assets/bizone_sg_optimized.webp";
import bizoneIndiaLogo from "@assets/bizone_india_optimized.webp";
import { AgentPanel } from "@/components/agent-panel";

// ── Sidebar collapse context ──────────────────────────────────────────────────
// true = collapsed icon-rail; false = full expanded sidebar
const SidebarCtx = React.createContext(false);

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
  if (loc.startsWith("/projects")) return "projects";
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
  const collapsed = React.useContext(SidebarCtx);

  const expandedEl = (
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

  if (!collapsed) return expandedEl;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={href} className="block">
          <div
            className={`flex items-center justify-center rounded-md h-9 w-9 mx-auto transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

// ── NavGroup (accordion / popover) ────────────────────────────────────────────

interface NavGroupProps {
  id: string;
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
  visible?: boolean;
  hasActive?: boolean;
}

function NavGroup({ id, label, icon: Icon, children, isOpen, onToggle, visible = true, hasActive = false }: NavGroupProps) {
  const collapsed = React.useContext(SidebarCtx);
  if (!visible) return null;

  if (collapsed) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`flex items-center justify-center rounded-md h-9 w-9 mx-auto transition-colors ${
                  hasActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" sideOffset={8} className="w-52 p-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5 px-2">
            {label}
          </p>
          {/* Force expanded mode inside the popover */}
          <SidebarCtx.Provider value={false}>
            {children}
          </SidebarCtx.Provider>
        </PopoverContent>
      </Popover>
    );
  }

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
  const collapsed = React.useContext(SidebarCtx);
  if (!selectedCompany) return null;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center py-2">
            <Building2 className="h-3.5 w-3.5 text-primary/70" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{selectedCompany.country}</TooltipContent>
      </Tooltip>
    );
  }

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
  const collapsed = React.useContext(SidebarCtx);
  const hasMultiple = (user?.companies?.length ?? 0) > 1;
  if (!user) return null;

  const avatarEl = (
    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
      {user.username.charAt(0).toUpperCase()}
    </div>
  );

  if (collapsed) {
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-center py-3 hover:bg-muted/50 transition-colors outline-none">
                {avatarEl}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{user.username}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" sideOffset={8}>
          <div className="px-2 py-1.5 text-sm font-medium">{user.username}</div>
          {isAdmin && <div className="px-2 pb-1.5 text-xs text-muted-foreground capitalize">{user.role}</div>}
          <DropdownMenuSeparator />
          {hasMultiple && (
            <>
              <DropdownMenuItem onClick={() => setLocation("/select-company")} className="gap-2 cursor-pointer">
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors outline-none">
          <div className="flex items-center gap-2.5">
            {avatarEl}
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
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch { /* noop */ }
      return next;
    });
  };

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

  if (!user || location === "/select-company") {
    return <>{children}</>;
  }

  const isSingapore = selectedCompany?.country?.toLowerCase() === "singapore" || selectedCompany?.country === "SG";
  const isIndia = selectedCompany?.country?.toLowerCase() === "india" || selectedCompany?.country === "IN";
  const activeLogo = isSingapore ? bizoneSgLogo : isIndia ? bizoneIndiaLogo : bizoneLogo;
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
      {(isAdmin || hasModuleAccess("dashboard")) && (
        <NavItem
          href="/dashboard"
          icon={LayoutDashboard}
          active={location === "/dashboard" || location === "/"}
        >
          Dashboard
        </NavItem>
      )}

      {(isAdmin || hasModuleAccess("projects")) && (
        <NavItem
          href="/projects"
          icon={FolderKanban}
          active={location.startsWith("/projects")}
        >
          Projects
        </NavItem>
      )}

      <NavGroup
        id="documents"
        label="Documents"
        icon={FileText}
        isOpen={openGroup === "documents"}
        onToggle={toggleGroup}
        visible={hasDocuments}
        hasActive={location.startsWith("/purchase-orders") || location.startsWith("/vendor-invoices") || location.startsWith("/quotations") || location.startsWith("/invoices") || location.startsWith("/proforma-invoices") || location.startsWith("/delivery-orders") || location.startsWith("/grn")}
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
        {hasModuleAccess("proforma_invoices") && (
          <NavItem href="/proforma-invoices" icon={FileMinus} active={location.startsWith("/proforma-invoices")} inGroup>
            Proforma Invoices
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

      <NavGroup
        id="inventory"
        label="Inventory"
        icon={Package}
        isOpen={openGroup === "inventory"}
        onToggle={toggleGroup}
        visible={isAdmin || hasModuleAccess("stock_items")}
        hasActive={location.startsWith("/stock")}
      >
        <NavItem href="/stock" icon={Package} active={location.startsWith("/stock")} inGroup>
          Stock Items
        </NavItem>
      </NavGroup>

      <NavGroup
        id="directory"
        label="Directory"
        icon={Building2}
        isOpen={openGroup === "directory"}
        onToggle={toggleGroup}
        visible={hasDirectory}
        hasActive={location.startsWith("/vendors") || location.startsWith("/customers") || location.startsWith("/address-book")}
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

      <NavGroup
        id="accounting"
        label="Accounting"
        icon={BookOpen}
        isOpen={openGroup === "accounting"}
        onToggle={toggleGroup}
        visible={isSingapore && hasAnyAccounting}
        hasActive={location.startsWith("/accounting")}
      >
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
        <div className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400/80 select-none">Income & Expenses</div>
        {hasModuleAccess("accounting_income") && (
          <NavItem href="/accounting/income" icon={TrendingUp} active={location.startsWith("/accounting/income")} inGroup>
            Income
          </NavItem>
        )}
        {hasModuleAccess("accounting_expenses") && (
          <NavItem href="/accounting/expenses" icon={ReceiptText} active={location.startsWith("/accounting/expenses")} inGroup>
            Expenses
          </NavItem>
        )}
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

      <NavGroup
        id="system"
        label="System"
        icon={Settings}
        isOpen={openGroup === "system"}
        onToggle={toggleGroup}
        visible={isAdmin}
        hasActive={location.startsWith("/admin") || location.startsWith("/audit-log") || location.startsWith("/settings")}
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

  const sidebarContent = (
    <SidebarCtx.Provider value={collapsed}>
      <TooltipProvider delayDuration={0}>
        {/* Header: logo + toggle */}
        <div className={`border-b border-border/50 flex items-center shrink-0 ${collapsed ? "justify-center py-4 px-2" : "px-5 py-4 justify-between"}`}>
          {!collapsed && (
            <img src={activeLogo} alt="BizOne" className="h-11 w-auto object-contain max-w-[160px]" />
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 ml-auto"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <div className={`flex-1 overflow-y-auto ${collapsed ? "p-1.5" : "p-3"}`}>
          {navItems}
        </div>

        {/* Bottom: company + user + logo */}
        <div className="border-t border-border/50 bg-muted/10 pt-2 shrink-0">
          <CompanyBadge />
          <UserMenu />
        </div>
        {!collapsed && (selectedCompany as any)?.logoUrl && (
          <div className="px-5 py-4 border-t border-border/30 flex items-center justify-start bg-muted/20">
            <img
              src={(selectedCompany as any).logoUrl}
              alt={selectedCompany?.name ?? "Company"}
              className="h-10 w-auto object-contain max-w-[150px]"
            />
          </div>
        )}
      </TooltipProvider>
    </SidebarCtx.Provider>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/20">
      {/* ── Mobile header ────────────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 border-b bg-card">
        <div className="flex items-center gap-2">
          <img src={activeLogo} alt="BizOne" className="h-6" />
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <div className="p-4 border-b shrink-0">
              <img src={activeLogo} alt="BizOne" className="h-8" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <SidebarCtx.Provider value={false}>
                <TooltipProvider delayDuration={0}>
                  {navItems}
                </TooltipProvider>
              </SidebarCtx.Provider>
            </div>
            <div className="shrink-0 border-t border-border/50 bg-muted/10 pt-2">
              <SidebarCtx.Provider value={false}>
                <TooltipProvider delayDuration={0}>
                  <CompanyBadge />
                  <UserMenu />
                </TooltipProvider>
              </SidebarCtx.Provider>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col border-r bg-card h-screen sticky top-0 shrink-0 transition-all duration-300 ${
          collapsed ? "w-14" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 p-4 md:p-6 xl:p-8 overflow-auto">
        {children}
      </main>
      <AgentPanel />
    </div>
  );
}
