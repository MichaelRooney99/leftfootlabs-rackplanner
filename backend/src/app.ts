import express from "express";
import cors from "cors";
import { devicesRouter } from "./routes/devices.js";
import { layoutsRouter } from "./routes/layouts.js";
import { shelvesRouter } from "./routes/shelves.js";
import { keystonesRouter } from "./routes/keystones.js";
import { getRackProfile } from "./db/shelves.js";

// Extracted out of index.ts so the app itself is importable without also
// triggering migrate()/seed()/app.listen() as a side effect — index.ts
// still does all three, in that order, for the real running server;
// tests (routes/devices.test.ts) call migrate()/seed() themselves against
// a throwaway DB and only need the app object, not a bound port.
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/devices", devicesRouter);
  app.use("/api/layouts", layoutsRouter);
  app.use("/api/shelves", shelvesRouter);
  app.use("/api/keystones", keystonesRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Direct route, not nested under /api/shelves — rack_profiles is a
  // single-row rack-wide standard, not a shelf-specific resource, and has
  // no id space to warrant its own sub-router.
  app.get("/api/rack-profile", (_req, res) => {
    res.json(getRackProfile());
  });

  return app;
}
