import type { Device, Keystone, PlacedShelf, RackProfile, Shelf, ValidationError, ValidationResult } from "./api";

// Faithful client-side port of backend/src/db/validate.ts's validateLayout
// — same checks, same order, same messages — but reading from fetched
// data (shelvesById/devicesById/keystonesById/rackProfile) instead of
// database lookups. This exists specifically so the pre-check the person
// sees while building a layout matches what the server will actually
// enforce at save time, rather than a second, hand-approximated set of
// rules that could quietly drift from the real one. Any change to the
// backend's validateLayout should be mirrored here — there's no way to
// share the implementation directly across a database-backed function
// and a fetched-data function without a much bigger refactor than this
// warrants right now.
export function validateLayoutClient(
  rackSizeU: number,
  placedShelves: PlacedShelf[],
  shelvesById: Map<string, Shelf>,
  devicesById: Map<string, Device>,
  keystonesById: Map<string, Keystone>,
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

    // Width-fit across the shelf's face — devices and keystones together,
    // sorted by real position. Each of the three real checks below is
    // independently gated on what's actually known, not skipped as a
    // whole item the way depth/weight are: an item's OWN width being
    // unmeasured (true for every real seeded device today) doesn't mean
    // nothing about it can be checked — its left-ear clearance only
    // needs its position, not its width, so that stays checkable even
    // when the item's width is a real, honest unknown.
    type FaceItem = { id: string; name: string; xPositionMm: number; widthMm: number | null };
    const faceItems: FaceItem[] = [];

    for (const devicePlacement of placement.placedDevices) {
      const device = devicesById.get(devicePlacement.deviceId);
      if (!device || devicePlacement.xPositionMm === undefined) continue;
      faceItems.push({ id: device.id, name: device.name, xPositionMm: devicePlacement.xPositionMm, widthMm: device.widthMm });
    }
    for (const keystonePlacement of placement.placedKeystones ?? []) {
      const keystone = keystonesById.get(keystonePlacement.keystoneId);
      if (!keystone) {
        errors.push({
          deviceId: keystonePlacement.keystoneId,
          kind: "collision",
          message: `Keystone ${keystonePlacement.keystoneId} not found in library.`,
        });
        continue;
      }
      faceItems.push({ id: keystone.id, name: keystone.name, xPositionMm: keystonePlacement.xPositionMm, widthMm: keystone.widthMm });
    }

    faceItems.sort((a, b) => a.xPositionMm - b.xPositionMm);

    for (let i = 0; i < faceItems.length; i++) {
      const item = faceItems[i];

      if (i === 0 && item.xPositionMm < rackProfile.minSpacingMm) {
        errors.push({
          deviceId: item.id,
          kind: "insufficient_ear_clearance",
          message: `${item.name} sits ${item.xPositionMm}mm from ${shelf.name}'s left ear — needs at least ${rackProfile.minSpacingMm}mm clearance.`,
        });
      }

      if (item.widthMm === null) continue;

      const itemEndMm = item.xPositionMm + item.widthMm;

      if (shelf.usableWidthMm !== null) {
        if (itemEndMm > shelf.usableWidthMm) {
          errors.push({
            deviceId: item.id,
            kind: "exceeds_shelf_face_width",
            message: `${item.name} (ending at ${itemEndMm}mm) doesn't fit within ${shelf.name}'s ${shelf.usableWidthMm}mm usable width at all.`,
          });
        } else if (itemEndMm > shelf.usableWidthMm - rackProfile.minSpacingMm) {
          errors.push({
            deviceId: item.id,
            kind: "insufficient_ear_clearance",
            message: `${item.name} ends ${(shelf.usableWidthMm - itemEndMm).toFixed(1)}mm from ${shelf.name}'s right ear — needs at least ${rackProfile.minSpacingMm}mm clearance.`,
          });
        }
      }

      const next = faceItems[i + 1];
      if (next && itemEndMm + rackProfile.minSpacingMm > next.xPositionMm) {
        errors.push({
          deviceId: next.id,
          kind: "insufficient_spacing",
          message: `${next.name} is too close to ${item.name} — needs at least ${rackProfile.minSpacingMm}mm between them.`,
        });
      }
    }

    occupied.push({ shelfId: placement.shelfId, startU: placement.startU, endU });
  }

  return { valid: errors.length === 0, errors };
}
