import { getTabSessionId } from "@/lib/browser-session";
import type {
  SuperAdminUser,
  SuperAdminCompany,
  SuperAdminPlan,
  SuperAdminLicense,
  SuperAdminRenewal,
  SuperAdminAuditLog,
  DashboardData,
} from "./types";

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const tabSession = getTabSessionId();
  if (tabSession) {
    headers.set("x-bizone-session", tabSession);
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data as T;
}

// 1. Auth
export async function superAdminLogin(emailOrUsername: string, password: string): Promise<{
  message: string;
  user: SuperAdminUser;
  sessionId: string;
}> {
  return request("/superadmin/login", {
    method: "POST",
    body: JSON.stringify({ emailOrUsername, password }),
  });
}

export async function superAdminLogout(): Promise<{ message: string }> {
  return request("/superadmin/logout", {
    method: "POST",
  });
}

export async function getSuperAdminMe(): Promise<{ user: SuperAdminUser }> {
  return request("/superadmin/me", { method: "GET" });
}

// 2. Dashboard
export async function getDashboardData(): Promise<DashboardData> {
  return request("/superadmin/dashboard", { method: "GET" });
}

// 3. Companies
export async function getCompanies(params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
} = {}): Promise<{
  companies: SuperAdminCompany[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);

  const qs = query.toString();
  const raw: any = await request(`/superadmin/companies${qs ? `?${qs}` : ""}`, { method: "GET" });
  return {
    companies: raw.companies || raw.items || [],
    total: Number(raw.total ?? raw.pagination?.total ?? 0),
    page: Number(raw.page ?? raw.pagination?.page ?? 1),
    totalPages: Number(raw.totalPages ?? raw.pagination?.totalPages ?? 1),
  };
}

export async function getCompanyDetails(id: number): Promise<{
  company: SuperAdminCompany;
  users: Array<{
    id: number;
    username: string;
    email: string;
    fullName: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
  }>;
  licenses: SuperAdminLicense[];
}> {
  return request(`/superadmin/companies/${id}`, { method: "GET" });
}

export async function updateCompanyStatus(
  id: number,
  status: string,
  notes?: string
): Promise<{ message: string; company: any }> {
  return request(`/superadmin/companies/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
}

// 4. Licenses
export async function getLicenses(params: {
  search?: string;
  status?: string;
  companyId?: number;
  page?: number;
  limit?: number;
} = {}): Promise<{
  licenses: SuperAdminLicense[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.companyId) query.set("companyId", String(params.companyId));
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  const raw: any = await request(`/superadmin/licenses${qs ? `?${qs}` : ""}`, { method: "GET" });
  return {
    licenses: raw.licenses || raw.items || [],
    total: Number(raw.total ?? raw.pagination?.total ?? 0),
    page: Number(raw.page ?? raw.pagination?.page ?? 1),
    totalPages: Number(raw.totalPages ?? raw.pagination?.totalPages ?? 1),
  };
}

export async function generateNewLicenseKey(prefix = "BIZ-SG"): Promise<{ licenseKey: string }> {
  return request("/superadmin/licenses/generate-key", {
    method: "POST",
    body: JSON.stringify({ prefix }),
  });
}

export async function createLicense(payload: {
  licenseKey?: string;
  companyId: number;
  planId?: number | null;
  planType: string;
  purchaseDate: string;
  expiryDate: string;
  isRenewable?: boolean;
  status?: string;
  paymentStatus?: string;
  maxUsers?: number;
  enabledModules?: string[];
  notes?: string;
}): Promise<{ message: string; license: SuperAdminLicense }> {
  return request("/superadmin/licenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLicense(
  id: number,
  payload: Partial<SuperAdminLicense>
): Promise<{ message: string; license: SuperAdminLicense }> {
  return request(`/superadmin/licenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateLicenseStatus(
  id: number,
  status: string,
  notes?: string
): Promise<{ message: string; license: SuperAdminLicense }> {
  return request(`/superadmin/licenses/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
}

export async function renewLicense(
  id: number,
  payload: {
    newExpiryDate: string;
    paymentAmount?: number;
    paymentStatus?: string;
    paymentReference?: string;
    notes?: string;
  }
): Promise<{ message: string; renewal: SuperAdminRenewal; license: SuperAdminLicense }> {
  return request(`/superadmin/licenses/${id}/renew`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 5. Plans
export async function getPlans(): Promise<{ plans: SuperAdminPlan[] }> {
  const raw: any = await request("/superadmin/plans", { method: "GET" });
  return {
    plans: raw.plans || raw.items || [],
  };
}

export async function createPlan(payload: {
  name: string;
  code: string;
  description?: string;
  duration?: string;
  durationDays?: number;
  price?: number;
  currency?: string;
  maxUsers?: number;
  modules?: string[];
}): Promise<{ message: string; plan: SuperAdminPlan }> {
  return request("/superadmin/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePlan(
  id: number,
  payload: Partial<SuperAdminPlan>
): Promise<{ message: string; plan: SuperAdminPlan }> {
  return request(`/superadmin/plans/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updatePlanStatus(
  id: number,
  isActive: boolean
): Promise<{ message: string; plan: SuperAdminPlan }> {
  return request(`/superadmin/plans/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

// 6. Renewals
export async function getRenewals(params: {
  licenseId?: number;
  companyId?: number;
} = {}): Promise<{ renewals: SuperAdminRenewal[] }> {
  const query = new URLSearchParams();
  if (params.licenseId) query.set("licenseId", String(params.licenseId));
  if (params.companyId) query.set("companyId", String(params.companyId));
  const qs = query.toString();
  const raw: any = await request(`/superadmin/renewals${qs ? `?${qs}` : ""}`, { method: "GET" });
  return {
    renewals: raw.renewals || raw.history || raw.items || [],
  };
}

export async function sendRenewalNotice(
  licenseId: number
): Promise<{ message: string; licenseId: number; expiryDate: string }> {
  return request(`/superadmin/renewals/notify/${licenseId}`, {
    method: "POST",
  });
}

// 7. Audit Logs
export async function getAuditLogs(params: {
  search?: string;
  action?: string;
  entityType?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{
  logs: SuperAdminAuditLog[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.action) query.set("action", params.action);
  if (params.entityType) query.set("entityType", params.entityType);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  const raw: any = await request(`/superadmin/audit-logs${qs ? `?${qs}` : ""}`, { method: "GET" });
  const rawLogs = raw.logs || raw.items || [];
  const normalizedLogs = rawLogs.map((l: any) => ({
    ...l,
    createdAt: l.createdAt || l.created_at,
    entityType: l.entityType || l.entity_type,
    entityId: l.entityId || l.entity_id,
    ipAddress: l.ipAddress || l.ip_address,
  }));
  return {
    logs: normalizedLogs,
    total: Number(raw.total ?? raw.pagination?.total ?? 0),
    page: Number(raw.page ?? raw.pagination?.page ?? 1),
    totalPages: Number(raw.totalPages ?? raw.pagination?.totalPages ?? 1),
  };
}

