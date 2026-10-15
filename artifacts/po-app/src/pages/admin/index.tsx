import { useAuth } from "@/contexts/auth-context";
import { MODULE_LABELS, MODULE_GROUPS, ALL_MODULES, POS_CHANNEL_MODULES, modulesForBusinessType, type AppModule, type ModuleGroup } from "@/contexts/auth-modules";

/**
 * Older users stored one Point of Sale grant and no channel keys.
 * That still means every channel. A list that already names channels stays as ticked.
 */
function expandLegacyPosModules(modules: string[]): string[] {
  const named = POS_CHANNEL_MODULES.filter((channel) => modules.includes(channel));
  if (named.length > 0) return [...modules];
  if (!modules.includes("point_of_sale")) return [...modules];
  return [...new Set([...modules, ...POS_CHANNEL_MODULES])];
}

/**
 * Keep the ticks the user just changed.
 * point_of_sale is only a parent flag: it must not turn a cleared channel back on.
 */
function syncPosParent(modules: string[]): string[] {
  const selected = new Set(modules);
  const allChannels = POS_CHANNEL_MODULES.every((channel) => selected.has(channel));
  if (allChannels) selected.add("point_of_sale");
  else selected.delete("point_of_sale");
  return [...selected];
}
import {
  useListUsers, getListUsersQueryKey, useCreateUser, useDeleteUser, useUpdateUser, useListCompanies,
  type User, type Company,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { Trash2, UserPlus, ShieldAlert, Edit, Building2, ArrowLeft, Plus, ChevronDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CompanyAccessEntry {
  companyId: number;
  modules: string[];
}

type EditorMode = "list" | "create" | "edit";

type CompanyRole = { id: number; name: string };

type FormState = {
  username: string;
  password: string;
  role: "admin" | "user" | "external" | "accountant";
  roleId: number | null;
  companyAccess: CompanyAccessEntry[];
  salesPersonId: number | null;
  salesPersonName: string;
  showCreateRole: boolean;
  newRoleName: string;
};

const EMPTY_FORM: FormState = {
  username: "",
  password: "",
  role: "user",
  roleId: null,
  companyAccess: [],
  salesPersonId: null,
  salesPersonName: "",
  showCreateRole: false,
  newRoleName: "",
};

const BUILTIN_ROLES: { value: FormState["role"]; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Administrator" },
  { value: "accountant", label: "Accountant" },
  { value: "external", label: "External User" },
];

const CREATE_ROLE_VALUE = "__create_role__";

const BUILTIN_ROLE_DB_NAMES = new Set(["administrator", "employee", "accountant"]);

function roleSelectValue(form: FormState): string {
  if (form.roleId != null) return `custom-${form.roleId}`;
  return form.role;
}

function isBuiltinRoleName(name: string) {
  return BUILTIN_ROLE_DB_NAMES.has(name.trim().toLowerCase());
}

/** Normalize display/legacy role names from API into form enum values. */
function toFormRole(value: string | null | undefined): FormState["role"] {
  const v = (value || "user").trim().toLowerCase();
  if (v === "admin" || v === "administrator") return "admin";
  if (v === "accountant") return "accountant";
  if (v === "external") return "external";
  if (v === "user" || v === "employee") return "user";
  return "user";
}

function salesPersonOptionLabel(person: { name?: string; employmentCode?: string }) {
  const name = String(person.name || "").trim();
  const code = String(person.employmentCode || "").trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "Sales person";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Modules laid out like the sidebar: group headers + items. */
function SidebarStyleModules({
  company,
  modules,
  onChange,
}: {
  company: Company;
  modules: string[];
  onChange: (next: string[]) => void;
}) {
  const isSg = company.country?.toLowerCase() === "singapore" || company.country?.toUpperCase() === "SG";
  const allowed = modulesForBusinessType((company as { businessType?: string | null }).businessType);
  const visibleGroups = MODULE_GROUPS
    .filter((g: ModuleGroup) => !g.sgOnly || isSg)
    .map((group) => ({
      ...group,
      modules: allowed ? group.modules.filter((mod) => allowed.includes(mod)) : group.modules,
    }))
    .filter((group) => group.modules.length > 0);

  const toggleModule = (mod: string) => {
    const next = modules.includes(mod)
      ? modules.filter((m) => m !== mod)
      : [...modules, mod];
    onChange(next);
  };

  const toggleGroup = (groupMods: string[], checked: boolean) => {
    const next = checked
      ? [...new Set([...modules, ...groupMods])]
      : modules.filter((m) => !groupMods.includes(m) && m !== "point_of_sale");
    onChange(next);
  };

  return (
    <div className="space-y-5 pl-6 pt-1">
      {visibleGroups.map((group) => {
        const groupMods = group.modules as string[];
        const allIn = groupMods.every((m) => modules.includes(m));
        const someIn = groupMods.some((m) => modules.includes(m));

        return (
          <div key={group.id} className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#2563EB] accent-[#2563EB]"
                  checked={allIn}
                  ref={(el) => {
                    if (el) el.indeterminate = someIn && !allIn;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleGroup(groupMods, e.target.checked);
                  }}
                />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">
                {group.label}
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-6">
              {group.modules.map((mod) => (
                <label key={mod} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#2563EB] accent-[#2563EB]"
                    checked={modules.includes(mod)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleModule(mod);
                    }}
                  />
                  <span className="text-sm text-[#111827]">
                    {MODULE_LABELS[mod as AppModule] ?? mod}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyModuleSelector({
  companies,
  companyAccess,
  onToggleCompany,
  onChangeModules,
}: {
  companies: Company[];
  companyAccess: CompanyAccessEntry[];
  onToggleCompany: (companyId: number, checked: boolean) => void;
  onChangeModules: (companyId: number, modules: string[]) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[#E5E7EB] bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-[#111827]">Companies</p>
        <p className="text-xs text-[#6B7280] mt-0.5">Tick a company, then choose the modules this user can see.</p>
      </div>
      {companies.length === 0 ? (
        <p className="text-sm text-[#6B7280]">No companies available.</p>
      ) : (
        companies.map((company) => {
          const entry = companyAccess.find((c) => Number(c.companyId) === Number(company.id));
          const checked = !!entry;
          return (
            <div key={company.id} className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#2563EB] accent-[#2563EB]"
                  checked={checked}
                  onChange={(e) => onToggleCompany(company.id, e.target.checked)}
                />
                <span className="text-sm font-medium text-[#111827]">{company.name}</span>
              </label>
              {checked && (
                <SidebarStyleModules
                  company={company}
                  modules={entry?.modules ?? []}
                  onChange={(modules) => onChangeModules(company.id, modules)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Admin() {
  const { isAdmin, user: currentUser, hasPermission, selectedCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<EditorMode>("list");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [salesPersonOpen, setSalesPersonOpen] = useState(false);
  const salesPersonBoxRef = useRef<HTMLDivElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const moduleMemory = useRef<Record<number, string[]>>({});

  const canView = isAdmin || hasPermission("user_management:view");
  const canCreate = isAdmin || hasPermission("user_management:create");
  const canEdit = isAdmin || hasPermission("user_management:edit");
  const canDelete = isAdmin || hasPermission("user_management:delete");

  const activeCompany = selectedCompany as Company | null;
  const activeCompanyId = activeCompany?.id ?? null;

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: canView },
  });

  const { data: assignableCompanies = [] } = useListCompanies({
    query: { enabled: canView && (mode === "create" || mode === "edit") },
  });

  const userList = users ?? [];
  const companyOptions = useMemo(() => {
    const byId = new Map<number, Company>();
    for (const company of assignableCompanies) byId.set(company.id, company);
    for (const company of editingUser?.companies ?? []) {
      if (!byId.has(company.id)) byId.set(company.id, company as Company);
    }
    return [...byId.values()];
  }, [assignableCompanies, editingUser]);
  const { page, setPage, totalPages, paginatedItems: paginatedUsers } = usePagination(userList);

  const { data: companyRoles = [] } = useQuery<CompanyRole[]>({
    queryKey: ["/api/roles", activeCompanyId],
    queryFn: async () => {
      const res = await fetch("/api/roles", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load roles");
      return res.json();
    },
    enabled: canView && !!activeCompanyId && (mode === "create" || mode === "edit"),
  });

  const customRoles = useMemo(
    () => companyRoles.filter((r) => !isBuiltinRoleName(r.name)),
    [companyRoles],
  );

  const { salesPersons } = useSalesPersons();
  const createMutation = useCreateUser();

  useEffect(() => {
    if (!salesPersonOpen) return;
    const close = (event: MouseEvent) => {
      if (!salesPersonBoxRef.current?.contains(event.target as Node)) setSalesPersonOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [salesPersonOpen]);
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive/50" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  function setCompanyModules(companyId: number, modules: string[]) {
    const id = Number(companyId);
    moduleMemory.current[id] = syncPosParent(modules);
    setForm((f) => {
      const others = f.companyAccess.filter((c) => Number(c.companyId) !== id);
      return { ...f, companyAccess: [...others, { companyId: id, modules: moduleMemory.current[id] }] };
    });
  }

  function toggleCompany(companyId: number, checked: boolean) {
    const id = Number(companyId);
    setForm((f) => {
      if (checked) {
        if (f.companyAccess.some((c) => Number(c.companyId) === id)) return f;
        const modules = moduleMemory.current[id] ?? [];
        return { ...f, companyAccess: [...f.companyAccess, { companyId: id, modules }] };
      }
      const existing = f.companyAccess.find((c) => Number(c.companyId) === id);
      if (existing) moduleMemory.current[id] = existing.modules;
      return { ...f, companyAccess: f.companyAccess.filter((c) => Number(c.companyId) !== id) };
    });
  }

  function savedCompanyAccess(user: User): CompanyAccessEntry[] {
    return (user.companies ?? []).map((c) => ({
      companyId: Number(c.id),
      modules: Array.isArray((c as { modules?: string[] }).modules)
        ? expandLegacyPosModules((c as { modules: string[] }).modules.filter((m) => (ALL_MODULES as readonly string[]).includes(m)))
        : [],
    }));
  }

  function openCreate() {
    setEditingUser(null);
    moduleMemory.current = {};
    setForm({
      ...EMPTY_FORM,
      username: "",
      password: "",
      role: "user",
      roleId: null,
      showCreateRole: false,
      newRoleName: "",
      companyAccess: [],
      salesPersonId: null,
      salesPersonName: "",
    });
    setFormError("");
    setSalesPersonOpen(false);
    setMode("create");
    // Clear any browser autofill that may land after mount
    requestAnimationFrame(() => {
      setForm((f) => ({ ...f, username: "", password: "" }));
    });
  }

  function openEdit(user: User) {
    setEditingUser(user);
    const saved = savedCompanyAccess(user);
    moduleMemory.current = Object.fromEntries(saved.map((entry) => [entry.companyId, entry.modules]));
    const userRoleId = (user as any).roleId as number | null | undefined;
    const userRoleName = (user as any).roleName as string | null | undefined;
    const useCustomRole =
      userRoleId != null &&
      userRoleName &&
      !isBuiltinRoleName(userRoleName) &&
      user.role !== "external";
    setForm({
      username: user.username,
      password: "",
      role: toFormRole(user.role),
      roleId: useCustomRole ? userRoleId! : null,
      showCreateRole: false,
      newRoleName: "",
      companyAccess: saved,
      salesPersonId: (() => {
        const raw = (user as { salesPersonId?: number | string | null }).salesPersonId
          ?? (user as { salesPerson?: { id?: number | string | null } | null }).salesPerson?.id;
        const id = Number(raw);
        return Number.isFinite(id) && id > 0 ? id : null;
      })(),
      salesPersonName: (() => {
        const person = (user as { salesPerson?: { name?: string; employmentCode?: string } | null }).salesPerson;
        if (!person?.name && !person?.employmentCode) return "";
        return salesPersonOptionLabel(person);
      })(),
    });
    setFormError("");
    setSalesPersonOpen(false);
    setMode("edit");
  }

  function backToList() {
    setMode("list");
    setEditingUser(null);
    moduleMemory.current = {};
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function validate(): string | null {
    if (!form.username.trim()) return "Email is required.";
    if (!isEmail(form.username)) return "Enter a valid email address.";
    if (mode === "create" && form.password.length < 6) return "Password must be at least 6 characters.";
    if (mode === "edit" && form.password && form.password.length < 6) return "Password must be at least 6 characters.";
    if (form.role !== "admin") {
      if (form.companyAccess.length === 0) return "Select a company.";
      if (form.companyAccess.every((c) => c.modules.length === 0)) return "Select at least one module for the selected company.";
    }
    return null;
  }

  function buildCompanyAccessPayload(): CompanyAccessEntry[] {
    if (form.role === "admin") return [];
    const sanitize = (mods: string[]) =>
      mods.filter((m) => (ALL_MODULES as readonly string[]).includes(m));
    return form.companyAccess
      .map((entry) => ({ companyId: entry.companyId, modules: sanitize(entry.modules) }))
      .filter((entry) => entry.modules.length > 0);
  }

  function onSave() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError("");
    const companyAccess = buildCompanyAccessPayload();

    if (mode === "create") {
      createMutation.mutate(
        {
          data: {
            username: form.username.trim().toLowerCase(),
            password: form.password,
            role: form.role,
            companyAccess,
            salesPersonId: form.salesPersonId,
            ...(form.roleId != null ? { roleId: form.roleId } : {}),
          } as any,
        },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "User created successfully." });
            queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            backToList();
          },
          onError: (error: any) => {
            toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
          },
        },
      );
      return;
    }

    if (!editingUser) return;
    const payload: any = {
      username: form.username.trim().toLowerCase(),
      role: form.role,
      companyAccess,
      salesPersonId: form.salesPersonId,
      roleId: form.roleId,
    };
    if (form.password) payload.password = form.password;

    updateMutation.mutate(
      { id: editingUser.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "User updated successfully." });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          backToList();
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
        },
      },
    );
  }

  function confirmDelete() {
    if (deleteId == null) return;
    if (deleteId === currentUser?.id) {
      toast({ title: "Error", description: "You cannot delete yourself.", variant: "destructive" });
      setDeleteId(null);
      return;
    }
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "User deleted." });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setDeleteId(null);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
          setDeleteId(null);
        },
      },
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  async function handleCreateRole() {
    const name = form.newRoleName.trim();
    if (name.length < 2) {
      toast({
        title: "Name required",
        description: "Role name must be at least 2 characters.",
        variant: "destructive",
      });
      return;
    }
    setCreatingRole(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Failed to create role");
      await queryClient.invalidateQueries({ queryKey: ["/api/roles", activeCompanyId] });
      setForm((f) => ({
        ...f,
        roleId: data.id,
        role: "user",
        showCreateRole: false,
        newRoleName: "",
      }));
      toast({ title: "Role created", description: `"${data.name}" is now selected.` });
    } catch (err: any) {
      toast({
        title: "Could not create role",
        description: err.message || "Failed to create role",
        variant: "destructive",
      });
    } finally {
      setCreatingRole(false);
    }
  }

  if (mode === "create" || mode === "edit") {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={backToList}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111827]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to users
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">
              {mode === "create" ? "Add User" : "Edit User"}
            </h1>
          </div>
        </div>

        <Card
          key={mode === "create" ? "add-user-form" : `edit-user-${editingUser?.id ?? "x"}`}
          className="p-6 space-y-6 border-[#E5E7EB] shadow-sm"
        >
          {/* Hidden decoys removed — they primed Chrome password/history UI */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="text"
                inputMode="email"
                placeholder="name@company.com"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5" ref={salesPersonBoxRef}>
              <Label htmlFor="user-sales-person">Sales Person</Label>
              <button
                id="user-sales-person"
                type="button"
                aria-label="Sales Person"
                aria-expanded={salesPersonOpen}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-left text-sm outline-none focus:ring-1 focus:ring-ring"
                onClick={() => setSalesPersonOpen((open) => !open)}
              >
                <span className={form.salesPersonName ? "truncate text-[#111827]" : "truncate text-[#6B7280]"}>
                  {form.salesPersonName || "Select sales person"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#6B7280]" />
              </button>
              {salesPersonOpen && (
                <div className="relative z-30">
                  <div className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md border border-[#E5E7EB] bg-white py-1 shadow-md">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-[#111827] hover:bg-[#F3F4F6]"
                      onClick={() => {
                        setForm((current) => ({ ...current, salesPersonId: null, salesPersonName: "" }));
                        setSalesPersonOpen(false);
                      }}
                    >
                      None
                    </button>
                    {salesPersons.map((person) => {
                      const label = salesPersonOptionLabel(person);
                      const id = Number(person.id);
                      return (
                        <button
                          key={person.id || label}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-[#111827] hover:bg-[#F3F4F6]"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              salesPersonId: Number.isFinite(id) && id > 0 ? id : current.salesPersonId,
                              salesPersonName: label,
                            }));
                            setSalesPersonOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                    {salesPersons.length === 0 && (
                      <p className="px-3 py-2 text-sm text-[#6B7280]">No sales persons yet.</p>
                    )}
                  </div>
                </div>
              )}
              {salesPersons.length === 0 && !salesPersonOpen && (
                <p className="text-xs text-[#6B7280]">
                  No sales persons yet. Create them under Directory → Sales Person.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-password">
                Password {mode === "edit" && <span className="text-muted-foreground font-normal">(leave blank to keep)</span>}
              </Label>
              <Input
                id="user-password"
                type="text"
                placeholder={mode === "edit" ? "••••••••" : "Min 6 characters"}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="[-webkit-text-security:disc]"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={roleSelectValue(form)}
                onValueChange={(v) => {
                  if (v === CREATE_ROLE_VALUE) {
                    setForm((f) => ({ ...f, showCreateRole: true, newRoleName: "" }));
                    return;
                  }
                  if (v.startsWith("custom-")) {
                    setForm((f) => ({
                      ...f,
                      roleId: Number(v.slice(7)),
                      role: "user",
                      showCreateRole: false,
                      newRoleName: "",
                    }));
                    return;
                  }
                  setForm((f) => ({
                    ...f,
                    role: v as FormState["role"],
                    roleId: null,
                    showCreateRole: false,
                    newRoleName: "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="max-h-[14rem]">
                  <SelectItem value={CREATE_ROLE_VALUE} className="font-medium text-primary">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create New Role
                    </span>
                  </SelectItem>
                  <SelectSeparator />
                  {BUILTIN_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                  {customRoles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Custom roles</SelectLabel>
                      {customRoles.map((r) => (
                        <SelectItem key={r.id} value={`custom-${r.id}`}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>

              {form.role === "external" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                  External users only see documents they created.
                </p>
              )}
              {form.role === "admin" && (
                <p className="text-xs text-[#6B7280]">
                  Administrators get all companies and modules automatically.
                </p>
              )}
            </div>
          </div>

          {form.role !== "admin" && (
            <CompanyModuleSelector
              companies={companyOptions}
              companyAccess={form.companyAccess}
              onToggleCompany={toggleCompany}
              onChangeModules={setCompanyModules}
            />
          )}

          {formError && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={backToList} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={saving} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
              {saving ? "Saving…" : mode === "create" ? "Create User" : "Save Changes"}
            </Button>
          </div>
        </Card>

        <Dialog
          open={form.showCreateRole}
          onOpenChange={(open) => {
            if (!open) setForm((f) => ({ ...f, showCreateRole: false, newRoleName: "" }));
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={form.newRoleName}
              onChange={(e) => setForm((f) => ({ ...f, newRoleName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateRole();
                }
              }}
              placeholder="Enter role name"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creatingRole}
                onClick={() => setForm((f) => ({ ...f, showCreateRole: false, newRoleName: "" }))}
              >
                Cancel
              </Button>
              <Button type="button" disabled={creatingRole} onClick={() => void handleCreateRole()}>
                {creatingRole ? "Creating…" : "Create & Select"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">User Management</h1>
        </div>

        {canCreate && (
          <Button className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={openCreate}>
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">Email</th>
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
                paginatedUsers.map((u: User) => (
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
                        variant={u.role === "admin" ? "default" : u.role === "external" ? "outline" : "secondary"}
                        className={
                          u.role === "external"
                            ? "text-amber-600 border-amber-300 bg-amber-50"
                            : u.role === "accountant"
                              ? "text-blue-700 border-blue-300 bg-blue-50"
                              : ""
                        }
                      >
                        {u.role === "admin"
                          ? "Administrator"
                          : u.role === "external"
                            ? "External"
                            : u.role === "accountant"
                              ? "Accountant"
                              : (u as any).roleName && !isBuiltinRoleName((u as any).roleName)
                                ? (u as any).roleName
                                : "User"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted-foreground">All companies & modules</span>
                      ) : (
                        <div className="space-y-1.5">
                          {u.companies && u.companies.length > 0 ? (
                            u.companies.map((c) => (
                              <div key={c.id} className="flex items-start gap-1.5">
                                <Badge variant="outline" className="text-xs font-normal gap-1 shrink-0">
                                  <Building2 className="h-2.5 w-2.5" />
                                  {c.name}
                                </Badge>
                                <div className="flex flex-wrap gap-1">
                                  {(Array.isArray((c as any).modules) ? ((c as any).modules as string[]) : []).slice(0, 6).map((mod) => (
                                    <span key={mod} className="text-xs bg-muted rounded px-1 py-0.5 text-muted-foreground">
                                      {MODULE_LABELS[mod as AppModule] ?? mod}
                                    </span>
                                  ))}
                                  {((c as any).modules as string[] ?? []).length > 6 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{((c as any).modules as string[]).length - 6} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">No access assigned</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-muted"
                          onClick={() => openEdit(u)}
                          disabled={!canEdit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(u.id)}
                          disabled={u.id === currentUser?.id || !canDelete || deleteMutation.isPending}
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
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </Card>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the user account and their company access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
