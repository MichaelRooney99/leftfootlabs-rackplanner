import { db } from "./index.js";
import type { } from "../types/index.js";
import { Shelf, RackProfile } from "../index.js";

// Same one-mapping-two-consumers reasoning as db/devices.ts's rowToDevice:
// this is the single place raw SQLite rows (snake_case) become the shared
// Shelf type (camelCase), for both routes and validateLayout to use.
function rowToShelf(row: any): Shelf {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    widthMm: row.width_mm,
    uHeight: row.u_height,
    maxDepthMm: row.max_depth_mm,
    maxWeightKg: row.max_weight_kg,
    source: row.source,
    status: row.status,
  };
}

export function getShelf(shelfId: string): Shelf | undefined {
  const row = db.prepare(`SELECT * FROM shelves WHERE id = ?`).get(shelfId) as any;
  if (!row) return undefined;
  return rowToShelf(row);
}

// v0.5: only approved/curated shelves are ever returned — same
// source/status-exists-but-unused-until-v2 pattern as devices.
export function getAllApprovedShelves(): Shelf[] {
  const rows = db
    .prepare(`SELECT * FROM shelves WHERE status = 'approved' ORDER BY name`)
    .all() as any[];
  return rows.map(rowToShelf);
}

// Single-row lookup — rack_profiles only ever has id = 1 for now (see the
// table's own CHECK constraint in db/index.ts). Throws rather than
// returning undefined if the seed row is somehow missing: unlike a shelf
// or device that legitimately might not exist by a given id, every code
// path that calls this expects the universal rack standard to be real
// and present, not an optional lookup.
export function getRackProfile(): RackProfile {
  const row = db.prepare(`SELECT * FROM rack_profiles WHERE id = 1`).get() as any;
  if (!row) {
    throw new Error("rack_profiles seed row is missing — run the seed script.");
  }
  return {
    widthMm: row.width_mm,
    toleranceMm: row.tolerance_mm,
    uHeightMm: row.u_height_mm,
  };
}
