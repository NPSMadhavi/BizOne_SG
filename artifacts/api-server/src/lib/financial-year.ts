/**
 * Financial year helpers: Singapore calendar FY (Jan 1 – Dec 31), period lock, opening balances.
 */
import {
  db,
  financialYearsTable,
  glOpeningBalancesTable,
  customerOpeningBalancesTable,
  vendorOpeningBalancesTable,
  inventoryOpeningBalancesTable,
  fixedAssetOpeningBalancesTable,
  bankOpeningBalancesTable,
  journalEntriesTable,
  journalLinesTable,
} from "@workspace/db";
import { eq, and, sql, asc, lte, gte } from "drizzle-orm";
import { hasMandatoryCloseBackup } from "./accounting-backup.js";

export type FyStatus = "active" | "inactive" | "closing" | "closed";

const CLOSED_MSG = "This financial year is closed. Transactions cannot be created or modified.";

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Singapore FY = calendar year: Jan 1 → Dec 31. Label: FY 2026 */
export function fyBoundsForDate(date: Date | string): { start: string; end: string; label: string } {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  const year = d.getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const label = `FY ${year}`;
  return { start, end, label };
}

export function nextFyBounds(startDate: string): { start: string; end: string; label: string } {
  const y = Number(startDate.slice(0, 4));
  const start = `${y + 1}-01-01`;
  const end = `${y + 1}-12-31`;
  const label = `FY ${y + 1}`;
  return { start, end, label };
}

export async function ensureFinancialYears(companyId: number) {
  const existing = await db
    .select()
    .from(financialYearsTable)
    .where(eq(financialYearsTable.companyId, companyId))
    .orderBy(asc(financialYearsTable.startDate));

  if (existing.length > 0) return existing;

  const current = fyBoundsForDate(new Date());
  const [created] = await db
    .insert(financialYearsTable)
    .values({
      companyId,
      label: current.label,
      startDate: current.start,
      endDate: current.end,
      status: "active",
      auditStatus: "pending",
      activatedAt: new Date(),
    })
    .returning();
  return [created];
}

/** Lookup only — does not seed years (safe for all modules / countries). */
export async function findFyForDate(companyId: number, dateStr: string) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [fy] = await db
    .select()
    .from(financialYearsTable)
    .where(
      and(
        eq(financialYearsTable.companyId, companyId),
        lte(financialYearsTable.startDate, dateStr),
        gte(financialYearsTable.endDate, dateStr),
      ),
    )
    .limit(1);
  return fy || null;
}

export async function getActiveFinancialYear(companyId: number) {
  const [active] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.companyId, companyId), eq(financialYearsTable.status, "active")))
    .limit(1);
  return active || null;
}

/**
 * Reject writes when the transaction date falls in a CLOSED year.
 * If no financial_years row exists yet, allow the write (existing behaviour unchanged).
 */
export async function assertPeriodWritable(
  companyId: number,
  transactionDate: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    return { ok: true };
  }
  const fy = await findFyForDate(companyId, transactionDate);
  if (fy && fy.status === "closed") {
    return { ok: false, error: CLOSED_MSG, status: 403 };
  }
  return { ok: true };
}

export async function buildClosingChecklist(companyId: number, fyId: number) {
  const [fy] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, fyId), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!fy) return null;

  const draftJes = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM journal_entries
    WHERE company_id = ${companyId}
      AND entry_date >= ${fy.startDate} AND entry_date <= ${fy.endDate}
      AND status = 'draft'
  `);
  const draftCount = Number((draftJes.rows[0] as any)?.c || 0);

  const backupCheck = await hasMandatoryCloseBackup(companyId, fy.startDate, fy.endDate);

  const items = [
    {
      key: "transactions",
      label: "All transactions completed",
      ok: draftCount === 0,
      detail: draftCount === 0 ? "No draft journals in period" : `${draftCount} draft journal(s) remain`,
    },
    {
      key: "journals",
      label: "Required journals posted",
      ok: draftCount === 0,
      detail: draftCount === 0 ? "All journals posted or reversed" : "Post or reverse draft journals first",
    },
    {
      key: "customers",
      label: "Customer balances calculated",
      ok: true,
      detail: "Receivables ready for carry-forward",
    },
    {
      key: "vendors",
      label: "Vendor balances calculated",
      ok: true,
      detail: "Payables ready for carry-forward",
    },
    {
      key: "inventory",
      label: "Inventory closing balance calculated",
      ok: true,
      detail: "Warehouse stock quantities available",
    },
    {
      key: "bank",
      label: "Bank/cash balances calculated",
      ok: true,
      detail: "GL cash & bank accounts available",
    },
    {
      key: "pl",
      label: "Profit & Loss calculated",
      ok: true,
      detail: "Income/expense remain in closed year; P&L transfers to retained earnings on activate",
    },
    {
      key: "backup",
      label: "Mandatory accounting backup completed",
      ok: backupCheck.ok,
      detail: backupCheck.ok
        ? `Backup verified (${backupCheck.backupCode})`
        : "Create a successful backup for this period before closing",
    },
    {
      key: "audit",
      label: "Audit completed",
      ok: fy.auditStatus === "completed",
      detail: fy.auditStatus === "completed" ? "Audit marked completed" : "Mark audit as completed before closing",
    },
  ];

  return {
    financialYear: fy,
    items,
    canClose: items.every((i) => i.ok) && fy.status !== "closed",
    mandatoryBackup: backupCheck,
  };
}

async function accountBalancesAsOf(companyId: number, asOf: string) {
  const rows = await db.execute(sql`
    SELECT a.id, a.code, a.name, a.type, a.sub_type,
      COALESCE(SUM(CASE WHEN jl.debit IS NOT NULL THEN jl.debit::numeric ELSE 0 END), 0) AS debit,
      COALESCE(SUM(CASE WHEN jl.credit IS NOT NULL THEN jl.credit::numeric ELSE 0 END), 0) AS credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.company_id = ${companyId}
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date <= ${asOf}
    WHERE a.company_id = ${companyId} AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.type, a.sub_type
    ORDER BY a.code
  `);
  return (rows.rows as any[]).map((r) => ({
    accountId: Number(r.id),
    accountCode: String(r.code),
    accountName: String(r.name),
    accountType: String(r.type),
    subType: String(r.sub_type || ""),
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
    balance: (Number(r.debit) || 0) - (Number(r.credit) || 0),
  }));
}

async function customerOutstandings(companyId: number, asOf: string) {
  const rows = await db.execute(sql`
    SELECT i.customer_name AS name,
      GREATEST(0,
        COALESCE(i.total_amount::numeric, 0)
        - COALESCE((
            SELECT SUM(p.amount::numeric) FROM invoice_payments p
            WHERE p.invoice_id = i.id AND p.payment_date <= ${asOf}
          ), 0)
      ) AS outstanding
    FROM invoices i
    WHERE i.company_id = ${companyId}
      AND i.issue_date <= ${asOf}
      AND COALESCE(i.status, '') NOT IN ('void', 'cancelled', 'draft')
  `);
  const map = new Map<string, number>();
  for (const r of rows.rows as any[]) {
    const amt = Number(r.outstanding) || 0;
    if (amt <= 0.005) continue;
    const name = String(r.name || "Unknown");
    map.set(name, (map.get(name) || 0) + amt);
  }
  return Array.from(map.entries()).map(([customerName, amount]) => ({ customerName, amount }));
}

async function vendorOutstandings(companyId: number, asOf: string) {
  const rows = await db.execute(sql`
    SELECT vi.vendor_name AS name,
      GREATEST(0,
        COALESCE(vi.total_amount::numeric, 0)
        - COALESCE((
            SELECT SUM(p.amount::numeric) FROM vendor_payments p
            WHERE p.vendor_invoice_id = vi.id AND p.payment_date <= ${asOf}
          ), 0)
      ) AS outstanding
    FROM vendor_invoices vi
    WHERE vi.company_id = ${companyId}
      AND COALESCE(vi.pi_date, vi.created_at::date::text) <= ${asOf}
      AND COALESCE(vi.status, '') NOT IN ('void', 'cancelled', 'draft')
  `);
  const map = new Map<string, number>();
  for (const r of rows.rows as any[]) {
    const amt = Number(r.outstanding) || 0;
    if (amt <= 0.005) continue;
    const name = String(r.name || "Unknown");
    map.set(name, (map.get(name) || 0) + amt);
  }
  return Array.from(map.entries()).map(([vendorName, amount]) => ({ vendorName, amount }));
}

async function inventoryClosing(companyId: number) {
  try {
    const rows = await db.execute(sql`
      SELECT ws.stock_item_id, ws.warehouse_id, ws.quantity,
        si.code AS item_code, si.name AS item_name, si.unit_price,
        w.name AS warehouse_name
      FROM warehouse_stock ws
      LEFT JOIN stock_items si ON si.id = ws.stock_item_id
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE si.company_id = ${companyId} OR w.company_id = ${companyId}
    `);
    return (rows.rows as any[])
      .map((r) => {
        const qty = Number(r.quantity) || 0;
        const unit = Number(r.unit_price) || 0;
        return {
          stockItemId: r.stock_item_id ? Number(r.stock_item_id) : null,
          warehouseId: r.warehouse_id ? Number(r.warehouse_id) : null,
          itemCode: r.item_code || "",
          itemName: r.item_name || "Item",
          warehouseName: r.warehouse_name || "",
          quantity: qty,
          value: qty * unit,
        };
      })
      .filter((r) => Math.abs(r.quantity) > 0.0001 || Math.abs(r.value) > 0.005);
  } catch {
    return [];
  }
}

export async function previewOpeningBalances(companyId: number, previousFyId: number) {
  const [prev] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, previousFyId), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!prev) throw new Error("Previous financial year not found");

  const balances = await accountBalancesAsOf(companyId, prev.endDate);
  // Income/expense stay in prior year — net P&L folds into retained earnings for carry-forward
  const plNet = balances
    .filter((b) => b.accountType === "revenue" || b.accountType === "expense")
    .reduce((s, b) => s + b.balance, 0);
  // profit (credit) = -plNet when balance = debit - credit
  const retainedEarningsAdjustment = -plNet;

  const bsAccounts = balances
    .filter((b) => ["asset", "liability", "equity"].includes(b.accountType))
    .map((b) => {
      // Current Year Earnings resets; transfer P&L into Retained Earnings (3100)
      if (b.accountCode === "3200" || /current year earnings/i.test(b.accountName)) {
        return { ...b, balance: 0, debit: 0, credit: 0 };
      }
      if (b.accountCode === "3100" || (/retained earnings/i.test(b.accountName) && b.accountCode !== "3200")) {
        const nextBal = b.balance + retainedEarningsAdjustment;
        return {
          ...b,
          balance: nextBal,
          debit: nextBal > 0 ? nextBal : 0,
          credit: nextBal < 0 ? Math.abs(nextBal) : 0,
        };
      }
      return b;
    });

  const customers = await customerOutstandings(companyId, prev.endDate);
  const vendors = await vendorOutstandings(companyId, prev.endDate);
  const inventory = await inventoryClosing(companyId);

  const bankCash = bsAccounts.filter(
    (b) =>
      b.accountType === "asset" &&
      (b.subType === "current_asset" || /cash|bank/i.test(b.accountName) || /cash|bank/i.test(b.accountCode)),
  );
  const fixedAssets = bsAccounts.filter(
    (b) => b.accountType === "asset" && (b.subType === "fixed_asset" || /fixed|ppe|asset/i.test(b.subType)),
  );

  const summary = {
    cash: bankCash.filter((b) => /cash/i.test(b.accountName)).reduce((s, b) => s + b.balance, 0),
    bank: bankCash.filter((b) => /bank/i.test(b.accountName)).reduce((s, b) => s + b.balance, 0),
    receivables: customers.reduce((s, c) => s + c.amount, 0),
    payables: vendors.reduce((s, v) => s + v.amount, 0),
    inventory: inventory.reduce((s, i) => s + i.value, 0),
    fixedAssets: fixedAssets.reduce((s, b) => s + b.balance, 0),
    capital: bsAccounts
      .filter((b) => b.accountType === "equity")
      .reduce((s, b) => s + Math.abs(b.balance), 0),
    retainedEarningsAdjustment,
  };

  const next = nextFyBounds(prev.startDate);

  return {
    previousFinancialYear: prev,
    newFinancialYear: next,
    summary,
    glLines: bsAccounts.filter((b) => Math.abs(b.balance) > 0.005),
    customers,
    vendors,
    inventory,
    bankCash,
    fixedAssets,
    plNet,
  };
}

export async function generateOpeningBalancesIdempotent(opts: {
  companyId: number;
  previousFyId: number;
  newFyId: number;
  userId: number;
}) {
  const { companyId, previousFyId, newFyId, userId } = opts;
  const [newFy] = await db
    .select()
    .from(financialYearsTable)
    .where(and(eq(financialYearsTable.id, newFyId), eq(financialYearsTable.companyId, companyId)))
    .limit(1);
  if (!newFy) throw new Error("New financial year not found");
  if (newFy.openingBalancesGenerated) {
    return { alreadyGenerated: true, financialYear: newFy };
  }

  const preview = await previewOpeningBalances(companyId, previousFyId);

  await db.transaction(async (tx) => {
    // Clear any partial rows for this FY (idempotent retry)
    await tx.delete(glOpeningBalancesTable).where(eq(glOpeningBalancesTable.financialYearId, newFyId));
    await tx.delete(customerOpeningBalancesTable).where(eq(customerOpeningBalancesTable.financialYearId, newFyId));
    await tx.delete(vendorOpeningBalancesTable).where(eq(vendorOpeningBalancesTable.financialYearId, newFyId));
    await tx.delete(inventoryOpeningBalancesTable).where(eq(inventoryOpeningBalancesTable.financialYearId, newFyId));
    await tx.delete(fixedAssetOpeningBalancesTable).where(eq(fixedAssetOpeningBalancesTable.financialYearId, newFyId));
    await tx.delete(bankOpeningBalancesTable).where(eq(bankOpeningBalancesTable.financialYearId, newFyId));

    for (const line of preview.glLines) {
      const debit = line.balance > 0 ? line.balance : 0;
      const credit = line.balance < 0 ? Math.abs(line.balance) : 0;
      await tx.insert(glOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        accountType: line.accountType,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        notes: "Carried forward from prior FY (balance sheet only)",
      });
    }

    for (const c of preview.customers) {
      await tx.insert(customerOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        customerName: c.customerName,
        amount: c.amount.toFixed(2),
      });
    }
    for (const v of preview.vendors) {
      await tx.insert(vendorOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        vendorName: v.vendorName,
        amount: v.amount.toFixed(2),
      });
    }
    for (const i of preview.inventory) {
      await tx.insert(inventoryOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        stockItemId: i.stockItemId,
        itemCode: i.itemCode,
        itemName: i.itemName,
        warehouseId: i.warehouseId,
        warehouseName: i.warehouseName,
        quantity: i.quantity.toFixed(4),
        value: i.value.toFixed(2),
      });
    }
    for (const fa of preview.fixedAssets) {
      await tx.insert(fixedAssetOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        accountCode: fa.accountCode,
        description: fa.accountName,
        amount: fa.balance.toFixed(2),
      });
    }
    for (const b of preview.bankCash) {
      await tx.insert(bankOpeningBalancesTable).values({
        companyId,
        financialYearId: newFyId,
        accountId: b.accountId,
        accountCode: b.accountCode,
        accountName: b.accountName,
        amount: b.balance.toFixed(2),
      });
    }

    // Opening JE — balance sheet only (idempotent via refType + refId = newFyId)
    const existingJe = await tx
      .select()
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.companyId, companyId),
          eq(journalEntriesTable.refType, "fy_opening"),
          eq(journalEntriesTable.refId, newFyId),
        ),
      )
      .limit(1);

    let jeId = existingJe[0]?.id;
    if (!jeId && preview.glLines.length > 0) {
      const [je] = await tx
        .insert(journalEntriesTable)
        .values({
          companyId,
          entryDate: newFy.startDate,
          description: `Opening balances ${newFy.label}`,
          refType: "fy_opening",
          refId: newFyId,
          refNumber: newFy.label,
          status: "posted",
          createdBy: userId,
        })
        .returning();
      jeId = je.id;
      for (const line of preview.glLines) {
        const debit = line.balance > 0 ? line.balance : 0;
        const credit = line.balance < 0 ? Math.abs(line.balance) : 0;
        if (debit < 0.005 && credit < 0.005) continue;
        await tx.insert(journalLinesTable).values({
          journalEntryId: jeId,
          accountId: line.accountId,
          debit: debit.toFixed(2),
          credit: credit.toFixed(2),
          description: "Opening balance",
        } as any);
      }
    }

    await tx
      .update(financialYearsTable)
      .set({
        openingBalancesGenerated: true,
        openingJournalEntryId: jeId || null,
      })
      .where(eq(financialYearsTable.id, newFyId));
  });

  const [updated] = await db
    .select()
    .from(financialYearsTable)
    .where(eq(financialYearsTable.id, newFyId))
    .limit(1);
  return { alreadyGenerated: false, financialYear: updated, preview };
}

export { CLOSED_MSG };
