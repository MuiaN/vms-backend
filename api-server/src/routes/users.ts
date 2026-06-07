import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, distributorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/users", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const users = await db.select().from(usersTable);
  const distributors = await db.select().from(distributorsTable);
  const distMap = new Map(distributors.map((d) => [d.id, d.name]));

  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      distributorId: u.distributorId,
      distributorName: u.distributorId ? (distMap.get(u.distributorId) ?? null) : null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.post("/users", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const { email, password, role, distributorId } = req.body;
  if (!email || !password || !role) {
    res.status(400).json({ error: "email, password, and role are required" });
    return;
  }

  if (!["manufacturer", "distributor"].includes(role)) {
    res.status(400).json({ error: "role must be manufacturer or distributor" });
    return;
  }

  if (role === "distributor" && !distributorId) {
    res.status(400).json({ error: "distributorId is required for distributor role" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const [newUser] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      role,
      distributorId: distributorId || null,
    })
    .returning();

  const distributors = await db.select().from(distributorsTable);
  const distMap = new Map(distributors.map((d) => [d.id, d.name]));

  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role,
    distributorId: newUser.distributorId,
    distributorName: newUser.distributorId ? (distMap.get(newUser.distributorId) ?? null) : null,
    createdAt: newUser.createdAt.toISOString(),
  });
});

router.patch("/users/:id", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  if (user.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const id = parseInt(req.params.id);
  const { email, password, role, distributorId } = req.body;

  const updates: Record<string, any> = {};
  if (email !== undefined) updates.email = email;
  if (password !== undefined) updates.passwordHash = bcrypt.hashSync(password, 10);
  if (role !== undefined) updates.role = role;
  if (distributorId !== undefined) updates.distributorId = distributorId || null;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const distributors = await db.select().from(distributorsTable);
  const distMap = new Map(distributors.map((d) => [d.id, d.name]));

  res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    distributorId: updated.distributorId,
    distributorName: updated.distributorId ? (distMap.get(updated.distributorId) ?? null) : null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/users/:id", requireAuth, async (req, res) => {
  const reqUser = (req as any).user as AuthPayload;
  if (reqUser.role !== "manufacturer") {
    res.status(403).json({ error: "Manufacturer access required" });
    return;
  }

  const id = parseInt(req.params.id);

  if (id === reqUser.id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

export default router;
