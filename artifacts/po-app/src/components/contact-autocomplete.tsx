import { useEffect } from "react";
import { Input } from "@/components/ui/input";

export interface Contact {
  name: string;
  address?: string | null;
  contact?: string | null;
  email?: string | null;
  deliveryAddress?: string | null;
}

interface ContactAutocompleteProps {
  type: "vendor" | "customer";
  value: string;
  onChange: (val: string) => void;
  onSelect: (contact: Contact) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Plain name input — directory picking is done via DirectoryPickerButton
 * ("Pick from Vendors" / "Pick from Customers"). Autocomplete dropdown removed.
 * Still listens for Veda guided-fill events.
 */
export function ContactAutocomplete({
  type,
  value,
  onChange,
  onSelect,
  placeholder,
  className,
}: ContactAutocompleteProps) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; contact?: Contact }>).detail;
      if (!detail?.contact || (detail.type && detail.type !== type)) return;
      onChange(detail.contact.name);
      onSelect(detail.contact);
    };
    window.addEventListener("veda:select-contact", handler);
    return () => window.removeEventListener("veda:select-contact", handler);
  }, [type, onChange, onSelect]);

  return (
    <Input
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="nope"
    />
  );
}
