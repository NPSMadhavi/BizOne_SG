import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type DocType =
  | "po" | "inv" | "qt" | "do" | "grn" | "cn" | "dn" | "pi" | "pv"
  | "igr" | "gin" | "st" | "sa" | "si";

type TableCol = { table: string; col: string };

const TABLE_MAP: Record<DocType, TableCol[]> = {
  po:  [{ table: "purchase_orders",   col: "po_number" }],
  inv: [{ table: "invoices",          col: "inv_number" }],
  qt:  [{ table: "quotations",        col: "qt_number" }],
  do:  [{ table: "delivery_orders",   col: "do_number" }],
  grn: [{ table: "grn",               col: "grn_number" }],
  cn:  [{ table: "credit_notes",      col: "cn_number" }],
  dn:  [{ table: "debit_notes",       col: "dn_number" }],
  // Sales PI and Vendor PI share the same settings counter
  pi:  [
    { table: "proforma_invoices", col: "pi_number" },
    { table: "vendor_invoices",   col: "pi_number" },
  ],
  pv:  [{ table: "vouchers",          col: "voucher_number" }],
  igr: [{ table: "goods_receipts",    col: "grn_number" }],
  gin: [{ table: "goods_issues",      col: "gin_number" }],
  st:  [{ table: "stock_transfers",   col: "transfer_number" }],
  sa:  [{ table: "stock_adjustments", col: "adjustment_number" }],
  si:  [{ table: "stock_items",       col: "code" }],
};

const COL_MAP: Record<DocType, { prefix: string; counter: string; suffix: string; fallbackPrefix: string }> = {
  po:  { prefix: "po_prefix",  counter: "po_counter",  suffix: "po_suffix",  fallbackPrefix: "PO" },
  inv: { prefix: "inv_prefix", counter: "inv_counter", suffix: "inv_suffix", fallbackPrefix: "INV" },
  qt:  { prefix: "qt_prefix",  counter: "qt_counter",  suffix: "qt_suffix",  fallbackPrefix: "QT" },
  do:  { prefix: "do_prefix",  counter: "do_counter",  suffix: "do_suffix",  fallbackPrefix: "DO" },
  grn: { prefix: "grn_prefix", counter: "grn_counter", suffix: "grn_suffix", fallbackPrefix: "GRN" },
  cn:  { prefix: "cn_prefix",  counter: "cn_counter",  suffix: "cn_suffix",  fallbackPrefix: "CN" },
  dn:  { prefix: "dn_prefix",  counter: "dn_counter",  suffix: "dn_suffix",  fallbackPrefix: "DN" },
  pi:  { prefix: "pi_prefix",  counter: "pi_counter",  suffix: "pi_suffix",  fallbackPrefix: "PI" },
  pv:  { prefix: "pv_prefix",  counter: "pv_counter",  suffix: "pv_suffix",  fallbackPrefix: "PV" },
  igr: { prefix: "igr_prefix", counter: "igr_counter", suffix: "igr_suffix", fallbackPrefix: "IGR" },
  gin: { prefix: "gin_prefix", counter: "gin_counter", suffix: "gin_suffix", fallbackPrefix: "GIN" },
  st:  { prefix: "st_prefix",  counter: "st_counter",  suffix: "st_suffix",  fallbackPrefix: "ST" },
  sa:  { prefix: "sa_prefix",  counter: "sa_counter",  suffix: "sa_suffix",  fallbackPrefix: "SA" },
  si:  { prefix: "si_prefix",  counter: "si_counter",  suffix: "si_suffix",  fallbackPrefix: "STK" },
};

export function buildDocNumber(prefix: string, counter: number, suffix: string): string {
  return `${prefix || ""}${String(counter)}${suffix || ""}`;
}

async function numberExists(type: DocType, number: string, companyId?: number): Promise<boolean> {
  const tables = TABLE_MAP[type];
  for (const { table, col } of tables) {
    const companyClause = companyId ? sql` AND company_id = ${companyId}` : sql``;
    try {
      const rows = await db.execute(
        sql`SELECT 1 FROM ${sql.raw(table)} WHERE ${sql.raw(col)} = ${number}${companyClause} LIMIT 1`
      ) as unknown as any[];
      const arr = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
      if (arr.length > 0) return true;
    } catch {
      // Table may not exist yet in some environments — skip
    }
  }
  return false;
}

export async function nextDocNumber(type: DocType, companyId?: number): Promise<string> {
  const cols = COL_MAP[type];
  const counterCol = cols.counter;
  const prefixCol = cols.prefix;
  const suffixCol = cols.suffix;

  let rows: any[];

  if (companyId) {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = COALESCE(${sql.raw(counterCol)}, 0) + 1 WHERE company_id = ${companyId} RETURNING *`
    ) as unknown as any[];
  } else {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = COALESCE(${sql.raw(counterCol)}, 0) + 1 WHERE id = (SELECT id FROM settings ORDER BY id LIMIT 1) RETURNING *`
    ) as unknown as any[];
  }

  const s = Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0];

  if (!s) {
    return `${cols.fallbackPrefix}1`;
  }

  const prefix = s[prefixCol] ?? cols.fallbackPrefix;
  const suffix = s[suffixCol] ?? "";
  let counter = Number(s[counterCol]) || 1;
  let candidate = buildDocNumber(prefix, counter, suffix);

  let safety = 0;
  while (await numberExists(type, candidate, companyId) && safety < 50) {
    safety++;
    counter++;
    candidate = buildDocNumber(prefix, counter, suffix);
    if (companyId) {
      await db.execute(
        sql`UPDATE settings SET ${sql.raw(counterCol)} = ${counter} WHERE company_id = ${companyId}`
      );
    } else {
      await db.execute(
        sql`UPDATE settings SET ${sql.raw(counterCol)} = ${counter} WHERE id = (SELECT id FROM settings ORDER BY id LIMIT 1)`
      );
    }
  }

  return candidate;
}

/** Preview next number without consuming the counter (for UI). */
export function previewDocNumber(prefix: string, counter: number | string, suffix: string): string {
  const n = (parseInt(String(counter), 10) || 0) + 1;
  return buildDocNumber(prefix || "", n, suffix || "");
}
