import express from "express";
import cors from "cors";
import { migrate } from "./db/index.js";
import { seed } from "./db/seed.js";
import { devicesRouter } from "./routes/devices.js";
import { layoutsRouter } from "./routes/layouts.js";

migrate();
seed(); // idempotent (INSERT OR IGNORE) — safe to call on every boot

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/devices", devicesRouter);
app.use("/api/layouts", layoutsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.RACKPLANNER_PROXY_PORT
  ? Number(process.env.RACKPLANNER_PROXY_PORT)
  : 3002;

app.listen(PORT, () => {
  console.log(`Rack Planner API listening on :${PORT}`);
});
