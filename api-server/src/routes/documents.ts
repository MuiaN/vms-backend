import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();

router.get("/documents", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;

  let docs;
  if (user.role === "distributor" && user.distributorId) {
    docs = await db.select().from(documentsTable).where(eq(documentsTable.distributorId, user.distributorId));
  } else {
    docs = await db.select().from(documentsTable);
  }

  res.json(
    docs.map((d) => ({
      ...d,
      uploadDate: d.uploadDate.toISOString(),
    }))
  );
});

router.post("/documents", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  const { fileName, fileType, distributorId } = req.body;

  if (!fileName || !fileType) {
    res.status(400).json({ error: "fileName and fileType required" });
    return;
  }

  const [doc] = await db
    .insert(documentsTable)
    .values({
      uploadedBy: user.id,
      distributorId: distributorId ?? user.distributorId ?? null,
      fileName,
      fileType,
      filePath: `/uploads/${Date.now()}-${fileName}`,
    })
    .returning();

  res.status(201).json({
    ...doc,
    uploadDate: doc.uploadDate.toISOString(),
  });
});

export default router;
