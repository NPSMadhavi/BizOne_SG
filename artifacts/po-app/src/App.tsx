import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
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
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType, adminOnly?: boolean }) {
  const { user, isLoading, isAdmin } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  if (!user) return <Redirect to="/login" />;
  if (adminOnly && !isAdmin) return <Redirect to="/dashboard" />;
  return <Component />;
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/">{() => <Redirect to="/dashboard" />}</Route>

        <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>

        {/* Purchase Orders */}
        <Route path="/purchase-orders">{() => <ProtectedRoute component={PurchaseOrderList} />}</Route>
        <Route path="/purchase-orders/new">{() => <ProtectedRoute component={PurchaseOrderNew} />}</Route>
        <Route path="/purchase-orders/:id/edit">{() => <ProtectedRoute component={PurchaseOrderEdit} />}</Route>
        <Route path="/purchase-orders/:id">{() => <ProtectedRoute component={PurchaseOrderView} />}</Route>

        {/* Quotations */}
        <Route path="/quotations">{() => <ProtectedRoute component={QuotationList} />}</Route>
        <Route path="/quotations/new">{() => <ProtectedRoute component={QuotationNew} />}</Route>
        <Route path="/quotations/:id/edit">{() => <ProtectedRoute component={QuotationEdit} />}</Route>
        <Route path="/quotations/:id">{() => <ProtectedRoute component={QuotationView} />}</Route>

        {/* Invoices */}
        <Route path="/invoices">{() => <ProtectedRoute component={InvoiceList} />}</Route>
        <Route path="/invoices/new">{() => <ProtectedRoute component={InvoiceNew} />}</Route>
        <Route path="/invoices/:id/edit">{() => <ProtectedRoute component={InvoiceEdit} />}</Route>
        <Route path="/invoices/:id">{() => <ProtectedRoute component={InvoiceView} />}</Route>

        {/* Delivery Orders */}
        <Route path="/delivery-orders">{() => <ProtectedRoute component={DeliveryOrderList} />}</Route>
        <Route path="/delivery-orders/new">{() => <ProtectedRoute component={DeliveryOrderNew} />}</Route>
        <Route path="/delivery-orders/:id/edit">{() => <ProtectedRoute component={DeliveryOrderEdit} />}</Route>
        <Route path="/delivery-orders/:id">{() => <ProtectedRoute component={DeliveryOrderView} />}</Route>

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
