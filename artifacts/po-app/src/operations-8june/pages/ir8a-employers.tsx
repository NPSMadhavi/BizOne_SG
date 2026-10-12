import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/operations-8june/lib/queryClient";

type Ir8aEmployer = {
  id: number;
  employerName: string;
  uen: string;
  address: string;
  signatoryName: string;
  designation: string;
  declarationDate?: string | null;
  signature?: string | null;
};

type EmployerForm = {
  employerName: string;
  uen: string;
  address: string;
  signatoryName: string;
  designation: string;
  declarationDate: string;
  signature: string;
};

function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function emptyForm(company?: { name?: string; registrationNo?: string; address?: string } | null): EmployerForm {
  return {
    employerName: company?.name?.trim() || "",
    uen: company?.registrationNo?.trim() || "",
    address: company?.address?.trim() || "",
    signatoryName: "",
    designation: "",
    declarationDate: todayInput(),
    signature: "",
  };
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-[#475569]">
      {children} <span className="text-[#EF4444]">*</span>
    </label>
  );
}

function Explain({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-[#2563EB]">✓</span>
      <div>
        <p className="text-sm font-semibold text-[#1E3A5F]">{title}</p>
        <p className="text-sm text-[#64748B]">{text}</p>
      </div>
    </div>
  );
}

function SignatureUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <button
        type="button"
        className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-white px-3"
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <img src={value} alt="Uploaded signature" className="max-h-20 max-w-full object-contain" />
        ) : (
          <span className="text-sm text-[#94A3B8]">Click to upload signature</span>
        )}
      </button>
      {value ? (
        <button type="button" className="mt-2 text-xs font-medium text-[#2563EB]" onClick={() => onChange("")}>
          Remove signature
        </button>
      ) : null}
    </div>
  );
}

export default function Ir8aEmployersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EmployerForm>(() => emptyForm(null));

  const { data: employers = [], isLoading } = useQuery<Ir8aEmployer[]>({
    queryKey: ["/api/ir8a/employers"],
  });

  const createMutation = useMutation({
    mutationFn: async (payload: EmployerForm) => {
      const response = await apiRequest("POST", "/api/ir8a/employers", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ir8a/employers"] });
      toast({ title: "Employer added" });
      setShowForm(false);
    },
    onError: (error: Error) => {
      toast({ title: "Could not save employer", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/ir8a/employers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ir8a/employers"] });
      toast({ title: "Employer removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not remove employer", description: error.message, variant: "destructive" });
    },
  });

  function openForm() {
    setForm(emptyForm(selectedCompany));
    setShowForm(true);
  }

  function update(field: keyof EmployerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function save() {
    const missing = [
      !form.employerName.trim() && "Employer Name",
      !form.uen.trim() && "UEN / Tax Reference No.",
      !form.address.trim() && "Address",
      !form.signatoryName.trim() && "Name",
      !form.designation.trim() && "Designation",
      !form.declarationDate && "Date",
      !form.signature && "Signature",
    ].filter(Boolean);
    if (missing.length) {
      toast({ title: "Fill the required fields", description: missing.join(", "), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...form,
      employerName: form.employerName.trim(),
      uen: form.uen.trim(),
      address: form.address.trim(),
      signatoryName: form.signatoryName.trim(),
      designation: form.designation.trim(),
    });
  }

  const inputClass = "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#111827] outline-none focus:border-[#2563EB]";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Employer's (IR8A)</h1>
          <p className="mt-1 text-sm text-[#6B7280]">Employer particulars and declaration for Form IR8A</p>
        </div>
        {!showForm ? (
          <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={openForm}>
            <Plus className="h-4 w-4" /> Add Employer
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_300px]">
            <div className="rounded-2xl border border-[#E8EEF8] bg-white p-6">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#1E3A5F]">Employer Details</h2>
                <p className="text-sm text-[#64748B]">Provide your company details as registered with IRAS.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Employer Name</FieldLabel>
                    <input className={inputClass} value={form.employerName} onChange={(event) => update("employerName", event.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>UEN / Tax Reference No.</FieldLabel>
                    <input className={inputClass} value={form.uen} onChange={(event) => update("uen", event.target.value)} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Address</FieldLabel>
                  <textarea className={`${inputClass} min-h-24 resize-y`} value={form.address} onChange={(event) => update("address", event.target.value)} />
                </div>
              </div>
            </div>
            <aside className="h-fit rounded-2xl border border-[#D6E6FA] bg-[#F3F8FF] p-5">
              <div className="mb-4 flex items-center gap-2 text-[#1E3A5F]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2563EB] text-white">
                  <Info className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-semibold">Field Explanations</h3>
              </div>
              <div className="space-y-4">
                <Explain title="Employer Name" text="Registered company name." />
                <Explain title="UEN / Tax Reference No." text="Unique Entity Number (UEN) or Tax Reference Number." />
                <Explain title="Address" text="Registered address of the company as per ACRA/IRAS." />
              </div>
            </aside>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_300px]">
            <div className="rounded-2xl border border-[#E8EEF8] bg-white p-6">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#1E3A5F]">Employer's Declaration</h2>
                <p className="text-sm text-[#64748B]">This section is to be signed/confirmed by the employer.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <input className={inputClass} value={form.signatoryName} onChange={(event) => update("signatoryName", event.target.value)} />
                </div>
                <div>
                  <FieldLabel>Date</FieldLabel>
                  <input type="date" className={inputClass} value={form.declarationDate} onChange={(event) => update("declarationDate", event.target.value)} />
                </div>
                <div>
                  <FieldLabel>Designation</FieldLabel>
                  <input className={inputClass} value={form.designation} onChange={(event) => update("designation", event.target.value)} />
                </div>
                <div>
                  <FieldLabel>Signature</FieldLabel>
                  <SignatureUpload value={form.signature} onChange={(value) => update("signature", value)} />
                </div>
              </div>
            </div>
            <aside className="h-fit rounded-2xl border border-[#D6E6FA] bg-[#F3F8FF] p-5">
              <div className="mb-4 flex items-center gap-2 text-[#1E3A5F]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2563EB] text-white">
                  <Info className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-semibold">Field Explanations</h3>
              </div>
              <div className="space-y-4">
                <Explain title="Name" text="Authorised person's name." />
                <Explain title="Designation" text="Position in the company." />
                <Explain title="Signature" text="Digital or scanned signature." />
                <Explain title="Date" text="Date of declaration." />
              </div>
            </aside>
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={createMutation.isPending} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
                  <th className="px-4 py-3 font-medium">Employer Name</th>
                  <th className="px-3 py-3 font-medium">UEN / Tax Reference No.</th>
                  <th className="px-3 py-3 font-medium">Address</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Designation</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">Loading employers...</td>
                  </tr>
                ) : employers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">No employers yet. Use Add Employer to create one.</td>
                  </tr>
                ) : (
                  employers.map((employer) => (
                    <tr key={employer.id} className="border-b border-[#F3F4F6] last:border-b-0">
                      <td className="px-4 py-3 font-medium text-[#111827]">{employer.employerName}</td>
                      <td className="px-3 py-3 text-[#374151]">{employer.uen}</td>
                      <td className="max-w-[240px] px-3 py-3 text-[#374151]">{employer.address}</td>
                      <td className="px-3 py-3 text-[#374151]">{employer.signatoryName}</td>
                      <td className="px-3 py-3 text-[#374151]">{employer.designation}</td>
                      <td className="px-3 py-3 text-[#374151]">{formatDisplayDate(employer.declarationDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#DC2626]"
                          aria-label={`Remove ${employer.employerName}`}
                          onClick={() => deleteMutation.mutate(employer.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
