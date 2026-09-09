import {
  DISCHARGE_CURVES,
  UPS_REALPOWER_NOMINAL_WATTS,
  type DischargeCurve,
} from "../data/dischargeCurves.js";

export type EstimateConfidence = "measured" | "interpolated" | "extrapolated-by-load";

export interface RuntimeEstimate {
  loadPctUsed: number;
  // Time from full charge (100%) down to the lowest charge% actually
  // observed at this (possibly interpolated) load — real data, not a guess
  // at full depletion. See observedFloorChargePct for what that floor is.
  secondsToObservedFloor: number;
  observedFloorChargePct: number;
  confidence: EstimateConfidence;
  // True if loadPct fell outside the three curves' measured range (15-47%)
  // and had to be extrapolated by load rather than interpolated between two
  // real curves — a materially weaker guarantee than interpolation.
  loadExtrapolated: boolean;
}

// Linear interpolation of a single curve's own points: given a target
// chargePct, find how many elapsed seconds it took this curve to reach that
// charge. Charge is non-increasing in elapsedSeconds, so a simple bracket
// search is sufficient — no need for anything fancier against real,
// monotonic (give or take flat ticks) logged data.
function secondsToReachCharge(curve: DischargeCurve, targetChargePct: number): number | null {
  const points = curve.points;
  const first = points[0];
  const last = points[points.length - 1];

  if (targetChargePct >= first.chargePct) return 0;
  if (targetChargePct < last.chargePct) return null; // below what was actually observed

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (targetChargePct <= a.chargePct && targetChargePct >= b.chargePct) {
      if (a.chargePct === b.chargePct) return a.elapsedSeconds; // flat tick, no interpolation needed
      const fraction = (a.chargePct - targetChargePct) / (a.chargePct - b.chargePct);
      return a.elapsedSeconds + fraction * (b.elapsedSeconds - a.elapsedSeconds);
    }
  }
  return null;
}

function lowestObservedCharge(curve: DischargeCurve): number {
  return curve.points[curve.points.length - 1].chargePct;
}

/**
 * Estimates runtime from a layout's total wattage, using the three real
 * discharge curves measured 09-08-2026 — interpolating between the two
 * bracketing curves by load%, or extrapolating by load only when the
 * requested load falls outside the 15-47% range those curves actually cover.
 *
 * Deliberately does NOT extrapolate below the lowest charge% actually
 * observed at a given load — Level 3 in particular only has real data down
 * to 68% charge, and guessing full depletion from that would misrepresent a
 * small slice of real data as something more complete than it is.
 */
export function estimateRuntime(totalWattage: number): RuntimeEstimate {
  const loadPct = (totalWattage / UPS_REALPOWER_NOMINAL_WATTS) * 100;
  const sorted = [...DISCHARGE_CURVES].sort((a, b) => a.loadPct - b.loadPct);
  const minCurve = sorted[0];
  const maxCurve = sorted[sorted.length - 1];

  // Below the lightest measured load — extrapolate by load using the
  // lightest real curve directly, flagged as weaker than interpolation.
  if (loadPct <= minCurve.loadPct) {
    return buildEstimate(minCurve, loadPct, loadPct < minCurve.loadPct);
  }

  // Above the heaviest measured load — same idea, using the heaviest curve.
  if (loadPct >= maxCurve.loadPct) {
    return buildEstimate(maxCurve, loadPct, loadPct > maxCurve.loadPct);
  }

  // Exact match to a measured level — no interpolation needed at all.
  const exact = sorted.find((c) => c.loadPct === loadPct);
  if (exact) return buildEstimate(exact, loadPct, false);

  // Real interpolation case: bracket by the two nearest measured curves.
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (loadPct >= sorted[i].loadPct && loadPct <= sorted[i + 1].loadPct) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }

  const fraction = (loadPct - lower.loadPct) / (upper.loadPct - lower.loadPct);

  // Only compare down to whichever curve's observed floor is higher —
  // can't claim data at a charge% one of the two bracketing curves never
  // actually reached.
  const floorPct = Math.max(lowestObservedCharge(lower), lowestObservedCharge(upper));
  const lowerSeconds = secondsToReachCharge(lower, floorPct)!;
  const upperSeconds = secondsToReachCharge(upper, floorPct)!;
  const interpolatedSeconds = lowerSeconds + fraction * (upperSeconds - lowerSeconds);

  return {
    loadPctUsed: loadPct,
    secondsToObservedFloor: Math.round(interpolatedSeconds),
    observedFloorChargePct: floorPct,
    confidence: "interpolated",
    loadExtrapolated: false,
  };
}

function buildEstimate(curve: DischargeCurve, loadPct: number, extrapolated: boolean): RuntimeEstimate {
  const floor = lowestObservedCharge(curve);
  const seconds = secondsToReachCharge(curve, floor)!;
  return {
    loadPctUsed: loadPct,
    secondsToObservedFloor: Math.round(seconds),
    observedFloorChargePct: floor,
    confidence: extrapolated ? "extrapolated-by-load" : "measured",
    loadExtrapolated: extrapolated,
  };
}
