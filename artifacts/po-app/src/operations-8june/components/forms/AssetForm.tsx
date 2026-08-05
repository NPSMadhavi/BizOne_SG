import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAssetSchema, type Employee, type Asset } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/operations-8june/components/ui/date-picker";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import { 
  Loader2, 
  Package, 
  User, 
  CreditCard, 
  Calculator,
  FileText,
  HelpCircle,
  UserPlus
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import EmployeeForm from "./EmployeeForm";

// Asset types for dropdown
const assetTypes = [
  "Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Server", 
  "Printer", "Scanner", "Router", "Switch", "Projector", "Camera", "Other"
];

// Asset categories for dropdown
const assetCategories = [
  "Hardware", "Software", "Furniture", "Office Equipment", "Network Equipment", "Other"
];

// Manufacturers for dropdown
const manufacturers = [
  "Apple", "Dell", "HP", "Lenovo", "Microsoft", "Samsung", "LG", 
  "Asus", "Acer", "Canon", "Epson", "Cisco", "Netgear", "Other"
];

// Locations for dropdown
const locations = [
  "Headquarters", "Branch Office", "Remote", "Warehouse", "IT Room", 
  "Conference Room", "Reception", "Other"
];

// Depreciation methods
const depreciationMethods = [
  "Straight Line", "Reducing Balance", "Sum of Years Digits"
];

// Enhanced form schema with better validation
const formSchema = insertAssetSchema.extend({
  tag: z.string().min(3, "Asset tag must be at least 3 characters"),
  type: z.string().min(1, "Asset type is required"),
  category: z.string().min(1, "Category is required"),
  serial: z.string().min(1, "Serial number is required"),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  condition: z.string().optional(),
  assignedTo: z.string().optional(),
  location: z.string().optional(),
  vendor: z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: z.date().optional(),
  warrantyExpiry: z.date().optional(),
  depreciationStartDate: z.date().optional(),
  usefulLifeYears: z.number().min(1).max(20).optional(),
  depreciationMethod: z.string().optional(),
  description: z.string().optional(),
});

type AssetFormData = z.infer<typeof formSchema>;

interface AssetFormProps {
  assetId?: number;
  initialAsset?: Asset | null;
  onSuccess?: () => void;
  formId?: string;
  hideFooter?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

type AssetRecord = Record<string, unknown>;

function pickField(data: AssetRecord, camel: string, snake: string): unknown {
  return data[camel] ?? data[snake];
}

function normalizeAssetRecord(data: AssetRecord): AssetRecord {
  return {
    ...data,
    type: pickField(data, "type", "asset_type") ?? pickField(data, "assetType", "asset_type"),
    category: pickField(data, "category", "category"),
    assignedTo: pickField(data, "assignedTo", "assigned_to"),
    location: pickField(data, "location", "location"),
    manufacturer: pickField(data, "manufacturer", "manufacturer"),
    model: pickField(data, "model", "model"),
    invoiceNumber: pickField(data, "invoiceNumber", "invoice_number"),
    purchaseDate: pickField(data, "purchaseDate", "purchase_date"),
    warrantyExpiry: pickField(data, "warrantyExpiry", "warranty_expiry"),
    depreciationStartDate: pickField(data, "depreciationStartDate", "depreciation_start_date"),
    usefulLifeYears: pickField(data, "usefulLifeYears", "useful_life_years"),
    depreciationMethod: pickField(data, "depreciationMethod", "depreciation_method"),
    vendorId: pickField(data, "vendorId", "vendor_id"),
  };
}

function matchSelectValue(stored: unknown, options: readonly string[]): string {
  if (stored == null || stored === "") return "";
  const normalized = String(stored).trim().toLowerCase();
  const match = options.find((option) => option.toLowerCase() === normalized);
  return match ? match.toLowerCase() : normalized;
}

function withStoredOption(options: readonly string[], stored: unknown): string[] {
  if (stored == null || String(stored).trim() === "") return [...options];
  const normalized = String(stored).trim().toLowerCase();
  if (options.some((option) => option.toLowerCase() === normalized)) return [...options];
  return [...options, String(stored).trim()];
}

function toDateValue(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapAssetToFormValues(data: AssetRecord): AssetFormData {
  const normalized = normalizeAssetRecord(data);
  return {
    tag: String(normalized.tag ?? ""),
    type: matchSelectValue(normalized.type, assetTypes),
    category: matchSelectValue(normalized.category, assetCategories),
    serial: String(normalized.serial ?? ""),
    model: String(normalized.model ?? ""),
    manufacturer: matchSelectValue(normalized.manufacturer, manufacturers),
    status:
      matchSelectValue(normalized.status, ["available", "assigned", "maintenance", "retired"]) ||
      "available",
    condition:
      matchSelectValue(normalized.condition, ["new", "used", "refurbished", "damaged"]) || "new",
    assignedTo: String(normalized.assignedTo ?? ""),
    location: matchSelectValue(normalized.location, locations),
    vendor: String(normalized.vendor ?? ""),
    invoiceNumber: String(normalized.invoiceNumber ?? ""),
    purchaseDate: toDateValue(normalized.purchaseDate),
    warrantyExpiry: toDateValue(normalized.warrantyExpiry),
    depreciationStartDate: toDateValue(normalized.depreciationStartDate),
    usefulLifeYears: normalized.usefulLifeYears != null ? Number(normalized.usefulLifeYears) : 3,
    depreciationMethod:
      matchSelectValue(normalized.depreciationMethod, depreciationMethods) || "straight line",
    description: String(normalized.description ?? ""),
    vendorId: normalized.vendorId as number | undefined,
    cost: normalized.cost as string | undefined,
  };
}

const emptyFormValues: AssetFormData = {
  tag: "",
  type: "",
  category: "",
  serial: "",
  model: "",
  manufacturer: "",
  status: "available",
  condition: "new",
  assignedTo: "",
  location: "",
  vendor: "",
  invoiceNumber: "",
  purchaseDate: undefined,
  warrantyExpiry: undefined,
  depreciationStartDate: undefined,
  usefulLifeYears: 3,
  depreciationMethod: "straight line",
  description: "",
  vendorId: undefined,
  cost: undefined,
};

export default function AssetForm({ assetId, initialAsset, onSuccess, formId, hideFooter, onPendingChange }: AssetFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditMode = !!assetId;
  const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
  const [employeeCountBeforeCreate, setEmployeeCountBeforeCreate] = useState(-1);
  
  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
  });
  
  // Fetch employees for dropdown
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });
  
  // Fetch asset data if in edit mode
  const { data: assetData, isLoading: isLoadingAsset } = useQuery({
    queryKey: ["/api/assets", assetId],
    enabled: !!assetId,
    staleTime: 0,
  });

  const resolvedAsset = useMemo(() => {
    const source = (assetData ?? initialAsset) as AssetRecord | null | undefined;
    return source ? normalizeAssetRecord(source) : undefined;
  }, [assetData, initialAsset]);

  const editFormValues = useMemo(() => {
    if (!assetId || !resolvedAsset) return undefined;
    return mapAssetToFormValues(resolvedAsset);
  }, [assetId, resolvedAsset]);

  const typeOptions = useMemo(
    () => withStoredOption(assetTypes, resolvedAsset?.type),
    [resolvedAsset?.type],
  );
  const categoryOptions = useMemo(
    () => withStoredOption(assetCategories, resolvedAsset?.category),
    [resolvedAsset?.category],
  );
  const manufacturerOptions = useMemo(
    () => withStoredOption(manufacturers, resolvedAsset?.manufacturer),
    [resolvedAsset?.manufacturer],
  );
  const locationOptions = useMemo(
    () => withStoredOption(locations, resolvedAsset?.location),
    [resolvedAsset?.location],
  );
  const depreciationMethodOptions = useMemo(
    () => withStoredOption(depreciationMethods, resolvedAsset?.depreciationMethod),
    [resolvedAsset?.depreciationMethod],
  );
  
  const form = useForm<AssetFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: editFormValues ?? emptyFormValues,
    values: editFormValues,
  });

  const assignedEmployeeName = String(resolvedAsset?.assignedTo ?? "").trim();
  const hasAssignedEmployeeOption = employees.some(
    (employee) => employee.name === assignedEmployeeName,
  );
  
  // Auto-select newly created employee
  useEffect(() => {
    if (!isEmployeeFormOpen && employeeCountBeforeCreate >= 0 && employees.length > employeeCountBeforeCreate) {
      // A new employee was created, select the newest one (last in array or highest ID)
      const newestEmployee = employees.reduce((prev, current) => 
        (current.id > prev.id) ? current : prev
      );
      if (newestEmployee) {
        form.setValue("assignedTo", newestEmployee.name);
        // Also update status to "Assigned" if it was "Available"
        if (form.getValues("status") === "available") {
          form.setValue("status", "assigned");
        }
      }
      setEmployeeCountBeforeCreate(-1); // Reset to -1 to prevent re-triggering
    }
  }, [isEmployeeFormOpen, employeeCountBeforeCreate, employees, form]);
  
  const handleEmployeeFormClose = () => {
    setIsEmployeeFormOpen(false);
  };
  
  const handleOpenEmployeeForm = () => {
    setEmployeeCountBeforeCreate(employees.length);
    setIsEmployeeFormOpen(true);
  };
  
  const createAssetMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      console.log("📤 Submitting asset data:", data);
      const res = await apiRequest("POST", "/api/assets", data);
      const responseData = await res.json();
      if (!res.ok) {
        console.error("❌ Asset creation failed:", responseData);
        throw new Error(responseData.message || "Failed to create asset");
      }
      return responseData;
    },
    onSuccess: async () => {
      toast({
        title: "Asset created",
        description: "The asset has been created successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      form.reset(emptyFormValues);
      if (onSuccess) onSuccess();
    },
    onError: (error: any) => {
      console.error("❌ Asset creation error:", error);
      const errorMessage = error?.message || "Failed to create asset";
      toast({
        title: "Failed to create asset",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  const updateAssetMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      const res = await apiRequest("PUT", `/api/assets/${assetId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Asset updated",
        description: "The asset has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      if (onSuccess) onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    onPendingChange?.(createAssetMutation.isPending || updateAssetMutation.isPending);
  }, [createAssetMutation.isPending, updateAssetMutation.isPending, onPendingChange]);

  const onSubmit = (data: AssetFormData) => {
    // Ensure all dates are properly converted to Date objects or ISO strings
    const cleanedData = {
      ...data,
      purchaseDate: data.purchaseDate ? (data.purchaseDate instanceof Date ? data.purchaseDate.toISOString() : new Date(data.purchaseDate).toISOString()) : undefined,
      warrantyExpiry: data.warrantyExpiry ? (data.warrantyExpiry instanceof Date ? data.warrantyExpiry.toISOString() : new Date(data.warrantyExpiry).toISOString()) : undefined,
      depreciationStartDate: data.depreciationStartDate ? (data.depreciationStartDate instanceof Date ? data.depreciationStartDate.toISOString() : new Date(data.depreciationStartDate).toISOString()) : undefined,
    };
    
    if (isEditMode) {
      updateAssetMutation.mutate(cleanedData);
    } else {
      createAssetMutation.mutate(cleanedData);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (onSuccess) onSuccess();
    }
  };
  
  if (isEditMode && isLoadingAsset && !initialAsset) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={handleKeyDown}
          className="space-y-8"
        >
          {/* Basic Details */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Package} title="Basic Details" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="tag"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2 text-sm font-medium text-[#111827]">
                              Asset Tag *
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-4 w-4 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Unique identifier for tracking this asset</p>
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="IT-LAP-001" 
                                className="w-full" 
                                autoFocus
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Asset Type *</FormLabel>
                            <Select
                              key={`type-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select asset type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {typeOptions.map((type) => (
                                  <SelectItem key={type} value={type.toLowerCase()}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Category *</FormLabel>
                            <Select
                              key={`category-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {categoryOptions.map((category) => (
                                  <SelectItem key={category} value={category.toLowerCase()}>
                                    {category}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="serial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Serial Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="C02XN1ABMD6R" className="w-full" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Model Number</FormLabel>
                            <FormControl>
                              <Input placeholder="MacBook Pro 14-inch" className="w-full" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="manufacturer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Manufacturer</FormLabel>
                            <Select
                              key={`manufacturer-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select manufacturer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {manufacturerOptions.map((manufacturer) => (
                                  <SelectItem key={manufacturer} value={manufacturer.toLowerCase()}>
                                    {manufacturer}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
            </div>
          </section>

          {/* Assignment & Status */}
          <section className="space-y-4">
            <ModalSectionHeader icon={User} title="Assignment & Status" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Status *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="assigned">Assigned</SelectItem>
                              <SelectItem value="maintenance">Under Repair</SelectItem>
                              <SelectItem value="retired">Retired</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Condition</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="used">Used</SelectItem>
                              <SelectItem value="refurbished">Refurbished</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assignedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Assigned To</FormLabel>
                          <Select
                            key={`assigned-${assetId ?? "new"}-${field.value}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={
                                  isLoadingEmployees 
                                    ? "Loading employees..." 
                                    : employees.length === 0 
                                      ? "No employees found - Create one first" 
                                      : "Select employee"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <div 
                                className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-primary cursor-pointer hover:bg-accent rounded-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleOpenEmployeeForm();
                                }}
                              >
                                <UserPlus className="h-4 w-4" />
                                Create New Employee
                              </div>
                              {employees.length > 0 && (
                                <div className="border-t my-1" />
                              )}
                              {assignedEmployeeName && !hasAssignedEmployeeOption && (
                                <SelectItem value={assignedEmployeeName}>
                                  {assignedEmployeeName}
                                </SelectItem>
                              )}
                              {employees.map((employee) => (
                                <SelectItem key={employee.id} value={employee.name}>
                                  {employee.name} - {employee.designation}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs text-[#6B7280]">
                            Leave empty if available for assignment
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Location</FormLabel>
                          <Select
                            key={`location-${assetId ?? "new"}-${field.value}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locationOptions.map((location) => (
                                <SelectItem key={location} value={location.toLowerCase()}>
                                  {location}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
            </div>
          </section>

          {/* Procurement Details */}
          <section className="space-y-4">
            <ModalSectionHeader icon={CreditCard} title="Procurement Details" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="vendor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Vendor</FormLabel>
                          <FormControl>
                            <Input placeholder="Vendor name" className="w-full" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="invoiceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Invoice Number</FormLabel>
                          <FormControl>
                            <Input placeholder="INV-2024-001" className="w-full" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="purchaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Purchase Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              date={field.value ? new Date(field.value) : undefined}
                              setDate={(date) => field.onChange(date)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="warrantyExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Warranty Expiry Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              date={field.value ? new Date(field.value) : undefined}
                              setDate={(date) => field.onChange(date)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
            </div>
          </section>

          {/* Finance Details (Optional) */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Calculator} title="Finance Details (Optional)" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="depreciationStartDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Depreciation Start Date</FormLabel>
                              <FormControl>
                                <DatePicker
                                  date={field.value ? new Date(field.value) : undefined}
                                  setDate={(date) => field.onChange(date)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="usefulLifeYears"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Useful Life (Years)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max="20"
                                  placeholder="3"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormDescription className="text-xs text-[#6B7280]">
                                Expected useful life for depreciation calculation
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="depreciationMethod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Depreciation Method</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || undefined}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select method" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {depreciationMethodOptions.map((method) => (
                                    <SelectItem key={method} value={method.toLowerCase()}>
                                      {method}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
            </div>
          </section>

          {/* Additional Notes */}
          <section className="space-y-4">
            <ModalSectionHeader icon={FileText} title="Additional Notes" />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-[#111827]">Description / Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional information about this asset..."
                            className="min-h-[100px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-[#6B7280]">
                          Any additional details, specifications, or notes about the asset
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
          </section>

          {!hideFooter && (
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset(emptyFormValues);
                  if (onSuccess) onSuccess();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAssetMutation.isPending || updateAssetMutation.isPending}
                className="bg-[#2563EB] text-white hover:bg-[#2563EB]"
              >
                {(createAssetMutation.isPending || updateAssetMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? "Update Asset" : "Create Asset"}
              </Button>
            </div>
          )}
        </form>
      </Form>
      
      {/* Employee Creation Sheet */}
      <EmployeeForm 
        isOpen={isEmployeeFormOpen}
        onClose={handleEmployeeFormClose}
      />
    </TooltipProvider>
  );
}
