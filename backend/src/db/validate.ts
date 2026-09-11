import { getShelf, getRackProfile } from "./shelves.js";
import { getDevice } from "./devices.js";
import type { PlacedShelf, ValidationError, ValidationResult } from "../types/index.js";

// Occupied-U tracking is the whole collision check — two shelves whose
// [startU, startU + uHeight) ranges overlap is a collision, full stop.
// This is the same algorithm that used to run directly against placed
// devices; it now runs one level up, against placed shelves, since a
// device no longer occupies its own rack position — it inherits one from
// whichever shelf it's nested under. Kept as a flat loop rather than a
// fancier interval-tree structure: layouts top out around a couple dozen
// shelves, so O(n^2) here is not a real cost, and a flat loop is easier
// to reason about and test than premature optimization would be.
//
// One universal-standard lookup for the whole layout, not per shelf —
// there's only ever one rack_profiles row, so fetching it once up front
// avoids a redundant database round trip inside the loop below.
export function validateLayout(rackSizeU: number, placedShelves: PlacedShelf[]): ValidationResult {
  const errors: ValidationError[] = [];
  const occupied: { shelfId: string; startU: number; endU: number }[] = [];
  const rackProfile = getRackProfile();

  for (const placement of placedShelves) {
    const shelf = getShelf(placement.shelfId);
    if (!shelf) {
      errors.push({
        deviceId: placement.shelfId, // ValidationError's field name predates shelves; the id it carries is whatever failed the check
        kind: "collision", // unknown shelf id — treat as a hard error, not a silent skip
        message: `Shelf ${placement.shelfId} not found in library.`,
      });
      continue;
    }

    const endU = placement.startU + shelf.uHeight;

    if (endU > rackSizeU + 1) {
      errors.push({
        deviceId: placement.shelfId,
        kind: "exceeds_rack_height",
        message: `${shelf.name} extends past the top of a ${rackSizeU}U rack.`,
      });
    }

    // Inclusive at the tolerance boundary on purpose — a shelf measured
    // at exactly rack width ± tolerance is a real, physically compliant
    // part, not a borderline failure. Math.abs so it doesn't matter which
    // direction the shelf's width drifts from the standard.
    const widthDelta = Math.abs(shelf.widthMm - rackProfile.widthMm);
    if (widthDelta > rackProfile.toleranceMm) {
      errors.push({
        deviceId: placement.shelfId,
        kind: "exceeds_rack_width",
        message: `${shelf.name} (${shelf.widthMm}mm) is outside the ${rackProfile.widthMm}mm ±${rackProfile.toleranceMm}mm rack-width standard.`,
      });
    }

    for (const other of occupied) {
      const overlaps = placement.startU < other.endU && endU > other.startU;
      if (overlaps) {
        errors.push({
          deviceId: placement.shelfId,
          kind: "collision",
          message: `${shelf.name} overlaps another shelf at U${placement.startU}.`,
        });
      }
    }

    // Depth is checked per device — each device on this shelf must
    // individually fit its maxDepthMm. Not a running total; shelf
    // surface area / 2D packing isn't modeled. Weight is the opposite:
    // a running total across every device on this shelf, since weight
    // capacity is a real physical limit on the shelf as a whole, not
    // per item. Skipped entirely when maxWeightKg is null (unmeasured
    // for several real seeded shelves) — a missing number should never
    // silently fail or silently pass as if it were zero.
    let shelfWeightTotal = 0;
    for (const devicePlacement of placement.placedDevices) {
      const device = getDevice(devicePlacement.deviceId);
      if (!device) {
        errors.push({
          deviceId: devicePlacement.deviceId,
          kind: "collision", // unknown device id — same hard-error treatment as an unknown shelf id above
          message: `Device ${devicePlacement.deviceId} not found in library.`,
        });
        continue;
      }

      if (device.depthMm > shelf.maxDepthMm) {
        errors.push({
          deviceId: devicePlacement.deviceId,
          kind: "depth_exceeds_shelf",
          message: `${device.name} (${device.depthMm}mm deep) exceeds ${shelf.name}'s ${shelf.maxDepthMm}mm depth limit.`,
        });
      }

      shelfWeightTotal += device.weightKg;
      if (shelf.maxWeightKg !== null && shelfWeightTotal > shelf.maxWeightKg) {
        errors.push({
          deviceId: devicePlacement.deviceId,
          kind: "weight_exceeds_shelf",
          message: `Adding ${device.name} brings ${shelf.name}'s total to ${shelfWeightTotal}kg, over its ${shelf.maxWeightKg}kg limit.`,
        });
      }
    }

    occupied.push({ shelfId: placement.shelfId, startU: placement.startU, endU });
  }

  return { valid: errors.length === 0, errors };
}
