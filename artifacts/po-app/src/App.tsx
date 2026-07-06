import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider, useAuth, type AppModule } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";
import { MaintenanceGuard } from "@/components/maintenance-guard";

// ── Eagerly-loaded shells (tiny, always needed) ────────────────────────────
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import SelectCompany from "@/pages/select-company/index";

// ── Route-level lazy bundles ───────────────────────────────────────────────
const Dashboard = lazy(() => import("@/pages/dashboard"));

const PurchaseOrderList = lazy(() => import("@/pages/purchase-orders/list"));
const PurchaseOrderNew  = lazy(() => import("@/pages/purchase-orders/new"));
const PurchaseOrderView = lazy(() => import("@/pages/purchase-orders/view"));
const PurchaseOrderEdit = lazy(() => import("@/pages/purchase-orders/edit"));

const QuotationList = lazy(() => import("@/pages/quotations/list"));
const QuotationNew  = lazy(() => import("@/pages/quotations/new"));
const QuotationView = lazy(() => import("@/pages/quotations/view"));
const QuotationEdit = lazy(() => import("@/pages/quotations/edit"));

const InvoiceList = lazy(() => import("@/pages/invoices/list"));
const InvoiceNew  = lazy(() => import("@/pages/invoices/new"));
const InvoiceView = lazy(() => import("@/pages/invoices/view"));
const InvoiceEdit = lazy(() => import("@/pages/invoices/edit"));

const CreditNoteList = lazy(() => import("@/pages/credit-notes/list"));
const CreditNoteNew  = lazy(() => import("@/pages/credit-notes/new"));
const CreditNoteView = lazy(() => import("@/pages/credit-notes/view"));
const CreditNoteEdit = lazy(() => import("@/pages/credit-notes/edit"));

const DeliveryOrderList = lazy(() => import("@/pages/delivery-orders/list"));
const DeliveryOrderNew  = lazy(() => import("@/pages/delivery-orders/new"));
const DeliveryOrderView = lazy(() => import("@/pages/delivery-orders/view"));
const DeliveryOrderEdit = lazy(() => import("@/pages/delivery-orders/edit"));

const GrnList = lazy(() => import("@/pages/grn/list"));
const GrnView = lazy(() => import("@/pages/grn/view"));

const StockList = lazy(() => import("@/pages/stock/list"));

const VendorsPage    = lazy(() => import("@/pages/vendors/index"));
const CustomersPage  = lazy(() => import("@/pages/customers/index"));
const AddressBookPage = lazy(() => import("@/pages/address-book/index"));

const VendorInvoiceList = lazy(() => import("@/pages/vendor-invoices/list"));
const VendorInvoiceView = lazy(() => import("@/pages/vendor-invoices/view"));

const Admin    = lazy(() => import("@/pages/admin/index"));
const Settings = lazy(() => import("@/pages/settings/index"));
const AuditLog = lazy(() => import("@/pages/admin/audit-log"));

const ChartOfAccounts    = lazy(() => import("@/pages/accounting/chart-of-accounts"));
const JournalEntriesList = lazy(() => import("@/pages/accounting/journal-entries"));
const JournalEntryNew    = lazy(() => import("@/pages/accounting/journal-entry-new"));
const JournalEntryView   = lazy(() => import("@/pages/accounting/journal-entry-view"));
const ProfitLoss         = lazy(() => import("@/pages/accounting/profit-loss"));
const GstF5              = lazy(() => import("@/pages/accounting/gst-f5"));
const ArAging            = lazy(() => import("@/pages/accounting/ar-aging"));
const ApAging            = lazy(() => import("@/pages/accounting/ap-aging"));
const ArCollections      = lazy(() => import("@/pages/accounting/ar-collections"));
const ApPayments         = lazy(() => import("@/pages/accounting/ap-payments"));
const BalanceSheet       = lazy(() => import("@/pages/accounting/balance-sheet"));
const TrialBalance       = lazy(() => import("@/pages/accounting/trial-balance"));
const CustomerStatement  = lazy(() => import("@/pages/accounting/customer-statement"));
const GstF7              = lazy(() => import("@/pages/accounting/gst-f7"));
const VendorStatement    = lazy(() => import("@/pages/accounting/vendor-statement"));
const GeneralLedger      = lazy(() => import("@/pages/accounting/general-ledger"));
const CashFlowStatement  = lazy(() => import("@/pages/accounting/cash-flow"));
const IafPage            = lazy(() => import("@/pages/accounting/iaf"));
const GstIoListing       = lazy(() => import("@/pages/accounting/gst-io"));
const WhtRegister        = lazy(() => import("@/pages/accounting/wht"));
const EciPage            = lazy(() => import("@/pages/accounting/eci"));
const FormCsPage         = lazy(() => import("@/pages/accounting/form-cs"));

// ── Route title map ────────────────────────────────────────────────────────
const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/purchase-orders": "Purchase Orders",
  "/quotations": "Quotations",
  "/invoices": "Invoices",
  "/credit-notes": "Credit Notes",
  "/delivery-orders": "Delivery Orders",
  "/grn": "Goods Receipt Notes",
  "/stock": "Stock Items",
  "/vendor-invoices": "Vendor Invoices",
  "/vendors": "Vendors",
  "/customers": "Customers",
  "/address-book": "Address Book",
  "/accounting/chart-of-accounts": "Chart of Accounts",
  "/accounting/journal-entries": "Journal Entries",
  "/accounting/profit-loss": "Profit & Loss",
  "/accounting/cash-flow": "Cash Flow Statement",
  "/accounting/iaf": "IRAS Audit File (IAF)",
  "/accounting/gst-f5": "GST F5 Return",
  "/accounting/ar": "AR Collections",
  "/accounting/ar-aging": "AR Aging Report",
  "/accounting/ap": "AP Payments",
  "/accounting/ap-aging": "AP Aging Report",
  "/accounting/balance-sheet": "Balance Sheet",
  "/accounting/trial-balance": "Trial Balance",
  "/accounting/customer-statement": "Customer Statement",
  "/accounting/gst-f7": "GST F7 Amended Return",
  "/accounting/vendor-statement": "Vendor Statement",
  "/accounting/general-ledger": "General Ledger",
  "/admin": "User Management",
  "/settings": "Settings",
  "/select-company": "Select Company",
  "/login": "Sign In",
};

function useDocumentTitle() {
  const [location] = useLocation();
  const { selectedCompany } = useAuth();

  useEffect(() => {
    const matchedKey = Object.keys(ROUTE_TITLES).find(key =>
      location === key || location.startsWith(key + "/")
    );
    const pageTitle = matchedKey ? ROUTE_TITLES[matchedKey] : null;
    const companyName = selectedCompany?.name ?? "RSV Infotech";

    if (pageTitle && pageTitle !== "Sign In" && pageTitle !== "Select Company") {
      document.title = `${companyName} - ${pageTitle}`;
    } else if (pageTitle) {
      document.title = `RSV Infotech - ${pageTitle}`;
    } else {
      document.title = companyName;
    }
  }, [location, selectedCompany]);
}

const queryClient = new QueryClient();

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3 text-center">
      <div className="text-5xl">🚫</div>
      <h2 className="text-2xl font-bold">Access Denied</h2>
      <p className="text-muted-foreground max-w-sm">
        You do not have permission to access this module for the selected company.
      </p>
    </div>
  );
}

interface ProtectedRouteProps {
  component: React.ComponentType;
  adminOnly?: boolean;
  module?: AppModule;
  anyOf?: AppModule[];
}

function getFirstAccessiblePath(isAdmin: boolean, hasModuleAccess: (m: any) => boolean): string {
  if (isAdmin || hasModuleAccess("dashboard")) return "/dashboard";
  if (hasModuleAccess("purchase_orders")) return "/purchase-orders";
  if (hasModuleAccess("invoices")) return "/invoices";
  if (hasModuleAccess("quotations")) return "/quotations";
  if (hasModuleAccess("delivery_orders")) return "/delivery-orders";
  return "/login";
}

function ProtectedRoute({ component: Component, adminOnly = false, module, anyOf }: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, selectedCompany, hasModuleAccess } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;

  const hasMultipleCompanies = (user.companies?.length ?? 0) > 1;
  if (!selectedCompany && hasMultipleCompanies) return <Redirect to="/select-company" />;

  if (adminOnly && !isAdmin) return <Redirect to={getFirstAccessiblePath(isAdmin, hasModuleAccess)} />;

  if (module && !isAdmin && !hasModuleAccess(module)) return <AccessDenied />;

  if (anyOf && !isAdmin && !anyOf.some((m) => hasModuleAccess(m))) return <AccessDenied />;

  return <Component />;
}

function SmartHomeRedirect() {
  const { user, isLoading, isAdmin, selectedCompany, hasModuleAccess } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  const hasMultiple = (user.companies?.length ?? 0) > 1;
  if (!selectedCompany && hasMultiple) return <Redirect to="/select-company" />;
  return <Redirect to={getFirstAccessiblePath(isAdmin, hasModuleAccess)} />;
}

function Router() {
  useDocumentTitle();
  return (
    <Shell>
      <Suspense fallback={<LoadingSpinner />}>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/select-company" component={SelectCompany} />
          <Route path="/">{() => <SmartHomeRedirect />}</Route>

          <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} module="dashboard" />}</Route>

          {/* Purchase Orders */}
          <Route path="/purchase-orders">{() => <ProtectedRoute component={PurchaseOrderList} module="purchase_orders" />}</Route>
          <Route path="/purchase-orders/new">{() => <ProtectedRoute component={PurchaseOrderNew} module="purchase_orders" />}</Route>
          <Route path="/purchase-orders/:id/edit">{() => <ProtectedRoute component={PurchaseOrderEdit} module="purchase_orders" />}</Route>
          <Route path="/purchase-orders/:id">{() => <ProtectedRoute component={PurchaseOrderView} module="purchase_orders" />}</Route>

          {/* Quotations */}
          <Route path="/quotations">{() => <ProtectedRoute component={QuotationList} module="quotations" />}</Route>
          <Route path="/quotations/new">{() => <ProtectedRoute component={QuotationNew} module="quotations" />}</Route>
          <Route path="/quotations/:id/edit">{() => <ProtectedRoute component={QuotationEdit} module="quotations" />}</Route>
          <Route path="/quotations/:id">{() => <ProtectedRoute component={QuotationView} module="quotations" />}</Route>

          {/* Invoices */}
          <Route path="/invoices">{() => <ProtectedRoute component={InvoiceList} module="invoices" />}</Route>
          <Route path="/invoices/new">{() => <ProtectedRoute component={InvoiceNew} module="invoices" />}</Route>
          <Route path="/invoices/:id/edit">{() => <ProtectedRoute component={InvoiceEdit} module="invoices" />}</Route>
          <Route path="/invoices/:id">{() => <ProtectedRoute component={InvoiceView} module="invoices" />}</Route>

          {/* Credit Notes */}
          <Route path="/credit-notes">{() => <ProtectedRoute component={CreditNoteList} module="credit_notes" />}</Route>
          <Route path="/credit-notes/new">{() => <ProtectedRoute component={CreditNoteNew} module="credit_notes" />}</Route>
          <Route path="/credit-notes/:id/edit">{() => <ProtectedRoute component={CreditNoteEdit} module="credit_notes" />}</Route>
          <Route path="/credit-notes/:id">{() => <ProtectedRoute component={CreditNoteView} module="credit_notes" />}</Route>

          {/* Delivery Orders */}
          <Route path="/delivery-orders">{() => <ProtectedRoute component={DeliveryOrderList} module="delivery_orders" />}</Route>
          <Route path="/delivery-orders/new">{() => <ProtectedRoute component={DeliveryOrderNew} module="delivery_orders" />}</Route>
          <Route path="/delivery-orders/:id/edit">{() => <ProtectedRoute component={DeliveryOrderEdit} module="delivery_orders" />}</Route>
          <Route path="/delivery-orders/:id">{() => <ProtectedRoute component={DeliveryOrderView} module="delivery_orders" />}</Route>

          {/* Goods Receipt Notes */}
          <Route path="/grn">{() => <ProtectedRoute component={GrnList} module="grn" />}</Route>
          <Route path="/grn/:id">{() => <ProtectedRoute component={GrnView} module="grn" />}</Route>

          {/* Stock Items */}
          <Route path="/stock">{() => <ProtectedRoute component={StockList} module="stock_items" />}</Route>

          {/* Vendor Invoices */}
          <Route path="/vendor-invoices">{() => <ProtectedRoute component={VendorInvoiceList} module="purchase_orders" />}</Route>
          <Route path="/vendor-invoices/:id">{() => <ProtectedRoute component={VendorInvoiceView} module="purchase_orders" />}</Route>

          {/* Directory */}
          <Route path="/vendors">{() => <ProtectedRoute component={VendorsPage} module="purchase_orders" />}</Route>
          <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} anyOf={["invoices", "quotations"]} />}</Route>
          <Route path="/address-book">{() => <ProtectedRoute component={AddressBookPage} anyOf={["purchase_orders", "invoices", "quotations", "delivery_orders"]} />}</Route>

          {/* Accounting */}
          <Route path="/accounting/chart-of-accounts">{() => <ProtectedRoute component={ChartOfAccounts} />}</Route>
          <Route path="/accounting/journal-entries/new">{() => <ProtectedRoute component={JournalEntryNew} />}</Route>
          <Route path="/accounting/journal-entries/:id">{() => <ProtectedRoute component={JournalEntryView} />}</Route>
          <Route path="/accounting/journal-entries">{() => <ProtectedRoute component={JournalEntriesList} />}</Route>
          <Route path="/accounting/profit-loss">{() => <ProtectedRoute component={ProfitLoss} />}</Route>
          <Route path="/accounting/cash-flow">{() => <ProtectedRoute component={CashFlowStatement} />}</Route>
          <Route path="/accounting/iaf">{() => <ProtectedRoute component={IafPage} />}</Route>
          <Route path="/accounting/gst-io">{() => <ProtectedRoute component={GstIoListing} />}</Route>
          <Route path="/accounting/wht">{() => <ProtectedRoute component={WhtRegister} />}</Route>
          <Route path="/accounting/eci">{() => <ProtectedRoute component={EciPage} />}</Route>
          <Route path="/accounting/form-cs">{() => <ProtectedRoute component={FormCsPage} />}</Route>
          <Route path="/accounting/gst-f5">{() => <ProtectedRoute component={GstF5} />}</Route>
          <Route path="/accounting/ar">{() => <ProtectedRoute component={ArCollections} />}</Route>
          <Route path="/accounting/ar-aging">{() => <ProtectedRoute component={ArAging} />}</Route>
          <Route path="/accounting/ap">{() => <ProtectedRoute component={ApPayments} />}</Route>
          <Route path="/accounting/ap-aging">{() => <ProtectedRoute component={ApAging} />}</Route>
          <Route path="/accounting/balance-sheet">{() => <ProtectedRoute component={BalanceSheet} />}</Route>
          <Route path="/accounting/trial-balance">{() => <ProtectedRoute component={TrialBalance} />}</Route>
          <Route path="/accounting/customer-statement">{() => <ProtectedRoute component={CustomerStatement} />}</Route>
          <Route path="/accounting/gst-f7">{() => <ProtectedRoute component={GstF7} />}</Route>
          <Route path="/accounting/vendor-statement">{() => <ProtectedRoute component={VendorStatement} />}</Route>
          <Route path="/accounting/general-ledger">{() => <ProtectedRoute component={GeneralLedger} />}</Route>

          {/* System — admin only */}
          <Route path="/admin">{() => <ProtectedRoute component={Admin} adminOnly={true} />}</Route>
          <Route path="/settings">{() => <ProtectedRoute component={Settings} adminOnly={true} />}</Route>
          <Route path="/audit-log">{() => <ProtectedRoute component={AuditLog} adminOnly={true} />}</Route>

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <MaintenanceGuard>
              <Router />
            </MaintenanceGuard>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
