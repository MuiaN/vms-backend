import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db, vehiclesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { AuthPayload } from "../middlewares/auth";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

interface TrackerEntry {
  vehicle_id: number;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  route_start: string;
  total_km: number;
  speed_kmh: number;
  heading: number;
  status: string;
}

function lerpPosition(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  progress: number
) {
  const p = Math.min(1, Math.max(0, progress));
  return {
    lat: originLat + (destLat - originLat) * p,
    lng: originLng + (destLng - originLng) * p,
  };
}

function computeHeading(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): number {
  const dLng = (toLng - fromLng) * (Math.PI / 180);
  const lat1 = fromLat * (Math.PI / 180);
  const lat2 = toLat * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
}

router.get("/tracking", requireAuth, async (req, res) => {
  const { distributorId } = req.query;
  const user = (req as any).user as AuthPayload;

  const trackerPath = join(__dirname, "../mock-data/tracker.json");
  const trackerData: TrackerEntry[] = JSON.parse(readFileSync(trackerPath, "utf-8"));

  const vehicles = await db.select().from(vehiclesTable);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const filterId = distributorId
    ? parseInt(distributorId as string)
    : user.role === "distributor"
    ? user.distributorId
    : null;

  const now = Date.now();

  const points = trackerData
    .map((t) => {
      const vehicle = vehicleMap.get(t.vehicle_id);
      if (!vehicle) return null;

      let progress = 0;
      let currentLat = t.origin_lat;
      let currentLng = t.origin_lng;
      let speed = t.speed_kmh;

      if (t.total_km > 0 && t.speed_kmh > 0) {
        const started = new Date(t.route_start).getTime();
        const elapsedHours = (now - started) / 3_600_000;
        progress = Math.min(1, (elapsedHours * t.speed_kmh) / t.total_km);
        const pos = lerpPosition(t.origin_lat, t.origin_lng, t.dest_lat, t.dest_lng, progress);
        currentLat = pos.lat;
        currentLng = pos.lng;
        if (progress >= 1) speed = 0;
      }

      const heading = t.total_km > 0
        ? computeHeading(t.origin_lat, t.origin_lng, t.dest_lat, t.dest_lng)
        : t.heading;

      return {
        vehicleId: t.vehicle_id,
        lat: currentLat,
        lng: currentLng,
        originLat: t.origin_lat,
        originLng: t.origin_lng,
        destLat: t.dest_lat,
        destLng: t.dest_lng,
        heading,
        speed: progress >= 1 ? 0 : speed,
        progress,
        status: progress >= 1 ? "Arrived" : t.status,
        lastUpdated: new Date().toISOString(),
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        distributorId: vehicle.currentDistributorId,
      };
    })
    .filter(Boolean)
    .filter((p) => {
      if (filterId) return p!.distributorId === filterId;
      return true;
    });

  res.json(points);
});

export default router;
