import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-test-validate-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("./index.js");
const { seed } = await import("./seed.js");
const { validateLayout } = await import("./validate.js");

// Every real seeded shelf is 1U (see seed.ts) — picking two of them keeps
// most fixtures simple without needing bespoke test-only shelf rows.
const SHELF_A = "community-10in-rack-shelf";
const SHELF_B = "community-10-inch-rack-shelf";
// Real seeded shelf that happens to sit exactly at the tolerance boundary
// (252mm vs. a 254mm ±2mm standard — delta is exactly 2mm) — genuinely
// useful for the inclusive-boundary test without inventing a fixture.
const SHELF_AT_BOUNDARY = "community-10in-rack-shelf-tesy-hony";
// No real seeded shelf is actually out of tolerance — this one is a
// deliberate test-only fixture, not a real product.
const BAD_WIDTH_SHELF = "test-bad-width-shelf";
// Width-compliant (254mm) on purpose, so capacity tests below don't also
// trip the width check and confound what's actually being tested.
const CAPACITY_SHELF = "test-capacity-shelf"; // maxDepthMm: 100, maxWeightKg: 5
const SHALLOW_LIGHT_DEVICE = "test-shallow-light-device"; // depthMm: 50, weightKg: 2
const DEEP_DEVICE = "test-deep-device"; // depthMm: 150, weightKg: 2 — exceeds CAPACITY_SHELF's depth alone
const MEDIUM_WEIGHT_DEVICE = "test-medium-weight-device"; // depthMm: 50, weightKg: 3 — fine alone, two of these exceed weight together
// Real fixture devices with a known width — every real seeded device
// has widthMm: null today, so width-fit tests need their own fixtures
// with a real, deliberately-chosen width, same treatment test-only
// shelves already got above.
const WIDE_DEVICE = "test-wide-device"; // widthMm: 20
const NARROW_DEVICE = "test-narrow-device"; // widthMm: 10
const NO_WIDTH_DEVICE = "test-no-width-device"; // widthMm: null, deliberately
// Real seeded shelf with a real, non-null usableWidthMm (214mm) — the
// one exception among the seven real shelves — used for the checks that
// specifically need a known usable width (right-ear clearance,
// exceeds_shelf_face_width).
const MEASURED_WIDTH_SHELF = "community-universal-tray-13cm";
// Real seeded keystone — the one universal standard, 14.5mm wide.
const REAL_KEYSTONE = "keystone-standard";

describe("validateLayout — collision, height, and rack-width checks against shelves", () => {
  beforeAll(() => {
    migrate();
    seed();
    db.prepare(
      `INSERT INTO shelves (id, name, manufacturer, width_mm, u_height, max_depth_mm, max_weight_kg, source, status)
       VALUES (@id, 'Test Bad Width Shelf', NULL, 300, 1, 200, NULL, 'curated', 'approved')`
    ).run({ id: BAD_WIDTH_SHELF });
    db.prepare(
      `INSERT INTO shelves (id, name, manufacturer, width_mm, u_height, max_depth_mm, max_weight_kg, source, status)
       VALUES (@id, 'Test Capacity Shelf', NULL, 254, 1, 100, 5, 'curated', 'approved')`
    ).run({ id: CAPACITY_SHELF });
    const insertDevice = db.prepare(
      `INSERT INTO devices (id, name, manufacturer, u_height, depth_mm, weight_kg, wattage, source, status, is_kit_item)
       VALUES (@id, @name, NULL, 1, @depthMm, @weightKg, 0, 'curated', 'approved', 0)`
    );
    insertDevice.run({ id: SHALLOW_LIGHT_DEVICE, name: "Shallow Light Device", depthMm: 50, weightKg: 2 });
    insertDevice.run({ id: DEEP_DEVICE, name: "Deep Device", depthMm: 150, weightKg: 2 });
    insertDevice.run({ id: MEDIUM_WEIGHT_DEVICE, name: "Medium Weight Device", depthMm: 50, weightKg: 3 });

    const insertDeviceWithWidth = db.prepare(
      `INSERT INTO devices (id, name, manufacturer, u_height, depth_mm, weight_kg, wattage, width_mm, source, status, is_kit_item)
       VALUES (@id, @name, NULL, 1, 50, 1, 0, @widthMm, 'curated', 'approved', 0)`
    );
    insertDeviceWithWidth.run({ id: WIDE_DEVICE, name: "Wide Device", widthMm: 20 });
    insertDeviceWithWidth.run({ id: NARROW_DEVICE, name: "Narrow Device", widthMm: 10 });
    insertDeviceWithWidth.run({ id: NO_WIDTH_DEVICE, name: "No Width Device", widthMm: null });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("a single shelf within the rack passes with no errors", () => {
    const result = validateLayout(5, [{ shelfId: SHELF_A, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("two non-overlapping 1U shelves both pass", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [] },
      { shelfId: SHELF_B, startU: 2, placedDevices: [] },
    ]);
    expect(result.valid).toBe(true);
  });

  it("two shelves claiming the same U position collide", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [] },
      { shelfId: SHELF_B, startU: 1, placedDevices: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "collision")).toBe(true);
  });

  it("a shelf placed past the top of the rack fails with exceeds_rack_height", () => {
    const result = validateLayout(2, [{ shelfId: SHELF_A, startU: 3, placedDevices: [] }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("exceeds_rack_height");
  });

  it("an unknown shelf id is a hard collision-kind error, not a silent skip", () => {
    const result = validateLayout(5, [{ shelfId: "does-not-exist", startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("collision");
    expect(result.errors[0].message).toContain("does-not-exist");
  });

  it("an empty layout is trivially valid", () => {
    const result = validateLayout(5, []);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("a shelf within the rack-width tolerance passes", () => {
    const result = validateLayout(5, [{ shelfId: SHELF_A, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(true);
  });

  it("a shelf right at the tolerance boundary passes — inclusive, not strict", () => {
    const result = validateLayout(5, [{ shelfId: SHELF_AT_BOUNDARY, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.kind === "exceeds_rack_width")).toBe(false);
  });

  it("a shelf clearly outside the rack-width tolerance fails with exceeds_rack_width", () => {
    const result = validateLayout(5, [{ shelfId: BAD_WIDTH_SHELF, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("exceeds_rack_width");
    expect(result.errors[0].deviceId).toBe(BAD_WIDTH_SHELF);
  });

  it("a multi-shelf layout with only one shelf out of spec flags that shelf specifically, not the whole layout", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [] },
      { shelfId: BAD_WIDTH_SHELF, startU: 2, placedDevices: [] },
    ]);
    expect(result.valid).toBe(false);
    const widthErrors = result.errors.filter((e) => e.kind === "exceeds_rack_width");
    expect(widthErrors).toHaveLength(1);
    expect(widthErrors[0].deviceId).toBe(BAD_WIDTH_SHELF);
  });

  it("a device that individually exceeds a shelf's depth fails with depth_exceeds_shelf", () => {
    const result = validateLayout(5, [
      { shelfId: CAPACITY_SHELF, startU: 1, placedDevices: [{ deviceId: DEEP_DEVICE }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "depth_exceeds_shelf" && e.deviceId === DEEP_DEVICE)).toBe(true);
  });

  it("a device that fits a shelf's depth passes", () => {
    const result = validateLayout(5, [
      { shelfId: CAPACITY_SHELF, startU: 1, placedDevices: [{ deviceId: SHALLOW_LIGHT_DEVICE }] },
    ]);
    expect(result.valid).toBe(true);
  });

  it("two devices individually within weight limits fail once their combined total exceeds the shelf's capacity — a real running total, not per-device", () => {
    // Two of MEDIUM_WEIGHT_DEVICE at 3kg each = 6kg combined, over
    // CAPACITY_SHELF's 5kg limit — neither one alone (3kg) would fail.
    const result = validateLayout(5, [
      {
        shelfId: CAPACITY_SHELF,
        startU: 1,
        placedDevices: [{ deviceId: MEDIUM_WEIGHT_DEVICE }, { deviceId: MEDIUM_WEIGHT_DEVICE }],
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "weight_exceeds_shelf")).toBe(true);
    // The first placement alone (3kg) is under the 5kg limit and must not
    // be flagged — only the second placement, which pushes the running
    // total to 6kg, should fail.
    const weightErrors = result.errors.filter((e) => e.kind === "weight_exceeds_shelf");
    expect(weightErrors).toHaveLength(1);
  });

  it("a shelf with an unmeasured (null) weight capacity skips the weight check entirely, even for a heavy device", () => {
    // SHELF_A is a real seeded shelf with maxWeightKg: null. DEEP_DEVICE
    // is also too deep for CAPACITY_SHELF, but SHELF_A's own maxDepthMm
    // (180.119mm) comfortably fits it — isolating this test to weight
    // behavior only, not an incidental depth failure.
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: DEEP_DEVICE }] },
    ]);
    expect(result.valid).toBe(true);
  });

  it("an item too close to the shelf's left ear fails with insufficient_ear_clearance, checked from position alone", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: WIDE_DEVICE, xPositionMm: 5 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === WIDE_DEVICE)).toBe(true);
  });

  it("an item exactly at the 8mm left-ear boundary passes — inclusive, not strict", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: WIDE_DEVICE, xPositionMm: 8 }] },
    ]);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance")).toBe(false);
  });

  it("left-ear clearance is still checked even when the item's own width is unmeasured — position alone is enough", () => {
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: NO_WIDTH_DEVICE, xPositionMm: 3 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("insufficient_ear_clearance");
  });

  it("right-ear clearance and exceeds_shelf_face_width are both genuinely unchecked when usableWidthMm is unmeasured", () => {
    // SHELF_A has usableWidthMm: null (true for six of the seven real
    // seeded shelves) — placing a device far out shouldn't fail a check
    // that has no real boundary to check against.
    const result = validateLayout(5, [
      { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: WIDE_DEVICE, xPositionMm: 1000 }] },
    ]);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width")).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === WIDE_DEVICE)).toBe(false);
  });

  it("an item that overflows a real measured usable width fails with exceeds_shelf_face_width", () => {
    // MEASURED_WIDTH_SHELF has a real usableWidthMm of 214. Placed at
    // 200 with a 20mm width, it ends at 220 — past the real boundary.
    const result = validateLayout(5, [
      { shelfId: MEASURED_WIDTH_SHELF, startU: 1, placedDevices: [{ deviceId: WIDE_DEVICE, xPositionMm: 200 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width" && e.deviceId === WIDE_DEVICE)).toBe(true);
  });

  it("an item that fits within the real usable width but violates the right-ear buffer fails with insufficient_ear_clearance", () => {
    // 214 usable width, item ends at 210 (within bounds) but only 4mm
    // from the real 214mm edge — inside the 8mm buffer, a different real
    // problem than not fitting at all.
    const result = validateLayout(5, [
      { shelfId: MEASURED_WIDTH_SHELF, startU: 1, placedDevices: [{ deviceId: NARROW_DEVICE, xPositionMm: 200 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === NARROW_DEVICE)).toBe(true);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width")).toBe(false);
  });

  it("two items closer together than 8mm fail with insufficient_spacing, flagging the second item specifically", () => {
    const result = validateLayout(5, [
      {
        shelfId: SHELF_A,
        startU: 1,
        placedDevices: [
          { deviceId: WIDE_DEVICE, xPositionMm: 20 }, // occupies 20-40
          { deviceId: NARROW_DEVICE, xPositionMm: 45 }, // starts only 5mm after the first ends
        ],
      },
    ]);
    expect(result.valid).toBe(false);
    const spacingErrors = result.errors.filter((e) => e.kind === "insufficient_spacing");
    expect(spacingErrors).toHaveLength(1);
    expect(spacingErrors[0].deviceId).toBe(NARROW_DEVICE);
  });

  it("two items exactly 8mm apart pass — inclusive, not strict", () => {
    const result = validateLayout(5, [
      {
        shelfId: SHELF_A,
        startU: 1,
        placedDevices: [
          { deviceId: WIDE_DEVICE, xPositionMm: 20 }, // occupies 20-40
          { deviceId: NARROW_DEVICE, xPositionMm: 48 }, // starts exactly 8mm after the first ends
        ],
      },
    ]);
    expect(result.errors.some((e) => e.kind === "insufficient_spacing")).toBe(false);
  });

  it("a real placed keystone gets the same width-fit checks as a device", () => {
    const result = validateLayout(5, [
      {
        shelfId: SHELF_A,
        startU: 1,
        placedDevices: [],
        placedKeystones: [{ keystoneId: REAL_KEYSTONE, xPositionMm: 2 }], // inside the 8mm left-ear buffer
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === REAL_KEYSTONE)).toBe(true);
  });

  it("a fully compliant multi-item shelf face passes with zero width-fit errors", () => {
    const result = validateLayout(5, [
      {
        shelfId: MEASURED_WIDTH_SHELF,
        startU: 1,
        placedDevices: [
          { deviceId: WIDE_DEVICE, xPositionMm: 8 }, // 8-28, exactly at left-ear boundary
          { deviceId: NARROW_DEVICE, xPositionMm: 36 }, // 36-46, exactly 8mm after the previous
        ],
        placedKeystones: [{ keystoneId: REAL_KEYSTONE, xPositionMm: 54 }], // 54-68.5, exactly 8mm after NARROW_DEVICE
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
