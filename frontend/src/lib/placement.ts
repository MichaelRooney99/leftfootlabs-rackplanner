import type { PlacedShelf, Shelf } from "./api";

// Mechanical placement guard only — does this shelf fit within the rack's
// height and avoid overlapping something already placed. This is NOT the
// full validateLayout parity check (no width/depth/weight yet); that's
// real-time validation, still to come as its own piece once devices can
// be placed on shelves too.
export function canPlaceAt(
  shelf: Shelf,
  startU: number,
  rackSizeU: number,
  placedShelves: PlacedShelf[],
  shelvesById: Map<string, Shelf>
): boolean {
  const endU = startU + shelf.uHeight - 1;
  if (endU > rackSizeU) return false;

  for (const placement of placedShelves) {
    const placedShelf = shelvesById.get(placement.shelfId);
    if (!placedShelf) continue;
    const placedEndU = placement.startU + placedShelf.uHeight - 1;
    const overlaps = startU <= placedEndU && endU >= placement.startU;
    if (overlaps) return false;
  }

  return true;
}
