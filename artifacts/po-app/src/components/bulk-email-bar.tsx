import { Search, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailSendDialog } from "@/components/email-send-dialog";

export async function markDocsSent(apiPath: string, ids: number[], recipients: string[]) {
  await Promise.all(ids.map(id =>
    fetch(`/api/${apiPath}/${id}/mark-sent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentTo: recipients }),
    })
  ));
}

export async function fetchDocJson(apiPath: string, id: number) {
  const res = await fetch(`/api/${apiPath}/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load document ${id}`);
  return res.json();
}

export function BulkEmailBar({
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  partyLabel,
  partyFilter,
  partyNames,
  onPartyChange,
  selectedCount,
  onSend,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  partyLabel: "Vendor" | "Customer";
  partyFilter: string;
  partyNames: string[];
  onPartyChange: (value: string) => void;
  selectedCount: number;
  onSend: () => void;
}) {
  const allLabel = partyLabel === "Vendor" ? "All vendors" : "All customers";
  return (
    <Card className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={searchPlaceholder} className="pl-9" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} />
      </div>
      <Select value={partyFilter} onValueChange={onPartyChange}>
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder={`${partyLabel} filter`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {partyNames.map(name => (
            <SelectItem key={name} value={name}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button className="gap-2" disabled={selectedCount === 0} onClick={onSend}>
        <Mail className="h-4 w-4" />
        {selectedCount > 0 ? `Send Email (${selectedCount})` : "Send Email"}
      </Button>
    </Card>
  );
}

export function BulkSelectHeader({
  allSelected,
  someSelected,
  disabled,
  onToggle,
  label,
}: {
  allSelected: boolean;
  someSelected: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean | "indeterminate") => void;
  label: string;
}) {
  return (
    <th className="px-4 py-4 w-10">
      <Checkbox
        checked={allSelected ? true : someSelected ? "indeterminate" : false}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={label}
      />
    </th>
  );
}

export function BulkSelectCell({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean | "indeterminate") => void;
  label: string;
}) {
  return (
    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} aria-label={label} />
    </td>
  );
}

export function ListBulkEmailDialog({
  open,
  onOpenChange,
  companyName,
  partyName,
  contactName,
  email,
  docLabel,
  numbers,
  generateAttachments,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  partyName: string;
  contactName?: string;
  email?: string;
  docLabel: string;
  numbers: string[];
  generateAttachments: () => Promise<{ filename: string; content: string }[]>;
  onSuccess: (recipients: string[]) => Promise<void> | void;
}) {
  const count = numbers.length;
  const plural = count === 1 ? docLabel.replace(/s$/, "") : docLabel;
  if (!open) return null;
  return (
    <EmailSendDialog
      hideTrigger
      open={open}
      onOpenChange={onOpenChange}
      defaultTo={email || ""}
      defaultSubject={`${docLabel} for ${partyName} (${count}) | ${companyName}`}
      defaultBody={`Dear ${contactName || "Sir/Madam"},\n\nPlease find attached ${count} ${plural} for ${partyName}:\n${numbers.map(n => `• ${n}`).join("\n")}\n\nThank you.`}
      pdfFilenames={numbers.map(n => `${n}.pdf`)}
      generateAttachments={generateAttachments}
      onSuccess={onSuccess}
      docInfo={{
        docType: plural,
        docNumber: numbers.join(", "),
        customerName: partyName,
        companyName,
        items: numbers.map(n => ({ description: n })),
        currency: "SGD",
        totalAmount: 0,
      }}
    />
  );
}
