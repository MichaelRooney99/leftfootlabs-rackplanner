import { Router } from "express";
import { db } from "../db/index.js";

export const devicesRouter = Router();

// v0.5: only approved/curated devices are ever returned — source/status
// filtering is unused (per decision #3) but the columns already exist so
// v2's community-submission moderation queue doesn't need a migration.
devicesRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM devices WHERE status = 'approved' ORDER BY name`)
    .all();
  res.json(rows);
});

devicesRouter.get("/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(row);
});
