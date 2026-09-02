// Shared domain types — backend is the source of truth for these shapes.
//
// Correction (02-Frontend-Backend-Type-Alignment.md): this comment used
// to claim the frontend imports this file directly via a workspace
// reference. That was never actually true, and it's not the fix that was
// applied — a real cross-package import here would mean the frontend's
// Docker build needs to see backend/src at image-build time, but each
// service's Docker build context is scoped to its own folder (the same
// constraint the capstone hit with shared fixtures). Instead:
// `frontend/src/lib/api.ts` declares its own matching camelCase `Device`
// interface, and the backend's Express routes (routes/devices.ts, via
// db/devices.ts) now serialize responses in this exact camelCase shape —
// so the wire contract and both type declarations agree, without a
// build-time dependency between the two packages.

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

export interface PowerBudget {
  totalWattage: number;
  deviceCount: number;
  // Runtime estimate is intentionally NOT modeled here yet — this waits on
  // the NUT discharge curve data (01-NUT-Discharge-Curve-Measurement.md).
  // A placeholder linear estimate would misrepresent the "measured, not
  // invented" framing the whole project is built around.
  runtimeEstimateAvailable: false;
}
