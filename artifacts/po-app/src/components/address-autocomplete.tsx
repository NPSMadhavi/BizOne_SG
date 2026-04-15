import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    building?: string;
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

const COUNTRY_CODES: Record<string, string> = {
  Singapore: "sg",
  India: "in",
  Malaysia: "my",
  Australia: "au",
  "United States": "us",
  "United Kingdom": "gb",
  China: "cn",
  Japan: "jp",
  Indonesia: "id",
  Thailand: "th",
  Philippines: "ph",
  "Hong Kong": "hk",
  "South Korea": "kr",
  Germany: "de",
  France: "fr",
  Canada: "ca",
  "United Arab Emirates": "ae",
  "Saudi Arabia": "sa",
  Bangladesh: "bd",
  "Sri Lanka": "lk",
  Vietnam: "vn",
  Myanmar: "mm",
  Nepal: "np",
  Pakistan: "pk",
};

function formatAddressLine(result: NominatimResult): string {
  const a = result.address;
  const parts: string[] = [];

  if (a.building) parts.push(a.building);
  if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
  else if (a.road) parts.push(a.road);
  if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood || "");
  if (a.city_district) parts.push(a.city_district);

  if (parts.length > 0) return parts.filter(Boolean).join(", ");

  const segments = result.display_name.split(",");
  return segments.slice(0, Math.min(3, segments.length - 2)).join(",").trim();
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPostalCodeChange?: (postalCode: string) => void;
  country?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPostalCodeChange,
  country,
  placeholder = "Start typing to search address…",
  rows = 2,
  className,
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const cc = country ? COUNTRY_CODES[country] : undefined;
        const params = new URLSearchParams({
          q,
          format: "json",
          addressdetails: "1",
          limit: "6",
        });
        if (cc) params.set("countrycodes", cc);

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          { headers: { "Accept-Language": "en" } }
        );
        if (!res.ok) throw new Error("Failed");
        const data: NominatimResult[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 600);
  }, [country]);

  function handleInput(val: string) {
    setQuery(val);
    onChange(val);
    search(val);
  }

  function handleSelect(result: NominatimResult) {
    const line = formatAddressLine(result);
    setQuery(line);
    onChange(line);
    if (onPostalCodeChange && result.address.postcode) {
      onPostalCodeChange(result.address.postcode.replace(/\s/g, ""));
    }
    setSuggestions([]);
    setOpen(false);
  }

  function handleClear() {
    setQuery("");
    onChange("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <textarea
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={cn(
            "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none pr-8",
            className
          )}
        />
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && query && (
            <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg overflow-hidden">
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5" />
            Powered by OpenStreetMap · Click to fill
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {suggestions.map(r => (
              <li key={r.place_id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleSelect(r)}
                >
                  <div className="font-medium truncate">{formatAddressLine(r)}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {r.display_name}
                  </div>
                  {r.address.postcode && (
                    <div className="text-xs text-primary mt-0.5">
                      Postal Code: {r.address.postcode.replace(/\s/g, "")}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
