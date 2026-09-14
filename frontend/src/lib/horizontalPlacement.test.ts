import { describe, it, expect } from "vitest";
import { canPlaceHorizontally, snapToGrid } from "./horizontalPlacement";

describe("canPlaceHorizontally", () => {
  it("allows placement on an empty face", () => {
    expect(canPlaceHorizontally(20, 0, [])).toBe(true);
  });

  it("rejects a placement that overlaps an existing item", () => {
    const existing = [{ xPositionMm: 10, widthMm: 20 }]; // occupies 10-30
    expect(canPlaceHorizontally(10, 15, existing)).toBe(false); // 15-25 overlaps
  });

  it("allows a placement immediately adjacent to an existing item, no gap required at this layer", () => {
    const existing = [{ xPositionMm: 10, widthMm: 20 }]; // occupies 10-30
    expect(canPlaceHorizontally(10, 30, existing)).toBe(true); // 30-40, touches but doesn't overlap
    expect(canPlaceHorizontally(10, 0, existing)).toBe(true); // 0-10, touches but doesn't overlap
  });

  it("does not guess when the item being placed has an unmeasured width — allows it", () => {
    const existing = [{ xPositionMm: 10, widthMm: 20 }];
    expect(canPlaceHorizontally(null, 15, existing)).toBe(true);
  });

  it("does not guess when an existing neighbor has an unmeasured width — allows past it", () => {
    const existing = [{ xPositionMm: 10, widthMm: null }];
    expect(canPlaceHorizontally(10, 15, existing)).toBe(true);
  });

  it("still catches a real overlap against one known neighbor even when another neighbor is unmeasured", () => {
    const existing = [
      { xPositionMm: 10, widthMm: null },
      { xPositionMm: 50, widthMm: 20 }, // occupies 50-70
    ];
    expect(canPlaceHorizontally(10, 55, existing)).toBe(false); // 55-65 overlaps the known one
  });
});

describe("snapToGrid", () => {
  it("snaps to the nearest real grid line", () => {
    expect(snapToGrid(15, 2)).toBe(16);
    expect(snapToGrid(14, 2)).toBe(14);
    expect(snapToGrid(13, 2)).toBe(14);
  });

  it("clamps a negative or rounding-induced-negative position to zero", () => {
    expect(snapToGrid(-3, 2)).toBe(0);
    expect(snapToGrid(0.4, 2)).toBe(0);
  });
});
