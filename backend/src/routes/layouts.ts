import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { validateLayout } from "../db/validate.js";
import { estimateRuntime } from "../lib/runtimeEstimator.js";
import type { Layout, PlacedShelf, PowerBudget } from "../types/index.js";

export const layoutsRouter = Router();

layoutsRouter.post("/", (req, res) => {
  const { name, rackSizeU, placedShelves } = req.body as {
    name: string;
    rackSizeU: number;
    placedShelves: PlacedShelf[];
  };

  if (!name || !rackSizeU || !Array.isArray(placedShelves)) {
    res.status(400).json({ error: "name, rackSizeU, and placedShelves are required" });
    return;
  }

  const validation = validateLayout(rackSizeU, placedShelves);
  if (!validation.valid) {
    res.status(422).json({ error: "Layout failed validation", validation });
    return;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO layouts (id, name, rack_size_u, placed_shelves) VALUES (?, ?, ?, ?)`
  ).run(id, name, rackSizeU, JSON.stringify(placedShelves));

  res.status(201).json({ id });
});

layoutsRouter.get("/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM layouts WHERE id = ?`).get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: "Layout not found" });
    return;
  }

  const layout: Layout = {
    id: row.id,
    name: row.name,
    rackSizeU: row.rack_size_u,
    placedShelves: JSON.parse(row.placed_shelves),
    createdAt: row.created_at,
  };

  res.json(layout);
});

layoutsRouter.get("/:id/power", (req, res) => {
  const row = db.prepare(`SELECT placed_shelves FROM layouts WHERE id = ?`).get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: "Layout not found" });
    return;
  }

  const placedShelves: PlacedShelf[] = JSON.parse(row.placed_shelves);
  // Flatten every device out of every shelf before summing — the same
  // repeated-device wattage bug from before applies one level deeper now:
  // fetch each UNIQUE device's wattage once, then sum per real placement
  // across every shelf, not once per unique id.
  const allPlacements = placedShelves.flatMap((shelf) => shelf.placedDevices);

  const uniqueIds = [...new Set(allPlacements.map((p) => p.deviceId))];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const deviceRows = uniqueIds.length
    ? (db
        .prepare(`SELECT id, wattage FROM devices WHERE id IN (${placeholders})`)
        .all(...uniqueIds) as { id: string; wattage: number }[])
    : [];
  const wattageById = new Map(deviceRows.map((d) => [d.id, d.wattage]));

  const totalWattage = allPlacements.reduce(
    (sum, p) => sum + (wattageById.get(p.deviceId) ?? 0),
    0
  );
  // Total device placements across every shelf, not unique device types —
  // four of the same mini PC (even split across two shelves) counts as 4.
  const deviceCount = allPlacements.length;

  const budget: PowerBudget = {
    totalWattage,
    deviceCount,
    runtimeEstimateAvailable: false,
  };

  // A layout with no real draw isn't a meaningful runtime question —
  // leave the estimate absent rather than running the estimator against
  // a 0W load.
  if (totalWattage > 0) {
    const estimate = estimateRuntime(totalWattage);
    budget.runtimeEstimateAvailable = true;
    budget.estimatedRuntimeSeconds = estimate.secondsToObservedFloor;
    budget.runtimeEstimateFloorChargePct = estimate.observedFloorChargePct;
    budget.runtimeEstimateConfidence = estimate.confidence;
  }

  res.json(budget);
});
