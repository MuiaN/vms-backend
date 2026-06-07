import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  distributorId: integer("distributor_id").notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerContact: varchar("customer_contact", { length: 255 }).notNull(),
  orderStatus: varchar("order_status", { length: 50 }).notNull().default("Pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
