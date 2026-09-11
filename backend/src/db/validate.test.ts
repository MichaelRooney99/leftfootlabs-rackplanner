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
// these fixtures simple without needing bespoke test-only shelf rows.
const SHELF_A = "community-10in-rack-shelf";
const SHELF_B = "community-10-inch-rack-shelf";

describe("validateLayout — collision and height checks against shelves", () => {
  beforeAll(() => {
    migrate();
    seed();
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
});
