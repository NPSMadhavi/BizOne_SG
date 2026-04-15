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
import { AuthProvider, useAuth, type AppModule } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";
import { useEffect } from "react";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/purchase-orders": "Purchase Orders",
  "/quotations": "Quotations",
  "/invoices": "Invoices",
  "/delivery-orders": "Delivery Orders",
  "/grn": "Goods Receipt Notes",
  "/stock": "Stock Items",
  "/vendors": "Vendors",
  "/customers": "Customers",
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
}

function ProtectedRoute({ component: Component, adminOnly = false, module }: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, selectedCompany, hasModuleAccess } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;

  const hasMultipleCompanies = (user.companies?.length ?? 0) > 1;
  if (!selectedCompany && hasMultipleCompanies) return <Redirect to="/select-company" />;

  if (adminOnly && !isAdmin) return <Redirect to="/dashboard" />;

  if (module && !hasModuleAccess(module)) return <AccessDenied />;

  return <Component />;
}

function Router() {
  useDocumentTitle();
  return (
    <Shell>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/select-company" component={SelectCompany} />
        <Route path="/">{() => <Redirect to="/dashboard" />}</Route>

        <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>

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
        <Route path="/grn">{() => <ProtectedRoute component={GrnList} module="purchase_orders" />}</Route>
        <Route path="/grn/:id">{() => <ProtectedRoute component={GrnView} module="purchase_orders" />}</Route>

        {/* Stock Items */}
        <Route path="/stock">{() => <ProtectedRoute component={StockList} />}</Route>

        {/* Directory */}
        <Route path="/vendors">{() => <ProtectedRoute component={VendorsPage} />}</Route>
        <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} />}</Route>

        <Route path="/admin">{() => <ProtectedRoute component={Admin} adminOnly={true} />}</Route>
        <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>

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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
