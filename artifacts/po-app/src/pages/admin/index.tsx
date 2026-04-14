import { useAuth } from "@/contexts/auth-context";
import { ALL_MODULES, MODULE_LABELS, type AppModule } from "@/contexts/auth-context";
import {
  useListUsers, getListUsersQueryKey, useCreateUser, useDeleteUser, useUpdateUser,
  useListCompanies, getListCompaniesQueryKey, type User, type Company,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, UserPlus, ShieldAlert, Edit, Building2, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MODULE_ICONS: Record<AppModule, string> = {
  purchase_orders: "📋",
  quotations: "📝",
  invoices: "🧾",
  delivery_orders: "🚚",
};

export interface CompanyAccessEntry {
  companyId: number;
  modules: string[];
}

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")),
  role: z.enum(["admin", "user", "external"]),
  companyAccess: z.array(z.object({
    companyId: z.number(),
    modules: z.array(z.string()).min(1, "Select at least one module"),
  })).min(1, "Select at least one company with module access"),
});

type UserFormValues = z.infer<typeof userSchema>;

function CompanyModuleSelector({
  companies,
  value,
  onChange,
}: {
  companies: Company[];
  value: CompanyAccessEntry[];
  onChange: (access: CompanyAccessEntry[]) => void;
}) {
  const selectedCompanyIds = value.map(v => v.companyId);

  const toggleCompany = (companyId: number) => {
    if (selectedCompanyIds.includes(companyId)) {
      onChange(value.filter(v => v.companyId !== companyId));
    } else {
      onChange([...value, { companyId, modules: [...ALL_MODULES] }]);
    }
  };

  const toggleModule = (companyId: number, mod: string) => {
    onChange(value.map(entry => {
      if (entry.companyId !== companyId) return entry;
      const mods = entry.modules.includes(mod)
        ? entry.modules.filter(m => m !== mod)
        : [...entry.modules, mod];
      return { ...entry, modules: mods };
    }));
  };

  const toggleAllModules = (companyId: number, checked: boolean) => {
    onChange(value.map(entry => {
      if (entry.companyId !== companyId) return entry;
      return { ...entry, modules: checked ? [...ALL_MODULES] : [] };
    }));
  };

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {companies.map(company => {
        const isSelected = selectedCompanyIds.includes(company.id);
        const entry = value.find(v => v.companyId === company.id);
        const allChecked = entry ? ALL_MODULES.every(m => entry.modules.includes(m)) : false;
        const someChecked = entry ? ALL_MODULES.some(m => entry.modules.includes(m)) : false;

        return (
          <div key={company.id} className="rounded-lg border bg-card overflow-hidden">
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer ${isSelected ? "bg-primary/5 border-b" : ""}`}
              onClick={() => toggleCompany(company.id)}
            >
              <Checkbox
                id={`company-${company.id}`}
                checked={isSelected}
                onCheckedChange={() => toggleCompany(company.id)}
                onClick={e => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{company.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{company.country}</p>
              </div>
              {isSelected && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rotate-90" />}
            </div>

            {isSelected && (
              <div className="px-3 py-2 bg-muted/30 space-y-1.5">
                <div className="flex items-center gap-2 pb-1.5 border-b border-border/50">
                  <Checkbox
                    id={`all-modules-${company.id}`}
                    checked={allChecked}
                    onCheckedChange={(checked) => toggleAllModules(company.id, !!checked)}
                  />
                  <label htmlFor={`all-modules-${company.id}`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer">
                    All Modules
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  {ALL_MODULES.map(mod => (
                    <div key={mod} className="flex items-center gap-2">
                      <Checkbox
                        id={`${company.id}-${mod}`}
                        checked={entry?.modules.includes(mod) ?? false}
                        onCheckedChange={() => toggleModule(company.id, mod)}
                      />
                      <label htmlFor={`${company.id}-${mod}`} className="text-xs cursor-pointer flex items-center gap-1">
                        <span>{MODULE_ICONS[mod as AppModule]}</span>
                        <span>{MODULE_LABELS[mod as AppModule]}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Admin() {
  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: isAdmin }
  });

  const { data: companies = [] } = useListCompanies({
    query: { queryKey: getListCompaniesQueryKey(), enabled: isAdmin }
  });

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", role: "user", companyAccess: [] },
  });

  const editForm = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", role: "user", companyAccess: [] },
  });

  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        username: editingUser.username,
        password: "",
        role: editingUser.role as "admin" | "user",
        companyAccess: editingUser.companies?.map(c => ({
          companyId: c.id,
          modules: (c as any).modules ?? [...ALL_MODULES],
        })) ?? [],
      });
    }
  }, [editingUser, editForm]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive/50" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  function onSubmit(values: UserFormValues) {
    createMutation.mutate({
      data: {
        username: values.username,
        password: values.password,
        role: values.role,
        companyAccess: values.companyAccess,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "User created successfully." });
        setIsCreateOpen(false);
        form.reset({ username: "", password: "", role: "user", companyAccess: [] });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
      }
    });
  }

  function onEditSubmit(values: UserFormValues) {
    if (!editingUser) return;
    const payload: any = {
      username: values.username,
      role: values.role,
      companyAccess: values.companyAccess,
    };
    if (values.password) payload.password = values.password;

    updateMutation.mutate({ id: editingUser.id, data: payload }, {
      onSuccess: () => {
        toast({ title: "Success", description: "User updated successfully." });
        setIsEditOpen(false);
        setEditingUser(null);
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
      }
    });
  }

  function handleDelete(id: number) {
    if (id === currentUser?.id) {
      toast({ title: "Error", description: "You cannot delete yourself.", variant: "destructive" });
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Success", description: "User deleted." });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
        }
      });
    }
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setIsEditOpen(true);
  }

  const UserFormContent = ({ f }: { f: ReturnType<typeof useForm<UserFormValues>> }) => (
    <>
      <FormField control={f.control} name="username" render={({ field }) => (
        <FormItem>
          <FormLabel>Username</FormLabel>
          <FormControl><Input placeholder="johndoe" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={f.control} name="password" render={({ field }) => (
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <Input type="password" placeholder="Leave blank to keep unchanged" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={f.control} name="role" render={({ field }) => (
        <FormItem>
          <FormLabel>Role</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="external">External User</SelectItem>
            </SelectContent>
          </Select>
          {field.value === "external" && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              External users can only see documents they created. Admins and regular users can still view their documents.
            </p>
          )}
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={f.control} name="companyAccess" render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Company & Module Access
          </FormLabel>
          <FormControl>
            <CompanyModuleSelector
              companies={companies}
              value={field.value ?? []}
              onChange={field.onChange}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage system access, roles, and module permissions per company.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user and configure their company and module access.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <UserFormContent f={form} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingUser(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details, role, and module access per company.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <UserFormContent f={editForm} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">Username</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Company & Module Access</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : !users || users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No users found.</td>
                </tr>
              ) : (
                users.map((u: User) => (
                  <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-2">
                        {u.username}
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-muted-foreground font-normal">(You)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={u.role === 'admin' ? 'default' : u.role === 'external' ? 'outline' : 'secondary'}
                        className={u.role === 'external' ? 'text-amber-600 border-amber-300 bg-amber-50' : ''}
                      >
                        {u.role === 'admin' ? 'Administrator' : u.role === 'external' ? 'External' : 'User'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-muted-foreground">All companies & modules</span>
                      ) : (
                        <div className="space-y-1.5">
                          {u.companies && u.companies.length > 0 ? u.companies.map(c => (
                            <div key={c.id} className="flex items-start gap-1.5">
                              <Badge variant="outline" className="text-xs font-normal gap-1 shrink-0">
                                <Building2 className="h-2.5 w-2.5" />
                                {c.name}
                              </Badge>
                              <div className="flex flex-wrap gap-1">
                                {((c as any).modules as string[] ?? ALL_MODULES).map(mod => (
                                  <span key={mod} className="text-xs bg-muted rounded px-1 py-0.5 text-muted-foreground">
                                    {MODULE_ICONS[mod as AppModule]} {MODULE_LABELS[mod as AppModule]}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )) : (
                            <span className="text-muted-foreground text-xs">No access assigned</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="hover:bg-muted" onClick={() => openEdit(u)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(u.id)}
                          disabled={u.id === currentUser?.id || deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
