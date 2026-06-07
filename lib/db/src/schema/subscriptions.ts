import { pgTable, serial, integer, numeric, date, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  distributorId: integer("distributor_id").notNull(),
  planName: varchar("plan_name", { length: 100 }).notNull(),
  billingCycle: varchar("billing_cycle", { length: 20 }).notNull(), // monthly | quarterly | annual
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  startDate: date("start_date").notNull(),
  nextBillingDate: date("next_billing_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | cancelled | suspended
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
