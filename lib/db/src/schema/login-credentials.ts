import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Master-DB login secrets. Kept off `users` so the directory row only routes to a company database. */
export const loginCredentialsTable = pgTable("login_credentials", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoginCredentialRecord = typeof loginCredentialsTable.$inferSelect;
