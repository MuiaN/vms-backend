import { Router } from "express";
import { db, distributorsTable, vehiclesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/distributors", requireAuth, async (req, res) => {
  const distributors = await db.select().from(distributorsTable);
  const vehicles = await db.select().from(vehiclesTable);
  const users = await db.select().from(usersTable);

  const vehicleCountMap = new Map<number, number>();
  for (const v of vehicles) {
    if (v.currentDistributorId) {
      vehicleCountMap.set(v.currentDistributorId, (vehicleCountMap.get(v.currentDistributorId) || 0) + 1);
    }
  }

  const userCountMap = new Map<number, number>();
  for (const u of users) {
    if (u.distributorId) {
      userCountMap.set(u.distributorId, (userCountMap.get(u.distributorId) || 0) + 1);
    }
  }

  res.json(
    distributors.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      vehicleCount: vehicleCountMap.get(d.id) || 0,
      userCount: userCountMap.get(d.id) || 0,
    }))
  );
});

router.post("/distributors", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const { name, contactInfo } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [distributor] = await db
    .insert(distributorsTable)
    .values({ name, contactInfo: contactInfo || null })
    .returning();

  res.status(201).json({
    ...distributor,
    createdAt: distributor.createdAt.toISOString(),
    vehicleCount: 0,
    userCount: 0,
  });
});

router.patch("/distributors/:id", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const id = parseInt(req.params.id);
  const { name, contactInfo } = req.body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (contactInfo !== undefined) updates.contactInfo = contactInfo;

  const [distributor] = await db
    .update(distributorsTable)
    .set(updates)
    .where(eq(distributorsTable.id, id))
    .returning();

  if (!distributor) {
    res.status(404).json({ error: "Distributor not found" });
    return;
  }

  const vehicles = await db.select().from(vehiclesTable);
  const users = await db.select().from(usersTable);

  res.json({
    ...distributor,
    createdAt: distributor.createdAt.toISOString(),
    vehicleCount: vehicles.filter((v) => v.currentDistributorId === id).length,
    userCount: users.filter((u) => u.distributorId === id).length,
  });
});

router.delete("/distributors/:id", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const id = parseInt(req.params.id);
  await db.delete(distributorsTable).where(eq(distributorsTable.id, id));
  res.status(204).send();
});

export default router;
