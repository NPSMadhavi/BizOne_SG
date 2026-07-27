import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type DocType = "po" | "inv" | "qt" | "do" | "grn" | "cn" | "pi" | "pv";

const TABLE_MAP: Record<DocType, { table: string; col: string }> = {
  po:  { table: "purchase_orders",    col: "po_number" },
  inv: { table: "invoices",           col: "inv_number" },
  qt:  { table: "quotations",         col: "qt_number" },
  do:  { table: "delivery_orders",    col: "do_number" },
  grn: { table: "grn",                col: "grn_number" },
  cn:  { table: "credit_notes",       col: "cn_number" },
  pi:  { table: "proforma_invoices",  col: "pi_number" },
  pv:  { table: "vouchers",           col: "voucher_number" },
};

function buildNumber(prefix: string, counter: number, suffix: string): string {
  return `${prefix}${String(counter)}${suffix}`;
}

async function numberExists(type: DocType, number: string, companyId?: number): Promise<boolean> {
  const { table, col } = TABLE_MAP[type];
  const companyClause = companyId ? sql` AND company_id = ${companyId}` : sql``;
  const rows = await db.execute(
    sql`SELECT 1 FROM ${sql.raw(table)} WHERE ${sql.raw(col)} = ${number}${companyClause} LIMIT 1`
  ) as unknown as any[];
  const arr = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  return arr.length > 0;
}

export async function nextDocNumber(type: DocType, companyId?: number): Promise<string> {
  const counterCol =
    type === "po"  ? "po_counter"  :
    type === "inv" ? "inv_counter" :
    type === "qt"  ? "qt_counter"  :
    type === "grn" ? "grn_counter" :
    type === "cn"  ? "cn_counter"  :
    type === "pi"  ? "pi_counter"  :
    type === "pv"  ? "pv_counter"  : "do_counter";

  const prefixCol =
    type === "po"  ? "po_prefix"  :
    type === "inv" ? "inv_prefix" :
    type === "qt"  ? "qt_prefix"  :
    type === "grn" ? "grn_prefix" :
    type === "cn"  ? "cn_prefix"  :
    type === "pi"  ? "pi_prefix"  :
    type === "pv"  ? "pv_prefix"  : "do_prefix";

  const suffixCol =
    type === "po"  ? "po_suffix"  :
    type === "inv" ? "inv_suffix" :
    type === "qt"  ? "qt_suffix"  :
    type === "grn" ? "grn_suffix" :
    type === "cn"  ? "cn_suffix"  :
    type === "pi"  ? "pi_suffix"  :
    type === "pv"  ? "pv_suffix"  : "do_suffix";

  let rows: any[];

  if (companyId) {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = ${sql.raw(counterCol)} + 1 WHERE company_id = ${companyId} RETURNING *`
    ) as unknown as any[];
  } else {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = ${sql.raw(counterCol)} + 1 WHERE id = (SELECT id FROM settings ORDER BY id LIMIT 1) RETURNING *`
    ) as unknown as any[];
  }

  const s = Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0];

  if (!s) {
    return `${type.toUpperCase()}1`;
  }

  const prefix  = s[prefixCol] ?? type.toUpperCase();
  const suffix  = s[suffixCol] ?? "";
  let counter   = s[counterCol] ?? 1;
  let candidate = buildNumber(prefix, counter, suffix);

  // Skip any numbers that already exist (handles gaps from auto-creation or retries)
  let safety = 0;
  while (await numberExists(type, candidate, companyId) && safety < 50) {
    safety++;
    counter++;
    candidate = buildNumber(prefix, counter, suffix);
    // Advance the counter in DB to stay in sync
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
