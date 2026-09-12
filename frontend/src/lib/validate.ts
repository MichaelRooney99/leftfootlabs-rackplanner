import type { Device, PlacedShelf, RackProfile, Shelf, ValidationError, ValidationResult } from "./api";

// Faithful client-side port of backend/src/db/validate.ts's validateLayout
// — same checks, same order, same messages — but reading from fetched
// data (shelvesById/devicesById/rackProfile) instead of database lookups.
// This exists specifically so the pre-check the person sees while
// building a layout matches what the server will actually enforce at
// save time, rather than a second, hand-approximated set of rules that
// could quietly drift from the real one. Any change to the backend's
// validateLayout should be mirrored here — there's no way to share the
// implementation directly across a database-backed function and a
// fetched-data function without a much bigger refactor than this
// warrants right now.
export function validateLayoutClient(
  rackSizeU: number,
  placedShelves: PlacedShelf[],
  shelvesById: Map<string, Shelf>,
  devicesById: Map<string, Device>,
  rackProfile: RackProfile
): ValidationResult {
  const errors: ValidationError[] = [];
  const occupied: { shelfId: string; startU: number; endU: number }[] = [];

  for (const placement of placedShelves) {
    const shelf = shelvesById.get(placement.shelfId);
    if (!shelf) {
      errors.push({
        deviceId: placement.shelfId,
        kind: "collision",
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

    let shelfWeightTotal = 0;
    for (const devicePlacement of placement.placedDevices) {
      const device = devicesById.get(devicePlacement.deviceId);
      if (!device) {
        errors.push({
          deviceId: devicePlacement.deviceId,
          kind: "collision",
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
