import { getShelf } from "./shelves.js";
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
export function validateLayout(rackSizeU: number, placedShelves: PlacedShelf[]): ValidationResult {
  const errors: ValidationError[] = [];
  const occupied: { shelfId: string; startU: number; endU: number }[] = [];

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

    occupied.push({ shelfId: placement.shelfId, startU: placement.startU, endU });
  }

  return { valid: errors.length === 0, errors };
}
