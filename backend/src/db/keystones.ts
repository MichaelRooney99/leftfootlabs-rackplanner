import { db } from "./index.js";
import type { Keystone } from "../types/index.js";

// No source/status columns here, unlike devices/shelves — keystones have
// no curated-vs-community or approved-vs-pending concept yet; the table
// is real but starts genuinely empty until a real keystone width gets
// measured and seeded.
function rowToKeystone(row: any): Keystone {
  return {
    id: row.id,
    name: row.name,
    widthMm: row.width_mm,
  };
}

export function getKeystone(keystoneId: string): Keystone | undefined {
  const row = db.prepare(`SELECT * FROM keystones WHERE id = ?`).get(keystoneId) as any;
  if (!row) return undefined;
  return rowToKeystone(row);
}

export function getAllKeystones(): Keystone[] {
  const rows = db.prepare(`SELECT * FROM keystones ORDER BY name`).all() as any[];
  return rows.map(rowToKeystone);
}
