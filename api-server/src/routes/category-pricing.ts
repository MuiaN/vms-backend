import { Router } from "express";
import { db, categoryPricingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/category-pricing", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const filterId = distributorId
    ? parseInt(distributorId as string)
    : user.role === "distributor"
    ? user.distributorId
    : null;

  let pricing;
  if (filterId) {
    pricing = await db
      .select()
      .from(categoryPricingTable)
      .where(eq(categoryPricingTable.distributorId, filterId));
  } else {
    pricing = await db.select().from(categoryPricingTable);
  }

  res.json(
    pricing.map((p) => ({
      ...p,
      price: parseFloat(p.price as string),
    }))
  );
});

router.post("/category-pricing", requireAuth, async (req, res) => {
  const { distributorId, category, price } = req.body;
  if (!distributorId || !category || price === undefined) {
    res.status(400).json({ error: "distributorId, category, price required" });
    return;
  }

  const [pricing] = await db
    .insert(categoryPricingTable)
    .values({
      distributorId,
      category,
      price: String(price),
    })
    .returning();

  res.status(201).json({
    ...pricing,
    price: parseFloat(pricing.price as string),
  });
});

export default router;
