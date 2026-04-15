import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type DocType = "po" | "inv" | "qt" | "do" | "grn";

export async function nextDocNumber(type: DocType, companyId?: number): Promise<string> {
  const counterCol =
    type === "po" ? "po_counter" :
    type === "inv" ? "inv_counter" :
    type === "qt" ? "qt_counter" :
    type === "grn" ? "grn_counter" : "do_counter";

  const prefixCol =
    type === "po" ? "po_prefix" :
    type === "inv" ? "inv_prefix" :
    type === "qt" ? "qt_prefix" :
    type === "grn" ? "grn_prefix" : "do_prefix";

  const suffixCol =
    type === "po" ? "po_suffix" :
    type === "inv" ? "inv_suffix" :
    type === "qt" ? "qt_suffix" :
    type === "grn" ? "grn_suffix" : "do_suffix";

  let rows: any[];

  if (companyId) {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = ${sql.raw(counterCol)} + 1 WHERE company_id = ${companyId} RETURNING *`
    ) as any[];
  } else {
    rows = await db.execute(
      sql`UPDATE settings SET ${sql.raw(counterCol)} = ${sql.raw(counterCol)} + 1 WHERE id = (SELECT id FROM settings ORDER BY id LIMIT 1) RETURNING *`
    ) as any[];
  }

  const s = Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0];

  if (!s) {
    const prefix = type.toUpperCase();
    return `${prefix}-0001`;
  }

  const prefix = s[prefixCol] ?? type.toUpperCase();
  const counter = s[counterCol] ?? 1;
  const suffix = s[suffixCol] ?? "";
  const padded = String(counter).padStart(4, "0");

  return `${prefix}-${padded}${suffix}`;
}
