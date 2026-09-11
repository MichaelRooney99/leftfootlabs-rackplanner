import { describe, it, expect } from "vitest";
import { canPlaceAt } from "./placement";
import type { PlacedShelf, Shelf } from "./api";

function makeShelf(id: string, uHeight: number): Shelf {
  return {
    id,
    name: `Test Shelf ${id}`,
    manufacturer: null,
    widthMm: 254,
    uHeight,
    maxDepthMm: 200,
    maxWeightKg: null,
    source: "curated",
    status: "approved",
  };
}

describe("canPlaceAt", () => {
  const shelf1U = makeShelf("shelf-1u", 1);
  const shelf2U = makeShelf("shelf-2u", 2);
  const shelvesById = new Map([
    [shelf1U.id, shelf1U],
    [shelf2U.id, shelf2U],
  ]);

  it("allows placement in an empty rack", () => {
    expect(canPlaceAt(shelf1U, 1, 5, [], shelvesById)).toBe(true);
  });

  it("rejects placement that would extend past the top of the rack", () => {
    // shelf2U at U4 in a 5U rack spans U4-U5, which fits exactly — not a
    // real exceeding case. U5 is the actual boundary: shelf2U there would
    // span U5-U6, one U past the top of a 5U rack.
    expect(canPlaceAt(shelf2U, 5, 5, [], shelvesById)).toBe(false);
    expect(canPlaceAt(shelf2U, 4, 5, [], shelvesById)).toBe(true);
  });

  it("rejects placement that exactly overlaps an existing shelf", () => {
    const existing: PlacedShelf[] = [{ shelfId: shelf1U.id, startU: 2, placedDevices: [] }];
    expect(canPlaceAt(shelf1U, 2, 5, existing, shelvesById)).toBe(false);
  });

  it("allows placement immediately adjacent to an existing shelf, no gap needed", () => {
    const existing: PlacedShelf[] = [{ shelfId: shelf1U.id, startU: 2, placedDevices: [] }];
    expect(canPlaceAt(shelf1U, 3, 5, existing, shelvesById)).toBe(true);
    expect(canPlaceAt(shelf1U, 1, 5, existing, shelvesById)).toBe(true);
  });

  it("correctly blocks a start position that overlaps a multi-U shelf's span", () => {
    // shelf2U placed at U2 occupies U2-U3.
    const existing: PlacedShelf[] = [{ shelfId: shelf2U.id, startU: 2, placedDevices: [] }];
    // Starting a new 1U shelf at U1 would need U1 only — doesn't overlap U2-U3.
    expect(canPlaceAt(shelf1U, 1, 5, existing, shelvesById)).toBe(true);
    // Starting at U3 lands inside the existing shelf's span — blocked.
    expect(canPlaceAt(shelf1U, 3, 5, existing, shelvesById)).toBe(false);
    // Starting at U4 is past the existing shelf's span — fine.
    expect(canPlaceAt(shelf1U, 4, 5, existing, shelvesById)).toBe(true);
  });

  it("does not crash on a placement referencing a shelf id missing from the lookup map", () => {
    const existing: PlacedShelf[] = [{ shelfId: "does-not-exist", startU: 2, placedDevices: [] }];
    expect(() => canPlaceAt(shelf1U, 3, 5, existing, shelvesById)).not.toThrow();
  });
});
