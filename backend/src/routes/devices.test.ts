import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";

// Same reasoning as db/devices.test.ts: RACKPLANNER_DB_PATH has to be set
// before db/index.ts is imported (directly or transitively through
// app.ts -> routes -> db/devices.ts), so these imports are dynamic and
// awaited after the env var is set.
const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-route-test-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { migrate } = await import("../db/index.js");
const { seed } = await import("../db/seed.js");
const { createApp } = await import("../app.js");

const app = createApp();

// This is the test devices.test.ts couldn't be: a real HTTP request
// through the actual running Express app (supertest binds to an
// ephemeral port internally, no real network exposure), not a direct
// function call against the data-access layer. This is what would have
// actually caught the original bug — routes/devices.ts shipping raw
// snake_case SQLite rows straight over the wire — since it checks the
// real JSON response body, not an intermediate return value.
describe("GET /api/devices — real request through the actual Express app", () => {
  beforeAll(() => {
    migrate();
    seed();
  });

  afterAll(() => {
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("GET /api/devices returns 200 and the camelCase wire shape", async () => {
    const res = await request(app).get("/api/devices");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const device = res.body[0];
    expect(Object.keys(device).sort()).toEqual(
      [
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
      ].sort()
    );

    // The actual regression check: the original bug shipped these
    // snake_case keys straight from the SQLite row. If routes/devices.ts
    // ever reverts to returning a raw row, this fails.
    expect(device).not.toHaveProperty("u_height");
    expect(device).not.toHaveProperty("depth_mm");
    expect(device).not.toHaveProperty("is_kit_item");
    expect(typeof device.isKitItem).toBe("boolean");
  });

  it("GET /api/devices/:id returns the same shape for the seeded leftfootLabs kit", async () => {
    const res = await request(app).get("/api/devices/lfl-5u-10in");

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("is_kit_item");
    expect(res.body.isKitItem).toBe(true);
    expect(res.body.uHeight).toBe(5);
    expect(res.body.depthMm).toBe(254);
  });

  it("GET /api/devices/:id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/devices/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
