import { Router } from "express";
import { db, subscriptionsTable, distributorsTable, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthPayload } from "../middlewares/auth";

const router = Router();

function computeNextBillingDate(startDate: string, cycle: string): string {
  const d = new Date(startDate);
  if (cycle === "monthly")   d.setMonth(d.getMonth() + 1);
  if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  if (cycle === "annual")    d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

function formatSub(
  sub: typeof subscriptionsTable.$inferSelect,
  distName: string | null
) {
  return {
    ...sub,
    amount: parseFloat(sub.amount as string),
    distributorName: distName,
  };
}

// POST /subscriptions — manufacturer only
router.post("/subscriptions", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer only" });
    return;
  }

  const { distributorId, planName, billingCycle, amount, startDate, description } = req.body;

  if (!distributorId || !planName || !billingCycle || !amount || !startDate) {
    res.status(400).json({ error: "distributorId, planName, billingCycle, amount, and startDate are required" });
    return;
  }

  const validCycles = ["monthly", "quarterly", "annual"];
  if (!validCycles.includes(billingCycle)) {
    res.status(400).json({ error: `billingCycle must be one of: ${validCycles.join(", ")}` });
    return;
  }

  const [distributor] = await db.select().from(distributorsTable).where(eq(distributorsTable.id, distributorId)).limit(1);
  if (!distributor) {
    res.status(404).json({ error: "Distributor not found" });
    return;
  }

  const nextBillingDate = computeNextBillingDate(startDate, billingCycle);
  const parsedAmount = parseFloat(String(amount));

  const [sub] = await db
    .insert(subscriptionsTable)
    .values({
      distributorId,
      planName,
      billingCycle,
      amount: String(parsedAmount),
      startDate,
      nextBillingDate,
      status: "active",
      description: description ?? null,
    })
    .returning();

  // Auto-generate the first invoice for this subscription
  const invoiceDesc = description ?? `Subscription: ${planName} plan — ${billingCycle} billing — ${distributor.name}`;
  await db.insert(invoicesTable).values({
    distributorId,
    vehicleId: null,
    amount: String(parsedAmount),
    dueDate: nextBillingDate,
    status: "unpaid",
    description: invoiceDesc,
    pdfUrl: null,
  });

  res.status(201).json(formatSub(sub, distributor.name));
});

// GET /subscriptions — manufacturer sees all; distributor sees own
router.get("/subscriptions", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;

  const rows =
    user.role === "distributor" && user.distributorId
      ? await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.distributorId, user.distributorId))
      : await db.select().from(subscriptionsTable);

  const distributors = await db.select().from(distributorsTable);
  const distMap = new Map(distributors.map(d => [d.id, d.name]));

  res.json(rows.map(s => formatSub(s, distMap.get(s.distributorId) ?? null)));
});

// PATCH /subscriptions/:id/cancel — manufacturer only
router.patch("/subscriptions/:id/cancel", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer only" });
    return;
  }

  const id = parseInt(req.params.id);
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id)).limit(1);
  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }
  if (sub.status === "cancelled") { res.status(409).json({ error: "Already cancelled" }); return; }

  const [updated] = await db
    .update(subscriptionsTable)
    .set({ status: "cancelled" })
    .where(eq(subscriptionsTable.id, id))
    .returning();

  const [distributor] = await db.select().from(distributorsTable).where(eq(distributorsTable.id, updated.distributorId)).limit(1);
  res.json(formatSub(updated, distributor?.name ?? null));
});

export default router;
