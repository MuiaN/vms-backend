import { Router } from "express";
import { db, vehiclesTable, distributorsTable, statusHistoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

function generateVin(): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  return Array.from({ length: 17 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

router.get("/vehicles/stats", requireAuth, async (req, res) => {
  const vehicles = await db.select().from(vehiclesTable);
  const byStatus: Record<string, number> = {};
  for (const v of vehicles) {
    byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  }
  res.json({
    total: vehicles.length,
    byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    dispatched: byStatus["Dispatched"] || 0,
    available: (byStatus["Production"] || 0) + (byStatus["Quality Check"] || 0) + (byStatus["Ready for Dispatch"] || 0),
  });
});

router.get("/vehicles", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const allVehicles = await db.select().from(vehiclesTable);
  const distributors = await db.select().from(distributorsTable);
  const distMap = new Map(distributors.map((d) => [d.id, d.name]));

  let vehicles = allVehicles;

  const filterId = distributorId ? parseInt(distributorId as string) : user.role === "distributor" ? user.distributorId : null;
  if (filterId) {
    vehicles = vehicles.filter((v) => v.currentDistributorId === filterId);
  }

  res.json(
    vehicles.map((v) => ({
      ...v,
      distributorName: v.currentDistributorId ? (distMap.get(v.currentDistributorId) ?? null) : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }))
  );
});

router.post("/vehicles", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  const { make, model, trim, colour, engine, vin } = req.body;

  if (!make || !model || !colour || !engine) {
    res.status(400).json({ error: "make, model, colour, engine required" });
    return;
  }

  const [vehicle] = await db
    .insert(vehiclesTable)
    .values({
      vin: vin || generateVin(),
      make,
      model,
      trim: trim || null,
      colour,
      engine,
      status: "Production",
    })
    .returning();

  await db.insert(statusHistoryTable).values({
    vehicleId: vehicle.id,
    oldStatus: null,
    newStatus: "Production",
    changedBy: user.id,
  });

  res.status(201).json({
    ...vehicle,
    distributorName: null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  });
});

router.get("/vehicles/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  let distributorName: string | null = null;
  if (vehicle.currentDistributorId) {
    const [dist] = await db.select().from(distributorsTable).where(eq(distributorsTable.id, vehicle.currentDistributorId)).limit(1);
    distributorName = dist?.name ?? null;
  }

  res.json({
    ...vehicle,
    distributorName,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  });
});

router.patch("/vehicles/:id/status", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = (req as any).user as AuthPayload;
  const { status } = req.body;

  const validStatuses = ["Production", "Quality Check", "Ready for Dispatch", "Dispatched"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(vehiclesTable.id, id))
    .returning();

  await db.insert(statusHistoryTable).values({
    vehicleId: id,
    oldStatus: existing.status,
    newStatus: status,
    changedBy: user.id,
  });

  res.json({
    ...vehicle,
    distributorName: null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  });
});

router.patch("/vehicles/:id/release", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = (req as any).user as AuthPayload;
  const { distributorId } = req.body;

  if (!distributorId) {
    res.status(400).json({ error: "distributorId required" });
    return;
  }

  const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set({ currentDistributorId: distributorId, status: "Dispatched", updatedAt: new Date() })
    .where(eq(vehiclesTable.id, id))
    .returning();

  await db.insert(statusHistoryTable).values({
    vehicleId: id,
    oldStatus: existing.status,
    newStatus: "Dispatched",
    changedBy: user.id,
  });

  const [dist] = await db.select().from(distributorsTable).where(eq(distributorsTable.id, distributorId)).limit(1);

  res.json({
    ...vehicle,
    distributorName: dist?.name ?? null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  });
});

router.get("/vehicles/:id/history", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const history = await db
    .select()
    .from(statusHistoryTable)
    .where(eq(statusHistoryTable.vehicleId, id))
    .orderBy(sql`changed_at DESC`);

  res.json(
    history.map((h) => ({
      ...h,
      changedAt: h.changedAt.toISOString(),
    }))
  );
});

export default router;
