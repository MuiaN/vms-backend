import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const statusHistoryTable = pgTable("status_history", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  oldStatus: varchar("old_status", { length: 50 }),
  newStatus: varchar("new_status", { length: 50 }).notNull(),
  changedBy: integer("changed_by"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export const insertStatusHistorySchema = createInsertSchema(statusHistoryTable).omit({ id: true, changedAt: true });
export type InsertStatusHistory = z.infer<typeof insertStatusHistorySchema>;
export type StatusHistory = typeof statusHistoryTable.$inferSelect;
