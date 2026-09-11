import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-shelves-route-test-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("../db/index.js");
const { seed } = await import("../db/seed.js");
const { createApp } = await import("../app.js");

const app = createApp();

// This is the test db/shelves.test.ts couldn't be — a real HTTP request
// through the actual Express app. Nothing exercised routes/shelves.ts or
// the rack-profile endpoint before this file existed at all; both were a
// real gap discovered while starting the frontend work, since the
// data-access layer was only ever tested directly, never through a route.
describe("GET /api/shelves and /api/rack-profile — real requests through the actual Express app", () => {
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

  it("GET /api/shelves returns 200 and the camelCase wire shape", async () => {
    const res = await request(app).get("/api/shelves");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(6);

    const shelf = res.body[0];
    expect(Object.keys(shelf).sort()).toEqual(
      ["id", "name", "manufacturer", "widthMm", "uHeight", "maxDepthMm", "maxWeightKg", "source", "status"].sort()
    );
    expect(shelf).not.toHaveProperty("width_mm");
    expect(shelf).not.toHaveProperty("max_depth_mm");
  });

  it("GET /api/shelves/:id returns the same shape for a real seeded shelf", async () => {
    const res = await request(app).get("/api/shelves/dell-optiplex-micro-flush-front");

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("width_mm");
    expect(res.body.widthMm).toBe(253.998);
    expect(res.body.maxDepthMm).toBe(176.498);
  });

  it("GET /api/shelves/:id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/shelves/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("GET /api/rack-profile returns the real seeded universal standard", async () => {
    const res = await request(app).get("/api/rack-profile");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ widthMm: 254, toleranceMm: 2, uHeightMm: 44.45 });
  });
});
