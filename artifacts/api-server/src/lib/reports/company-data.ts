import { db, companiesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { EMPTY_COMPANY, type CompanyReportData } from "./types.js";

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Live company profile for reports.
 * Values always come from Settings → Companies (+ company settings), never from the template.
 */
export async function getCompanyReportData(companyId: number): Promise<CompanyReportData> {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) return { ...EMPTY_COMPANY };

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, companyId))
    .limit(1);

  return {
    name: str(company.name),
    logo: str(company.logoUrl),
    address: str(company.address),
    city: "",
    state: "",
    country: str(company.country),
    postalCode: "",
    phone: str(company.phone),
    email: str(company.email),
    website: str(company.domain),
    taxNumber: str(company.gstRegNo),
    registrationNumber: str(company.registrationNo),
    bankDetails: str(settings?.bankDetails),
    terms: str(settings?.termsAndConditions),
    gstRate: str(settings?.gstRate),
  };
}
