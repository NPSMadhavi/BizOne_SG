import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  postalCode: text("postal_code"),
  country: text("country"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  currency: text("currency"),
  gstRegistered: boolean("gst_registered").notNull().default(false),
  gstNo: text("gst_no"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerRecord = typeof customersTable.$inferSelect;
