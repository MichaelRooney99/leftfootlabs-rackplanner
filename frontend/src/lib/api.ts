// Thin fetch wrapper — no facade/adapter layer needed here the way the
// capstone's services/ does, because there's only ever one backend
// (the Rack Planner's own Express API), not several heterogeneous
// monitoring sources to normalize between. That's the whole reason the
// capstone needed a facade pattern and this doesn't — different problem
// shape, not a dropped convention.

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Matches backend/src/types/index.ts's Device shape field-for-field.
// Deliberately a separate declaration, not a cross-package import — see
// the correction note at the top of backend/src/types/index.ts for why
// (Docker build-context-per-service means the frontend image can't see
// backend/src at build time). The fix that actually matters is that the
// backend now serializes its responses in this exact shape
// (02-Frontend-Backend-Type-Alignment.md decision #1b), so keeping this
// as a plain duplicate is fine as long as it's kept in sync by hand when
// Device changes on the backend — which is a small, visible surface, not
// a hidden one.
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
