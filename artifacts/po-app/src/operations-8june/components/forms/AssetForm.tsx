import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAssetSchema, type Employee, type Asset } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { previewRunningNumber } from "@/lib/running-number";
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { useVedaFormFill } from "@/hooks/useVedaFormFill";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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
import { formFieldGridClass, formFieldGrid2Class } from "@/lib/form-ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/operations-8june/components/ui/date-picker";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import {
  formatFileSize,
  loadAssetAttachments,
  readFileAsDataUrl,
  saveAssetAttachments,
  type AssetAttachment,
} from "@/operations-8june/lib/asset-attachments";
import { 
  Package, 
  HelpCircle,
  UserPlus,
  Plus,
  Pencil,
  Upload,
  X
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Asset types for dropdown
const assetTypes = [
  "Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Server", 
  "Printer", "Scanner", "Router", "Switch", "Projector", "Camera"
];

// Asset categories for dropdown
const assetCategories = [
  "Hardware", "Software", "Furniture", "Office Equipment", "Network Equipment"
];

// Manufacturers for dropdown
const manufacturers = [
  "Apple", "Dell", "HP", "Lenovo", "Microsoft", "Samsung", "LG", 
  "Asus", "Acer", "Canon", "Epson", "Cisco", "Netgear"
];

// Locations for dropdown
const locations = [
  "Headquarters", "Branch Office", "Remote", "Warehouse", "IT Room", 
  "Conference Room", "Reception"
];

type CustomOptionTarget = "type" | "category" | "manufacturer" | "location";

const optionLabels: Record<CustomOptionTarget, string> = {
  type: "Asset Name",
  category: "Asset Category",
  manufacturer: "Manufacturer",
  location: "Location",
};

function loadCustomOptions(target: CustomOptionTarget): string[] {
  try {
    const value = localStorage.getItem(`asset-custom-options-${target}`);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function loadOptionRenames(target: CustomOptionTarget): Record<string, string> {
  try {
    const value = localStorage.getItem(`asset-option-renames-${target}`);
    const parsed = value ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function capitalizeStart(value: string): string {
  const text = value.trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function applyOptionRenames(options: string[], renames: Record<string, string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options) {
    const renamed = renames[option.trim().toLowerCase()] ?? option;
    const key = renamed.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(renamed);
  }
  return result;
}

type OptionDialogState =
  | { mode: "create"; target: CustomOptionTarget }
  | { mode: "edit"; target: CustomOptionTarget; original: string };

// Depreciation methods
const depreciationMethods = [
  "Straight Line", "Reducing Balance", "Sum of Years Digits"
];

const optionalDate = z.union([z.date(), z.literal(""), z.null(), z.undefined()]).optional().transform((val) => {
  if (val == null || val === "") return undefined;
  return val instanceof Date && !Number.isNaN(val.getTime()) ? val : undefined;
});

// Enhanced form schema with better validation
const formSchema = insertAssetSchema.extend({
  tag: z.string().optional(),
  type: z.string().min(1, "Asset name is required"),
  category: z.string().min(1, "Asset category is required"),
  serial: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  status: z.string().min(1, "Assignment Status is required"),
  condition: z.string().optional(),
  assignedTo: z.string().optional(),
  location: z.string().optional(),
  vendor: z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: optionalDate,
  warrantyExpiry: optionalDate,
  depreciationStartDate: optionalDate,
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
  if (normalized === "other") return "";
  const match = options.find((option) => option.toLowerCase() === normalized);
  return match ? match.toLowerCase() : normalized;
}

function withStoredOption(options: readonly string[], stored: unknown): string[] {
  if (stored == null || String(stored).trim() === "") return [...options];
  const normalized = String(stored).trim().toLowerCase();
  if (normalized === "other") return [...options];
  if (options.some((option) => option.toLowerCase() === normalized)) return [...options];
  return [...options, String(stored).trim()];
}

function getExistingAssetOptions(
  assets: AssetRecord[],
  camelField: string,
  snakeField: string,
): string[] {
  const seen = new Set<string>();
  return assets.flatMap((asset) => {
    const value = pickField(asset, camelField, snakeField);
    if (value == null) return [];
    const label = String(value).trim();
    const normalized = label.toLowerCase();
    if (!label || normalized === "other" || seen.has(normalized)) return [];
    seen.add(normalized);
    return [label];
  });
}

function mergeOptions(...groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((option) => {
      const normalized = option.trim().toLowerCase();
      if (!normalized || normalized === "other" || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }),
  );
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
    usefulLifeYears: normalized.usefulLifeYears != null && normalized.usefulLifeYears !== ""
      ? Number(normalized.usefulLifeYears)
      : undefined,
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
  usefulLifeYears: undefined,
  depreciationMethod: "straight line",
  description: "",
  vendorId: undefined,
  cost: undefined,
};

const ASSET_FORM_DRAFT_KEY = "asset-form-return-draft";

type AssetFormDraft = {
  assetId?: number;
  values: Record<string, unknown>;
  attachments: AssetAttachment[];
};

function serializeAssetFormValues(values: AssetFormData): Record<string, unknown> {
  return {
    ...values,
    purchaseDate:
      values.purchaseDate instanceof Date && !Number.isNaN(values.purchaseDate.getTime())
        ? values.purchaseDate.toISOString()
        : undefined,
    warrantyExpiry:
      values.warrantyExpiry instanceof Date && !Number.isNaN(values.warrantyExpiry.getTime())
        ? values.warrantyExpiry.toISOString()
        : undefined,
    depreciationStartDate:
      values.depreciationStartDate instanceof Date &&
      !Number.isNaN(values.depreciationStartDate.getTime())
        ? values.depreciationStartDate.toISOString()
        : undefined,
  };
}

function deserializeAssetFormValues(raw: Record<string, unknown>): Partial<AssetFormData> {
  const next = { ...raw };
  if (typeof next.purchaseDate === "string") next.purchaseDate = toDateValue(next.purchaseDate);
  if (typeof next.warrantyExpiry === "string") next.warrantyExpiry = toDateValue(next.warrantyExpiry);
  if (typeof next.depreciationStartDate === "string") {
    next.depreciationStartDate = toDateValue(next.depreciationStartDate);
  }
  return next as Partial<AssetFormData>;
}

function saveAssetFormDraft(draft: AssetFormDraft) {
  try {
    sessionStorage.setItem(ASSET_FORM_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota errors — navigation still works without draft restore.
  }
}

function loadAssetFormDraft(): AssetFormDraft | null {
  try {
    const raw = sessionStorage.getItem(ASSET_FORM_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ASSET_FORM_DRAFT_KEY);
    const parsed = JSON.parse(raw) as AssetFormDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    sessionStorage.removeItem(ASSET_FORM_DRAFT_KEY);
    return null;
  }
}

function EditableOptionItem({ option, onEdit }: { option: string; onEdit: () => void }) {
  return (
    <div className="relative">
      <SelectItem value={option.toLowerCase()} className="pr-14">
        {option}
      </SelectItem>
      <button
        type="button"
        title={`Edit ${option}`}
        className="absolute right-8 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#6B7280] hover:bg-gray-100 hover:text-[#111827]"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function AssetForm({ assetId, initialAsset, onSuccess, formId, hideFooter, onPendingChange }: AssetFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditMode = !!assetId;
  const [customOptions, setCustomOptions] = useState<Record<CustomOptionTarget, string[]>>(() => ({
    type: loadCustomOptions("type"),
    category: loadCustomOptions("category"),
    manufacturer: loadCustomOptions("manufacturer"),
    location: loadCustomOptions("location"),
  }));
  const [optionRenames, setOptionRenames] = useState<Record<CustomOptionTarget, Record<string, string>>>(() => ({
    type: loadOptionRenames("type"),
    category: loadOptionRenames("category"),
    manufacturer: loadOptionRenames("manufacturer"),
    location: loadOptionRenames("location"),
  }));
  const [optionDialog, setOptionDialog] = useState<OptionDialogState | null>(null);
  const [openOptionMenu, setOpenOptionMenu] = useState<CustomOptionTarget | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [optionSaving, setOptionSaving] = useState(false);
  const [attachments, setAttachments] = useState<AssetAttachment[]>(() => loadAssetAttachments(assetId));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRestoredRef = useRef(false);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const nextAssetTag = !isEditMode
    ? previewRunningNumber(
        (settings as any)?.faPrefix ?? "FA",
        (settings as any)?.faCounter,
        (settings as any)?.faSuffix ?? "",
      )
    : "";
  
  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
  });
  
  // Fetch employees for dropdown
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  // Existing asset values make newly created options available to every user
  // in the selected company, not only in the browser that created them.
  const { data: existingAssets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
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
    () => applyOptionRenames(
      withStoredOption(
        mergeOptions(
          assetTypes,
          getExistingAssetOptions(existingAssets as AssetRecord[], "type", "asset_type"),
          customOptions.type,
        ),
        resolvedAsset?.type,
      ),
      optionRenames.type,
    ),
    [customOptions.type, existingAssets, optionRenames.type, resolvedAsset?.type],
  );
  const categoryOptions = useMemo(
    () => applyOptionRenames(
      withStoredOption(
        mergeOptions(
          assetCategories,
          getExistingAssetOptions(existingAssets as AssetRecord[], "category", "category"),
          customOptions.category,
        ),
        resolvedAsset?.category,
      ),
      optionRenames.category,
    ),
    [customOptions.category, existingAssets, optionRenames.category, resolvedAsset?.category],
  );
  const manufacturerOptions = useMemo(
    () => applyOptionRenames(
      withStoredOption(
        mergeOptions(
          manufacturers,
          getExistingAssetOptions(existingAssets as AssetRecord[], "manufacturer", "manufacturer"),
          customOptions.manufacturer,
        ),
        resolvedAsset?.manufacturer,
      ),
      optionRenames.manufacturer,
    ),
    [customOptions.manufacturer, existingAssets, optionRenames.manufacturer, resolvedAsset?.manufacturer],
  );
  const locationOptions = useMemo(
    () => applyOptionRenames(
      withStoredOption(
        mergeOptions(
          locations,
          getExistingAssetOptions(existingAssets as AssetRecord[], "location", "location"),
          customOptions.location,
        ),
        resolvedAsset?.location,
      ),
      optionRenames.location,
    ),
    [customOptions.location, existingAssets, optionRenames.location, resolvedAsset?.location],
  );
  const depreciationMethodOptions = useMemo(
    () => withStoredOption(depreciationMethods, resolvedAsset?.depreciationMethod),
    [resolvedAsset?.depreciationMethod],
  );

  const employeeSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    return employees.filter((employee) => {
      const name = String(employee.name ?? "").trim();
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [employees]);
  
  const form = useForm<AssetFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: editFormValues ?? emptyFormValues,
    values: editFormValues,
  });

  useVedaFormFill(form);

  useEffect(() => {
    if (!isEditMode && nextAssetTag) {
      form.setValue("tag", nextAssetTag, { shouldValidate: true });
    }
  }, [form, isEditMode, nextAssetTag]);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (assetId && !editFormValues) return;

    const draft = loadAssetFormDraft();
    if (draft) {
      if (!assetId) {
        form.reset({
          ...emptyFormValues,
          ...deserializeAssetFormValues(draft.values),
        } as AssetFormData);
        if (draft.attachments?.length) setAttachments(draft.attachments);
        draftRestoredRef.current = true;
      } else if (draft.assetId === assetId) {
        form.reset({
          ...form.getValues(),
          ...deserializeAssetFormValues(draft.values),
        } as AssetFormData);
        if (draft.attachments?.length) setAttachments(draft.attachments);
        draftRestoredRef.current = true;
      }
    } else if (!assetId) {
      draftRestoredRef.current = true;
    } else if (editFormValues) {
      draftRestoredRef.current = true;
    }
  }, [assetId, editFormValues, form]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assignEmployee = params.get("assignEmployee");
    if (!assignEmployee) return;

    form.setValue("assignedTo", assignEmployee, { shouldDirty: true, shouldValidate: true });
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });

    params.delete("assignEmployee");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", path);
  }, [form, queryClient]);

  const handleOpenEmployeeForm = () => {
    saveAssetFormDraft({
      assetId,
      values: serializeAssetFormValues(form.getValues()),
      attachments,
    });
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    setLocation(`/employees/new?returnTo=${returnTo}`);
  };

  const optionsFor = (target: CustomOptionTarget) => {
    if (target === "type") return typeOptions;
    if (target === "category") return categoryOptions;
    if (target === "manufacturer") return manufacturerOptions;
    return locationOptions;
  };

  const handleOpenCreateOption = (target: CustomOptionTarget) => {
    setOpenOptionMenu(null);
    setOptionDialog({ mode: "create", target });
    setNewOptionName("");
  };

  const handleOpenEditOption = (target: CustomOptionTarget, original: string) => {
    setOpenOptionMenu(null);
    setOptionDialog({ mode: "edit", target, original });
    setNewOptionName(original);
  };

  const closeOptionDialog = () => {
    setOptionDialog(null);
    setNewOptionName("");
  };

  const rememberCustomOption = (target: CustomOptionTarget, name: string, previous?: string) => {
    setCustomOptions((current) => {
      const withoutPrevious = current[target].filter(
        (item) => !previous || item.toLowerCase() !== previous.toLowerCase(),
      );
      const next = withoutPrevious.some((item) => item.toLowerCase() === name.toLowerCase())
        ? withoutPrevious
        : [...withoutPrevious, name];
      try {
        localStorage.setItem(`asset-custom-options-${target}`, JSON.stringify(next));
      } catch {
        // The value still remains available for the current session.
      }
      return { ...current, [target]: next };
    });
  };

  const rememberRename = (target: CustomOptionTarget, original: string, name: string) => {
    setOptionRenames((current) => {
      const next = { ...current[target], [original.toLowerCase()]: name };
      for (const [key, value] of Object.entries(next)) {
        if (value.toLowerCase() === original.toLowerCase()) next[key] = name;
      }
      try {
        localStorage.setItem(`asset-option-renames-${target}`, JSON.stringify(next));
      } catch {
        // Keep the rename for this session even if storage is full.
      }
      return { ...current, [target]: next };
    });
  };

  const handleSaveOption = async () => {
    if (!optionDialog) return;
    const name = capitalizeStart(newOptionName);
    const label = optionLabels[optionDialog.target].toLowerCase();
    if (!name) {
      toast({
        title: "Name required",
        description: `Enter a ${label} name.`,
        variant: "destructive",
      });
      return;
    }

    const existingOptions = optionsFor(optionDialog.target);
    if (optionDialog.mode === "create") {
      const existing = existingOptions.find((option) => option.toLowerCase() === name.toLowerCase());
      const selectedName = existing ?? name;
      if (!existing) rememberCustomOption(optionDialog.target, selectedName);
      form.setValue(optionDialog.target, selectedName.toLowerCase(), {
        shouldDirty: true,
        shouldValidate: true,
      });
      closeOptionDialog();
      toast({
        title: existing ? "Option selected" : `${optionLabels[optionDialog.target]} created`,
        description: `${selectedName} is now selected.`,
      });
      return;
    }

    const original = optionDialog.original;
    const conflict = existingOptions.find(
      (option) =>
        option.toLowerCase() === name.toLowerCase() &&
        option.toLowerCase() !== original.toLowerCase(),
    );
    if (conflict) {
      toast({
        title: "Name already exists",
        description: `${conflict} is already in this list.`,
        variant: "destructive",
      });
      return;
    }

    if (name.toLowerCase() === original.toLowerCase() && name === original) {
      closeOptionDialog();
      return;
    }

    setOptionSaving(true);
    try {
      const field = optionDialog.target;
      const matches = (existingAssets as AssetRecord[]).filter((asset) => {
        const value = pickField(
          asset,
          field,
          field === "type" ? "asset_type" : field,
        );
        return String(value ?? "").trim().toLowerCase() === original.toLowerCase();
      });
      await Promise.all(
        matches.map(async (asset) => {
          const id = Number(pickField(asset, "id", "id"));
          if (!Number.isFinite(id)) return;
          await apiRequest("PUT", `/api/assets/${id}`, { [field]: name });
        }),
      );
      rememberCustomOption(field, name, original);
      rememberRename(field, original, name);
      if (String(form.getValues(field) ?? "").trim().toLowerCase() === original.toLowerCase()) {
        form.setValue(field, name.toLowerCase(), { shouldDirty: true, shouldValidate: true });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      closeOptionDialog();
      toast({
        title: `${optionLabels[field]} updated`,
        description: `${original} is now ${name}.`,
      });
    } catch (error) {
      toast({
        title: "Failed to update option",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOptionSaving(false);
    }
  };
  
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    try {
      const uploaded = await Promise.all(
        files.map(async (file) => ({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      if (uploaded.length === 0) return;
      setAttachments((current) => [...current, ...uploaded]);
      toast({
        title: uploaded.length === 1 ? "File attached" : "Files attached",
        description: `${uploaded.map((file) => file.name).join(", ")} will be saved with this asset.`,
      });
    } catch {
      toast({
        title: "Upload failed",
        description: "The selected file could not be read. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const createAssetMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      const res = await apiRequest("POST", "/api/assets", data);
      const responseData = await res.json();
      if (!res.ok) {
        console.error("❌ Asset creation failed:", responseData);
        throw new Error(responseData.error || responseData.message || "Failed to create asset");
      }
      return responseData;
    },
    onSuccess: async (created: any) => {
      toast({
        title: "Asset created",
        description: "The asset has been created successfully.",
      });
      if (created?.id != null) saveAssetAttachments(created.id, attachments);
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      form.reset(emptyFormValues);
      setAttachments([]);
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
      const responseData = await res.json();
      if (!res.ok) {
        console.error("❌ Asset update failed:", responseData);
        throw new Error(responseData.error || responseData.message || "Failed to update asset");
      }
      return responseData;
    },
    onSuccess: () => {
      toast({
        title: "Asset updated",
        description: "The asset has been updated successfully.",
      });
      if (assetId != null) saveAssetAttachments(assetId, attachments);
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
    const cleanedData = {
      ...data,
      tag: (data.tag && data.tag.trim()) || nextAssetTag || "AUTO",
      serial: data.serial?.trim() || "",
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
      <p className="py-8 text-center text-sm text-[#6B7280]">Loading...</p>
    );
  }
  
  return (
    <TooltipProvider>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit, (errors) => {
            console.warn("Asset form validation errors:", errors);
            const firstError = Object.values(errors)[0];
            if (firstError?.message) {
              toast({
                title: "Please complete required fields",
                description: String(firstError.message),
                variant: "destructive",
              });
            }
          })}
          onKeyDown={handleKeyDown}
          className="space-y-8"
        >
          {/* Basic Details */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Package} title="Basic Details" />
            <div className={formFieldGridClass}>
                      <FormField
                        control={form.control}
                        name="tag"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2 text-sm font-medium text-[#111827]">
                              Asset Tag <span className="text-[#DC2626]">*</span>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-4 w-4 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isEditMode ? "Unique identifier for tracking this asset" : "Auto-generated from Settings → Running Numbers"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Auto-generated" 
                                className="w-full" 
                                autoFocus={!isEditMode ? false : true}
                                readOnly={!isEditMode}
                                {...field}
                                value={field.value || (!isEditMode ? nextAssetTag : "") || ""}
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
                            <FormLabel className="text-sm font-medium text-[#111827]">
                              Asset Name <span className="text-[#DC2626]">*</span>
                            </FormLabel>
                            <Select
                              key={`type-${assetId ?? "new"}-${field.value}`}
                              open={openOptionMenu === "type"}
                              onOpenChange={(open) => setOpenOptionMenu(open ? "type" : null)}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select asset name" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("type");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Asset Name
                                </div>
                                <div className="my-1 border-t" />
                                {typeOptions.map((type) => (
                                  <EditableOptionItem
                                    key={type}
                                    option={type}
                                    onEdit={() => handleOpenEditOption("type", type)}
                                  />
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
                            <FormLabel className="text-sm font-medium text-[#111827]">
                              Asset Category <span className="text-[#DC2626]">*</span>
                            </FormLabel>
                            <Select
                              key={`category-${assetId ?? "new"}-${field.value}`}
                              open={openOptionMenu === "category"}
                              onOpenChange={(open) => setOpenOptionMenu(open ? "category" : null)}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select asset category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("category");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Asset Category
                                </div>
                                <div className="my-1 border-t" />
                                {categoryOptions.map((category) => (
                                  <EditableOptionItem
                                    key={category}
                                    option={category}
                                    onEdit={() => handleOpenEditOption("category", category)}
                                  />
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
                            <FormLabel className="text-sm font-medium text-[#111827]">Serial Number</FormLabel>
                            <FormControl>
                              <Input placeholder="" className="w-full" {...field} />
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
                              <Input placeholder="" className="w-full" {...field} />
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
                              open={openOptionMenu === "manufacturer"}
                              onOpenChange={(open) => setOpenOptionMenu(open ? "manufacturer" : null)}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select manufacturer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("manufacturer");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Manufacturer
                                </div>
                                <div className="my-1 border-t" />
                                {manufacturerOptions.map((manufacturer) => (
                                  <EditableOptionItem
                                    key={manufacturer}
                                    option={manufacturer}
                                    onEdit={() => handleOpenEditOption("manufacturer", manufacturer)}
                                  />
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">
                            Assignment Status <span className="text-[#DC2626]">*</span>
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
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
                            <SelectContent className="max-h-[14rem]">
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
                      render={({ field }) => {
                        const selectedName = String(field.value ?? "").trim();
                        const orphanName =
                          selectedName ||
                          String(resolvedAsset?.assignedTo ?? "").trim();
                        const orphanInList =
                          orphanName &&
                          employeeSelectOptions.some(
                            (employee) => employee.name === orphanName,
                          );

                        return (
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
                                    : employeeSelectOptions.length === 0 
                                      ? "No employees found - Create one first" 
                                      : "Select employee"
                                }>
                                  {selectedName || undefined}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
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
                              {employeeSelectOptions.length > 0 && (
                                <div className="border-t my-1" />
                              )}
                              {orphanName && !orphanInList && (
                                <SelectItem value={orphanName}>
                                  {orphanName}
                                </SelectItem>
                              )}
                              {employeeSelectOptions.map((employee) => (
                                <SelectItem key={employee.id} value={employee.name}>
                                  {employee.name} - {employee.designation}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Location</FormLabel>
                          <Select
                            key={`location-${assetId ?? "new"}-${field.value}`}
                            open={openOptionMenu === "location"}
                            onOpenChange={(open) => setOpenOptionMenu(open ? "location" : null)}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
                              <div
                                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                onClick={(event) => {
                                  event.preventDefault();
                                  handleOpenCreateOption("location");
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                Create New Location
                              </div>
                              <div className="my-1 border-t" />
                              {locationOptions.map((location) => (
                                <EditableOptionItem
                                  key={location}
                                  option={location}
                                  onEdit={() => handleOpenEditOption("location", location)}
                                />
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vendor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Vendor</FormLabel>
                          <FormControl>
                            <Input placeholder="" className="w-full" {...field} />
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
                            <Input placeholder="" className="w-full" {...field} />
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
                                  type="text"
                                  inputMode="numeric"
                                  placeholder=""
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "");
                                    field.onChange(v === "" ? undefined : parseInt(v, 10));
                                  }}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
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
                                <SelectContent className="max-h-[14rem]">
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

          <div className={formFieldGrid2Class}>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-[#111827]">Description / Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder=""
                      className="min-h-[100px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#111827]">Attachments</label>
              <div className="space-y-3">
                <div className="flex flex-col items-start gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleFilesSelected(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-[#E5E7EB] text-[#111827]"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </Button>
                  <p className="text-xs text-[#6B7280]">
                    Attach invoices, warranty cards or photos.
                  </p>
                </div>

                {attachments.length > 0 && (
                  <ul className="space-y-2">
                    {attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-[#E5E7EB] bg-white px-3 py-2"
                      >
                        <a
                          href={attachment.dataUrl}
                          download={attachment.name}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-sm font-medium text-[#2563EB] hover:underline"
                        >
                          {attachment.name}
                        </a>
                        <span className="shrink-0 text-xs text-[#6B7280]">
                          {formatFileSize(attachment.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          className="shrink-0 rounded p-1 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#DC2626]"
                          aria-label={`Remove ${attachment.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

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
                {isEditMode ? "Update Asset" : "Create Asset"}
              </Button>
            </div>
          )}
        </form>
      </Form>

      <Dialog
        open={optionDialog !== null}
        onOpenChange={(open) => {
          if (!open && !optionSaving) closeOptionDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {optionDialog?.mode === "edit" ? "Edit" : "Create New"}{" "}
              {optionDialog ? optionLabels[optionDialog.target] : "Option"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newOptionName}
            onChange={(event) => setNewOptionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSaveOption();
              }
            }}
            placeholder={`Enter ${optionDialog ? optionLabels[optionDialog.target].toLowerCase() : "option"}`}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={optionSaving}
              onClick={closeOptionDialog}
            >
              Cancel
            </Button>
            <Button type="button" disabled={optionSaving} onClick={() => void handleSaveOption()}>
              {optionSaving
                ? "Saving..."
                : optionDialog?.mode === "edit"
                  ? "Save"
                  : "Create & Select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
