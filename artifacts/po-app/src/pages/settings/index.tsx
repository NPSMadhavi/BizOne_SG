import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Shield, Percent, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user, logout, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gstInput, setGstInput] = useState<string>("");
  const [editing, setEditing] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useGetSettings({
    query: {
      queryKey: getGetSettingsQueryKey(),
    },
  });

  useEffect(() => {
    if (settings && !editing) {
      setGstInput(String(settings.gstRate));
    }
  }, [settings]);

  const updateSettings = useUpdateSettings();

  const handleSaveGst = () => {
    const rate = parseFloat(gstInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: "Invalid rate", description: "GST rate must be between 0 and 100.", variant: "destructive" });
      return;
    }
    updateSettings.mutate({ data: { gstRate: rate } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        setEditing(false);
        toast({ title: "Saved", description: "GST rate updated successfully." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage company preferences and account settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Tax Settings
          </CardTitle>
          <CardDescription>
            Configure the GST rate applied to all Purchase Orders, Quotations, and Invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <div className="h-10 bg-muted animate-pulse rounded-md" />
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs space-y-1.5">
                <Label htmlFor="gstRate">GST Rate (%)</Label>
                <div className="relative">
                  <Input
                    id="gstRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editing ? gstInput : (settings?.gstRate ?? 9)}
                    onChange={(e) => {
                      setEditing(true);
                      setGstInput(e.target.value);
                    }}
                    onFocus={() => {
                      setEditing(true);
                      setGstInput(String(settings?.gstRate ?? 9));
                    }}
                    disabled={!isAdmin}
                    className="pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current rate: <strong>{settings?.gstRate ?? 9}%</strong> GST (Singapore)
                </p>
              </div>
              {isAdmin && editing && (
                <Button onClick={handleSaveGst} disabled={updateSettings.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {updateSettings.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
          )}
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">Only administrators can change the GST rate.</p>
          )}
        </CardContent>
      </Card>

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
