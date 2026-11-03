export interface SuperAdminUser {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
}

export interface CompanyAdminInfo {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  phone: string | null;
}

export interface SuperAdminCompany {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  country: string;
  businessType: string | null;
  databaseName: string | null;
  status: "Active" | "Suspended" | "Inactive" | string;
  notes: string | null;
  createdAt: string;
  admin: CompanyAdminInfo | null;
  license: {
    id: number;
    licenseKey: string;
    planType: string;
    status: string;
    expiryDate: string;
    paymentStatus: string;
    maxUsers: number;
    isRenewable: boolean;
  } | null;
  userCount?: number;
}

export interface SuperAdminPlan {
  id: number;
  name: string;
  code: string;
  description: string | null;
  duration: "Monthly" | "Quarterly" | "Yearly" | "Custom" | string;
  durationDays: number;
  price: number;
  currency: string;
  maxUsers: number;
  modules: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SuperAdminLicense {
  id: number;
  licenseKey: string;
  companyId: number;
  companyName?: string;
  companySlug?: string;
  companyEmail?: string;
  planId: number | null;
  planType: string;
  purchaseDate: string;
  expiryDate: string;
  isRenewable: boolean;
  status: "Active" | "Pending" | "Expired" | "Suspended" | "Revoked" | string;
  paymentStatus: "Paid" | "Pending" | "Overdue" | "Cancelled" | string;
  maxUsers: number;
  enabledModules: string[];
  notes: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminRenewal {
  id: number;
  licenseId: number;
  licenseKey?: string;
  companyId: number;
  companyName?: string;
  previousExpiryDate: string;
  newExpiryDate: string;
  renewalDate: string;
  paymentAmount: number;
  paymentStatus: string;
  paymentReference: string | null;
  notes: string | null;
  renewedBy?: number | null;
  createdAt: string;
}

export interface SuperAdminAuditLog {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, any>;
  ipAddress: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalCompanies: number;
  totalUsers: number;
  activeLicenses: number;
  expiredLicenses: number;
  suspendedLicenses: number;
  renewalsDueSoon: number;
  plansCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentCompanies: SuperAdminCompany[];
  planDistribution: Array<{
    name: string;
    code: string;
    count: number;
    price: number;
  }>;
  upcomingRenewals: SuperAdminLicense[];
  recentAuditLogs: SuperAdminAuditLog[];
}

