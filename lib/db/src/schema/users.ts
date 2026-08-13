import { boolean, pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { rolesTable } from "./roles-permissions";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  email: text("email"),
  fullName: text("full_name"),
  phoneNumber: text("phone_number"),
  isActive: boolean("is_active").notNull().default(true),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  roleId: integer("role_id").references(() => rolesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRecord = typeof usersTable.$inferSelect;
