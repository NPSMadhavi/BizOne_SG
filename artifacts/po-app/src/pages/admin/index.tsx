import { useAuth } from "@/contexts/auth-context";
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
import { Trash2, UserPlus, ShieldAlert, Edit, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")),
  role: z.enum(["admin", "user"]),
  companyIds: z.array(z.number()).min(1, "Select at least one company"),
});

type UserFormValues = z.infer<typeof userSchema>;

function CompanyCheckboxes({
  companies,
  value,
  onChange,
}: {
  companies: Company[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      {companies.map(company => (
        <div key={company.id} className="flex items-center gap-2">
          <Checkbox
            id={`company-${company.id}`}
            checked={value.includes(company.id)}
            onCheckedChange={() => toggle(company.id)}
          />
          <label htmlFor={`company-${company.id}`} className="text-sm cursor-pointer flex-1">
            <span className="font-medium">{company.name}</span>
            <span className="text-muted-foreground ml-1.5">({company.country})</span>
          </label>
        </div>
      ))}
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
    defaultValues: { username: "", password: "", role: "user", companyIds: [] },
  });

  const editForm = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", role: "user", companyIds: [] },
  });

  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        username: editingUser.username,
        password: "",
        role: editingUser.role as "admin" | "user",
        companyIds: editingUser.companies?.map(c => c.id) ?? [],
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
      data: { username: values.username, password: values.password, role: values.role, companyIds: values.companyIds }
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "User created successfully." });
        setIsCreateOpen(false);
        form.reset({ username: "", password: "", role: "user", companyIds: [] });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
      }
    });
  }

  function onEditSubmit(values: UserFormValues) {
    if (!editingUser) return;
    const payload: any = { username: values.username, role: values.role, companyIds: values.companyIds };
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

  const UserFormFields = ({ control, isEdit = false }: { control: any; isEdit?: boolean }) => (
    <>
      <FormField control={control} name="username" render={({ field }) => (
        <FormItem>
          <FormLabel>Username</FormLabel>
          <FormControl><Input placeholder="johndoe" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={control} name="password" render={({ field }) => (
        <FormItem>
          <FormLabel>{isEdit ? "New Password (Optional)" : "Password"}</FormLabel>
          <FormControl>
            <Input type="password" placeholder={isEdit ? "Leave blank to keep unchanged" : "******"} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={control} name="role" render={({ field }) => (
        <FormItem>
          <FormLabel>Role</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={control} name="companyIds" render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Company Access
          </FormLabel>
          <FormControl>
            <CompanyCheckboxes
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
          <p className="text-muted-foreground mt-1">Manage system access, roles, and company permissions.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user and assign company access.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <UserFormFields control={form.control} />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details, role, and company access.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <UserFormFields control={editForm.control} isEdit />
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
                <th className="px-6 py-4 font-medium">Companies</th>
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
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {u.companies && u.companies.length > 0 ? (
                          u.companies.map(c => (
                            <Badge key={c.id} variant="outline" className="text-xs font-normal gap-1">
                              <Building2 className="h-2.5 w-2.5" />
                              {c.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">No companies assigned</span>
                        )}
                      </div>
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
