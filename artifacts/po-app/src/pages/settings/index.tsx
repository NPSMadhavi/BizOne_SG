import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, User, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your current session details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <User className="h-8 w-8" />
            </div>
            <div>
              <div className="font-semibold text-lg">{user?.username}</div>
              <div className="flex items-center gap-2 mt-1">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground capitalize">{user?.role}</span>
                {user?.role === 'admin' && (
                  <Badge variant="default" className="ml-2 text-xs py-0">System Admin</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Actions that affect your current session.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between border rounded-md p-4 border-destructive/20 bg-destructive/5">
            <div>
              <div className="font-medium text-destructive">End Session</div>
              <div className="text-sm text-destructive/80 mt-1">Sign out of your current account.</div>
            </div>
            <Button variant="destructive" onClick={() => logout()} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
