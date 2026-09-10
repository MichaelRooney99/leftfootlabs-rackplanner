import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Same reasoning as devices.test.ts: db/index.ts opens the database at
// module load, so RACKPLANNER_DB_PATH has to be set before that import —
// dynamic imports below, awaited after the env var is set.
const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-test-shelves-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("./index.js");
const { seed } = await import("./seed.js");
const { getAllApprovedShelves, getShelf, getRackProfile } = await import("./shelves.js");

describe("shelf row -> Shelf shape", () => {
  beforeAll(() => {
    migrate();
    seed();
  });

  afterAll(() => {
    // db.close() before rmSync — better-sqlite3 holds the file open,
    // Windows locks it (EPERM) until something closes it first.
    db.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("getAllApprovedShelves returns exactly the camelCase Shelf shape", () => {
    const shelves = getAllApprovedShelves();
    expect(shelves.length).toBeGreaterThan(0);

    const expectedKeys = [
      "id",
      "name",
      "manufacturer",
      "widthMm",
      "uHeight",
      "maxDepthMm",
      "maxWeightKg",
      "source",
      "status",
    ].sort();

    for (const shelf of shelves) {
      expect(Object.keys(shelf).sort()).toEqual(expectedKeys);
      expect(typeof shelf.widthMm).toBe("number");
      expect(typeof shelf.uHeight).toBe("number");
      expect(typeof shelf.maxDepthMm).toBe("number");
    }
  });

  it("seeds exactly six real, non-leftfootLabs shelves", () => {
    const shelves = getAllApprovedShelves();
    expect(shelves.length).toBe(6);
  });

  it("getShelf returns the same shape as a single lookup", () => {
    const [first] = getAllApprovedShelves();
    const shelf = getShelf(first.id);

    expect(shelf).toBeDefined();
    expect(shelf!.id).toBe(first.id);
    expect(typeof shelf!.widthMm).toBe("number");
  });

  it("getShelf returns undefined for an unknown id, not a thrown error", () => {
    expect(getShelf("does-not-exist")).toBeUndefined();
  });

  it("all six seeded shelves have maxWeightKg as an unmeasured null, not a guessed value", () => {
    // None of the six seeded shelves had a measured weight capacity
    // available. A non-null value here would mean someone guessed a
    // number rather than flagging it as unmeasured.
    const shelves = getAllApprovedShelves();
    for (const shelf of shelves) {
      expect(shelf.maxWeightKg).toBeNull();
    }
  });

  it("includes the two one-piece bracket shelves with their real measured dimensions", () => {
    const optiplex = getShelf("dell-optiplex-micro-flush-front");
    expect(optiplex).toBeDefined();
    expect(optiplex!.widthMm).toBe(253.998);
    expect(optiplex!.maxDepthMm).toBe(176.498);

    const tpLink = getShelf("tp-link-tl-sg108e-bracket");
    expect(tpLink).toBeDefined();
    expect(tpLink!.widthMm).toBe(254);
    expect(tpLink!.maxDepthMm).toBe(102.53);
  });

  it("getRackProfile returns the seeded universal 10-inch standard", () => {
    const profile = getRackProfile();
    expect(profile.widthMm).toBe(254);
    expect(profile.toleranceMm).toBe(2);
    expect(profile.uHeightMm).toBe(44.45);
  });
});
