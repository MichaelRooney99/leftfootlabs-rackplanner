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
      width_mm      REAL,          -- nullable: unmeasured for every real seeded device so far, flagged not guessed
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
    -- usable_width_mm is a real, separate number from width_mm: the real
    -- space available for placing devices across the shelf's face,
    -- bounded by the shelf's own "ears" (where it connects to the post) —
    -- always less than width_mm, never a fixed fraction of it, since that
    -- relationship depends on each shelf's actual frame design.
    CREATE TABLE IF NOT EXISTS shelves (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      manufacturer      TEXT,
      width_mm          REAL NOT NULL,
      u_height          REAL NOT NULL,
      max_depth_mm      REAL NOT NULL,
      max_weight_kg     REAL,          -- nullable: unmeasured for several real seed rows, flagged not guessed
      usable_width_mm   REAL,          -- nullable: unmeasured for every real seeded shelf so far
      source            TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('curated', 'community')),
      status            TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending'))
    );

    -- Single-row table: the universal 10-inch rack standard. A table
    -- rather than a hardcoded constant, since a second rack-width class
    -- (e.g. 19-inch) is a real possibility down the line and would be a
    -- second row here, not a second copy of constants scattered through
    -- the codebase — even though only the 10-inch profile exists today.
    -- min_spacing_mm lives here rather than on shelves individually
    -- because it's the same kind of thing width_mm/tolerance_mm are: a
    -- universal constant, not a per-shelf attribute.
    CREATE TABLE IF NOT EXISTS rack_profiles (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      width_mm        REAL NOT NULL,
      tolerance_mm    REAL NOT NULL,
      u_height_mm     REAL NOT NULL,
      min_spacing_mm  REAL NOT NULL DEFAULT 8
    );

    -- Deliberately not a devices row with nulled-out fields that don't
    -- apply — a keystone has no depth, weight, or wattage in any way
    -- comparable to a mini PC or switch. The only thing it shares with a
    -- device for placement purposes is real width and a need for spacing
    -- from whatever's next to it.
    CREATE TABLE IF NOT EXISTS keystones (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      width_mm REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS layouts (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      rack_size_u      INTEGER NOT NULL,
      placed_shelves   TEXT NOT NULL,  -- JSON array of PlacedShelf, each
                                        -- with its own nested devices; not
                                        -- worth a join table at this scale
                                        -- (single owner per layout, no
                                        -- cross-querying into individual
                                        -- placements needed)
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Real drop, not just "stop creating it" — an existing local dev DB
    -- (data/rackplanner.db) may already have this table from an earlier
    -- schema version, and IF NOT EXISTS above would silently leave it
    -- sitting there unused.
    DROP TABLE IF EXISTS kit_compatibility;
  `);

  // layouts.placed_devices -> placed_shelves: an existing local dev DB may
  // already have this table from before shelves existed, and CREATE TABLE
  // IF NOT EXISTS above won't touch an existing table's columns. No real
  // layout data exists yet to worry about losing, but a real rename is
  // still the correct move over a silent mismatch between the column name
  // and what it actually stores now.
  const layoutsColumns = db.prepare(`PRAGMA table_info(layouts)`).all() as { name: string }[];
  const hasOldColumnName = layoutsColumns.some((c) => c.name === "placed_devices");
  if (hasOldColumnName) {
    db.exec(`ALTER TABLE layouts RENAME COLUMN placed_devices TO placed_shelves`);
  }

  // Same real-migration treatment as the rename above: CREATE TABLE IF
  // NOT EXISTS won't add a column to a table that already exists from an
  // earlier schema version, so an existing dev DB needs each new column
  // checked for and added explicitly, not just declared in the CREATE
  // TABLE statement above (which only ever fires for a genuinely fresh
  // database).
  const devicesColumns = db.prepare(`PRAGMA table_info(devices)`).all() as { name: string }[];
  if (!devicesColumns.some((c) => c.name === "width_mm")) {
    db.exec(`ALTER TABLE devices ADD COLUMN width_mm REAL`);
  }

  const shelvesColumns = db.prepare(`PRAGMA table_info(shelves)`).all() as { name: string }[];
  if (!shelvesColumns.some((c) => c.name === "usable_width_mm")) {
    db.exec(`ALTER TABLE shelves ADD COLUMN usable_width_mm REAL`);
  }

  // rack_profiles is a single real row, not a fresh-per-database concept
  // — an existing row from before min_spacing_mm existed needs the
  // column added AND that existing row backfilled with the real value,
  // since ALTER TABLE ADD COLUMN leaves existing rows NULL and this
  // table's seed step uses INSERT OR IGNORE (a no-op against a row that
  // already exists).
  const rackProfilesColumns = db.prepare(`PRAGMA table_info(rack_profiles)`).all() as { name: string }[];
  if (!rackProfilesColumns.some((c) => c.name === "min_spacing_mm")) {
    db.exec(`ALTER TABLE rack_profiles ADD COLUMN min_spacing_mm REAL NOT NULL DEFAULT 8`);
  }
  db.prepare(`UPDATE rack_profiles SET min_spacing_mm = 8 WHERE id = 1 AND min_spacing_mm IS NULL`).run();
}
