import { getShelf, getRackProfile } from "./shelves.js";
import { getDevice } from "./devices.js";
import { getKeystone } from "./keystones.js";
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
      const device = getDevice(devicePlacement.deviceId);
      if (!device || devicePlacement.xPositionMm === undefined) continue; // already reported above, or not yet positioned
      faceItems.push({ id: device.id, name: device.name, xPositionMm: devicePlacement.xPositionMm, widthMm: device.widthMm });
    }
    for (const keystonePlacement of placement.placedKeystones ?? []) {
      const keystone = getKeystone(keystonePlacement.keystoneId);
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

      // Left-ear clearance — needs only the item's real position, not its
      // width, so this runs even for an item whose width is unmeasured.
      if (i === 0 && item.xPositionMm < rackProfile.minSpacingMm) {
        errors.push({
          deviceId: item.id,
          kind: "insufficient_ear_clearance",
          message: `${item.name} sits ${item.xPositionMm}mm from ${shelf.name}'s left ear — needs at least ${rackProfile.minSpacingMm}mm clearance.`,
        });
      }

      if (item.widthMm === null) continue; // can't check anything that needs this item's own width

      const itemEndMm = item.xPositionMm + item.widthMm;

      // Right-ear clearance and the harder "doesn't fit at all" case both
      // need a real usable_width_mm — unmeasured for six of the seven
      // real seeded shelves, so both are genuinely unchecked rather than
      // guessed for most shelves today, same treatment maxWeightKg's
      // null already gets above.
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

      // Neighbor spacing — only needs this item's own end position and
      // the next item's real start position, not the next item's width.
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
