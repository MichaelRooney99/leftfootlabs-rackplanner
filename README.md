# Rack Planner (leftfootLabs)

Plan a homelab rack build: place devices into a rack elevation, validate
fit against the 10-inch rack standard and, optionally, a specific kit's
depth/weight capacity, and roll up total power draw. First real
product-adjacent surface for leftfootLabs — kit items live in the device
library as placeable items, but the planner works for any compliant
10-inch rack, not just leftfootLabs' own.

This scaffold covers the elevation logic, device library API, and power
rollup — the actual drag/place UI is next.

## Stack

- **Backend:** Express + TypeScript, SQLite (`better-sqlite3`)
- **Frontend:** React + TypeScript + Vite
- Same pattern as the capstone status page — deliberate repetition, not a
  second stack to learn in parallel.

## What's here vs. not yet

**Here:**
- Device schema (`devices`, `kit_compatibility`, `layouts` tables) —
  normalized, `source`/`status` columns present but unused until
  community submissions are supported
- Device library API (`GET /api/devices`, `GET /api/devices/:id`) —
  responses serialize to a shared camelCase `Device` shape; the raw
  snake_case SQLite row shape never leaves the data-access layer
- Layout creation + immutable snapshot fetch (`POST /api/layouts`,
  `GET /api/layouts/:id`)
- Collision/fit validation (`validateLayout`) — height and overlap checks
- Power rollup (`GET /api/layouts/:id/power`) — wattage sum only;
  `runtimeEstimateAvailable` is hardcoded `false` until real UPS discharge
  curve data has been captured and a runtime model built from it. No
  placeholder linear estimate — that would misrepresent measured data as
  something it isn't.
- Seed data: the leftfootLabs 5U 10-inch kit itself, using verified
  dimensions (254mm × 254mm footprint, 222.25mm stock height, confirmed
  against real measured hardware and cross-checked against independent
  community 10-inch rack shelf designs). Kit weight is a placeholder `0` —
  flagged in the seed file, needs a real measurement before this goes live.
- Backend test coverage: a data-access-layer test (`db/devices.test.ts`)
  and a real HTTP-level test via `supertest` (`routes/devices.test.ts`)
  that hits the actual Express app and checks the real response body.

**Not yet:**
- Rack elevation drag/place UI (frontend currently just lists devices)
- Depth/weight validation against a specific kit (`kit_compatibility`
  table exists, not yet wired into `validateLayout`)
- Accounts
- Runtime estimator itself (depends on real UPS discharge curve data)

## Local dev

```bash
cd backend && npm install && npm run seed && npm run dev   # :3002
cd frontend && npm install && npm run dev                   # :5173, proxies /api to :3002
```

## Testing

```bash
cd backend && npm run test
```

## Docker

```bash
docker compose up -d --build
```

Backend on :3002 (volume-backed SQLite at `/data`), frontend on :8080
served via nginx, proxying `/api` to the backend container.

## Deployment

Same shape as the capstone: provisioning (Docker + cloudflared) then a
deploy playbook (clone, `docker compose up -d --build`) on the dedicated
Dega VM (`10.10.20.56`), tunneled to `planner.leftfootlabs.com`.
