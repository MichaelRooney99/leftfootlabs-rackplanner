import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { validateLayout } from "../db/validate.js";
import type { Layout, PlacedDevice, PowerBudget } from "../types/index.js";

export const layoutsRouter = Router();

// v0.5 layouts are immutable snapshots (RPP-Overview decision #4) — no
// PATCH/PUT here on purpose. A "new" layout is always a new row and a new
// link. Live-editable sharing is explicitly deferred to v2.

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
  const placeholders = placedDevices.map(() => "?").join(",");
  const devices = placedDevices.length
    ? (db
        .prepare(`SELECT wattage FROM devices WHERE id IN (${placeholders})`)
        .all(...placedDevices.map((p) => p.deviceId)) as { wattage: number }[])
    : [];

  const budget: PowerBudget = {
    totalWattage: devices.reduce((sum, d) => sum + d.wattage, 0),
    deviceCount: devices.length,
    runtimeEstimateAvailable: false, // stays false until the NUT discharge curve data lands
  };

  res.json(budget);
});
