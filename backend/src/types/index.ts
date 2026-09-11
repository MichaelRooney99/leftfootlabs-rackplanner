// Shared domain types — backend is the source of truth for these shapes.
//
// frontend/src/lib/api.ts declares its own matching camelCase `Device`
// interface rather than importing this file directly — a real
// cross-package import would mean the frontend's Docker build needs to
// see backend/src at image-build time, but each service's Docker build
// context is scoped to its own folder, so that isn't viable. Instead,
// the backend's Express routes (routes/devices.ts, via db/devices.ts)
// serialize responses in this exact camelCase shape, so the wire
// contract and both type declarations agree without a build-time
// dependency between the two packages.

export type DeviceSource = "curated" | "community";
export type DeviceStatus = "approved" | "pending";

export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  uHeight: number;      // rack units
  depthMm: number;
  weightKg: number;
  wattage: number;       // typical draw, watts
  source: DeviceSource;   // unused for filtering until v2 (community submissions)
  status: DeviceStatus;   // unused for filtering until v2
  isKitItem: boolean;     // true for leftfootLabs kit parts/accessories
}

// A shelf sits between the rack and its devices — the thing that
// physically clips into a 10-inch rack's rails (checked against
// RackProfile below) and carries real depth/weight capacity for
// whatever's placed on it. Not a variant of Device: a shelf doesn't draw
// power or get "organized," it's what other things get organized on.
// widthMm means different things depending on the shelf's real design:
// for a one-piece shelf (the part that mounts and the part that holds
// the device are the same piece), it's that whole part's width. For a
// two-piece design (a separate internal tray plus a distinct faceplate),
// it's specifically the faceplate's width — the faceplate is what
// actually clips into the rails, the tray is an internal fixture that
// doesn't need to be rack-width compliant on its own.
export interface Shelf {
  id: string;
  name: string;
  manufacturer: string | null;
  widthMm: number;
  uHeight: number;
  maxDepthMm: number;
  maxWeightKg: number | null;   // null: several real seed shelves have this unmeasured, not guessed
  source: DeviceSource;
  status: DeviceStatus;
}

// The universal 10-inch rack standard — one row today, structured as a
// table rather than a constant to future-proof multi-profile support
// even though only 10-inch is in scope for now.
export interface RackProfile {
  widthMm: number;
  toleranceMm: number;
  uHeightMm: number;
}

// A device no longer carries its own rack position — it's nested under
// whichever shelf it's placed on, and inherits that shelf's position.
// xPositionMm is unused by anything in this file today: it's added now,
// optional, ahead of a future feature that would need to know exactly
// where on a shelf's face a device sits (for generating a matching
// faceplate cutout) — adding it now avoids a second breaking change to
// this same type later, for the cost of one unused optional field today.
export interface PlacedDeviceOnShelf {
  deviceId: string;
  xPositionMm?: number;
}

export interface PlacedShelf {
  shelfId: string;
  startU: number;          // bottom rack unit position, 1-indexed
  placedDevices: PlacedDeviceOnShelf[];
}

export interface Layout {
  id: string;             // snapshot link id (nanoid or similar)
  name: string;
  rackSizeU: number;      // total rack units available (5, 8, 10 for now)
  placedShelves: PlacedShelf[];
  createdAt: string;       // ISO timestamp
}

// Result of validating a layout against physical + logical constraints.
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  deviceId: string;
  kind: "collision" | "exceeds_rack_height" | "depth_exceeds_kit" | "weight_exceeds_kit";
  message: string;
}

// Runtime estimate confidence — reflects how the number was actually
// produced, not just whether one exists:
//   "measured"              — load matches one of the three real tested
//                              levels (15%, ~25%, 47%) almost exactly
//   "interpolated"          — load falls between two real tested levels
//   "extrapolated-by-load"  — load falls outside the 15-47% tested range,
//                              using the nearest real curve directly
export type RuntimeEstimateConfidence = "measured" | "interpolated" | "extrapolated-by-load";

export interface PowerBudget {
  totalWattage: number;
  deviceCount: number;
  // Built from three real discharge tests run against the live UPS
  // (September 2026) rather than a spec-sheet linear estimate — see the
  // discharge curve data and estimator module for the real numbers this
  // is built from. False only for a layout with no real wattage draw
  // (empty, or all-zero-wattage devices), where a runtime estimate isn't
  // a meaningful question to ask in the first place.
  runtimeEstimateAvailable: boolean;
  // Seconds from full charge (100%) down to the lowest charge% actually
  // observed during testing at this (possibly interpolated) load — not a
  // guess at full depletion. Undefined when runtimeEstimateAvailable is
  // false.
  estimatedRuntimeSeconds?: number;
  // What charge% that estimate actually stops at — varies by load, since
  // the three real tests didn't all run down to the same floor (Level 3
  // in particular only reached 68% before being stopped deliberately).
  runtimeEstimateFloorChargePct?: number;
  runtimeEstimateConfidence?: RuntimeEstimateConfidence;
}
