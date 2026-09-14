import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";

const TEST_DB_PATH = path.join(os.tmpdir(), `rackplanner-keystones-route-test-${Date.now()}-${process.pid}.db`);
process.env.RACKPLANNER_DB_PATH = TEST_DB_PATH;

const { db, migrate } = await import("../db/index.js");
const { createApp } = await import("../app.js");

const app = createApp();

describe("GET /api/keystones — real requests through the actual Express app", () => {
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

  it("GET /api/keystones returns 200 and the camelCase wire shape", async () => {
    const res = await request(app).get("/api/keystones");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name", "widthMm"].sort());
    expect(res.body[0]).not.toHaveProperty("width_mm");
  });

  it("GET /api/keystones/:id returns the same shape for a real lookup", async () => {
    const res = await request(app).get("/api/keystones/test-keystone");

    expect(res.status).toBe(200);
    expect(res.body.widthMm).toBe(14.5);
  });

  it("GET /api/keystones/:id returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/keystones/does-not-exist");
    expect(res.status).toBe(404);
  });
});
