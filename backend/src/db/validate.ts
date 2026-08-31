import { db } from "./index.js";
import type { Device, PlacedDevice, ValidationError, ValidationResult } from "../types/index.js";

function getDevice(deviceId: string): Device | undefined {
  const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(deviceId) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    uHeight: row.u_height,
    depthMm: row.depth_mm,
    weightKg: row.weight_kg,
    wattage: row.wattage,
    source: row.source,
    status: row.status,
    isKitItem: !!row.is_kit_item,
  };
}

// Occupied-U tracking is the whole collision check — two devices whose
// [startU, startU + uHeight) ranges overlap is a collision, full stop.
// Kept as a flat loop rather than a fancier interval-tree structure:
// layouts top out around a couple dozen devices, so O(n^2) here is not
// a real cost, and a flat loop is easier to reason about and test than
// premature optimization would be.
export function validateLayout(rackSizeU: number, placedDevices: PlacedDevice[]): ValidationResult {
  const errors: ValidationError[] = [];
  const occupied: { deviceId: string; startU: number; endU: number }[] = [];

  for (const placement of placedDevices) {
    const device = getDevice(placement.deviceId);
    if (!device) {
      errors.push({
        deviceId: placement.deviceId,
        kind: "collision", // unknown device id — treat as a hard error, not a silent skip
        message: `Device ${placement.deviceId} not found in library.`,
      });
      continue;
    }

    const endU = placement.startU + device.uHeight;

    if (endU > rackSizeU + 1) {
      errors.push({
        deviceId: placement.deviceId,
        kind: "exceeds_rack_height",
        message: `${device.name} extends past the top of a ${rackSizeU}U rack.`,
      });
    }

    for (const other of occupied) {
      const overlaps = placement.startU < other.endU && endU > other.startU;
      if (overlaps) {
        errors.push({
          deviceId: placement.deviceId,
          kind: "collision",
          message: `${device.name} overlaps another device at U${placement.startU}.`,
        });
      }
    }

    occupied.push({ deviceId: placement.deviceId, startU: placement.startU, endU });
  }

  return { valid: errors.length === 0, errors };
}
