import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import SelectCompany from "@/pages/select-company/index";
import PurchaseOrderList from "@/pages/purchase-orders/list";
import PurchaseOrderNew from "@/pages/purchase-orders/new";
import PurchaseOrderView from "@/pages/purchase-orders/view";
import PurchaseOrderEdit from "@/pages/purchase-orders/edit";
import QuotationList from "@/pages/quotations/list";
import QuotationNew from "@/pages/quotations/new";
import QuotationView from "@/pages/quotations/view";
import QuotationEdit from "@/pages/quotations/edit";
import InvoiceList from "@/pages/invoices/list";
import InvoiceNew from "@/pages/invoices/new";
import InvoiceView from "@/pages/invoices/view";
import InvoiceEdit from "@/pages/invoices/edit";
import DeliveryOrderList from "@/pages/delivery-orders/list";
import DeliveryOrderNew from "@/pages/delivery-orders/new";
import DeliveryOrderView from "@/pages/delivery-orders/view";
import DeliveryOrderEdit from "@/pages/delivery-orders/edit";
import Admin from "@/pages/admin/index";
import Settings from "@/pages/settings/index";
import GrnList from "@/pages/grn/list";
import GrnView from "@/pages/grn/view";
import StockList from "@/pages/stock/list";
import VendorsPage from "@/pages/vendors/index";
import CustomersPage from "@/pages/customers/index";
import AddressBookPage from "@/pages/address-book/index";
import VendorInvoiceList from "@/pages/vendor-invoices/list";
import VendorInvoiceView from "@/pages/vendor-invoices/view";
import AuditLog from "@/pages/admin/audit-log";
import ChartOfAccounts from "@/pages/accounting/chart-of-accounts";
import JournalEntriesList from "@/pages/accounting/journal-entries";
import JournalEntryNew from "@/pages/accounting/journal-entry-new";
import JournalEntryView from "@/pages/accounting/journal-entry-view";
import ProfitLoss from "@/pages/accounting/profit-loss";
import GstF5 from "@/pages/accounting/gst-f5";
import ArAging from "@/pages/accounting/ar-aging";
import ApAging from "@/pages/accounting/ap-aging";
import BalanceSheet from "@/pages/accounting/balance-sheet";
import TrialBalance from "@/pages/accounting/trial-balance";
import CustomerStatement from "@/pages/accounting/customer-statement";
import GstF7 from "@/pages/accounting/gst-f7";
import VendorStatement from "@/pages/accounting/vendor-statement";
import GeneralLedger from "@/pages/accounting/general-ledger";
import { AuthProvider, useAuth, type AppModule } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";
import { InactivityTimeout } from "@/components/inactivity-timeout";
import { MaintenanceGuard } from "@/components/maintenance-guard";
import { useEffect } from "react";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/purchase-orders": "Purchase Orders",
  "/quotations": "Quotations",
  "/invoices": "Invoices",
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
  "/accounting/gst-f5": "GST F5 Return",
  "/accounting/ar-aging": "AR Aging Report",
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

        {/* Delivery Orders */}
        <Route path="/delivery-orders">{() => <ProtectedRoute component={DeliveryOrderList} module="delivery_orders" />}</Route>
        <Route path="/delivery-orders/new">{() => <ProtectedRoute component={DeliveryOrderNew} module="delivery_orders" />}</Route>
        <Route path="/delivery-orders/:id/edit">{() => <ProtectedRoute component={DeliveryOrderEdit} module="delivery_orders" />}</Route>
        <Route path="/delivery-orders/:id">{() => <ProtectedRoute component={DeliveryOrderView} module="delivery_orders" />}</Route>

        {/* Goods Receipt Notes */}
        <Route path="/grn">{() => <ProtectedRoute component={GrnList} module="grn" />}</Route>
        <Route path="/grn/:id">{() => <ProtectedRoute component={GrnView} module="grn" />}</Route>

        {/* Stock Items — requires stock_items access */}
        <Route path="/stock">{() => <ProtectedRoute component={StockList} module="stock_items" />}</Route>

        {/* Vendor Invoices — requires purchase_orders access */}
        <Route path="/vendor-invoices">{() => <ProtectedRoute component={VendorInvoiceList} module="purchase_orders" />}</Route>
        <Route path="/vendor-invoices/:id">{() => <ProtectedRoute component={VendorInvoiceView} module="purchase_orders" />}</Route>

        {/* Directory — scoped by relevant module */}
        <Route path="/vendors">{() => <ProtectedRoute component={VendorsPage} module="purchase_orders" />}</Route>
        <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} anyOf={["invoices", "quotations"]} />}</Route>
        <Route path="/address-book">{() => <ProtectedRoute component={AddressBookPage} anyOf={["purchase_orders", "invoices", "quotations", "delivery_orders"]} />}</Route>

        {/* Accounting — Singapore companies */}
        <Route path="/accounting/chart-of-accounts">{() => <ProtectedRoute component={ChartOfAccounts} />}</Route>
        <Route path="/accounting/journal-entries/new">{() => <ProtectedRoute component={JournalEntryNew} />}</Route>
        <Route path="/accounting/journal-entries/:id">{() => <ProtectedRoute component={JournalEntryView} />}</Route>
        <Route path="/accounting/journal-entries">{() => <ProtectedRoute component={JournalEntriesList} />}</Route>
        <Route path="/accounting/profit-loss">{() => <ProtectedRoute component={ProfitLoss} />}</Route>
        <Route path="/accounting/gst-f5">{() => <ProtectedRoute component={GstF5} />}</Route>
        <Route path="/accounting/ar-aging">{() => <ProtectedRoute component={ArAging} />}</Route>
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
              <InactivityTimeout />
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
