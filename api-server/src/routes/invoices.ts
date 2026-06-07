import { Router } from "express";
import { db, invoicesTable, distributorsTable, vehiclesTable, vehiclePricingTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

async function getDistributorMap() {
  const distributors = await db.select().from(distributorsTable);
  return new Map(distributors.map((d) => [d.id, d.name]));
}

async function getVehicleMap(vehicleIds: number[]) {
  if (vehicleIds.length === 0) return new Map<number, typeof vehiclesTable.$inferSelect>();
  const vehicles = await db.select().from(vehiclesTable).where(inArray(vehiclesTable.id, vehicleIds));
  return new Map(vehicles.map((v) => [v.id, v]));
}

function formatInvoice(
  inv: typeof invoicesTable.$inferSelect,
  distName: string | null,
  vehicle?: typeof vehiclesTable.$inferSelect | null
) {
  return {
    ...inv,
    amount: parseFloat(inv.amount as string),
    distributorName: distName,
    description: inv.description ?? null,
    vehicleId: inv.vehicleId ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
    vehicleTrim: vehicle?.trim ?? null,
    vehicleVin: vehicle?.vin ?? null,
  };
}

router.post("/invoices", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer only" });
    return;
  }

  const { vehicleId, amount, dueDate, description } = req.body;
  if (!vehicleId || !dueDate) {
    res.status(400).json({ error: "vehicleId and dueDate required" });
    return;
  }

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicleId)).limit(1);
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  if (!vehicle.currentDistributorId) {
    res.status(400).json({ error: "Vehicle must be dispatched to a distributor before invoicing" });
    return;
  }

  let finalAmount = amount;
  if (!finalAmount || finalAmount <= 0) {
    const [pricing] = await db
      .select()
      .from(vehiclePricingTable)
      .where(
        and(
          eq(vehiclePricingTable.vehicleId, vehicleId),
          eq(vehiclePricingTable.distributorId, vehicle.currentDistributorId)
        )
      )
      .limit(1);
    finalAmount = pricing ? parseFloat(pricing.price as string) : 0;
  }

  const autoDesc = description ?? `Vehicle sale: ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""} — VIN ${vehicle.vin}`.trim();

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      distributorId: vehicle.currentDistributorId,
      vehicleId,
      amount: String(finalAmount),
      dueDate,
      status: "unpaid",
      description: autoDesc,
      pdfUrl: null,
    })
    .returning();

  const distMap = await getDistributorMap();
  res.status(201).json(formatInvoice(invoice, distMap.get(invoice.distributorId) ?? null, vehicle));
});

router.get("/invoices", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const filterId = distributorId
    ? parseInt(distributorId as string)
    : user.role === "distributor"
    ? user.distributorId
    : null;

  const invoices = filterId
    ? await db.select().from(invoicesTable).where(eq(invoicesTable.distributorId, filterId))
    : await db.select().from(invoicesTable);

  const vehicleIds = invoices.filter((i) => i.vehicleId).map((i) => i.vehicleId!);
  const [distMap, vehicleMap] = await Promise.all([
    getDistributorMap(),
    getVehicleMap(vehicleIds),
  ]);

  res.json(
    invoices.map((inv) =>
      formatInvoice(inv, distMap.get(inv.distributorId) ?? null, inv.vehicleId ? vehicleMap.get(inv.vehicleId) : null)
    )
  );
});

router.post("/invoices/:id/pay", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { cardHolder, cardNumber, expiryMonth, expiryYear, cvv } = req.body;

  if (!cardHolder || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
    res.status(400).json({ error: "All payment fields required" });
    return;
  }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "paid") { res.status(409).json({ error: "Invoice already paid" }); return; }

  await db.update(invoicesTable).set({ status: "paid" }).where(eq(invoicesTable.id, id));

  const distMap = await getDistributorMap();
  const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const cardLast4 = cardNumber.replace(/\s/g, "").slice(-4);

  res.json({
    receiptNumber,
    invoiceId: id,
    amount: parseFloat(invoice.amount as string),
    paidAt: new Date().toISOString(),
    cardLast4,
    distributorName: distMap.get(invoice.distributorId) ?? null,
  });
});

router.get("/invoices/:id/download", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const distMap = await getDistributorMap();
  const vehicleMap = invoice.vehicleId ? await getVehicleMap([invoice.vehicleId]) : new Map();
  const vehicle = invoice.vehicleId ? vehicleMap.get(invoice.vehicleId) : null;

  res.json(formatInvoice(invoice, distMap.get(invoice.distributorId) ?? null, vehicle));
});

export default router;
