import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

async function fetchContacts(type: "vendor" | "customer"): Promise<Contact[]> {
  const res = await fetch(`/api/contacts?type=${type}`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

export function ContactAutocomplete({
  type,
  value,
  onChange,
  onSelect,
  placeholder,
  className,
}: ContactAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["contacts", type],
    queryFn: () => fetchContacts(type),
    staleTime: 30_000,
  });

  const filtered =
    value.trim().length > 0
      ? contacts.filter((c) =>
          c.name.toLowerCase().includes(value.toLowerCase().trim())
        )
      : contacts;

  useEffect(() => {
    setHighlighted(0);
  }, [filtered.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function select(contact: Contact) {
    onChange(contact.name);
    onSelect(contact);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((contact, i) => (
            <div
              key={i}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm",
                i === highlighted ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                select(contact);
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <div className="font-medium">{contact.name}</div>
              {(contact.contact || contact.email) && (
                <div className="text-xs text-muted-foreground truncate">
                  {[contact.contact, contact.email].filter(Boolean).join(" · ")}
                </div>
              )}
              {contact.address && (
                <div className="text-xs text-muted-foreground truncate">{contact.address}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
