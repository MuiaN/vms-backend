import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

router.get("/news", requireAuth, (req, res) => {
  const newsPath = join(__dirname, "../mock-data/news.json");
  const news = JSON.parse(readFileSync(newsPath, "utf-8"));
  res.json(news);
});

export default router;
