import { Router } from "express";
import { db, ordersTable, vehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/orders", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const filterId = distributorId
    ? parseInt(distributorId as string)
    : user.role === "distributor"
    ? user.distributorId
    : null;

  let orders;
  if (filterId) {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.distributorId, filterId));
  } else {
    orders = await db.select().from(ordersTable);
  }

  const allVehicles = await db.select().from(vehiclesTable);
  const vehicleMap = new Map(allVehicles.map((v) => [v.id, v]));

  res.json(
    orders.map((o) => {
      const v = vehicleMap.get(o.vehicleId);
      return {
        ...o,
        createdAt: o.createdAt.toISOString(),
        vehicleVin: v?.vin ?? null,
        vehicleMake: v?.make ?? null,
        vehicleModel: v?.model ?? null,
      };
    })
  );
});

router.post("/orders", requireAuth, async (req, res) => {
  const { vehicleId, distributorId, customerName, customerContact } = req.body;
  if (!vehicleId || !distributorId || !customerName || !customerContact) {
    res.status(400).json({ error: "vehicleId, distributorId, customerName, customerContact required" });
    return;
  }

  const [order] = await db
    .insert(ordersTable)
    .values({ vehicleId, distributorId, customerName, customerContact, orderStatus: "Pending" })
    .returning();

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicleId)).limit(1);

  res.status(201).json({
    ...order,
    createdAt: order.createdAt.toISOString(),
    vehicleVin: vehicle?.vin ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
  });
});

router.patch("/orders/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { orderStatus } = req.body;

  const validStatuses = ["Pending", "Confirmed", "Delivered"];
  if (orderStatus && !validStatuses.includes(orderStatus)) {
    res.status(400).json({ error: "Invalid order status" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({ orderStatus })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, order.vehicleId)).limit(1);

  res.json({
    ...order,
    createdAt: order.createdAt.toISOString(),
    vehicleVin: vehicle?.vin ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
  });
});

router.delete("/orders/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(ordersTable).where(eq(ordersTable.id, id));
  res.status(204).send();
});

export default router;
