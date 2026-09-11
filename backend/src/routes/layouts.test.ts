import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-layouts-route-test-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("../db/index.js");
const { seed } = await import("../db/seed.js");
const { createApp } = await import("../app.js");

const app = createApp();

// Two fixture devices inserted directly, not through seed.ts — seed.ts's
// only real device is the leftfootLabs kit itself (wattage 0, informational
// only), so a real non-zero-wattage device is needed here to actually
// exercise the power rollup. Test-only fixtures, not real catalog entries.
const MINI_PC_ID = "test-mini-pc";
const MINI_PC_WATTAGE = 15;
const SHELF_A = "community-10in-rack-shelf";
const SHELF_B = "community-10-inch-rack-shelf";

describe("layouts routes — real requests against the placedShelves shape", () => {
  beforeAll(() => {
    migrate();
    seed();
    db.prepare(
      `INSERT INTO devices (id, name, manufacturer, u_height, depth_mm, weight_kg, wattage, source, status, is_kit_item)
       VALUES (@id, 'Test Mini PC', NULL, 1, 100, 0.5, @wattage, 'curated', 'approved', 0)`
    ).run({ id: MINI_PC_ID, wattage: MINI_PC_WATTAGE });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-wal`, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-shm`, { force: true });
  });

  it("POST /api/layouts creates a layout with a valid nested shelf/device shape", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({
        name: "Test Layout",
        rackSizeU: 5,
        placedShelves: [
          { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: MINI_PC_ID }] },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it("GET /api/layouts/:id returns the same nested placedShelves shape that was sent", async () => {
    const created = await request(app)
      .post("/api/layouts")
      .send({
        name: "Round Trip Layout",
        rackSizeU: 5,
        placedShelves: [
          { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: MINI_PC_ID }] },
        ],
      });

    const res = await request(app).get(`/api/layouts/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.placedShelves).toHaveLength(1);
    expect(res.body.placedShelves[0].shelfId).toBe(SHELF_A);
    expect(res.body.placedShelves[0].placedDevices).toEqual([{ deviceId: MINI_PC_ID }]);
    // The old flat placedDevices field genuinely shouldn't exist anymore —
    // this is what would fail if the route ever reverted to the old shape.
    expect(res.body).not.toHaveProperty("placedDevices");
  });

  it("POST /api/layouts rejects a layout with colliding shelves (422)", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({
        name: "Colliding Layout",
        rackSizeU: 5,
        placedShelves: [
          { shelfId: SHELF_A, startU: 1, placedDevices: [] },
          { shelfId: SHELF_B, startU: 1, placedDevices: [] },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.validation.valid).toBe(false);
  });

  it("GET /api/layouts/:id/power flattens devices across multiple shelves and sums real placements, not unique device types", async () => {
    // Same device placed on two different shelves — the repeated-device
    // wattage bug this regression-tests for now applies one level deeper
    // than the original fix (across shelves, not just across a flat list).
    const created = await request(app)
      .post("/api/layouts")
      .send({
        name: "Repeated Device Across Shelves",
        rackSizeU: 5,
        placedShelves: [
          { shelfId: SHELF_A, startU: 1, placedDevices: [{ deviceId: MINI_PC_ID }] },
          { shelfId: SHELF_B, startU: 2, placedDevices: [{ deviceId: MINI_PC_ID }] },
        ],
      });

    const res = await request(app).get(`/api/layouts/${created.body.id}/power`);

    expect(res.status).toBe(200);
    expect(res.body.deviceCount).toBe(2);
    expect(res.body.totalWattage).toBe(MINI_PC_WATTAGE * 2);
    expect(res.body.runtimeEstimateAvailable).toBe(true);
  });

  it("GET /api/layouts/:id/power reports no runtime estimate for an all-empty-shelf layout", async () => {
    const created = await request(app)
      .post("/api/layouts")
      .send({
        name: "Empty Shelves Layout",
        rackSizeU: 5,
        placedShelves: [{ shelfId: SHELF_A, startU: 1, placedDevices: [] }],
      });

    const res = await request(app).get(`/api/layouts/${created.body.id}/power`);

    expect(res.status).toBe(200);
    expect(res.body.totalWattage).toBe(0);
    expect(res.body.deviceCount).toBe(0);
    expect(res.body.runtimeEstimateAvailable).toBe(false);
  });

  it("GET /api/layouts/:id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/layouts/does-not-exist");
    expect(res.status).toBe(404);
  });
});
