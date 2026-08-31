# Rack Planner (leftfootLabs)

Plan a homelab rack build: place devices into a rack elevation, validate
fit, and roll up total power draw. First real product-adjacent surface for
leftfootLabs — kit items live in the device library as placeable items.

Full scope: `00-RPP-Overview.md` (Obsidian). This scaffold covers v0.5
milestones 1–3 (elevation logic + device library API + power rollup) minus
the actual drag/place UI, which is next.

## Stack

- **Backend:** Express + TypeScript, SQLite (`better-sqlite3`)
- **Frontend:** React + TypeScript + Vite
- Same pattern as the capstone status page (decision #6) — deliberate
  repetition, not a second stack to learn in parallel.

## What's here vs. not yet

**Here:**
- Device schema (`devices`, `kit_compatibility`, `layouts` tables) —
  normalized, `source`/`status` columns present but unused until v2
- Device library API (`GET /api/devices`, `GET /api/devices/:id`)
- Layout creation + immutable snapshot fetch (`POST /api/layouts`,
  `GET /api/layouts/:id`)
- Collision/fit validation (`validateLayout`) — height and overlap checks
- Power rollup (`GET /api/layouts/:id/power`) — wattage sum only;
  `runtimeEstimateAvailable` is hardcoded `false` until the NUT discharge
  curve data (01-NUT-Discharge-Curve-Measurement.md) is captured. No
  placeholder linear estimate — that would misrepresent the "measured, not
  invented" framing this project is built on.
- Seed data: the leftfootLabs 5U 10-inch kit itself, using verified
  dimensions from the design handoff (254mm × 254mm footprint, 222.25mm
  stock height). Kit weight is a placeholder `0` — flagged in the seed
  file, needs a real measurement before this goes live.

**Not yet:**
- Rack elevation drag/place UI (frontend currently just lists devices)
- Depth/weight validation against a specific kit (`kit_compatibility` table
  exists, not yet wired into `validateLayout`)
- Accounts (v1 milestone)
- Runtime estimator itself (depends on discharge curve session)

## Local dev

```bash
cd backend && npm install && npm run seed && npm run dev   # :3002
cd frontend && npm install && npm run dev                   # :5173, proxies /api to :3002
```

## Docker

```bash
docker compose up -d --build
```

Backend on :3002 (volume-backed SQLite at `/data`), frontend on :8080
served via nginx, proxying `/api` to the backend container.

## Deployment

Same shape as the capstone: `rack_planner_provision.yml` (Docker +
cloudflared) then a deploy playbook (clone, `docker compose up -d --build`)
on the dedicated Dega VM (`10.10.20.56`), tunneled to
`planner.leftfootlabs.com`.
