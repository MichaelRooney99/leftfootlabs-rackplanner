import { db, migrate } from "./index.js";

// Dimensions here are pulled directly from the leftfootLabs Rack design
// handoff (08-17-2026) — real verified numbers, not placeholders:
//   - 254mm x 254mm footprint, verified against a measured 10" universal
//     shelf bracket (rack_width_ext / rack_depth params)
//   - 5U stock height = 222.25mm (standard 1U = 44.45mm), expandable to
//     8U/10U via stackable post segments
// Kit itself draws no power — wattage 0, not null, so power rollup logic
// doesn't need a special case for "device with no wattage field."

const KIT_SKU = "lfl-5u-10in";

export function seed(): void {
  migrate();

  const insertDevice = db.prepare(`
    INSERT OR IGNORE INTO devices
      (id, name, manufacturer, u_height, depth_mm, weight_kg, wattage, source, status, is_kit_item)
    VALUES (@id, @name, @manufacturer, @uHeight, @depthMm, @weightKg, @wattage, @source, @status, @isKitItem)
  `);

  insertDevice.run({
    id: KIT_SKU,
    name: "leftfootLabs 5U 10-inch Rack Kit",
    manufacturer: "leftfootLabs",
    uHeight: 5,
    depthMm: 254,
    weightKg: 0, // frame weight not yet measured — placeholder, flag before shipping real numbers
    wattage: 0,
    source: "curated",
    status: "approved",
    isKitItem: 1,
  });

  const insertCompat = db.prepare(`
    INSERT OR IGNORE INTO kit_compatibility (device_id, kit_sku, fits, notes)
    VALUES (@deviceId, @kitSku, @fits, @notes)
  `);

  insertCompat.run({
    deviceId: KIT_SKU,
    kitSku: KIT_SKU,
    fits: 1,
    notes: "Self-reference — the kit trivially fits itself. Real device-vs-kit entries get added as the library grows.",
  });
}

// Run directly: `node --loader ts-node/esm src/db/seed.ts` or via npm script
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log("Seed complete.");
}
