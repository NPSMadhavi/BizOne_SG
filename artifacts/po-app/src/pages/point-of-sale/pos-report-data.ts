export type PosPayment = { method?: string; amount?: number };

export type PosSale = {
  id: string;
  posNumber?: string;
  createdAt?: string;
  channel?: string;
  salesPerson?: string;
  salesPersonId?: string | number | null;
  createdByUserId?: number | null;
  total?: number;
  tax?: number;
  subtotal?: number;
  status?: string;
  customerName?: string;
  counter?: string;
  payments?: PosPayment[];
};

export const PAYMENT_MODES = [
  { key: "Cash", matches: ["cash"], color: "#3B82F6", soft: "#EFF6FF" },
  { key: "PayNow", matches: ["paynow", "pay now"], color: "#60A5FA", soft: "#EFF6FF" },
  { key: "NETS", matches: ["nets"], color: "#8B5CF6", soft: "#F5F3FF" },
  { key: "Card", matches: ["card", "visa", "mastercard", "credit"], color: "#F59E0B", soft: "#FFFBEB" },
  { key: "Gift Voucher", matches: ["voucher", "gift"], color: "#10B981", soft: "#ECFDF3" },
] as const;

export const TREND_COLORS = { sales: "#3B82F6", refunds: "#5EEAD4" };

export type PaymentModeKey = (typeof PAYMENT_MODES)[number]["key"];

export const CHANNEL_LABELS: Record<string, string> = {
  retail: "Retail",
  supermarket: "Supermarket",
  restaurants: "Restaurants",
  pharmacy: "Pharmacy",
  electronics: "Electronics",
};

export function money(value: number, digits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  return `S$ ${safe.toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function compactAxis(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 1000) return `${Math.round(safe / 100) / 10}K`.replace(".0K", "K");
  return String(Math.round(safe));
}

export function isoDate(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return toIso(date);
}

export function monthBounds(anchor = new Date()) {
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toIso(from), to: toIso(to) };
}

export function toIso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function prettyDate(iso: string) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function prettyTime(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

export function outletLabel(channel: string | undefined) {
  const key = String(channel || "").toLowerCase();
  return CHANNEL_LABELS[key] || (key ? key[0].toUpperCase() + key.slice(1) : "Retail");
}

export function counterOf(sale: PosSale) {
  const value = String(sale.counter || "").trim();
  return value || "Counter 1";
}

export function customerOf(sale: PosSale) {
  const value = String(sale.customerName || "").trim();
  return value || "Cash";
}

export function salespersonOf(sale: PosSale) {
  const value = String(sale.salesPerson || "").trim();
  return value || "Unassigned";
}

export function isRefund(sale: PosSale) {
  const status = String(sale.status || "").toLowerCase();
  return status.includes("refund") || Number(sale.total) < 0;
}

export function saleTotal(sale: PosSale) {
  return Math.abs(Number(sale.total) || 0);
}

export function modeOfMethod(method: string | undefined): PaymentModeKey {
  const value = String(method || "").toLowerCase();
  const found = PAYMENT_MODES.find((mode) => mode.matches.some((part) => value.includes(part)));
  return found?.key || "Cash";
}

export function paymentsOf(sale: PosSale): { mode: PaymentModeKey; amount: number }[] {
  const rows = Array.isArray(sale.payments) ? sale.payments : [];
  const parsed = rows
    .map((row) => ({ mode: modeOfMethod(row.method), amount: Math.abs(Number(row.amount) || 0) }))
    .filter((row) => row.amount > 0);
  if (parsed.length) return parsed;
  const total = saleTotal(sale);
  return total > 0 ? [{ mode: "Cash", amount: total }] : [];
}

export function inRange(sale: PosSale, from: string, to: string) {
  const day = isoDate(sale.createdAt);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function previousRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { from: toIso(prevStart), to: toIso(prevEnd) };
}

export function changePct(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function eachDay(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return days;
  while (cursor <= end && days.length < 62) {
    days.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function gstOf(sale: PosSale) {
  const tax = Math.abs(Number(sale.tax) || 0);
  const total = saleTotal(sale);
  if (tax > 0) return { taxable: Math.max(0, total - tax), gst: tax, total };
  const taxable = Math.abs(Number(sale.subtotal) || 0);
  if (taxable > 0 && total > taxable) return { taxable, gst: total - taxable, total };
  return { taxable: total, gst: 0, total };
}
