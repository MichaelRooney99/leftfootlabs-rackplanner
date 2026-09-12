// Thin fetch wrapper — no facade/adapter layer needed here the way the
// capstone's services/ does, because there's only ever one backend
// (the Rack Planner's own Express API), not several heterogeneous
// monitoring sources to normalize between. That's the whole reason the
// capstone needed a facade pattern and this doesn't — different problem
// shape, not a dropped convention.

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Matches backend/src/types/index.ts's Device shape field-for-field.
// Deliberately a separate declaration, not a cross-package import — the
// frontend's Docker build context is scoped to its own folder, so it
// can't see backend/src at build time. What actually matters is that the
// backend serializes its responses in this exact shape, so this stays in
// sync with the real wire format even though it's a plain duplicate —
// a small, visible surface to keep in sync by hand, not a hidden one.
export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  uHeight: number;
  depthMm: number;
  weightKg: number;
  wattage: number;
  source: "curated" | "community";
  status: "approved" | "pending";
  isKitItem: boolean;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/devices`);
  if (!res.ok) throw new Error(`Failed to fetch devices: ${res.status}`);
  return res.json();
}

// Matches backend/src/types/index.ts's Shelf shape field-for-field — same
// deliberate-duplicate reasoning as Device above.
export interface Shelf {
  id: string;
  name: string;
  manufacturer: string | null;
  widthMm: number;
  uHeight: number;
  maxDepthMm: number;
  maxWeightKg: number | null;
  source: "curated" | "community";
  status: "approved" | "pending";
}

export async function fetchShelves(): Promise<Shelf[]> {
  const res = await fetch(`${API_BASE}/shelves`);
  if (!res.ok) throw new Error(`Failed to fetch shelves: ${res.status}`);
  return res.json();
}

// Matches backend/src/types/index.ts's RackProfile shape field-for-field.
// Fetched (not hardcoded) specifically so a future real-time client-side
// validation pre-check reads the same source of truth the backend's
// validateLayout does, rather than a second copy of 254/2/44.45 that
// could silently drift from the real seeded value.
export interface RackProfile {
  widthMm: number;
  toleranceMm: number;
  uHeightMm: number;
}

export async function fetchRackProfile(): Promise<RackProfile> {
  const res = await fetch(`${API_BASE}/rack-profile`);
  if (!res.ok) throw new Error(`Failed to fetch rack profile: ${res.status}`);
  return res.json();
}// Thin fetch wrapper — no facade/adapter layer needed here the way the
// capstone's services/ does, because there's only ever one backend
// (the Rack Planner's own Express API), not several heterogeneous
// monitoring sources to normalize between. That's the whole reason the
// capstone needed a facade pattern and this doesn't — different problem
// shape, not a dropped convention.

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Matches backend/src/types/index.ts's Device shape field-for-field.
// Deliberately a separate declaration, not a cross-package import — the
// frontend's Docker build context is scoped to its own folder, so it
// can't see backend/src at build time. What actually matters is that the
// backend serializes its responses in this exact shape, so this stays in
// sync with the real wire format even though it's a plain duplicate —
// a small, visible surface to keep in sync by hand, not a hidden one.
export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  uHeight: number;
  depthMm: number;
  weightKg: number;
  wattage: number;
  source: "curated" | "community";
  status: "approved" | "pending";
  isKitItem: boolean;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/devices`);
  if (!res.ok) throw new Error(`Failed to fetch devices: ${res.status}`);
  return res.json();
}

// Matches backend/src/types/index.ts's Shelf shape field-for-field — same
// deliberate-duplicate reasoning as Device above.
export interface Shelf {
  id: string;
  name: string;
  manufacturer: string | null;
  widthMm: number;
  uHeight: number;
  maxDepthMm: number;
  maxWeightKg: number | null;
  source: "curated" | "community";
  status: "approved" | "pending";
}

export async function fetchShelves(): Promise<Shelf[]> {
  const res = await fetch(`${API_BASE}/shelves`);
  if (!res.ok) throw new Error(`Failed to fetch shelves: ${res.status}`);
  return res.json();
}

// Matches backend/src/types/index.ts's RackProfile shape field-for-field.
// Fetched (not hardcoded) specifically so a future real-time client-side
// validation pre-check reads the same source of truth the backend's
// validateLayout does, rather than a second copy of 254/2/44.45 that
// could silently drift from the real seeded value.
export interface RackProfile {
  widthMm: number;
  toleranceMm: number;
  uHeightMm: number;
}

export async function fetchRackProfile(): Promise<RackProfile> {
  const res = await fetch(`${API_BASE}/rack-profile`);
  if (!res.ok) throw new Error(`Failed to fetch rack profile: ${res.status}`);
  return res.json();
}

// Matches backend/src/types/index.ts's shape field-for-field. This is the
// elevation's own state shape, not just a save-time payload — a layout
// being built client-side literally is a PlacedShelf[] under construction.
export interface PlacedDeviceOnShelf {
  deviceId: string;
  xPositionMm?: number;
}

export interface PlacedShelf {
  shelfId: string;
  startU: number;
  placedDevices: PlacedDeviceOnShelf[];
}

// Matches backend/src/types/index.ts's ValidationError/ValidationResult
// exactly, including the same awkward-but-documented overload: deviceId
// sometimes holds a shelf id (collision/height/width checks are shelf-
// level), and only genuinely holds a device id for the two capacity
// checks. Kept identical to the server's shape on purpose — the client
// pre-check and the server's real 422 response need to be directly
// comparable, not two different error shapes reconciled ad hoc.
export interface ValidationError {
  deviceId: string;
  kind: "collision" | "exceeds_rack_height" | "exceeds_rack_width" | "depth_exceeds_shelf" | "weight_exceeds_shelf";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Matches backend/src/types/index.ts's shape field-for-field. This is the
// elevation's own state shape, not just a save-time payload — a layout
// being built client-side literally is a PlacedShelf[] under construction.
export interface PlacedDeviceOnShelf {
  deviceId: string;
  xPositionMm?: number;
}

export interface PlacedShelf {
  shelfId: string;
  startU: number;
  placedDevices: PlacedDeviceOnShelf[];
}
