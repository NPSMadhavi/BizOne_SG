/**
 * Fixed Asset Disposal journal posting + reversal.
 *
 * Disposal JE (sale example):
 *   DR Bank / Cash                         = sale proceeds
 *   DR Accumulated Depreciation            = acc. dep. to disposal date
 *   DR Loss on Disposal (if any)           = NBV − sale
 *   CR Fixed Asset                         = cost
 *   CR Gain on Disposal (if any)           = sale − NBV
 *
 * Idempotent: one posted JE per asset via ref_type=asset_disposal + ref_id=assetId.
 */

import { db, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ensureAccountsSeeded } from "./accounts-seed.js";
import { assertPeriodWritable } from "./financial-year.js";

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

/** Straight-line book values as of disposal date (matches frontend calcAssetBookValues). */
export function calcAssetBooksAsOf(asset: Record<string, unknown>, asOfIso: string) {
  const cost = toNum(asset.cost);
  const residual = Math.max(0, toNum(asset.residualValue ?? asset.residual_value));
  const lifeRaw = Math.max(0, Number(asset.usefulLifeYears ?? asset.useful_life_years) || 0);
  const lifeUnit = String(asset.usefulLifeUnit ?? asset.useful_life_unit ?? "Years").toLowerCase();
  const usefulLifeYears = lifeUnit.startsWith("month") ? lifeRaw / 12 : lifeRaw;
  const frequency = String(
    asset.depreciationFrequency ?? asset.depreciation_frequency ?? "monthly",
  ).toLowerCase();
  const startRaw = String(
    asset.depreciationStartDate ?? asset.depreciation_start_date ?? asset.purchaseDate ?? asset.purchase_date ?? "",
  );
  if (cost <= 0 || usefulLifeYears <= 0 || !startRaw) {
    return { cost: round2(cost), residual: round2(residual), accDep: 0, nbv: round2(cost) };
  }

  const start = startOfMonth(new Date(startRaw));
  const asOf = startOfMonth(new Date(asOfIso));
  if (Number.isNaN(start.getTime()) || Number.isNaN(asOf.getTime())) {
    return { cost: round2(cost), residual: round2(residual), accDep: 0, nbv: round2(cost) };
  }

  const periodsPerYear = frequency.startsWith("year") ? 1 : frequency.startsWith("quart") ? 4 : 12;
  const periodsTotal = Math.max(1, Math.round(usefulLifeYears * periodsPerYear));
  const depreciable = Math.max(0, cost - residual);
  const perPeriod = periodsTotal > 0 ? depreciable / periodsTotal : 0;
  const monthStep = 12 / periodsPerYear;

  let periodsPosted = 0;
  for (let i = 0; i < periodsTotal; i++) {
    const periodStart = addMonths(start, Math.round(i * monthStep));
    if (periodStart.getTime() <= asOf.getTime()) periodsPosted++;
    else break;
  }
  periodsPosted = Math.min(periodsPosted, periodsTotal);
  const accDep = round2(Math.min(depreciable, perPeriod * periodsPosted));
  const nbv = round2(Math.max(residual, cost - accDep));
  return { cost: round2(cost), residual: round2(residual), accDep, nbv };
}

async function getAccountByCode(companyId: number, code: string) {
  const [acct] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
    .limit(1);
  return acct ?? null;
}

function faCodesForCategory(category?: string | null) {
  const c = String(category || "").toLowerCase();
  if (c.includes("furniture") || c.includes("fitting")) return { asset: "1600", accDep: "1610" };
  if (c.includes("renovation") || c.includes("leasehold")) return { asset: "1700", accDep: "1710" };
  return { asset: "1500", accDep: "1510" };
}

export async function findExistingDisposalJE(companyId: number, assetId: number) {
  const [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.refType, "asset_disposal"),
        eq(journalEntriesTable.refId, assetId),
        eq(journalEntriesTable.status, "posted"),
      ),
    )
    .limit(1);
  return entry ?? null;
}

export async function postAssetDisposalJE(params: {
  companyId: number;
  userId: number;
  asset: Record<string, unknown>;
  assetId: number;
  disposalDate: string;
  disposalType: string;
  saleAmount: number;
  remarks?: string;
}): Promise<{ journalEntryId: number; books: ReturnType<typeof calcAssetBooksAsOf>; gainLoss: number }> {
  const { companyId, userId, asset, assetId, disposalDate, disposalType, saleAmount, remarks } = params;

  await ensureAccountsSeeded(companyId);

  const existing = await findExistingDisposalJE(companyId, assetId);
  if (existing) {
    const books = calcAssetBooksAsOf(asset, disposalDate);
    return {
      journalEntryId: existing.id,
      books,
      gainLoss: round2(saleAmount - books.nbv),
    };
  }

  const periodCheck = await assertPeriodWritable(companyId, disposalDate);
  if (!periodCheck.ok) {
    throw new Error(periodCheck.error || "Accounting period is closed for this disposal date.");
  }

  const books = calcAssetBooksAsOf(asset, disposalDate);
  const sale = Math.max(0, round2(saleAmount));
  const gainLoss = round2(sale - books.nbv);
  const codes = faCodesForCategory(String(asset.category || ""));

  const bank = (await getAccountByCode(companyId, "1010")) ?? (await getAccountByCode(companyId, "1000"));
  const fa = await getAccountByCode(companyId, codes.asset);
  const accDepAcct = await getAccountByCode(companyId, codes.accDep);
  const gainAcct = await getAccountByCode(companyId, "4200");
  const lossAcct = await getAccountByCode(companyId, "7200");

  if (!fa) throw new Error(`Fixed asset account ${codes.asset} not found in Chart of Accounts.`);
  if (sale > 0 && !bank) throw new Error("Bank / cash account (1010) not found in Chart of Accounts.");
  if (books.accDep > 0 && !accDepAcct) {
    throw new Error(`Accumulated depreciation account ${codes.accDep} not found in Chart of Accounts.`);
  }
  if (gainLoss > 0 && !gainAcct) throw new Error("Gain account (4200) not found in Chart of Accounts.");
  if (gainLoss < 0 && !lossAcct) throw new Error("Loss account (7200) not found in Chart of Accounts.");

  const assetLabel = String(asset.type || asset.tag || `Asset #${assetId}`);
  const lines: { accountId: number; description: string; debit: number; credit: number }[] = [];

  if (sale > 0 && bank) {
    lines.push({
      accountId: bank.id,
      description: `Sale proceeds — ${assetLabel}`,
      debit: sale,
      credit: 0,
    });
  }
  if (books.accDep > 0 && accDepAcct) {
    lines.push({
      accountId: accDepAcct.id,
      description: `Clear accumulated depreciation — ${assetLabel}`,
      debit: books.accDep,
      credit: 0,
    });
  }
  if (gainLoss < 0 && lossAcct) {
    lines.push({
      accountId: lossAcct.id,
      description: `Loss on disposal — ${assetLabel}`,
      debit: Math.abs(gainLoss),
      credit: 0,
    });
  }
  if (books.cost > 0) {
    lines.push({
      accountId: fa.id,
      description: `Remove fixed asset — ${assetLabel}`,
      debit: 0,
      credit: books.cost,
    });
  }
  if (gainLoss > 0 && gainAcct) {
    lines.push({
      accountId: gainAcct.id,
      description: `Gain on disposal — ${assetLabel}`,
      debit: 0,
      credit: gainLoss,
    });
  }

  // Edge: fully depreciated scrap with zero sale / zero cost leftovers — skip JE if < 2 lines
  if (lines.length < 2) {
    // Still balanced no-op (e.g. zero-cost asset) — invent a balanced zero JE is unnecessary;
    // caller can proceed with status update only.
    return { journalEntryId: 0, books, gainLoss };
  }

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.02) {
    throw new Error(
      `Disposal journal is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`,
    );
  }

  const typeLabel = disposalType.replace(/_/g, " ");
  const descParts = [
    `Asset Disposal — ${assetLabel}`,
    `Type: ${typeLabel}`,
    remarks?.trim() ? remarks.trim() : null,
  ].filter(Boolean);

  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      companyId,
      entryDate: disposalDate,
      description: descParts.join(" · "),
      refType: "asset_disposal",
      refId: assetId,
      refNumber: String(asset.tag || `FA-${assetId}`),
      status: "posted",
      createdBy: userId,
    })
    .returning();

  await db.insert(journalLinesTable).values(
    lines.map((l) => ({
      journalEntryId: entry.id,
      accountId: l.accountId,
      description: l.description,
      debit: l.debit > 0 ? l.debit.toFixed(2) : "0",
      credit: l.credit > 0 ? l.credit.toFixed(2) : "0",
    })),
  );

  return { journalEntryId: entry.id, books, gainLoss };
}

export async function reverseAssetDisposalJE(params: {
  companyId: number;
  userId: number;
  assetId: number;
  reversalDate: string;
}): Promise<{ reversed: boolean; journalEntryId?: number }> {
  const { companyId, userId, assetId, reversalDate } = params;
  const original = await findExistingDisposalJE(companyId, assetId);
  if (!original) return { reversed: false };

  const periodCheck = await assertPeriodWritable(companyId, reversalDate);
  if (!periodCheck.ok) {
    throw new Error(periodCheck.error || "Accounting period is closed for this reversal date.");
  }

  const lines = await db
    .select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, original.id));

  if (lines.length === 0) {
    await db
      .update(journalEntriesTable)
      .set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, original.id));
    return { reversed: true };
  }

  const [reversal] = await db
    .insert(journalEntriesTable)
    .values({
      companyId,
      entryDate: reversalDate,
      description: `Reversal of Asset Disposal — ${original.refNumber || `FA-${assetId}`}`,
      refType: "asset_disposal_reversal",
      refId: assetId,
      refNumber: original.refNumber,
      status: "posted",
      reversalOfId: original.id,
      createdBy: userId,
    })
    .returning();

  await db.insert(journalLinesTable).values(
    lines.map((l) => ({
      journalEntryId: reversal.id,
      accountId: l.accountId,
      description: `Reversal — ${l.description || ""}`.trim(),
      debit: l.credit, // swap
      credit: l.debit,
    })),
  );

  await db
    .update(journalEntriesTable)
    .set({ status: "reversed" })
    .where(eq(journalEntriesTable.id, original.id));

  return { reversed: true, journalEntryId: reversal.id };
}
