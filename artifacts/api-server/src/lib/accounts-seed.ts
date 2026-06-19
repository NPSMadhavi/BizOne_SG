import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash & Cash Equivalents",                    type: "asset",     subType: "current_asset",       isSystem: true  },
  { code: "1010", name: "Cash at Bank - SGD",                         type: "asset",     subType: "current_asset",       isSystem: true  },
  { code: "1020", name: "Cash at Bank - Foreign Currency",            type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1030", name: "Petty Cash",                                 type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1100", name: "Accounts Receivable (Trade Debtors)",        type: "asset",     subType: "current_asset",       isSystem: true  },
  { code: "1110", name: "GST Input Tax Recoverable",                  type: "asset",     subType: "current_asset",       isSystem: true  },
  { code: "1120", name: "Other Receivables",                          type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1200", name: "Inventory / Stock",                          type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1300", name: "Prepayments",                                type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1400", name: "Deposits Paid",                              type: "asset",     subType: "current_asset",       isSystem: false },
  { code: "1500", name: "Fixed Assets - Equipment",                   type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1510", name: "Less: Accumulated Depreciation - Equipment", type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1600", name: "Fixed Assets - Furniture & Fittings",       type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1610", name: "Less: Accumulated Depreciation - F&F",      type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1700", name: "Fixed Assets - Office Renovation",          type: "asset",     subType: "fixed_asset",         isSystem: false },
  { code: "1710", name: "Less: Accumulated Depreciation - Renovation",type: "asset",    subType: "fixed_asset",         isSystem: false },
  { code: "2000", name: "Accounts Payable (Trade Creditors)",         type: "liability", subType: "current_liability",   isSystem: true  },
  { code: "2010", name: "GST Output Tax Payable",                     type: "liability", subType: "current_liability",   isSystem: true  },
  { code: "2020", name: "Accrued Liabilities",                        type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2030", name: "Deferred Revenue",                           type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2040", name: "Staff Salaries Payable",                     type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2050", name: "CPF Contributions Payable",                  type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2060", name: "Other Current Liabilities",                  type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2100", name: "Director's Loan",                            type: "liability", subType: "current_liability",   isSystem: false },
  { code: "2200", name: "Bank Loan",                                  type: "liability", subType: "long_term_liability", isSystem: false },
  { code: "2300", name: "Other Long-term Liabilities",                type: "liability", subType: "long_term_liability", isSystem: false },
  { code: "3000", name: "Paid-up Share Capital",                      type: "equity",    subType: "share_capital",       isSystem: true  },
  { code: "3100", name: "Retained Earnings",                          type: "equity",    subType: "retained_earnings",   isSystem: true  },
  { code: "3200", name: "Current Year Earnings",                      type: "equity",    subType: "retained_earnings",   isSystem: true  },
  { code: "4000", name: "Sales Revenue",                              type: "revenue",   subType: "sales",               isSystem: true  },
  { code: "4100", name: "Service Revenue",                            type: "revenue",   subType: "sales",               isSystem: false },
  { code: "4200", name: "Other Operating Revenue",                    type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "4300", name: "Interest Income",                            type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "4400", name: "Foreign Exchange Gain",                      type: "revenue",   subType: "other_income",        isSystem: false },
  { code: "5000", name: "Cost of Goods Sold",                         type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5100", name: "Direct Materials",                           type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5200", name: "Direct Labour",                              type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "5300", name: "Subcontractor Costs",                        type: "expense",   subType: "cost_of_sales",       isSystem: false },
  { code: "6000", name: "Salaries and Wages",                         type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6010", name: "CPF Contributions (Employer)",               type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6020", name: "Employee Benefits",                          type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6100", name: "Rent and Utilities",                         type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6110", name: "Electricity and Water",                      type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6200", name: "Office Supplies",                            type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6300", name: "Telephone and Internet",                     type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6400", name: "Professional Fees",                          type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6500", name: "Marketing and Advertising",                  type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6600", name: "Travel and Entertainment",                   type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6700", name: "Depreciation",                               type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6800", name: "Bank Charges and Fees",                      type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "6900", name: "Insurance",                                  type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7000", name: "Repairs and Maintenance",                    type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7100", name: "Foreign Exchange Loss",                      type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7200", name: "Miscellaneous Expenses",                     type: "expense",   subType: "operating_expense",   isSystem: false },
  { code: "7300", name: "Income Tax Expense",                         type: "expense",   subType: "operating_expense",   isSystem: false },
];

export async function ensureAccountsSeeded(companyId: number): Promise<void> {
  const existing = await db.select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(accountsTable).values(
    DEFAULT_ACCOUNTS.map(a => ({ ...a, companyId }))
  );
}
