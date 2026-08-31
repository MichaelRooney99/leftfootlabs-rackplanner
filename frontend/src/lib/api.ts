// Thin fetch wrapper — no facade/adapter layer needed here the way the
// capstone's services/ does, because there's only ever one backend
// (the Rack Planner's own Express API), not several heterogeneous
// monitoring sources to normalize between. That's the whole reason the
// capstone needed a facade pattern and this doesn't — different problem
// shape, not a dropped convention.

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  u_height: number;
  depth_mm: number;
  weight_kg: number;
  wattage: number;
  is_kit_item: number;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/devices`);
  if (!res.ok) throw new Error(`Failed to fetch devices: ${res.status}`);
  return res.json();
}
