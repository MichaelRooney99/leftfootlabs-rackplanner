// Mechanical guard only — does placing an item of this width at this
// X-position overlap something already on the shelf's face. This is NOT
// the real fit/spacing validation (no 8mm gap enforcement, no
// usable-width boundary check) — that's a separate, later check once
// it's built, just "do two real rectangles overlap." Same relationship
// canPlaceAt had to validateLayoutClient's collision check before the
// width/depth/weight checks existed.
//
// A null width — either the item being placed or a neighbor already on
// the shelf — means "can't verify," not "assume it's fine" or "assume
// it collides." Every real seeded device has an unmeasured width today,
// so returning false here would make horizontal placement untestable
// against real data; returning true pretends to a certainty that isn't
// there. Allowing the placement while genuinely unable to check is the
// same real precedent 03d already set for a shelf's unmeasured weight
// capacity — skip the check, don't guess an answer either direction.
export function canPlaceHorizontally(
  widthMm: number | null,
  xPositionMm: number,
  existingItems: { xPositionMm: number; widthMm: number | null }[]
): boolean {
  if (widthMm === null) return true;

  const endX = xPositionMm + widthMm;
  for (const item of existingItems) {
    if (item.widthMm === null) continue;
    const itemEndX = item.xPositionMm + item.widthMm;
    const overlaps = xPositionMm < itemEndX && endX > item.xPositionMm;
    if (overlaps) return false;
  }

  return true;
}

// Snaps a raw pixel-derived mm position to the real 2mm grid, clamped to
// never go negative — a drop event can report a position slightly before
// the face bar's own left edge due to rounding, and a negative position
// has no physical meaning.
export function snapToGrid(rawMm: number, gridMm: number): number {
  const snapped = Math.round(rawMm / gridMm) * gridMm;
  return Math.max(0, snapped);
}
