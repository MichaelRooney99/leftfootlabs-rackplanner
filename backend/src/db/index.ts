import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// SQLite via better-sqlite3 for v0.5 — no accounts yet, single-file DB is
// plenty and keeps the VM footprint small. Decision #6 says "same
// React/TS/Express pattern as capstone," not "same database" — capstone
// has no persistence layer at all (read-only telemetry), so this is new
// ground either way. SQLite now, with a real migration path to Postgres
// at v1 if concurrent account writes ever justify it — normalized schema
// below is written so that move doesn't require a data-model rethink.

const DB_PATH = process.env.RACKPLANNER_DB_PATH ?? path.join(process.cwd(), "data", "rackplanner.db");

// better-sqlite3 does not create the parent directory — real bug, caught
// by actually running this rather than trusting the code on read.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      manufacturer  TEXT,
      u_height      REAL NOT NULL,
      depth_mm      REAL NOT NULL,
      weight_kg     REAL NOT NULL,
      wattage       REAL NOT NULL,
      source        TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('curated', 'community')),
      status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
      is_kit_item   INTEGER NOT NULL DEFAULT 0
    );

    -- Replaces kit_compatibility (dropped below): capacity now lives
    -- directly on the shelf itself instead of a per-device-per-kit pairing.
    -- width_mm is the number checked against rack_profiles — for a
    -- one-piece shelf that's the whole part; for a two-piece design
    -- (separate tray + faceplate) it's specifically the faceplate's
    -- width, since the faceplate is what actually clips into the rails.
    CREATE TABLE IF NOT EXISTS shelves (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      manufacturer  TEXT,
      width_mm      REAL NOT NULL,
      u_height      REAL NOT NULL,
      max_depth_mm  REAL NOT NULL,
      max_weight_kg REAL,          -- nullable: unmeasured for several real seed rows, flagged not guessed
      source        TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('curated', 'community')),
      status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending'))
    );

    -- Single-row table: the universal 10-inch rack standard. A table
    -- rather than a hardcoded constant, since a second rack-width class
    -- (e.g. 19-inch) is a real possibility down the line and would be a
    -- second row here, not a second copy of constants scattered through
    -- the codebase — even though only the 10-inch profile exists today.
    CREATE TABLE IF NOT EXISTS rack_profiles (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      width_mm      REAL NOT NULL,
      tolerance_mm  REAL NOT NULL,
      u_height_mm   REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS layouts (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      rack_size_u      INTEGER NOT NULL,
      placed_devices   TEXT NOT NULL,  -- JSON array of PlacedDevice; not worth
                                        -- a join table at this scale (single
                                        -- owner per layout, no cross-querying
                                        -- into individual placements needed)
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Real drop, not just "stop creating it" — an existing local dev DB
    -- (data/rackplanner.db) may already have this table from an earlier
    -- schema version, and IF NOT EXISTS above would silently leave it
    -- sitting there unused.
    DROP TABLE IF EXISTS kit_compatibility;
  `);
}
