import { Router } from "express";
import { db, settingsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function gstLabelForCountry(country: string | null | undefined): string {
  if (!country) return "GST";
  const c = country.toLowerCase();
  if (c === "india") return "GST (India)";
  if (c === "singapore") return "GST (Singapore)";
  return `GST (${country})`;
}

function defaultGstForCountry(country: string | null | undefined): string {
  if (!country) return "9";
  return country.toLowerCase() === "india" ? "18" : "9";
}

async function ensureSettings(companyId: number) {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const defaultGst = defaultGstForCountry(company?.country);

  const [created] = await db.insert(settingsTable).values({
    companyId,
    gstRate: defaultGst,
    poPrefix: "PO", poCounter: 1, poSuffix: "",
    invPrefix: "INV", invCounter: 1, invSuffix: "",
    qtPrefix: "QT", qtCounter: 1, qtSuffix: "",
    doPrefix: "DO", doCounter: 1, doSuffix: "",
    grnPrefix: "GRN", grnCounter: 1, grnSuffix: "",
  }).returning();
  return created;
}

function formatSettings(s: typeof settingsTable.$inferSelect, country?: string | null) {
  return {
    id: s.id,
    companyId: s.companyId,
    gstRate: parseFloat(s.gstRate),
    taxLabel: gstLabelForCountry(country),
    smtpHost: s.smtpHost || "",
    smtpPort: s.smtpPort || "587",
    smtpUser: s.smtpUser || "",
    smtpFrom: s.smtpFrom || "",
    smtpConfigured: !!(s.smtpHost && s.smtpUser && s.smtpPass),
    poPrefix: s.poPrefix ?? "PO",
    poCounter: s.poCounter ?? 1,
    poSuffix: s.poSuffix ?? "",
    invPrefix: s.invPrefix ?? "INV",
    invCounter: s.invCounter ?? 1,
    invSuffix: s.invSuffix ?? "",
    qtPrefix: s.qtPrefix ?? "QT",
    qtCounter: s.qtCounter ?? 1,
    qtSuffix: s.qtSuffix ?? "",
    doPrefix: s.doPrefix ?? "DO",
    doCounter: s.doCounter ?? 1,
    doSuffix: s.doSuffix ?? "",
    grnPrefix: s.grnPrefix ?? "GRN",
    grnCounter: s.grnCounter ?? 1,
    grnSuffix: s.grnSuffix ?? "",
    allowNegativeStock: s.allowNegativeStock ?? false,
    autoDeductOnDo: s.autoDeductOnDo ?? false,
    lowStockWarning: parseFloat(s.lowStockWarning ?? "0"),
    defaultUom: s.defaultUom ?? "pcs",
    bankDetails: s.bankDetails ?? "",
    termsAndConditions: s.termsAndConditions ?? "",
  };
}

router.get("/", async (req, res) => {
  try {
    const companyId = (req.session as any).companyId;
    if (!companyId) return res.status(400).json({ error: "No company selected" });
    const settings = await ensureSettings(companyId);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    res.json(formatSettings(settings, company?.country));
  } catch (err) {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const companyId = (req.session as any).companyId;
  if (!companyId) return res.status(400).json({ error: "No company selected" });

  const {
    gstRate, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom,
    poPrefix, poCounter, poSuffix,
    invPrefix, invCounter, invSuffix,
    qtPrefix, qtCounter, qtSuffix,
    doPrefix, doCounter, doSuffix,
    grnPrefix, grnCounter, grnSuffix,
    allowNegativeStock, autoDeductOnDo, lowStockWarning, defaultUom,
    bankDetails, termsAndConditions,
  } = req.body;

  const updateData: Record<string, any> = {};
  if (gstRate !== undefined) {
    if (typeof gstRate !== "number" || gstRate < 0 || gstRate > 100)
      return res.status(400).json({ error: "Invalid GST rate" });
    updateData.gstRate = gstRate.toString();
  }
  if (smtpHost !== undefined) updateData.smtpHost = smtpHost;
  if (smtpPort !== undefined) updateData.smtpPort = smtpPort;
  if (smtpUser !== undefined) updateData.smtpUser = smtpUser;
  if (smtpPass !== undefined && smtpPass !== "") updateData.smtpPass = smtpPass;
  if (smtpFrom !== undefined) updateData.smtpFrom = smtpFrom;
  if (poPrefix !== undefined) updateData.poPrefix = poPrefix;
  if (poCounter !== undefined) updateData.poCounter = Number(poCounter);
  if (poSuffix !== undefined) updateData.poSuffix = poSuffix;
  if (invPrefix !== undefined) updateData.invPrefix = invPrefix;
  if (invCounter !== undefined) updateData.invCounter = Number(invCounter);
  if (invSuffix !== undefined) updateData.invSuffix = invSuffix;
  if (qtPrefix !== undefined) updateData.qtPrefix = qtPrefix;
  if (qtCounter !== undefined) updateData.qtCounter = Number(qtCounter);
  if (qtSuffix !== undefined) updateData.qtSuffix = qtSuffix;
  if (doPrefix !== undefined) updateData.doPrefix = doPrefix;
  if (doCounter !== undefined) updateData.doCounter = Number(doCounter);
  if (doSuffix !== undefined) updateData.doSuffix = doSuffix;
  if (grnPrefix !== undefined) updateData.grnPrefix = grnPrefix;
  if (grnCounter !== undefined) updateData.grnCounter = Number(grnCounter);
  if (grnSuffix !== undefined) updateData.grnSuffix = grnSuffix;
  if (allowNegativeStock !== undefined) updateData.allowNegativeStock = Boolean(allowNegativeStock);
  if (autoDeductOnDo !== undefined) updateData.autoDeductOnDo = Boolean(autoDeductOnDo);
  if (lowStockWarning !== undefined) updateData.lowStockWarning = String(lowStockWarning);
  if (defaultUom !== undefined) updateData.defaultUom = defaultUom;
  if (bankDetails !== undefined) updateData.bankDetails = bankDetails;
  if (termsAndConditions !== undefined) updateData.termsAndConditions = termsAndConditions;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const settings = await ensureSettings(companyId);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    const [updated] = await db.update(settingsTable).set(updateData).where(eq(settingsTable.id, settings.id)).returning();
    res.json(formatSettings(updated, company?.country));
  } catch (err) {
    console.error("[settings PUT error]", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
