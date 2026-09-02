import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// db/index.ts reads RACKPLANNER_DB_PATH the moment it's imported (it opens
// the database at module load, not inside a function call), so the env
// var has to be set BEFORE that import happens. Static imports at the top
// of this file would be hoisted ahead of any plain statement that sets
// process.env — so the imports below are dynamic and deliberately awaited
// after the env var is set, not a stylistic choice.
const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-test-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("./index.js");
const { seed } = await import("./seed.js");
const { getAllApprovedDevices, getDevice } = await import("./devices.js");

describe("device row -> Device shape", () => {
  beforeAll(() => {
    migrate();
    seed();
  });

  afterAll(() => {
    // better-sqlite3 holds the file open until explicitly closed. On
    // Linux this doesn't block deleting the file out from under it, but
    // Windows locks open file handles and refuses the delete (EPERM)
    // until something closes them — close() first so the rmSync calls
    // below actually succeed on every platform, not just the ones that
    // happen to allow deleting open files.
    db.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("getAllApprovedDevices returns exactly the camelCase Device shape", () => {
    const devices = getAllApprovedDevices();
    expect(devices.length).toBeGreaterThan(0);

    // A real runtime shape check, not just a compile-time assumption —
    // this is the assertion that would have caught the original bug
    // (routes returning raw snake_case rows) instead of it only ever
    // surfacing by someone happening to inspect a response by hand.
    const expectedKeys = [
      "id",
      "name",
      "manufacturer",
      "uHeight",
      "depthMm",
      "weightKg",
      "wattage",
      "source",
      "status",
      "isKitItem",
    ].sort();

    for (const device of devices) {
      expect(Object.keys(device).sort()).toEqual(expectedKeys);
      expect(typeof device.uHeight).toBe("number");
      expect(typeof device.depthMm).toBe("number");
      expect(typeof device.weightKg).toBe("number");
      expect(typeof device.wattage).toBe("number");
      expect(typeof device.isKitItem).toBe("boolean"); // was truthy/falsy 0|1 off the raw row before this fix
    }
  });

  it("getDevice returns the same shape as a single lookup", () => {
    const [first] = getAllApprovedDevices();
    const device = getDevice(first.id);

    expect(device).toBeDefined();
    expect(device!.id).toBe(first.id);
    expect(typeof device!.isKitItem).toBe("boolean");
  });

  it("getDevice returns undefined for an unknown id, not a thrown error", () => {
    expect(getDevice("does-not-exist")).toBeUndefined();
  });

  it("includes the seeded leftfootLabs kit with real dimensions", () => {
    const kit = getDevice("lfl-5u-10in");
    expect(kit).toBeDefined();
    expect(kit!.isKitItem).toBe(true);
    expect(kit!.uHeight).toBe(5);
    expect(kit!.depthMm).toBe(254);
  });
});
