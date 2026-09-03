/**
 * Client-safe schema exports for Operations modules (no drizzle-orm dependency).
 */
import { z } from "zod";

export type Asset = {
  id: number;
  companyId?: number;
  tag: string;
  type: string;
  category: string;
  serial: string;
  model?: string | null;
  manufacturer?: string | null;
  status: string;
  condition?: string | null;
  assignedTo?: string | null;
  location?: string | null;
  vendor?: string | null;
  vendorId?: number | null;
  invoiceNumber?: string | null;
  purchaseDate?: string | Date | null;
  warrantyExpiry?: string | Date | null;
  cost?: string | null;
  depreciationStartDate?: string | Date | null;
  usefulLifeYears?: number | null;
  depreciationMethod?: string | null;
  description?: string | null;
  hasLicense?: boolean | null;
  createdAt?: string | Date | null;
};

export type License = {
  id: number;
  companyId?: number;
  assetId?: number | null;
  name: string;
  licenseKey: string;
  type: string;
  seats?: number | null;
  vendorId?: number | null;
  purchaseDate?: string | Date | null;
  expiryDate?: string | Date | null;
  cost?: string | null;
  renewalCycle?: string | null;
  status?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
};

export type Employee = {
  id: number;
  companyId?: number;
  employeeId: string;
  userId?: number | null;
  name: string;
  email: string;
  phone: string;
  address: string;
  department: string;
  designation: string;
  joinDate: string | Date;
  status: string;
  salary?: string | null;
  annualSalary?: string | null;
  nationality?: string | null;
  prStatus?: string | null;
  dateOfBirth?: string | Date | null;
  passportNumber?: string | null;
  passportExpiry?: string | Date | null;
  visaNumber?: string | null;
  visaExpiry?: string | Date | null;
  nric?: string | null;
  nricExpiry?: string | Date | null;
  createdAt?: string | Date | null;
};

export type Customer = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  isActive?: boolean | null;
};

export type ServiceReport = {
  id: number;
  csrNumber: string;
  customerId: number;
  customerName: string;
  customerAddress?: string | null;
  customerContactPerson?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  supportRequestedBy: string;
  supportRequestDate: string | Date;
  problemDescription: string;
  engineerId?: number | null;
  serviceDate: string | Date;
  serviceTime: string;
  hoursCharged: number | string;
  serviceDetails: string;
  remarks?: string | null;
  priorityLevel: string;
  status: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type EmployeePayroll = {
  id: number;
  employeeId: number;
  baseSalary: string | number;
  payrollPeriod: string;
  hourlyRate?: string | number | null;
  overtimeRate?: string | number | null;
  allowances?: Record<string, number> | null;
  deductions?: Record<string, number> | null;
  taxRate?: string | number | null;
  cpfRate?: string | number | null;
  employerCpfRate?: string | number | null;
  isActive?: boolean;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
  tenantId?: number;
  tenantSlug?: string;
  createdBy?: number;
};

export type PayrollRecord = {
  id: number;
  employeeId: number;
  payrollConfigId: number;
  payPeriodStart: string | Date;
  payPeriodEnd: string | Date;
  grossPay: string | number;
  netPay: string | number;
  status: string;
};

export const insertAssetSchema = z.object({
  tag: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  serial: z.string().optional().default(""),
  model: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  status: z.string().optional(),
  condition: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  vendorId: z.coerce.number().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  warrantyExpiry: z.coerce.date().optional().nullable(),
  cost: z.string().optional().nullable(),
  depreciationStartDate: z.coerce.date().optional(),
  usefulLifeYears: z.coerce.number().optional().nullable(),
  depreciationMethod: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  hasLicense: z.boolean().optional(),
});

export const insertLicenseSchema = z.object({
  assetId: z.coerce.number().optional().nullable(),
  name: z.string().min(1),
  licenseKey: z.string().optional(),
  type: z.string().min(1),
  seats: z.coerce.number().optional(),
  vendorId: z.coerce.number().optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  cost: z.string().optional().nullable(),
  renewalCycle: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const insertEmployeeSchema = z.object({
  employeeId: z.string().optional(),
  userId: z.coerce.number().optional().nullable(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  department: z.string().min(1),
  designation: z.string().min(1),
  joinDate: z.coerce.date(),
  status: z.string().optional(),
  salary: z.union([z.string(), z.number()]).optional().nullable(),
  annualSalary: z.union([z.string(), z.number()]).optional().nullable(),
  nationality: z.string().optional().nullable(),
  prStatus: z.string().optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  passportExpiry: z.coerce.date().optional().nullable(),
  visaNumber: z.string().optional().nullable(),
  visaExpiry: z.coerce.date().optional().nullable(),
  nric: z.string().optional().nullable(),
  nricExpiry: z.coerce.date().optional().nullable(),
  companyId: z.number().optional().nullable(),
});

export const documentTypeEnum = {
  enumValues: [
    "passport",
    "visa",
    "contract",
    "certification",
    "warranty",
    "purchase_order",
    "other",
  ] as const,
};

export type EmployeeDocument = {
  id: number;
  companyId?: number;
  employeeId: number;
  documentType: string;
  filePath: string;
  issueDate?: string | Date | null;
  expiryDate?: string | Date | null;
  notes?: string | null;
  createdAt?: string | Date | null;
};

export const insertEmployeeDocumentSchema = z.object({
  employeeId: z.coerce.number(),
  documentType: z.enum(documentTypeEnum.enumValues),
  filePath: z.string().optional(),
  issueDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertDependentSchema = z.object({
  employeeId: z.coerce.number().optional(),
  name: z.string().min(1),
  relationship: z.string().min(1),
  passportNumber: z.string().optional(),
  passportExpiry: z.coerce.date().optional().nullable(),
  visaNumber: z.string().optional(),
  visaExpiry: z.coerce.date().optional().nullable(),
  visaType: z.string().optional().nullable(),
  passportScan: z.string().optional(),
  visaScan: z.string().optional(),
});

export const insertEmployeePayrollSchema = z.object({
  tenantId: z.coerce.number().optional(),
  tenantSlug: z.string().optional(),
  createdBy: z.coerce.number().optional(),
  employeeId: z.coerce.number(),
  baseSalary: z.union([z.string(), z.number()]),
  payrollPeriod: z.string().default("monthly"),
  hourlyRate: z.union([z.string(), z.number()]).optional().nullable(),
  overtimeRate: z.union([z.string(), z.number()]).optional().nullable(),
  allowances: z.record(z.number()).optional(),
  deductions: z.record(z.number()).optional(),
  taxRate: z.union([z.string(), z.number()]).optional(),
  cpfRate: z.union([z.string(), z.number()]).optional(),
  cpfAmount: z.union([z.string(), z.number()]).optional().nullable(),
  employerCpfRate: z.union([z.string(), z.number()]).optional(),
  employerCpfAmount: z.union([z.string(), z.number()]).optional().nullable(),
  netSalary: z.union([z.string(), z.number()]).optional().nullable(),
  noOfWorkingDays: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.union([z.string(), z.coerce.date()]),
  effectiveTo: z.union([z.string(), z.coerce.date()]).optional().nullable(),
});

export const insertServiceReportSchema = z.object({
  csrNumber: z.string().optional(),
  customerId: z.coerce.number(),
  customerName: z.string().min(1),
  customerAddress: z.string().optional().nullable(),
  customerContactPerson: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  supportRequestedBy: z.string().min(1),
  supportRequestDate: z.coerce.date(),
  problemDescription: z.string().min(1),
  engineerId: z.coerce.number().optional().nullable(),
  serviceDate: z.coerce.date(),
  serviceTime: z.string().min(1),
  hoursCharged: z.coerce.number(),
  serviceDetails: z.string().min(1),
  remarks: z.string().optional().nullable(),
  priorityLevel: z.string().optional(),
  status: z.string().optional(),
  createdBy: z.coerce.number().optional().nullable(),
});
