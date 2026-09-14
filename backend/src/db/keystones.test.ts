import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-test-keystones-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("./index.js");
const { getAllKeystones, getKeystone } = await import("./keystones.js");

// No seed() call here — unlike devices/shelves/rack_profiles, keystones
// has no real seeded data yet. No real keystone width has been measured
// yet, so the table is real, migrated, and genuinely empty rather than
// seeded with a guessed number.
describe("keystones — real, empty table until a real width is measured", () => {
  beforeAll(() => {
    migrate();
    db.prepare(`INSERT INTO keystones (id, name, width_mm) VALUES ('test-keystone', 'Test Keystone', 14.5)`).run();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("getAllKeystones returns exactly the camelCase Keystone shape", () => {
    const keystones = getAllKeystones();
    expect(keystones.length).toBe(1);
    expect(Object.keys(keystones[0]).sort()).toEqual(["id", "name", "widthMm"].sort());
    expect(typeof keystones[0].widthMm).toBe("number");
  });

  it("getKeystone returns the same shape as a single lookup", () => {
    const keystone = getKeystone("test-keystone");
    expect(keystone).toBeDefined();
    expect(keystone!.widthMm).toBe(14.5);
  });

  it("getKeystone returns undefined for an unknown id, not a thrown error", () => {
    expect(getKeystone("does-not-exist")).toBeUndefined();
  });
});
