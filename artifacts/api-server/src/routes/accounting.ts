import { Router, type IRouter } from "express";
import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable, invoicesTable, vendorInvoicesTable, settingsTable } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { DEFAULT_ACCOUNTS, ensureAccountsSeeded } from "../lib/accounts-seed.js";

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

// ─── Profit & Loss Statement ─────────────────────────────────────────────────

router.get("/profit-loss", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  // All revenue + expense accounts for this company
  const accounts = await db.select()
    .from(accountsTable)
    .where(and(
      eq(accountsTable.companyId, companyId),
      eq(accountsTable.isActive, true),
      sql`${accountsTable.type} IN ('revenue','expense')`,
    ))
    .orderBy(asc(accountsTable.code));

  // Include both 'posted' and 'reversed' entries so that a voided invoice
  // (original reversed + reversal posted) nets to zero rather than showing
  // only the reversal (which would produce a negative revenue line).
  const entries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted','reversed')`,
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ));

  const entryIds = entries.map(e => e.entryId);
  let linesByAccount: Record<number, { debit: number; credit: number }> = {};

  if (entryIds.length > 0) {
    const lines = await db.select()
      .from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!linesByAccount[l.accountId]) linesByAccount[l.accountId] = { debit: 0, credit: 0 };
      linesByAccount[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      linesByAccount[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  function netAmount(acct: typeof accounts[0]) {
    const t = linesByAccount[acct.id] ?? { debit: 0, credit: 0 };
    // Revenue: positive = credit > debit
    // Expense: positive = debit > credit
    return acct.type === "revenue" ? t.credit - t.debit : t.debit - t.credit;
  }

  function mapAcct(acct: typeof accounts[0]) {
    return { code: acct.code, name: acct.name, subType: acct.subType, amount: parseFloat(netAmount(acct).toFixed(2)) };
  }

  const revenue         = accounts.filter(a => a.type === "revenue" && a.subType === "sales").map(mapAcct);
  const otherIncome     = accounts.filter(a => a.type === "revenue" && a.subType === "other_income").map(mapAcct);
  const costOfSales     = accounts.filter(a => a.type === "expense" && a.subType === "cost_of_sales").map(mapAcct);
  const operatingExpenses = accounts.filter(a => a.type === "expense" && a.subType === "operating_expense" && a.code !== "7300").map(mapAcct);
  const incomeTaxAcct   = accounts.find(a => a.code === "7300");

  const totalRevenue          = revenue.reduce((s, a) => s + a.amount, 0);
  const totalOtherIncome      = otherIncome.reduce((s, a) => s + a.amount, 0);
  const totalCostOfSales      = costOfSales.reduce((s, a) => s + a.amount, 0);
  const grossProfit           = totalRevenue + totalOtherIncome - totalCostOfSales;
  const totalOperatingExpenses = operatingExpenses.reduce((s, a) => s + a.amount, 0);
  const operatingProfit       = grossProfit - totalOperatingExpenses;
  const incomeTax             = incomeTaxAcct ? parseFloat(netAmount(incomeTaxAcct).toFixed(2)) : 0;
  const netProfit             = operatingProfit - incomeTax;

  res.json({
    period: { from: fromDate, to: toDate },
    revenue,
    otherIncome,
    totalRevenue: parseFloat((totalRevenue + totalOtherIncome).toFixed(2)),
    costOfSales,
    totalCostOfSales: parseFloat(totalCostOfSales.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    operatingExpenses,
    totalOperatingExpenses: parseFloat(totalOperatingExpenses.toFixed(2)),
    operatingProfit: parseFloat(operatingProfit.toFixed(2)),
    incomeTax: parseFloat(incomeTax.toFixed(2)),
    netProfit: parseFloat(netProfit.toFixed(2)),
  });
});

// ─── GST F5 Return (Singapore) ───────────────────────────────────────────────

router.get("/gst-f5", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const [company]  = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const gstRate    = parseFloat((settings as any)?.gstRate ?? "9");

  // ─ Box 1 + Box 6: standard-rated sales invoices (non-draft, non-void, GST > 0) ─
  const invRows = await db.select({
    id:             invoicesTable.id,
    invNumber:      invoicesTable.invNumber,
    customerName:   invoicesTable.customerName,
    issueDate:      invoicesTable.issueDate,
    subtotal:       invoicesTable.subtotal,
    discountAmount: invoicesTable.discountAmount,
    tax:            invoicesTable.tax,
    totalAmount:    invoicesTable.totalAmount,
    status:         invoicesTable.status,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`${invoicesTable.status} NOT IN ('draft', 'void')`,
    sql`CAST(${invoicesTable.tax} AS numeric) > 0`,
    ...(fromDate ? [sql`${invoicesTable.issueDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${invoicesTable.issueDate} <= ${toDate}`]   : []),
  ));

  const box1 = invRows.reduce((s, r) =>
    s + parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0"), 0);
  const box6 = invRows.reduce((s, r) => s + parseFloat(r.tax ?? "0"), 0);

  // ─ Box 4: taxable purchases from vendor invoices ─
  const viRows = await db.select({
    id:          vendorInvoicesTable.id,
    piNumber:    vendorInvoicesTable.piNumber,
    vendorName:  vendorInvoicesTable.vendorName,
    piDate:      vendorInvoicesTable.piDate,
    totalAmount: vendorInvoicesTable.totalAmount,
    currency:    vendorInvoicesTable.currency,
  })
  .from(vendorInvoicesTable)
  .where(and(
    eq(vendorInvoicesTable.companyId, companyId),
    ...(fromDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) >= ${fromDate}`] : []),
    ...(toDate   ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) <= ${toDate}`]   : []),
  ));

  const box4 = viRows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);

  // ─ Box 7: input tax from GL account 1110 (GST Input Tax Recoverable) ─
  const [gstInputAcct] = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, "1110"))).limit(1);

  let box7 = 0;
  if (gstInputAcct) {
    const jeWhere = and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status,    "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    );
    const entries  = await db.select({ entryId: journalEntriesTable.id }).from(journalEntriesTable).where(jeWhere);
    const entryIds = entries.map(e => e.entryId);
    if (entryIds.length > 0) {
      const lines = await db.select().from(journalLinesTable).where(and(
        eq(journalLinesTable.accountId, gstInputAcct.id),
        sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`,
      ));
      box7 = lines.reduce((s, l) => s + parseFloat(l.debit ?? "0"), 0);
    }
  }

  const box8 = box6 - box7;

  res.json({
    period:  { from: fromDate, to: toDate },
    company: { name: company?.name, gstRegistrationNo: company?.registrationNo, address: company?.address },
    gstRate,
    box1: parseFloat(box1.toFixed(2)),
    box2: 0,
    box3: 0,
    box4: parseFloat(box4.toFixed(2)),
    box5: 0,
    box6: parseFloat(box6.toFixed(2)),
    box7: parseFloat(box7.toFixed(2)),
    box8: parseFloat(box8.toFixed(2)),
    invoices: invRows.map(r => ({
      id:           r.id,
      invNumber:    r.invNumber,
      customerName: r.customerName,
      issueDate:    r.issueDate,
      netAmount:    parseFloat((parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0")).toFixed(2)),
      gstAmount:    parseFloat(parseFloat(r.tax ?? "0").toFixed(2)),
      totalAmount:  parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
      status:       r.status,
    })),
    vendorInvoices: viRows.map(r => ({
      id:          r.id,
      piNumber:    r.piNumber,
      vendorName:  r.vendorName,
      piDate:      r.piDate,
      totalAmount: parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
      currency:    r.currency,
    })),
  });
});

// ─── AR Aging Report ─────────────────────────────────────────────────────────

router.get("/ar-aging", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf = (req.query.asOf as string) || new Date().toISOString().split("T")[0];
  const asOfMs = new Date(asOf + "T00:00:00").getTime();

  const rows = await db.select({
    id: invoicesTable.id, invNumber: invoicesTable.invNumber,
    customerName: invoicesTable.customerName, issueDate: invoicesTable.issueDate,
    totalAmount: invoicesTable.totalAmount, status: invoicesTable.status,
    paymentTerms: invoicesTable.paymentTerms,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`${invoicesTable.status} NOT IN ('draft', 'void', 'paid')`,
    sql`COALESCE(${invoicesTable.issueDate}, to_char(${invoicesTable.createdAt}::date, 'YYYY-MM-DD')) <= ${asOf}`,
  ));

  function termsDays(pt: string | null): number {
    const s = (pt ?? "").toLowerCase();
    if (s.includes("cod") || s.includes("advance")) return 0;
    if (s.includes("7"))  return 7;
    if (s.includes("14")) return 14;
    return 30;
  }

  const byCustomer: Record<string, { customerName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: any[] }> = {};

  for (const inv of rows) {
    const name   = inv.customerName || "Unknown";
    const amount = parseFloat(inv.totalAmount ?? "0");
    const dueMs  = new Date((inv.issueDate || asOf) + "T00:00:00").getTime() + termsDays(inv.paymentTerms) * 86_400_000;
    const days   = Math.floor((asOfMs - dueMs) / 86_400_000);
    if (!byCustomer[name]) byCustomer[name] = { customerName: name, current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0, invoices: [] };
    if      (days <= 0)  byCustomer[name].current  += amount;
    else if (days <= 30) byCustomer[name].b1_30    += amount;
    else if (days <= 60) byCustomer[name].b31_60   += amount;
    else if (days <= 90) byCustomer[name].b61_90   += amount;
    else                 byCustomer[name].b91plus  += amount;
    byCustomer[name].total += amount;
    byCustomer[name].invoices.push({ id: inv.id, invNumber: inv.invNumber, issueDate: inv.issueDate, amount, daysPastDue: days });
  }

  const customers = Object.values(byCustomer).sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, current: +c.current.toFixed(2), b1_30: +c.b1_30.toFixed(2), b31_60: +c.b31_60.toFixed(2), b61_90: +c.b61_90.toFixed(2), b91plus: +c.b91plus.toFixed(2), total: +c.total.toFixed(2) }));

  const totals = customers.reduce((s, c) => ({
    current: s.current + c.current, b1_30: s.b1_30 + c.b1_30, b31_60: s.b31_60 + c.b31_60,
    b61_90: s.b61_90 + c.b61_90, b91plus: s.b91plus + c.b91plus, total: s.total + c.total,
  }), { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0 });

  res.json({ asOf, customers, totals });
});

// ─── AP Aging Report ─────────────────────────────────────────────────────────

router.get("/ap-aging", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf   = (req.query.asOf as string) || new Date().toISOString().split("T")[0];
  const asOfMs = new Date(asOf + "T00:00:00").getTime();
  const TERMS  = 30;

  const rows = await db.select({
    id: vendorInvoicesTable.id, piNumber: vendorInvoicesTable.piNumber,
    vendorName: vendorInvoicesTable.vendorName, piDate: vendorInvoicesTable.piDate,
    totalAmount: vendorInvoicesTable.totalAmount, paidAmount: vendorInvoicesTable.paidAmount,
    status: vendorInvoicesTable.status,
  })
  .from(vendorInvoicesTable)
  .where(and(
    eq(vendorInvoicesTable.companyId, companyId),
    sql`${vendorInvoicesTable.status} != 'paid'`,
    sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}::date, 'YYYY-MM-DD')) <= ${asOf}`,
  ));

  const byVendor: Record<string, { vendorName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: any[] }> = {};

  for (const vi of rows) {
    const name    = vi.vendorName || "Unknown";
    const balance = parseFloat(vi.totalAmount ?? "0") - parseFloat(vi.paidAmount ?? "0");
    if (balance < 0.005) continue;
    const dueMs = new Date((vi.piDate || asOf) + "T00:00:00").getTime() + TERMS * 86_400_000;
    const days  = Math.floor((asOfMs - dueMs) / 86_400_000);
    if (!byVendor[name]) byVendor[name] = { vendorName: name, current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0, invoices: [] };
    if      (days <= 0)  byVendor[name].current  += balance;
    else if (days <= 30) byVendor[name].b1_30    += balance;
    else if (days <= 60) byVendor[name].b31_60   += balance;
    else if (days <= 90) byVendor[name].b61_90   += balance;
    else                 byVendor[name].b91plus  += balance;
    byVendor[name].total += balance;
    byVendor[name].invoices.push({ id: vi.id, piNumber: vi.piNumber, piDate: vi.piDate, balance: +balance.toFixed(2), daysPastDue: days, status: vi.status });
  }

  const vendors = Object.values(byVendor).sort((a, b) => b.total - a.total)
    .map(v => ({ ...v, current: +v.current.toFixed(2), b1_30: +v.b1_30.toFixed(2), b31_60: +v.b31_60.toFixed(2), b61_90: +v.b61_90.toFixed(2), b91plus: +v.b91plus.toFixed(2), total: +v.total.toFixed(2) }));

  const totals = vendors.reduce((s, v) => ({
    current: s.current + v.current, b1_30: s.b1_30 + v.b1_30, b31_60: s.b31_60 + v.b31_60,
    b61_90: s.b61_90 + v.b61_90, b91plus: s.b91plus + v.b91plus, total: s.total + v.total,
  }), { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0 });

  res.json({ asOf, vendors, totals });
});

// ─── Balance Sheet ────────────────────────────────────────────────────────────

router.get("/balance-sheet", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf = (req.query.asOf as string) || new Date().toISOString().split("T")[0];

  await ensureAccountsSeeded(companyId);

  const allAccounts = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  const entries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted', 'reversed')`,
      sql`${journalEntriesTable.entryDate} <= ${asOf}`,
    ));

  const linesByAccount: Record<number, { debit: number; credit: number }> = {};
  if (entries.length > 0) {
    const ids = entries.map(e => e.entryId);
    const lines = await db.select().from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!linesByAccount[l.accountId]) linesByAccount[l.accountId] = { debit: 0, credit: 0 };
      linesByAccount[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      linesByAccount[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  const bal    = (a: typeof allAccounts[0]) => { const t = linesByAccount[a.id] ?? { debit: 0, credit: 0 }; return a.type === "asset" ? t.debit - t.credit : t.credit - t.debit; };
  const mapA   = (a: typeof allAccounts[0]) => ({ code: a.code, name: a.name, subType: a.subType, amount: parseFloat(bal(a).toFixed(2)) });

  const assets      = allAccounts.filter(a => a.type === "asset").map(mapA);
  const liabilities = allAccounts.filter(a => a.type === "liability").map(mapA);
  const equity      = allAccounts.filter(a => a.type === "equity").map(mapA);

  const retainedEarnings = allAccounts
    .filter(a => a.type === "revenue" || a.type === "expense")
    .reduce((s, a) => { const t = linesByAccount[a.id] ?? { debit: 0, credit: 0 }; return s + (a.type === "revenue" ? t.credit - t.debit : t.debit - t.credit); }, 0);

  const totalAssets      = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.amount, 0) + retainedEarnings;

  res.json({
    asOf,
    assets, totalAssets: parseFloat(totalAssets.toFixed(2)),
    liabilities, totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
    equity, retainedEarnings: parseFloat(retainedEarnings.toFixed(2)),
    totalEquity: parseFloat(totalEquity.toFixed(2)),
    totalLiabilitiesAndEquity: parseFloat((totalLiabilities + totalEquity).toFixed(2)),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// ─── Customer Statement ───────────────────────────────────────────────────────

router.get("/customer-statement", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const customer  = (req.query.customer as string) || "";
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  const nameRows = await db.selectDistinct({ name: invoicesTable.customerName })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.companyId, companyId), sql`${invoicesTable.status} != 'draft'`, sql`${invoicesTable.customerName} IS NOT NULL`))
    .orderBy(asc(invoicesTable.customerName));
  const customerNames = nameRows.map(r => r.name).filter(Boolean) as string[];

  if (!customer) { res.json({ customer: "", customerNames, entries: [], totalBilled: 0, totalPaid: 0, balance: 0 }); return; }

  const invRows = await db.select({
    id: invoicesTable.id, invNumber: invoicesTable.invNumber,
    issueDate: invoicesTable.issueDate, totalAmount: invoicesTable.totalAmount,
    status: invoicesTable.status, paymentTerms: invoicesTable.paymentTerms,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`LOWER(${invoicesTable.customerName}) = LOWER(${customer})`,
    sql`${invoicesTable.status} NOT IN ('draft', 'void')`,
    ...(fromDate ? [sql`${invoicesTable.issueDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${invoicesTable.issueDate} <= ${toDate}`]   : []),
  ))
  .orderBy(asc(invoicesTable.issueDate), asc(invoicesTable.id));

  const totalBilled = invRows.reduce((s, i) => s + parseFloat(i.totalAmount ?? "0"), 0);
  const totalPaid   = invRows.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount ?? "0"), 0);

  res.json({
    customer, customerNames,
    entries: invRows.map(inv => ({ id: inv.id, invNumber: inv.invNumber, issueDate: inv.issueDate, amount: parseFloat(parseFloat(inv.totalAmount ?? "0").toFixed(2)), status: inv.status, paymentTerms: inv.paymentTerms })),
    totalBilled: parseFloat(totalBilled.toFixed(2)),
    totalPaid:   parseFloat(totalPaid.toFixed(2)),
    balance:     parseFloat((totalBilled - totalPaid).toFixed(2)),
  });
});

export default router;

// ─── GST F7 (Amended Return) ─────────────────────────────────────────────────

router.get("/gst-f7", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId  = req.session.companyId!;
  const fromDate   = (req.query.from  as string) || null;
  const toDate     = (req.query.to    as string) || null;
  const origFromDate = (req.query.origFrom as string) || null;
  const origToDate   = (req.query.origTo   as string) || null;

  await ensureAccountsSeeded(companyId);

  const [company]  = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const gstRate    = parseFloat((settings as any)?.gstRate ?? "9");

  async function computeF5Boxes(fDate: string | null, tDate: string | null) {
    const invRows = await db.select({
      subtotal: invoicesTable.subtotal, discountAmount: invoicesTable.discountAmount, tax: invoicesTable.tax,
    })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.companyId, companyId),
      sql`${invoicesTable.status} NOT IN ('draft','void')`,
      sql`CAST(${invoicesTable.tax} AS numeric) > 0`,
      ...(fDate ? [sql`${invoicesTable.issueDate} >= ${fDate}`] : []),
      ...(tDate ? [sql`${invoicesTable.issueDate} <= ${tDate}`] : []),
    ));
    const box1 = invRows.reduce((s, r) => s + parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0"), 0);
    const box6 = invRows.reduce((s, r) => s + parseFloat(r.tax ?? "0"), 0);

    const viRows = await db.select({ totalAmount: vendorInvoicesTable.totalAmount })
      .from(vendorInvoicesTable)
      .where(and(
        eq(vendorInvoicesTable.companyId, companyId),
        ...(fDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) >= ${fDate}`] : []),
        ...(tDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) <= ${tDate}`] : []),
      ));
    const box4 = viRows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);

    const [gstInputAcct] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, "1110"))).limit(1);
    let box7 = 0;
    if (gstInputAcct) {
      const entries = await db.select({ entryId: journalEntriesTable.id }).from(journalEntriesTable)
        .where(and(eq(journalEntriesTable.companyId, companyId), eq(journalEntriesTable.status, "posted"),
          ...(fDate ? [sql`${journalEntriesTable.entryDate} >= ${fDate}`] : []),
          ...(tDate ? [sql`${journalEntriesTable.entryDate} <= ${tDate}`] : []),
        ));
      const eIds = entries.map(e => e.entryId);
      if (eIds.length > 0) {
        const lines = await db.select().from(journalLinesTable)
          .where(and(eq(journalLinesTable.accountId, gstInputAcct.id), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${eIds.join(",")}]::int[]`)})`));
        box7 = lines.reduce((s, l) => s + parseFloat(l.debit ?? "0"), 0);
      }
    }
    return { box1, box2: 0, box3: 0, box4, box5: 0, box6, box7, box8: box6 - box7 };
  }

  const [original, amended] = await Promise.all([
    computeF5Boxes(origFromDate, origToDate),
    computeF5Boxes(fromDate, toDate),
  ]);

  const delta = {
    box1: amended.box1 - original.box1, box2: 0, box3: 0,
    box4: amended.box4 - original.box4, box5: 0,
    box6: amended.box6 - original.box6, box7: amended.box7 - original.box7,
    box8: amended.box8 - original.box8,
  };

  res.json({
    originalPeriod: { from: origFromDate, to: origToDate },
    amendedPeriod:  { from: fromDate,     to: toDate     },
    company: { name: company?.name, gstRegistrationNo: company?.registrationNo, address: company?.address },
    gstRate,
    original: { box1: +original.box1.toFixed(2), box2: 0, box3: 0, box4: +original.box4.toFixed(2), box5: 0, box6: +original.box6.toFixed(2), box7: +original.box7.toFixed(2), box8: +original.box8.toFixed(2) },
    amended:  { box1: +amended.box1.toFixed(2),  box2: 0, box3: 0, box4: +amended.box4.toFixed(2),  box5: 0, box6: +amended.box6.toFixed(2),  box7: +amended.box7.toFixed(2),  box8: +amended.box8.toFixed(2) },
    delta:    { box1: +delta.box1.toFixed(2),    box2: 0, box3: 0, box4: +delta.box4.toFixed(2),    box5: 0, box6: +delta.box6.toFixed(2),    box7: +delta.box7.toFixed(2),    box8: +delta.box8.toFixed(2) },
  });
});

// ─── Vendor Statement ─────────────────────────────────────────────────────────

router.get("/vendor-statement", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const vendor    = (req.query.vendor as string) || "";
  const fromDate  = (req.query.from   as string) || null;
  const toDate    = (req.query.to     as string) || null;

  const nameRows = await db.selectDistinct({ name: vendorInvoicesTable.vendorName })
    .from(vendorInvoicesTable)
    .where(and(eq(vendorInvoicesTable.companyId, companyId), sql`${vendorInvoicesTable.vendorName} IS NOT NULL`))
    .orderBy(asc(vendorInvoicesTable.vendorName));
  const vendorNames = nameRows.map(r => r.name).filter(Boolean) as string[];

  if (!vendor) { res.json({ vendor: "", vendorNames, entries: [], totalBilled: 0, totalPaid: 0, balance: 0 }); return; }

  const piRows = await db.select()
    .from(vendorInvoicesTable)
    .where(and(
      eq(vendorInvoicesTable.companyId, companyId),
      sql`LOWER(${vendorInvoicesTable.vendorName}) = LOWER(${vendor})`,
      ...(fromDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) >= ${fromDate}`] : []),
      ...(toDate   ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) <= ${toDate}`]   : []),
    ))
    .orderBy(asc(vendorInvoicesTable.piDate), asc(vendorInvoicesTable.id));

  const totalBilled = piRows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
  const totalPaid   = piRows.filter(r => r.status === "paid").reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);

  res.json({
    vendor, vendorNames,
    entries: piRows.map(r => ({
      id: r.id, piNumber: r.piNumber, piDate: r.piDate,
      amount: +parseFloat(r.totalAmount ?? "0").toFixed(2),
      paidAmount: +parseFloat(r.paidAmount ?? "0").toFixed(2),
      balance: +Math.max(0, parseFloat(r.totalAmount ?? "0") - parseFloat(r.paidAmount ?? "0")).toFixed(2),
      status: r.status, currency: r.currency,
    })),
    totalBilled: +totalBilled.toFixed(2),
    totalPaid:   +totalPaid.toFixed(2),
    balance:     +(totalBilled - totalPaid).toFixed(2),
  });
});

// ─── General Ledger ───────────────────────────────────────────────────────────

router.get("/general-ledger", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const accountId = req.query.accountId ? parseInt(req.query.accountId as string, 10) : null;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  if (!accountId) {
    res.json({ accounts: accounts.map(a => ({ id: a.id, code: a.code, name: a.name, type: a.type })), transactions: [], openingBalance: 0, closingBalance: 0 });
    return;
  }

  const [account] = accounts.filter(a => a.id === accountId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  // Opening balance: all posted entries BEFORE fromDate
  let openingDebit = 0, openingCredit = 0;
  if (fromDate) {
    const obEntries = await db.select({ entryId: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.companyId, companyId), eq(journalEntriesTable.status, "posted"), sql`${journalEntriesTable.entryDate} < ${fromDate}`));
    const obIds = obEntries.map(e => e.entryId);
    if (obIds.length > 0) {
      const obLines = await db.select().from(journalLinesTable)
        .where(and(eq(journalLinesTable.accountId, accountId), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${obIds.join(",")}]::int[]`)})`));
      openingDebit  = obLines.reduce((s, l) => s + parseFloat(l.debit  ?? "0"), 0);
      openingCredit = obLines.reduce((s, l) => s + parseFloat(l.credit ?? "0"), 0);
    }
  }
  const openingBalance = openingDebit - openingCredit;

  // Period entries
  const entries = await db.select({ entryId: journalEntriesTable.id, entryDate: journalEntriesTable.entryDate, reference: journalEntriesTable.reference, description: journalEntriesTable.description })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status, "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ))
    .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));

  const entryIds = entries.map(e => e.entryId);
  let lines: any[] = [];
  if (entryIds.length > 0) {
    lines = await db.select().from(journalLinesTable)
      .where(and(eq(journalLinesTable.accountId, accountId), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`));
  }

  const linesByEntry: Record<number, typeof lines[0]> = {};
  for (const l of lines) linesByEntry[l.journalEntryId] = l;

  let running = openingBalance;
  const transactions = entries
    .filter(e => linesByEntry[e.entryId])
    .map(e => {
      const l = linesByEntry[e.entryId];
      const debit  = parseFloat(l.debit  ?? "0");
      const credit = parseFloat(l.credit ?? "0");
      running += debit - credit;
      return { journalEntryId: e.entryId, date: e.entryDate, reference: e.reference, description: e.description || l.description, debit: +debit.toFixed(2), credit: +credit.toFixed(2), balance: +running.toFixed(2) };
    });

  res.json({
    account: { id: account.id, code: account.code, name: account.name, type: account.type, subType: account.subType },
    accounts: accounts.map(a => ({ id: a.id, code: a.code, name: a.name, type: a.type })),
    openingBalance: +openingBalance.toFixed(2),
    closingBalance: +running.toFixed(2),
    transactions,
  });
});
