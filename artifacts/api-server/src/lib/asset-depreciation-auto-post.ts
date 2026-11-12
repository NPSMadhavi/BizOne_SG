/**
 * Post one journal entry for each depreciation period that the schedule marks Posted.
 *
 *   DR 6700 Depreciation
 *   CR 1510 / 1610 / 1710 Accumulated Depreciation
 *
 * Idempotent: ref_type=asset_depreciation, ref_id=asset id, ref_number=DEP-{id}-{yyyy}-{mm}.
 */

import { db, accountsTable, companiesTable, journalEntriesTable, journalLinesTable, pool } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";
import { assertPeriodWritable } from "./financial-year.js";
import { isSingaporeCountry } from "./singapore.js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNum(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function periodEndIso(periodStart: Date, monthStep: number): string {
  const end = new Date(periodStart.getFullYear(), periodStart.getMonth() + monthStep, 0);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function periodLabel(d: Date): string {
  return d.toLocaleDateString("en-SG", { month: "short", year: "numeric" });
}

function faAccDepCode(category?: string | null) {
  const c = String(category || "").toLowerCase();
  if (c.includes("furniture") || c.includes("fitting")) return "1610";
  if (c.includes("renovation") || c.includes("leasehold")) return "1710";
  return "1510";
}

type DepPeriod = {
  key: string;
  label: string;
  frequency: "M" | "Q" | "Y";
  frequencyLabel: string;
  entryDate: string;
  amount: number;
};

function frequencyCode(frequency: string): "M" | "Q" | "Y" {
  if (frequency.startsWith("year") || frequency.startsWith("annual")) return "Y";
  if (frequency.startsWith("quart")) return "Q";
  return "M";
}

function todayIso(asOf: Date): string {
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, "0");
  const d = String(asOf.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Posted periods only — same dates and amounts as the Depreciation Schedule. */
export function postedDepreciationPeriods(asset: Record<string, unknown>, asOf: Date = new Date()): DepPeriod[] {
  const cost = toNum(asset.cost);
  const residual = Math.max(0, toNum(asset.residualValue ?? asset.residual_value));
  const lifeRaw = Math.max(0, Number(asset.usefulLifeYears ?? asset.useful_life_years) || 0);
  const lifeUnit = String(asset.usefulLifeUnit ?? asset.useful_life_unit ?? "Years").toLowerCase();
  const usefulLifeYears = lifeUnit.startsWith("month") ? lifeRaw / 12 : lifeRaw;
  const frequency = String(asset.depreciationFrequency ?? asset.depreciation_frequency ?? "monthly").toLowerCase();
  const startRaw = String(
    asset.depreciationStartDate ?? asset.depreciation_start_date ?? asset.purchaseDate ?? asset.purchase_date ?? "",
  );
  if (cost <= 0 || usefulLifeYears <= 0 || !startRaw) return [];

  const start = startOfMonth(new Date(startRaw));
  if (Number.isNaN(start.getTime())) return [];

  const code = frequencyCode(frequency);
  const periodsPerYear = code === "Y" ? 1 : code === "Q" ? 4 : 12;
  const periodsTotal = Math.max(1, Math.round(usefulLifeYears * periodsPerYear));
  const depreciable = Math.max(0, cost - residual);
  const perPeriod = periodsTotal > 0 ? depreciable / periodsTotal : 0;
  const monthStep = 12 / periodsPerYear;
  const asOfMonth = startOfMonth(asOf);
  const today = todayIso(asOf);

  const disposalRaw = String(asset.disposalDate ?? asset.disposal_date ?? "").slice(0, 10);
  const disposal = /^\d{4}-\d{2}-\d{2}$/.test(disposalRaw) ? startOfMonth(new Date(`${disposalRaw}T00:00:00`)) : null;

  const periods: DepPeriod[] = [];
  let opening = round2(depreciable);
  for (let i = 0; i < periodsTotal; i++) {
    const periodStart = addMonths(start, Math.round(i * monthStep));
    if (periodStart.getTime() > asOfMonth.getTime()) break;
    if (disposal && periodStart.getTime() > disposal.getTime()) break;
    const dep = round2(Math.min(perPeriod, Math.max(0, opening)));
    opening = round2(Math.max(0, opening - dep));
    if (dep < 0.005) {
      if (opening <= 0.001) break;
      continue;
    }
    const y = periodStart.getFullYear();
    const m = String(periodStart.getMonth() + 1).padStart(2, "0");
    const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
    const entryDateRaw = periodEndIso(periodStart, monthStep);
    periods.push({
      key: code === "Y" ? String(y) : code === "Q" ? `${y}-Q${quarter}` : `${y}-${m}`,
      label: code === "Y" ? String(y) : code === "Q" ? `Q${quarter} ${y}` : periodLabel(periodStart),
      frequency: code,
      frequencyLabel: code === "Y" ? "Yearly" : code === "Q" ? "Quarterly" : "Monthly",
      entryDate: entryDateRaw > today ? today : entryDateRaw,
      amount: dep,
    });
    if (opening <= 0.001) break;
  }
  return periods;
}

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

export async function backfillAssetDepreciationJEs(
  companyId: number,
  userId: number,
  log?: { warn?: (obj: unknown, msg?: string) => void },
): Promise<number> {
  if (!companyId || !userId) return 0;

  const [company] = await db
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!isSingaporeCountry(company?.country)) return 0;

  await ensureAccountsSeeded(companyId);

  const assets = await pool.query(
    `SELECT id, tag, type, category, status, cost, residual_value, useful_life_years,
            useful_life_unit, depreciation_frequency, depreciation_start_date, purchase_date,
            disposal_date
       FROM assets
      WHERE company_id = $1`,
    [companyId],
  );

  const existing = await db
    .select({
      id: journalEntriesTable.id,
      refId: journalEntriesTable.refId,
      refNumber: journalEntriesTable.refNumber,
      entryDate: journalEntriesTable.entryDate,
    })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.refType, "asset_depreciation"),
    ));
  const postedKeys = new Set(existing.map((row) => `${row.refId}|${row.refNumber}`));

  const expenseAcct = await getAccountByCode(companyId, "6700");
  if (!expenseAcct) {
    log?.warn?.({ companyId }, "asset-depreciation-auto-post: depreciation account 6700 not found");
    return 0;
  }

  let created = 0;
  for (const asset of assets.rows as Record<string, unknown>[]) {
    const assetId = Number(asset.id);
    if (!assetId) continue;
    const status = String(asset.status || "").toLowerCase();
    if (status === "disposed" || status === "retired") continue;

    const accDep = await getAccountByCode(companyId, faAccDepCode(String(asset.category || "")));
    if (!accDep) continue;

    const label = String(asset.type || asset.tag || `Asset #${assetId}`);
    const tag = String(asset.tag || `FA-${assetId}`);
    const periods = postedDepreciationPeriods(asset);
    const desired = new Set(periods.map((period) => `DEP-${assetId}-${period.frequency}-${period.key}`));

    for (const row of existing) {
      if (row.refId !== assetId || !row.refNumber || desired.has(row.refNumber)) continue;
      const periodCheck = await assertPeriodWritable(companyId, row.entryDate);
      if (!periodCheck.ok) continue;
      try {
        await db.delete(journalLinesTable).where(eq(journalLinesTable.journalEntryId, row.id));
        await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, row.id));
        postedKeys.delete(`${assetId}|${row.refNumber}`);
      } catch (err) {
        log?.warn?.({ err, assetId, refNumber: row.refNumber }, "asset-depreciation-auto-post: failed to replace old frequency JE");
      }
    }

    for (const period of periods) {
      const refNumber = `DEP-${assetId}-${period.frequency}-${period.key}`;
      if (postedKeys.has(`${assetId}|${refNumber}`)) continue;

      const periodCheck = await assertPeriodWritable(companyId, period.entryDate);
      if (!periodCheck.ok) continue;

      const desc = `Depreciation (${period.frequencyLabel}) — ${label} (${tag}) — ${period.label}`;
      try {
        const [entry] = await db.insert(journalEntriesTable).values({
          companyId,
          entryDate: period.entryDate,
          description: desc,
          refType: "asset_depreciation",
          refId: assetId,
          refNumber,
          status: "posted",
          createdBy: userId,
        }).returning();

        await db.insert(journalLinesTable).values([
          {
            journalEntryId: entry.id,
            accountId: expenseAcct.id,
            description: desc,
            debit: period.amount.toFixed(2),
            credit: "0.00",
          },
          {
            journalEntryId: entry.id,
            accountId: accDep.id,
            description: desc,
            debit: "0.00",
            credit: period.amount.toFixed(2),
          },
        ]);
        postedKeys.add(`${assetId}|${refNumber}`);
        created++;
      } catch (err) {
        log?.warn?.({ err, assetId, period: period.key }, "asset-depreciation-auto-post: failed to post JE");
      }
    }
  }

  return created;
}
