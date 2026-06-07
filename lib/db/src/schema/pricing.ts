import { pgTable, serial, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehiclePricingTable = pgTable("vehicle_pricing", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  distributorId: integer("distributor_id").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date("effective_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVehiclePricingSchema = createInsertSchema(vehiclePricingTable).omit({ id: true, createdAt: true });
export type InsertVehiclePricing = z.infer<typeof insertVehiclePricingSchema>;
export type VehiclePricing = typeof vehiclePricingTable.$inferSelect;
