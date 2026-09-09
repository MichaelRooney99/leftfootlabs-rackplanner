import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { validateLayout } from "../db/validate.js";
import { estimateRuntime } from "../lib/runtimeEstimator.js";
import type { Layout, PlacedDevice, PowerBudget } from "../types/index.js";

export const layoutsRouter = Router();

layoutsRouter.post("/", (req, res) => {
  const { name, rackSizeU, placedDevices } = req.body as {
    name: string;
    rackSizeU: number;
    placedDevices: PlacedDevice[];
  };

  if (!name || !rackSizeU || !Array.isArray(placedDevices)) {
    res.status(400).json({ error: "name, rackSizeU, and placedDevices are required" });
    return;
  }

  const validation = validateLayout(rackSizeU, placedDevices);
  if (!validation.valid) {
    res.status(422).json({ error: "Layout failed validation", validation });
    return;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO layouts (id, name, rack_size_u, placed_devices) VALUES (?, ?, ?, ?)`
  ).run(id, name, rackSizeU, JSON.stringify(placedDevices));

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
    placedDevices: JSON.parse(row.placed_devices),
    createdAt: row.created_at,
  };

  res.json(layout);
});

layoutsRouter.get("/:id/power", (req, res) => {
  const row = db.prepare(`SELECT placed_devices FROM layouts WHERE id = ?`).get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: "Layout not found" });
    return;
  }

  const placedDevices: PlacedDevice[] = JSON.parse(row.placed_devices);

  // Fetch each UNIQUE device's wattage once, then sum per placement below —
  // a layout can place the same device more than once (four identical mini
  // PCs, say), and `WHERE id IN (...)` only returns one row per unique id
  // no matter how many times that id appears in the IN list. Summing
  // straight off that query result silently undercounts any repeated
  // device — a real bug found while wiring up this route's power estimate,
  // not something introduced by it.
  const uniqueIds = [...new Set(placedDevices.map((p) => p.deviceId))];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const deviceRows = uniqueIds.length
    ? (db
        .prepare(`SELECT id, wattage FROM devices WHERE id IN (${placeholders})`)
        .all(...uniqueIds) as { id: string; wattage: number }[])
    : [];
  const wattageById = new Map(deviceRows.map((d) => [d.id, d.wattage]));

  const totalWattage = placedDevices.reduce(
    (sum, p) => sum + (wattageById.get(p.deviceId) ?? 0),
    0
  );
  // Total placements in the layout, not unique device types — four of the
  // same mini PC counts as 4, matching what "how many devices are in this
  // rack" actually means to someone looking at the layout.
  const deviceCount = placedDevices.length;

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
