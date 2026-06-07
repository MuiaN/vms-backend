import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoryPricingTable = pgTable("category_pricing", {
  id: serial("id").primaryKey(),
  distributorId: integer("distributor_id").notNull(),
  category: text("category").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCategoryPricingSchema = createInsertSchema(categoryPricingTable).omit({ id: true, createdAt: true });
export type InsertCategoryPricing = z.infer<typeof insertCategoryPricingSchema>;
export type CategoryPricing = typeof categoryPricingTable.$inferSelect;
