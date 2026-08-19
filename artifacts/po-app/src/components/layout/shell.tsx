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
  FilePlus,
  UserCheck,
  FileDiff,
  Building,
  BookMarked,
  Banknote,
  Archive,
  ChevronDown,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  ReceiptText,
  Monitor,
  KeyRound,
  DollarSign,
  Briefcase,
  Warehouse,
  BarChart3,
  Store,
  Hourglass,
  Boxes,
  ShoppingBag,
  ArrowLeftRight,
  Landmark,
  LayoutTemplate,
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
  if (loc.startsWith("/accounting/bank-reconciliation")) return null;
  if (
    loc.startsWith("/purchase-quotations") ||
    loc.startsWith("/purchase-orders") ||
    loc.startsWith("/vendor-invoices") ||
    loc.startsWith("/quotations") ||
    loc.startsWith("/sales-orders") ||
    loc.startsWith("/invoices") ||
    loc.startsWith("/delivery-orders") ||
    loc.startsWith("/point-of-sale") ||
    loc.startsWith("/bill-of-materials") ||
    loc.startsWith("/grn")
  ) return "documents";
  if (
    loc.startsWith("/credit-notes") ||
    loc.startsWith("/debit-notes") ||
    loc.startsWith("/proforma-invoices")
  ) return "documents";
  if (loc.startsWith("/projects")) return "projects";
  if (
    loc.startsWith("/assets") ||
    loc.startsWith("/licenses") ||
    loc.startsWith("/employees") ||
    loc.startsWith("/payroll")
  ) return "operations";
  if (loc.startsWith("/stock") || loc.startsWith("/inventory")) return "inventory";
  if (
    loc.startsWith("/vendors") ||
    loc.startsWith("/customers") ||
    loc.startsWith("/address-book")
  ) return "directory";
  if (loc.startsWith("/accounting")) return "accounting";
  if (
    loc.startsWith("/admin") ||
    loc.startsWith("/audit-log") ||
    loc.startsWith("/settings") ||
    loc.startsWith("/report-templates")
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

  const activeCls =
    "bg-[#1a73e8] text-white shadow-[0_4px_12px_rgba(26,115,232,0.35)]";
  const idleCls =
    "text-[#64748b] hover:bg-[#f0f4ff] hover:text-[#1a73e8]";

  const expandedEl = (
    <Link href={href} className="block">
      <div
        className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
          inGroup ? "px-2.5 py-1.5" : "px-3 py-2.5"
        } ${active ? activeCls : idleCls}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[#1a73e8]/80"}`} />
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
            className={`flex items-center justify-center rounded-xl h-9 w-9 mx-auto transition-all ${
              active ? activeCls : idleCls
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[#1a73e8]/80"}`} />
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
                className={`flex items-center justify-center rounded-xl h-9 w-9 mx-auto transition-all ${
                  hasActive
                    ? "bg-[#1a73e8] text-white shadow-[0_4px_12px_rgba(26,115,232,0.35)]"
                    : "text-[#64748b] hover:bg-[#f0f4ff] hover:text-[#1a73e8]"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${hasActive ? "text-white" : "text-[#1a73e8]/80"}`} />
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
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isOpen || hasActive
            ? "text-[#1a73e8] bg-[#f0f4ff]"
            : "text-[#64748b] hover:bg-[#f0f4ff] hover:text-[#1a73e8]"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${isOpen || hasActive ? "text-[#1a73e8]" : "text-[#1a73e8]/80"}`} />
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
        <button className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/50 transition-colors outline-none min-w-0">
          {avatarEl}
          <div className="text-left min-w-0 flex-1 overflow-hidden">
            <div className="text-xs font-medium leading-snug break-all">{user.username}</div>
            {isAdmin && <div className="text-[11px] text-muted-foreground leading-tight capitalize mt-0.5">{user.role}</div>}
          </div>
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
    hasModuleAccess("purchase_quotations") ||
    hasModuleAccess("purchase_orders") ||
    hasModuleAccess("vendor_invoices") ||
    hasModuleAccess("quotations") ||
    hasModuleAccess("sales_orders") ||
    hasModuleAccess("invoices") ||
    hasModuleAccess("proforma_invoices") ||
    hasModuleAccess("credit_notes") ||
    hasModuleAccess("debit_notes") ||
    hasModuleAccess("delivery_orders") ||
    hasModuleAccess("point_of_sale") ||
    hasModuleAccess("bill_of_materials") ||
    hasModuleAccess("grn");
  const directoryModules = ["vendors", "customers", "address_book"] as const;
  // Directory ONLY for these three — never via PO/Invoice/Documents access
  const hasDirectory =
    isAdmin || directoryModules.some((m) => hasModuleAccess(m as AppModule));
  const hasOperations =
    isAdmin ||
    hasModuleAccess("assets") ||
    hasModuleAccess("licenses") ||
    hasModuleAccess("employees") ||
    hasModuleAccess("payroll");
  const inventoryModules = ["warehouses", "stock_items", "stock_transfer", "inventory_reports", "batch_expiry"] as const;
  // Inventory ONLY when one of these is explicitly assigned — never via Documents / GRN / defaults
  const hasInventory =
    isAdmin || inventoryModules.some((m) => hasModuleAccess(m as AppModule));
  const systemGroupModules = MODULE_GROUPS.find(g => g.id === "system")?.modules ?? [];
  const hasSystem = isAdmin || systemGroupModules.some(m => hasModuleAccess(m as AppModule));
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

      <NavGroup
        id="operations"
        label="Operations"
        icon={Briefcase}
        isOpen={openGroup === "operations"}
        onToggle={toggleGroup}
        visible={hasOperations}
        hasActive={
          location.startsWith("/assets") ||
          location.startsWith("/licenses") ||
          location.startsWith("/employees") ||
          location.startsWith("/payroll")
        }
      >
        {(isAdmin || hasModuleAccess("assets")) && (
          <NavItem href="/assets" icon={Monitor} active={location.startsWith("/assets")} inGroup>
            Assets
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("licenses")) && (
          <NavItem href="/licenses" icon={KeyRound} active={location.startsWith("/licenses")} inGroup>
            Licenses
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("employees")) && (
          <NavItem href="/employees" icon={Users} active={location.startsWith("/employees")} inGroup>
            Employees
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("payroll")) && (
          <NavItem href="/payroll" icon={DollarSign} active={location.startsWith("/payroll")} inGroup>
            Payroll
          </NavItem>
        )}
      </NavGroup>

      {/* Projects — hidden from sidebar; routes/functionality kept */}
      {/* {(isAdmin || hasModuleAccess("projects")) && (
        <NavItem
          href="/projects"
          icon={FolderKanban}
          active={location.startsWith("/projects")}
        >
          Projects
        </NavItem>
      )} */}

      <NavGroup
        id="documents"
        label="Documents"
        icon={FileText}
        isOpen={openGroup === "documents"}
        onToggle={toggleGroup}
        visible={hasDocuments}
        hasActive={
          location.startsWith("/purchase-quotations") || location.startsWith("/purchase-orders") || location.startsWith("/vendor-invoices") ||
          location.startsWith("/quotations") || location.startsWith("/sales-orders") ||
          location.startsWith("/invoices") ||
          location.startsWith("/proforma-invoices") || location.startsWith("/credit-notes") ||
          location.startsWith("/debit-notes") || location.startsWith("/delivery-orders") ||
          location.startsWith("/grn")
        }
      >
        {/* ── Purchases ── */}
        {(hasModuleAccess("purchase_quotations") || hasModuleAccess("purchase_orders") || hasModuleAccess("vendor_invoices") || hasModuleAccess("grn")) && (
          <div className="px-3 pt-2 pb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 select-none">Purchases</span>
          </div>
        )}
        {hasModuleAccess("purchase_quotations") && (
          <NavItem href="/purchase-quotations" icon={FileSpreadsheet} active={location.startsWith("/purchase-quotations")} inGroup>
            Purchase Quotations
          </NavItem>
        )}
        {hasModuleAccess("purchase_orders") && (
          <NavItem href="/purchase-orders" icon={FileText} active={location.startsWith("/purchase-orders")} inGroup>
            Purchase Orders
          </NavItem>
        )}
        {hasModuleAccess("vendor_invoices") && (
          <NavItem href="/vendor-invoices" icon={FileInput} active={location.startsWith("/vendor-invoices")} inGroup>
            Vendor Invoices
          </NavItem>
        )}
        {hasModuleAccess("grn") && (
          <NavItem href="/grn" icon={ClipboardList} active={location.startsWith("/grn")} inGroup>
            GoodsReceipt Note
          </NavItem>
        )}

        {/* ── Sales ── */}
        {(hasModuleAccess("quotations") || hasModuleAccess("sales_orders") || hasModuleAccess("invoices") || hasModuleAccess("proforma_invoices") || hasModuleAccess("credit_notes") || hasModuleAccess("debit_notes") || hasModuleAccess("delivery_orders") || hasModuleAccess("point_of_sale") || hasModuleAccess("bill_of_materials")) && (
          <div className="px-3 pt-3 pb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 select-none">Sales</span>
          </div>
        )}
        {hasModuleAccess("quotations") && (
          <NavItem href="/quotations" icon={FileSpreadsheet} active={location.startsWith("/quotations")} inGroup>
            Quotations
          </NavItem>
        )}
        {hasModuleAccess("sales_orders") && (
          <NavItem href="/sales-orders" icon={ShoppingBag} active={location.startsWith("/sales-orders")} inGroup>
            Sales Orders
          </NavItem>
        )}
        {hasModuleAccess("proforma_invoices") && (
          <NavItem href="/proforma-invoices" icon={FileMinus} active={location.startsWith("/proforma-invoices")} inGroup>
            Proforma Invoices
          </NavItem>
        )}
        {hasModuleAccess("invoices") && (
          <NavItem href="/invoices" icon={Receipt} active={location.startsWith("/invoices")} inGroup>
            Tax Invoices
          </NavItem>
        )}
        {hasModuleAccess("credit_notes") && (
          <NavItem href="/credit-notes" icon={FileMinus} active={location.startsWith("/credit-notes")} inGroup>
            Credit Notes
          </NavItem>
        )}
        {hasModuleAccess("debit_notes") && (
          <NavItem href="/debit-notes" icon={FilePlus} active={location.startsWith("/debit-notes")} inGroup>
            Debit Notes
          </NavItem>
        )}
        {hasModuleAccess("delivery_orders") && (
          <NavItem href="/delivery-orders" icon={Truck} active={location.startsWith("/delivery-orders")} inGroup>
            Delivery Orders
          </NavItem>
        )}
        {hasModuleAccess("point_of_sale") && (
          <NavItem href="/point-of-sale" icon={Store} active={location.startsWith("/point-of-sale")} inGroup>
            Point of Sale
          </NavItem>
        )}
        {hasModuleAccess("bill_of_materials") && (
          <NavItem href="/bill-of-materials" icon={Boxes} active={location.startsWith("/bill-of-materials")} inGroup>
            Bill of Materials
          </NavItem>
        )}
      </NavGroup>

      <NavGroup
        id="inventory"
        label="Inventory"
        icon={Package}
        isOpen={openGroup === "inventory"}
        onToggle={toggleGroup}
        visible={hasInventory}
        hasActive={location.startsWith("/stock") || location.startsWith("/inventory")}
      >
        {hasModuleAccess("warehouses") && (
          <NavItem href="/inventory/warehouses" icon={Warehouse} active={location.startsWith("/inventory/warehouses")} inGroup>
            Warehouses
          </NavItem>
        )}
        {hasModuleAccess("stock_items") && (
          <NavItem href="/stock" icon={Package} active={location.startsWith("/stock")} inGroup>
            Stock Items
          </NavItem>
        )}
        {hasModuleAccess("stock_transfer") && (
          <NavItem href="/inventory/stock-transfer" icon={ArrowLeftRight} active={location.startsWith("/inventory/stock-transfer")} inGroup>
            Stock Transfer
          </NavItem>
        )}
        {hasModuleAccess("inventory_reports") && (
          <NavItem href="/inventory/reports" icon={BarChart3} active={location.startsWith("/inventory/reports")} inGroup>
            Stock Reports
          </NavItem>
        )}
        {hasModuleAccess("batch_expiry") && (
          <NavItem href="/inventory/batch-expiry" icon={Hourglass} active={location.startsWith("/inventory/batch-expiry")} inGroup>
            Batch & Expiry
          </NavItem>
        )}
      </NavGroup>

      {(isSingapore && hasModuleAccess("accounting_bank_recon")) && (
        <NavItem
          href="/accounting/bank-reconciliation"
          icon={Landmark}
          active={location.startsWith("/accounting/bank-reconciliation")}
        >
          Bank Reconciliation
        </NavItem>
      )}

      <NavGroup
        id="directory"
        label="Directory"
        icon={Building2}
        isOpen={openGroup === "directory"}
        onToggle={toggleGroup}
        visible={hasDirectory}
        hasActive={location.startsWith("/vendors") || location.startsWith("/customers") || location.startsWith("/address-book")}
      >
        {hasModuleAccess("vendors") && (
          <NavItem href="/vendors" icon={Building2} active={location.startsWith("/vendors")} inGroup>
            Vendors
          </NavItem>
        )}
        {hasModuleAccess("customers") && (
          <NavItem href="/customers" icon={Users2} active={location.startsWith("/customers")} inGroup>
            Customers
          </NavItem>
        )}
        {hasModuleAccess("address_book") && (
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
        hasActive={location.startsWith("/accounting") && !location.startsWith("/accounting/bank-reconciliation")}
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
        visible={hasSystem}
        hasActive={location.startsWith("/admin") || location.startsWith("/audit-log") || location.startsWith("/settings") || location.startsWith("/report-templates")}
      >
        {(isAdmin || hasModuleAccess("user_management")) && (
          <NavItem href="/admin" icon={Users} active={location === "/admin"} inGroup>
            User Management
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("audit_log")) && (
          <NavItem href="/audit-log" icon={ShieldCheck} active={location === "/audit-log"} inGroup>
            Audit Log
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("settings")) && (
          <NavItem href="/settings" icon={Settings} active={location === "/settings"} inGroup>
            Settings
          </NavItem>
        )}
        {(isAdmin || hasModuleAccess("report_templates")) && (
          <NavItem href="/report-templates" icon={LayoutTemplate} active={location.startsWith("/report-templates")} inGroup>
            Report Design
          </NavItem>
        )}
      </NavGroup>
    </div>
  );

  const sidebarContent = (
    <SidebarCtx.Provider value={collapsed}>
      <TooltipProvider delayDuration={0}>
        {/* Header: logo + toggle */}
        <div className={`border-b border-border/50 flex items-center shrink-0 ${collapsed ? "justify-center py-4 px-2" : "px-4 py-4 gap-2"}`}>
          {!collapsed && (
            <img src={activeLogo} alt="BizOne" className="h-14 w-auto object-contain object-left max-w-[200px] flex-1 min-w-0" />
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <div className={`flex-1 overflow-y-auto ${collapsed ? "p-1.5" : "p-3"}`}>
          {navItems}
        </div>

        {/* Bottom: company + user */}
        <div className="border-t border-border/50 bg-muted/10 pt-2 shrink-0">
          <CompanyBadge />
          <UserMenu />
        </div>
      </TooltipProvider>
    </SidebarCtx.Provider>
  );

  return (
    <div
      className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/20"
      style={{ ["--app-sidebar-width" as string]: collapsed ? "3.5rem" : "16rem" }}
    >
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
