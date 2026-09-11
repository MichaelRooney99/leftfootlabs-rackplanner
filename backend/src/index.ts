import { migrate } from "./db/index.js";
import { seed } from "./db/seed.js";
import { createApp } from "./app.js";

migrate();
seed(); // idempotent (INSERT OR IGNORE) — safe to call on every boot

const app = createApp();

const PORT = process.env.RACKPLANNER_PROXY_PORT
  ? Number(process.env.RACKPLANNER_PROXY_PORT)
  : 3002;

app.listen(PORT, () => {
  console.log(`Rack Planner API listening on :${PORT}`);
});
