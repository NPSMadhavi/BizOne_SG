import { pgTable, serial, timestamp, integer, decimal, text } from "drizzle-orm/pg-core";

export const journalLinesTable = pgTable("journal_lines", {
  id:             serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull(),
  accountId:      integer("account_id").notNull(),
  description:    text("description"),
  debit:          decimal("debit",  { precision: 15, scale: 2 }).notNull().default("0"),
  credit:         decimal("credit", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JournalLineRecord = typeof journalLinesTable.$inferSelect;
