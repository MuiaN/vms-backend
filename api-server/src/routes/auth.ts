import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    distributorId: user.distributorId ?? null,
  };

  const token = signToken(payload);
  res.json({ token, user: payload });
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json((req as any).user);
});

router.get("/me", requireAuth, (req, res) => {
  res.json((req as any).user);
});

export default router;
