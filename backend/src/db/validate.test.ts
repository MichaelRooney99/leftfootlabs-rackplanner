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
});
