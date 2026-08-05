import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeDocumentSchema, documentTypeEnum, type Employee } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/operations-8june/lib/queryClient";
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
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/operations-8june/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText } from "lucide-react";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";

const formSchema = insertEmployeeDocumentSchema
  .omit({ filePath: true })
  .extend({
    fileData: z.string().optional(),
    employeeId: z.number().or(z.string().transform((value) => parseInt(value, 10))),
  });

type DocumentFormData = z.infer<typeof formSchema>;

interface DocumentFormProps {
  documentId?: number;
  employeeId?: number;
  onSuccess?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  formId?: string;
  hideShell?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

export default function DocumentForm({
  documentId,
  employeeId,
  onSuccess,
  isOpen = true,
  onClose,
  formId = "document-form",
  hideShell = false,
  onPendingChange,
}: DocumentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditMode = !!documentId;
  const [file, setFile] = useState<File | null>(null);

  const formLabelClass = "text-sm font-medium text-[#111827]";

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: isOpen,
  });

  const { data: documentData, isLoading: isLoadingDocument } = useQuery({
    queryKey: ["/api/documents", documentId],
    enabled: !!documentId && isOpen,
  });

  const form = useForm<DocumentFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employeeId: employeeId || "",
      documentType: "passport",
      issueDate: undefined,
      expiryDate: undefined,
      notes: "",
    },
  });

  useEffect(() => {
    if (documentData) {
      const doc = documentData as Record<string, unknown>;
      form.reset({
        employeeId: doc.employeeId as number,
        documentType: doc.documentType as DocumentFormData["documentType"],
        issueDate: doc.issueDate ? new Date(String(doc.issueDate)) : undefined,
        expiryDate: doc.expiryDate ? new Date(String(doc.expiryDate)) : undefined,
        notes: String(doc.notes ?? ""),
      });
    } else if (employeeId) {
      form.setValue("employeeId", employeeId);
    }
  }, [documentData, employeeId, form]);

  useEffect(() => {
    if (isOpen && employeeId) {
      form.setValue("employeeId", employeeId);
    }
    if (!isOpen) {
      form.reset({
        employeeId: employeeId || "",
        documentType: "passport",
        issueDate: undefined,
        expiryDate: undefined,
        notes: "",
      });
      setFile(null);
    }
  }, [isOpen, employeeId, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);

    if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setValue("fileData", reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      form.setValue("fileData", undefined);
    }
  };

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: DocumentFormData) => {
      const res = await apiRequest("POST", "/api/documents", data);
      return await res.json();
    },
    onSuccess: async () => {
      toast({
        title: "Document uploaded",
        description: "The document has been uploaded successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      if (employeeId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/employees", employeeId, "documents"],
        });
      }
      form.reset();
      setFile(null);
      onClose?.();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload document",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    onPendingChange?.(uploadDocumentMutation.isPending);
  }, [uploadDocumentMutation.isPending, onPendingChange]);

  const onSubmit = (data: DocumentFormData) => {
    if (!isEditMode && !data.fileData) {
      toast({
        title: "Missing file",
        description: "Please upload a document file.",
        variant: "destructive",
      });
      return;
    }
    uploadDocumentMutation.mutate(data);
  };

  if (!isOpen) return null;

  if (isEditMode && isLoadingDocument) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8"
      >
        <section className="space-y-4">
          <ModalSectionHeader icon={FileText} title="Document Information" />
          <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 lg:grid-cols-2">
            <FormField
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={formLabelClass}>Employee</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(parseInt(value, 10))}
                    value={field.value ? String(field.value) : undefined}
                    disabled={!!employeeId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id.toString()}>
                          {employee.name} ({employee.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Employee this document belongs to</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="documentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={formLabelClass}>Document Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeEnum.enumValues.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Type of document being uploaded</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="issueDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className={formLabelClass}>Issue Date</FormLabel>
                  <FormControl>
                    <DatePicker date={field.value} setDate={(date) => field.onChange(date)} />
                  </FormControl>
                  <FormDescription>Date when the document was issued</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiryDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className={formLabelClass}>Expiry Date</FormLabel>
                  <FormControl>
                    <DatePicker date={field.value} setDate={(date) => field.onChange(date)} />
                  </FormControl>
                  <FormDescription>Date when the document expires</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="lg:col-span-2">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={formLabelClass}>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional information about this document"
                        className="min-h-[100px] resize-none"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <ModalSectionHeader icon={Upload} title="Document Upload" />
          <div>
            <Label className={formLabelClass}>Document File</Label>
            <div className="mt-2 flex justify-center rounded-md border-2 border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-6 pb-6 pt-5">
              <div className="space-y-1 text-center">
                <Upload className="mx-auto h-12 w-12 text-[#9CA3AF]" />
                <div className="flex text-sm text-[#6B7280]">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer rounded-md bg-white font-medium text-[#2563EB] hover:text-[#1D4ED8] focus-within:outline-none focus-within:ring-2 focus-within:ring-[#2563EB] focus-within:ring-offset-2"
                  >
                    <span>Upload a file</span>
                    <Input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      onChange={handleFileChange}
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-[#9CA3AF]">PDF, JPG, JPEG, PNG up to 10MB</p>
              </div>
            </div>
            {file ? (
              <p className="mt-2 text-sm text-green-600">File selected: {file.name}</p>
            ) : null}
          </div>
        </section>
      </form>
    </Form>
  );
}
