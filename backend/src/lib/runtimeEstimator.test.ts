import { describe, it, expect } from "vitest";
import { estimateRuntime } from "./runtimeEstimator.js";
import { UPS_REALPOWER_NOMINAL_WATTS } from "../data/dischargeCurves.js";

function wattsForLoadPct(loadPct: number): number {
  return (loadPct / 100) * UPS_REALPOWER_NOMINAL_WATTS;
}

describe("estimateRuntime — reproduces real measured curves exactly", () => {
  it("Level 1 (15% load, measured): reproduces the real logged floor exactly", () => {
    const result = estimateRuntime(wattsForLoadPct(15));
    expect(result.confidence).toBe("measured");
    expect(result.loadExtrapolated).toBe(false);
    expect(result.observedFloorChargePct).toBe(24); // real logged floor
    expect(result.secondsToObservedFloor).toBe(1530); // real logged elapsed time to 24%
  });

  it("Level 2 (25% load, measured but loadPct itself was inferred, not upsc-confirmed): reproduces the real logged floor exactly", () => {
    const result = estimateRuntime(wattsForLoadPct(25));
    expect(result.confidence).toBe("measured");
    expect(result.observedFloorChargePct).toBe(27); // real cutoff — FSD/LB fired here
    expect(result.secondsToObservedFloor).toBe(600);
  });

  it("Level 3 (47% load, measured): reproduces the real logged floor exactly, does not pretend to know anything below 68%", () => {
    const result = estimateRuntime(wattsForLoadPct(47));
    expect(result.confidence).toBe("measured");
    expect(result.observedFloorChargePct).toBe(68); // test was stopped here, live-watched
    expect(result.secondsToObservedFloor).toBe(150);
  });
});

describe("estimateRuntime — interpolates between two real curves for an untested load", () => {
  it("20% load (between the 15% and 25% curves) is interpolated, not measured", () => {
    const result = estimateRuntime(wattsForLoadPct(20));
    expect(result.confidence).toBe("interpolated");
    expect(result.loadExtrapolated).toBe(false);
    // Floor has to be the HIGHER of the two curves' own floors (27%, from
    // Level 2) — can't claim data at 24% for a curve that borrows partly
    // from a curve that never actually got below 27%.
    expect(result.observedFloorChargePct).toBe(27);
    // Interpolated seconds should sit strictly between Level 1's real time
    // to 27% and Level 2's real time to 27% (600s) — a real, bounded check,
    // not an exact hardcoded number, since interpolation math shouldn't be
    // pinned to a value that would silently pass if the interpolation logic
    // were subtly wrong in a way that still landed in a plausible range.
    expect(result.secondsToObservedFloor).toBeGreaterThan(600);
    expect(result.secondsToObservedFloor).toBeLessThan(1530);
  });

  it("35% load (between the 25% and 47% curves) is interpolated", () => {
    const result = estimateRuntime(wattsForLoadPct(35));
    expect(result.confidence).toBe("interpolated");
    expect(result.observedFloorChargePct).toBe(68); // Level 3's floor is the higher one here
    expect(result.secondsToObservedFloor).toBeGreaterThan(150);
    expect(result.secondsToObservedFloor).toBeLessThan(600);
  });
});

describe("estimateRuntime — extrapolates by load only outside the 15-47% measured range", () => {
  it("a very light load (5%) is flagged as extrapolated, not silently treated as measured", () => {
    const result = estimateRuntime(wattsForLoadPct(5));
    expect(result.confidence).toBe("extrapolated-by-load");
    expect(result.loadExtrapolated).toBe(true);
  });

  it("a very heavy load (80%) is flagged as extrapolated, not silently treated as measured", () => {
    const result = estimateRuntime(wattsForLoadPct(80));
    expect(result.confidence).toBe("extrapolated-by-load");
    expect(result.loadExtrapolated).toBe(true);
  });

  it("exactly at the boundary (15% or 47%) is NOT flagged as extrapolated — real measured data", () => {
    expect(estimateRuntime(wattsForLoadPct(15)).loadExtrapolated).toBe(false);
    expect(estimateRuntime(wattsForLoadPct(47)).loadExtrapolated).toBe(false);
  });
});
