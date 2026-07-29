import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  address: text("address"),
  registrationNo: text("registration_no"),
  gstRegNo: text("gst_reg_no"),
  email: text("email"),
  phone: text("phone"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyRecord = typeof companiesTable.$inferSelect;
