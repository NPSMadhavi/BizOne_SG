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
import Admin from "@/pages/admin/index";
import Settings from "@/pages/settings/index";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Shell } from "@/components/layout/shell";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType, adminOnly?: boolean }) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/">
          {() => <Redirect to="/dashboard" />}
        </Route>
        
        {/* Protected Routes */}
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/purchase-orders">
          {() => <ProtectedRoute component={PurchaseOrderList} />}
        </Route>
        <Route path="/purchase-orders/new">
          {() => <ProtectedRoute component={PurchaseOrderNew} />}
        </Route>
        <Route path="/purchase-orders/:id">
          {() => <ProtectedRoute component={PurchaseOrderView} />}
        </Route>
        <Route path="/admin">
          {() => <ProtectedRoute component={Admin} adminOnly={true} />}
        </Route>
        <Route path="/settings">
          {() => <ProtectedRoute component={Settings} />}
        </Route>

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
