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

// Links a device to the rack size(s) it's compatible with — kept separate
// from Device itself so a future community-submitted device can be added
// without needing kit-specific columns bolted onto every row.
export interface KitCompatibility {
  deviceId: string;
  kitSku: string;        // e.g. "lfl-5u-10in"
  fits: boolean;
  notes: string | null;
}

export interface PlacedDevice {
  deviceId: string;
  startU: number;         // bottom rack unit position, 1-indexed
  // uHeight, depthMm, weightKg, wattage are looked up from Device at
  // render/validation time, not duplicated here — single source of truth.
}

export interface Layout {
  id: string;             // snapshot link id (nanoid or similar)
  name: string;
  rackSizeU: number;      // total rack units available (5, 8, 10 for now)
  placedDevices: PlacedDevice[];
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
