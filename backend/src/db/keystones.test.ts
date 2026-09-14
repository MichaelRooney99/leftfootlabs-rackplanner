import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-test-keystones-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("./index.js");
const { seed } = await import("./seed.js");
const { getAllKeystones, getKeystone } = await import("./keystones.js");

// Real seeded data now exists — every keystone jack shares the same
// standardized 14.5mm x 16.0mm face regardless of connector type, so
// one universal real row is seeded rather than the table staying empty
// the way it did before that real research resolved the question.
describe("keystones — real seeded standard, not a synthetic fixture", () => {
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

  it("getAllKeystones returns exactly the camelCase Keystone shape", () => {
    const keystones = getAllKeystones();
    expect(keystones.length).toBe(1);
    expect(Object.keys(keystones[0]).sort()).toEqual(["id", "name", "widthMm", "heightMm"].sort());
    expect(typeof keystones[0].widthMm).toBe("number");
    expect(typeof keystones[0].heightMm).toBe("number");
  });

  it("seeds the real standardized keystone dimensions — 14.5mm x 16.0mm", () => {
    const keystone = getKeystone("keystone-standard");
    expect(keystone).toBeDefined();
    expect(keystone!.widthMm).toBe(14.5);
    expect(keystone!.heightMm).toBe(16.0);
  });

  it("getKeystone returns undefined for an unknown id, not a thrown error", () => {
    expect(getKeystone("does-not-exist")).toBeUndefined();
  });
});
