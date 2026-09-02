import { db } from "./index.js";
import type { Device } from "../types/index.js";

// Single place raw SQLite rows (snake_case) become the shared Device type
// (camelCase). Both routes/devices.ts and validate.ts go through this now
// instead of each doing their own row -> Device mapping — validate.ts
// used to have its own private getDevice() that duplicated this exact
// logic; routes/devices.ts used to skip the mapping entirely and return
// raw rows straight off the DB, which was the actual bug (02-Frontend-
// Backend-Type-Alignment). One mapping, two real consumers.
function rowToDevice(row: any): Device {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    uHeight: row.u_height,
    depthMm: row.depth_mm,
    weightKg: row.weight_kg,
    wattage: row.wattage,
    source: row.source,
    status: row.status,
    isKitItem: !!row.is_kit_item,
  };
}

export function getDevice(deviceId: string): Device | undefined {
  const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(deviceId) as any;
  if (!row) return undefined;
  return rowToDevice(row);
}

// v0.5: only approved/curated devices are ever returned — source/status
// filtering is unused (per 00-RPP-Overview.md decision #3) but the
// columns already exist so v2's community-submission moderation queue
// doesn't need a migration.
export function getAllApprovedDevices(): Device[] {
  const rows = db
    .prepare(`SELECT * FROM devices WHERE status = 'approved' ORDER BY name`)
    .all() as any[];
  return rows.map(rowToDevice);
}
