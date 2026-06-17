import { Router, type IRouter } from "express";
import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}

async function requireSingapore(req: any, res: any): Promise<boolean> {
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company || company.country?.toLowerCase() !== "singapore") {
    res.status(403).json({ error: "Accounting features are only available for Singapore companies." });
    return false;
  }
  return true;
}

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash & Cash Equivalents",                 type: "asset",     subType: "current_asset",       isSystem: true },
  { code: "1010", name: "Cash at Bank - SGD",                      type: "asset",     subType: "current_asset",       isSystem: true },
  { code: "1020", name: "Cash at Bank - Foreign Currency",         type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1030", name: "Petty Cash",                              type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1100", name: "Accounts Receivable (Trade Debtors)",     type: "asset",     subType: "current_asset",       isSystem: true },
  { code: "1110", name: "GST Input Tax Recoverable",               type: "asset",     subType: "current_asset",       isSystem: true },
  { code: "1120", name: "Other Receivables",                       type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1200", name: "Inventory / Stock",                       type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1300", name: "Prepayments",                             type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1400", name: "Deposits Paid",                           type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1500", name: "Fixed Assets - Equipment",                type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1510", name: "Less: Accumulated Depreciation - Equipment", type: "asset",  subType: "fixed_asset",         isSystem: false },
  { code: "1600", name: "Fixed Assets - Furniture & Fittings",    type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1610", name: "Less: Accumulated Depreciation - F&F",   type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1700", name: "Fixed Assets - Office Renovation",       type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1710", name: "Less: Accumulated Depreciation - Renovation", type: "asset", subType: "fixed_asset",        isSystem: false },
  { code: "2000", name: "Accounts Payable (Trade Creditors)",      type: "liability", subType: "current_liability",   isSystem: true },
  { code: "2010", name: "GST Output Tax Payable",                  type: "liability", subType: "current_liability",   isSystem: true },
  { code: "2020", name: "Accrued Liabilities",                     type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2030", name: "Deferred Revenue",                        type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2040", name: "Staff Salaries Payable",                  type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2050", name: "CPF Contributions Payable",               type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2060", name: "Other Current Liabilities",               type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2100", name: "Director's Loan",                         type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2200", name: "Bank Loan",                               type: "liability", subType: "long_term_liability", isSystem: false },
  { code: "2300", name: "Other Long-term Liabilities",             type: "liability", subType: "long_term_liability", isSystem: false },
  { code: "3000", name: "Paid-up Share Capital",                   type: "equity",    subType: "share_capital",       isSystem: true },
  { code: "3100", name: "Retained Earnings",                       type: "equity",    subType: "retained_earnings",   isSystem: true },
  { code: "3200", name: "Current Year Earnings",                   type: "equity",    subType: "retained_earnings",   isSystem: true },
  { code: "4000", name: "Sales Revenue",                           type: "revenue",   subType: "sales",               isSystem: true },
  { code: "4100", name: "Service Revenue",                         type: "revenue",   subType: "sales",               isSystem: false },
  { code: "4200", name: "Other Operating Revenue",                 type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "4300", name: "Interest Income",                         type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "4400", name: "Foreign Exchange Gain",                   type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "5000", name: "Cost of Goods Sold",                      type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5100", name: "Direct Materials",                        type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5200", name: "Direct Labour",                           type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5300", name: "Subcontractor Costs",                     type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "6000", name: "Salaries and Wages",                      type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6010", name: "CPF Contributions (Employer)",            type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6020", name: "Employee Benefits",                       type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6100", name: "Rent and Utilities",                      type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6110", name: "Electricity and Water",                   type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6200", name: "Office Supplies",                         type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6300", name: "Telephone and Internet",                  type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6400", name: "Professional Fees",                       type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6500", name: "Marketing and Advertising",               type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6600", name: "Travel and Entertainment",                type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6700", name: "Depreciation",                            type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6800", name: "Bank Charges and Fees",                   type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6900", name: "Insurance",                               type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7000", name: "Repairs and Maintenance",                 type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7100", name: "Foreign Exchange Loss",                   type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7200", name: "Miscellaneous Expenses",                  type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7300", name: "Income Tax Expense",                      type: "expense",   subType: "operating_expense",   isSystem: false },
];

async function ensureAccountsSeeded(companyId: number): Promise<void> {
  const existing = await db.select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(accountsTable).values(
    DEFAULT_ACCOUNTS.map(a => ({ ...a, companyId }))
  );
}

// ─── Chart of Accounts ──────────────────────────────────────────────────────

router.get("/accounts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId))
    .orderBy(asc(accountsTable.code));

  res.json(accounts);
});

router.post("/accounts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const companyId = req.session.companyId!;
  const { code, name, type, subType, description } = req.body;

  if (!code?.trim()) { res.status(400).json({ error: "Account code is required" }); return; }
  if (!name?.trim()) { res.status(400).json({ error: "Account name is required" }); return; }

  const VALID_TYPES = ["asset", "liability", "equity", "revenue", "expense"];
  if (!VALID_TYPES.includes(type)) { res.status(400).json({ error: "Invalid account type" }); return; }

  try {
    const [account] = await db.insert(accountsTable).values({
      companyId, code: code.trim(), name: name.trim(),
      type, subType: subType || type, description: description || null,
    }).returning();
    logAudit({ req, action: "create", entityType: "account", entityId: account.id, entityLabel: `${account.code} ${account.name}` });
    res.status(201).json(account);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: `Account code "${code}" already exists for this company` });
    } else {
      res.status(500).json({ error: "Failed to create account" });
    }
  }
});

router.put("/accounts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account ID" }); return; }

  const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Account not found" }); return; }

  const { name, subType, description, isActive } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (subType !== undefined) updates.subType = subType;
  if (description !== undefined) updates.description = description || null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  try {
    const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
    logAudit({ req, action: "update", entityType: "account", entityId: id, entityLabel: `${updated.code} ${updated.name}` });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update account" });
  }
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account ID" }); return; }

  const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Account not found" }); return; }
  if (existing.isSystem) { res.status(400).json({ error: "System accounts cannot be deleted. You can deactivate them instead." }); return; }

  const usedLines = await db.select({ id: journalLinesTable.id })
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, id))
    .limit(1);
  if (usedLines.length > 0) {
    res.status(400).json({ error: "This account has journal entries. Deactivate it instead of deleting." });
    return;
  }

  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  logAudit({ req, action: "delete", entityType: "account", entityId: id, entityLabel: `${existing.code} ${existing.name}` });
  res.json({ success: true });
});

// ─── Journal Entries ─────────────────────────────────────────────────────────

router.get("/journal-entries", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const entries = await db.select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, companyId))
    .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id));

  res.json(entries);
});

router.get("/journal-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }

  const lines = await db.select({
    line:    journalLinesTable,
    account: accountsTable,
  })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, id));

  res.json({
    ...entry,
    lines: lines.map(r => ({
      ...r.line,
      debit:  parseFloat(r.line.debit ?? "0"),
      credit: parseFloat(r.line.credit ?? "0"),
      accountCode: r.account.code,
      accountName: r.account.name,
      accountType: r.account.type,
    })),
  });
});

router.post("/journal-entries", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const { entryDate, description, lines } = req.body as {
    entryDate:   string;
    description: string;
    lines: Array<{ accountId: number; description?: string; debit: number; credit: number }>;
  };

  if (!entryDate)        { res.status(400).json({ error: "Entry date is required" }); return; }
  if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
  if (!Array.isArray(lines) || lines.length < 2) {
    res.status(400).json({ error: "At least 2 journal lines are required" }); return;
  }

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    res.status(400).json({ error: `Journal entry is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}` });
    return;
  }

  const accountIds = lines.map(l => l.accountId);
  const accounts = await db.select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId)));
  const validIds = new Set(accounts.map(a => a.id));
  const invalid = accountIds.find(id => !validIds.has(id));
  if (invalid) { res.status(400).json({ error: `Account ID ${invalid} not found for this company` }); return; }

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate,
      description: description.trim(),
      refType: "manual",
      status: "posted",
      createdBy: req.session.userId!,
    }).returning();

    await db.insert(journalLinesTable).values(
      lines.map(l => ({
        journalEntryId: entry.id,
        accountId:      l.accountId,
        description:    l.description || null,
        debit:          l.debit  > 0 ? l.debit.toFixed(2)  : "0",
        credit:         l.credit > 0 ? l.credit.toFixed(2) : "0",
      }))
    );

    logAudit({ req, action: "create", entityType: "journal_entry", entityId: entry.id, entityLabel: description });
    res.status(201).json({ ...entry, lines });
  } catch {
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

router.delete("/journal-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }
  if (entry.refType !== "manual") {
    res.status(400).json({ error: "Auto-posted entries cannot be deleted. They are reversed automatically when the source document changes." });
    return;
  }

  await db.delete(journalLinesTable).where(eq(journalLinesTable.journalEntryId, id));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  logAudit({ req, action: "delete", entityType: "journal_entry", entityId: id, entityLabel: entry.description });
  res.json({ success: true });
});

// ─── Trial Balance ────────────────────────────────────────────────────────────

router.get("/trial-balance", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  const entriesQuery = db.select({
    entryId:   journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
  })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status, "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ));

  const entries = await entriesQuery;
  const entryIds = entries.map(e => e.entryId);

  let linesByAccount: Record<number, { debit: number; credit: number }> = {};

  if (entryIds.length > 0) {
    const lines = await db.select()
      .from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`);

    for (const line of lines) {
      if (!linesByAccount[line.accountId]) linesByAccount[line.accountId] = { debit: 0, credit: 0 };
      linesByAccount[line.accountId].debit  += parseFloat(line.debit  ?? "0");
      linesByAccount[line.accountId].credit += parseFloat(line.credit ?? "0");
    }
  }

  const rows = accounts.map(a => {
    const totals = linesByAccount[a.id] ?? { debit: 0, credit: 0 };
    return {
      id:           a.id,
      code:         a.code,
      name:         a.name,
      type:         a.type,
      subType:      a.subType,
      totalDebit:   totals.debit,
      totalCredit:  totals.credit,
      balance:      totals.debit - totals.credit,
    };
  });

  const grandDebit  = rows.reduce((s, r) => s + r.totalDebit,  0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  res.json({
    fromDate: fromDate || null,
    toDate:   toDate   || null,
    rows,
    grandDebit,
    grandCredit,
    balanced: Math.abs(grandDebit - grandCredit) < 0.01,
  });
});

export default router;
