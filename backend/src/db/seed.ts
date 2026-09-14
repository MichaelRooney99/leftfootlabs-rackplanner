import { db, migrate } from "./index.js";

// Dimensions here are pulled directly from the leftfootLabs Rack design
// handoff (08-17-2026) — real verified numbers, not placeholders:
//   - 254mm x 254mm footprint, verified against a measured 10" universal
//     shelf bracket (rack_width_ext / rack_depth params)
//   - 5U stock height = 222.25mm (standard 1U = 44.45mm), expandable to
//     8U/10U via stackable post segments
// Kit itself draws no power — wattage 0, not null, so power rollup logic
// doesn't need a special case for "device with no wattage field."
// The frame is informational-only in this model — never placed in a
// layout, never touched by fit or capacity validation. It stays a
// device row purely as a catalog/product record.

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

  // The universal 10-inch rack standard — one row, id fixed at 1 by the
  // table's own CHECK constraint. ±2mm tolerance matches the real
  // measured spread across multiple independent 10-inch rack shelf
  // designs (see the shelf rows below); a table rather than a hardcoded
  // constant leaves room for a second rack-width profile later without
  // a schema change, even though only 10-inch exists today. min_spacing_mm
  // (8mm) is the real minimum gap required both between two placed items
  // on a shelf's face and between an item and the shelf's own "ear" —
  // named explicitly here rather than left to the column's default, same
  // preference for explicit real values over implicit ones as elsewhere
  // in this file (e.g. wattage: 0, not left unset).
  db.prepare(`
    INSERT OR IGNORE INTO rack_profiles (id, width_mm, tolerance_mm, u_height_mm, min_spacing_mm)
    VALUES (1, 254, 2, 44.45, 8)
  `).run();

  // Seven real, independently-measured 10-inch shelves — none of them a
  // leftfootLabs product (leftfootLabs doesn't have a real shelf yet).
  // Seeded specifically to prove the "works for any 10-inch rack" claim
  // with real non-leftfootLabs data from day one. max_weight_kg is NULL
  // for all seven — none had a real measured weight capacity available,
  // so it's left unmeasured rather than guessed. usable_width_mm is
  // NULL for six of them for the same real reason; the seventh (the
  // universal tray below) has a real measured value, the first one.
  const insertShelf = db.prepare(`
    INSERT OR IGNORE INTO shelves
      (id, name, manufacturer, width_mm, u_height, max_depth_mm, max_weight_kg, usable_width_mm, source, status)
    VALUES (@id, @name, @manufacturer, @widthMm, @uHeight, @maxDepthMm, @maxWeightKg, @usableWidthMm, @source, @status)
  `);

  const shelves = [
    {
      id: "community-10in-rack-shelf",
      name: "10 Inch Rack Shelf",
      manufacturer: null,
      widthMm: 252.982,
      uHeight: 1,
      maxDepthMm: 180.119,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      id: "community-10in-rack-shelf-tesy-hony",
      name: "10 Inch Rack Shelf (Tesy Hony)",
      manufacturer: null,
      widthMm: 252,
      uHeight: 1,
      maxDepthMm: 212.997,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      id: "community-10-inch-rack-shelf",
      name: "10-inch Rack Shelf",
      manufacturer: null,
      widthMm: 254,
      uHeight: 1,
      maxDepthMm: 211.5,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      id: "community-rack-tray-10inch-1u",
      name: "Rack+Tray+10inch+1U",
      manufacturer: null,
      widthMm: 254,
      uHeight: 1,
      maxDepthMm: 160,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      id: "dell-optiplex-micro-flush-front",
      name: "Dell OptiPlex Micro 10-inch Flush Front Bracket",
      manufacturer: "Community (Dell OptiPlex Micro form factor)",
      widthMm: 253.998,
      uHeight: 1, // 44.4mm measured, matches 1U (44.45mm) within normal print tolerance
      maxDepthMm: 176.498,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      id: "tp-link-tl-sg108e-bracket",
      name: "TP-Link TL-SG108E 10-inch Bracket",
      manufacturer: "Community (TP-Link TL-SG108E form factor)",
      widthMm: 254,
      uHeight: 1, // 44.44mm measured, matches 1U within normal print tolerance
      maxDepthMm: 102.53,
      maxWeightKg: null,
      usableWidthMm: null,
    },
    {
      // Real dimensions taken directly from the STL's own mesh geometry
      // (254 x 133 x 44.426mm), not read off a screenshot. The real
      // faceplate reference for this same design measures 214mm wide —
      // the first non-null usableWidthMm in the catalog, real evidence
      // for how much a shelf's ears actually eat into its outer width
      // (254 - 214 = 40mm total, 20mm each side, for this specific
      // design — not assumed to generalize to every shelf).
      id: "community-universal-tray-13cm",
      name: "Universal 10-inch Rack Tray (13cm, Sodola SL-SGT108J-D reference)",
      manufacturer: "Community (Sodola SL-SGT108J-D reference design)",
      widthMm: 254,
      uHeight: 1, // 44.426mm measured, matches 1U (44.45mm) within normal print tolerance
      maxDepthMm: 133,
      maxWeightKg: null,
      usableWidthMm: 214,
    },
  ];

  for (const shelf of shelves) {
    insertShelf.run({ ...shelf, source: "curated", status: "approved" });
  }

  // One real keystone entry — every real keystone jack shares the exact
  // same standardized 14.5mm x 16.0mm face regardless of connector type
  // (RJ45, RJ11, F-connector, HDMI, USB all snap into the identical real
  // cutout), confirmed convergent across multiple independent real
  // sources. One universal row, not a per-connector-type catalog, since
  // the standard itself guarantees the dimension is the same either way.
  db.prepare(`
    INSERT OR IGNORE INTO keystones (id, name, width_mm, height_mm)
    VALUES ('keystone-standard', 'Standard Keystone Jack (RJ45/Cat6 and compatible)', 14.5, 16.0)
  `).run();
}

// Run directly: `node --loader ts-node/esm src/db/seed.ts` or via npm script
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log("Seed complete.");
}
