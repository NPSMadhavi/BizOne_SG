import type { Asset } from "@shared/schema";

export type DepreciationRow = {
  periodKey: string;
  periodLabel: string;
  year: number;
  openingNbv: number;
  depreciation: number;
  closingNbv: number;
  status: "posted" | "calculated";
};

function toNum(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function formatPeriod(d: Date): string {
  return d.toLocaleDateString("en-SG", { month: "short", year: "numeric" });
}

export function formatAssetRegisterId(asset: Pick<Asset, "id" | "tag">): string {
  const tag = String(asset.tag || "").trim();
  if (/^FA[-\s]?\d+/i.test(tag)) {
    return tag.toUpperCase().replace(/\s+/g, "-").replace(/^FA(\d)/i, "FA-$1");
  }
  return `FA-${String(asset.id).padStart(4, "0")}`;
}

export function calcAssetBookValues(asset: Asset, asOf: Date = new Date()) {
  const cost = toNum(asset.cost);
  const residual = Math.max(0, toNum((asset as any).residualValue ?? (asset as any).residual_value));
  const lifeRaw = Math.max(0, Number(asset.usefulLifeYears) || 0);
  const lifeUnit = String(
    (asset as any).usefulLifeUnit || (asset as any).useful_life_unit || "Years",
  ).toLowerCase();
  const usefulLifeYears = lifeUnit.startsWith("month") ? lifeRaw / 12 : lifeRaw;
  const frequency = String(
    (asset as any).depreciationFrequency || (asset as any).depreciation_frequency || "monthly",
  ).toLowerCase();
  const startRaw = asset.depreciationStartDate || asset.purchaseDate;
  if (cost <= 0 || usefulLifeYears <= 0 || !startRaw) {
    return {
      cost,
      residual,
      accDep: 0,
      nbv: cost,
      monthlyDep: 0,
      periodsTotal: 0,
      periodsPosted: 0,
    };
  }

  const start = startOfMonth(new Date(startRaw));
  if (Number.isNaN(start.getTime())) {
    return { cost, residual, accDep: 0, nbv: cost, monthlyDep: 0, periodsTotal: 0, periodsPosted: 0 };
  }

  const periodsPerYear = frequency.startsWith("year") ? 1 : frequency.startsWith("quart") ? 4 : 12;
  const periodsTotal = Math.max(1, Math.round(usefulLifeYears * periodsPerYear));
  const depreciable = Math.max(0, cost - residual);
  const perPeriod = periodsTotal > 0 ? depreciable / periodsTotal : 0;

  const monthStep = 12 / periodsPerYear;
  let periodsPosted = 0;
  const asOfMonth = startOfMonth(asOf);
  for (let i = 0; i < periodsTotal; i++) {
    const periodStart = addMonths(start, Math.round(i * monthStep));
    if (periodStart.getTime() <= asOfMonth.getTime()) periodsPosted++;
    else break;
  }
  periodsPosted = Math.min(periodsPosted, periodsTotal);
  const accDep = round2(Math.min(depreciable, perPeriod * periodsPosted));
  const nbv = round2(Math.max(residual, cost - accDep));

  return {
    cost: round2(cost),
    residual: round2(residual),
    accDep,
    nbv,
    monthlyDep: round2(perPeriod),
    periodsTotal,
    periodsPosted,
  };
}

/** Build full depreciation schedule for an asset (straight-line style). */
export function buildDepreciationSchedule(
  asset: Asset,
  asOf: Date = new Date(),
): DepreciationRow[] {
  const cost = toNum(asset.cost);
  const residual = Math.max(0, toNum((asset as any).residualValue ?? (asset as any).residual_value));
  const lifeRaw = Math.max(0, Number(asset.usefulLifeYears) || 0);
  const lifeUnit = String(
    (asset as any).usefulLifeUnit || (asset as any).useful_life_unit || "Years",
  ).toLowerCase();
  const usefulLifeYears = lifeUnit.startsWith("month") ? lifeRaw / 12 : lifeRaw;
  const frequency = String(
    (asset as any).depreciationFrequency || (asset as any).depreciation_frequency || "monthly",
  ).toLowerCase();
  const startRaw = asset.depreciationStartDate || asset.purchaseDate;
  if (cost <= 0 || usefulLifeYears <= 0 || !startRaw) return [];

  const start = startOfMonth(new Date(startRaw));
  if (Number.isNaN(start.getTime())) return [];

  const periodsPerYear = frequency.startsWith("year") ? 1 : frequency.startsWith("quart") ? 4 : 12;
  const periodsTotal = Math.max(1, Math.round(usefulLifeYears * periodsPerYear));
  const depreciable = Math.max(0, cost - residual);
  const perPeriod = periodsTotal > 0 ? depreciable / periodsTotal : 0;
  const monthStep = 12 / periodsPerYear;
  const asOfMonth = startOfMonth(asOf);

  const rows: DepreciationRow[] = [];
  let opening = round2(cost);
  for (let i = 0; i < periodsTotal; i++) {
    const periodStart = addMonths(start, Math.round(i * monthStep));
    const remaining = Math.max(0, round2(opening - residual));
    const dep = round2(Math.min(perPeriod, remaining));
    const closing = round2(Math.max(residual, opening - dep));
    const posted = periodStart.getTime() <= asOfMonth.getTime();
    rows.push({
      periodKey: `${periodStart.getFullYear()}-${periodStart.getMonth() + 1}`,
      periodLabel: formatPeriod(periodStart),
      year: periodStart.getFullYear(),
      openingNbv: opening,
      depreciation: dep,
      closingNbv: closing,
      status: posted ? "posted" : "calculated",
    });
    opening = closing;
    if (opening <= residual + 0.001) break;
  }
  return rows;
}

export function formatSgd(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatAssetDateShort(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}
