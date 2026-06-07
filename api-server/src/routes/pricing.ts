import { Router } from "express";
import { db, vehiclePricingTable, vehiclesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/pricing", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const filterId = distributorId
    ? parseInt(distributorId as string)
    : user.role === "distributor"
    ? user.distributorId
    : null;

  let pricing;
  if (filterId) {
    pricing = await db.select().from(vehiclePricingTable).where(eq(vehiclePricingTable.distributorId, filterId));
  } else {
    pricing = await db.select().from(vehiclePricingTable);
  }

  const vehicleIds = [...new Set(pricing.map((p) => p.vehicleId))];
  const vehicles = vehicleIds.length
    ? await db.select().from(vehiclesTable).where(
        vehicleIds.length === 1
          ? eq(vehiclesTable.id, vehicleIds[0])
          : eq(vehiclesTable.id, vehicleIds[0])
      )
    : [];

  const allVehicles = await db.select().from(vehiclesTable);
  const vehicleMap = new Map(allVehicles.map((v) => [v.id, v]));

  res.json(
    pricing.map((p) => {
      const v = vehicleMap.get(p.vehicleId);
      return {
        ...p,
        price: parseFloat(p.price as string),
        vehicleVin: v?.vin ?? null,
        vehicleMake: v?.make ?? null,
        vehicleModel: v?.model ?? null,
      };
    })
  );
});

router.post("/pricing", requireAuth, async (req, res) => {
  const { vehicleId, distributorId, price, effectiveDate } = req.body;
  if (!vehicleId || !distributorId || price === undefined) {
    res.status(400).json({ error: "vehicleId, distributorId, price required" });
    return;
  }

  const [pricing] = await db
    .insert(vehiclePricingTable)
    .values({
      vehicleId,
      distributorId,
      price: String(price),
      effectiveDate: effectiveDate || null,
    })
    .returning();

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicleId)).limit(1);

  res.status(201).json({
    ...pricing,
    price: parseFloat(pricing.price as string),
    vehicleVin: vehicle?.vin ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
  });
});

export default router;
