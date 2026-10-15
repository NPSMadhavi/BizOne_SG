import { db, userCompaniesTable, salesPersonsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function loadAssignedModules(userId: number, companyId: number): Promise<string[]> {
  const [row] = await db
    .select({ modules: userCompaniesTable.modules })
    .from(userCompaniesTable)
    .where(and(eq(userCompaniesTable.userId, userId), eq(userCompaniesTable.companyId, companyId)))
    .limit(1);
  return Array.isArray(row?.modules) ? (row.modules as string[]) : [];
}

export async function getSalesPersonSummary(salesPersonId: number | null | undefined) {
  if (!salesPersonId) return null;
  const [row] = await db
    .select({
      id: salesPersonsTable.id,
      name: salesPersonsTable.name,
      employmentCode: salesPersonsTable.employmentCode,
    })
    .from(salesPersonsTable)
    .where(eq(salesPersonsTable.id, salesPersonId))
    .limit(1);
  return row ?? null;
}
