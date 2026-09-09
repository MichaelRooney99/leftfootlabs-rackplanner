// Real UPS discharge data — three load levels, logged 09-08-2026 against the
// live CyberPower SX950U. Every point below is transcribed directly from the
// actual upsc polling logs (30s interval), not modeled or invented. t=0 for
// each curve is that level's first real on-battery reading (OB DISCHRG),
// using that reading's own charge% as the starting point — not assumed 100 —
// since the driver sometimes already shows a 1% drop by the first poll after
// transfer.
//
// Level 2's loadPct (25) was never directly confirmed via `upsc ups.load`
// during that session — it's inferred from the runtime-estimate ratio against
// Level 1, not measured the way Levels 1 (15%) and 3 (47%) were. Flagged
// explicitly here and carried through as `loadPctConfirmed: false` rather
// than presented with the same confidence as the other two.

export interface DischargePoint {
  elapsedSeconds: number;
  chargePct: number;
}

export interface DischargeCurve {
  loadPct: number;
  loadPctConfirmed: boolean;
  points: DischargePoint[]; // sorted by elapsedSeconds ascending, chargePct non-increasing
}

// ~15% load, confirmed via upsc immediately before the test.
const LEVEL_1: DischargeCurve = {
  loadPct: 15,
  loadPctConfirmed: true,
  points: [
    { elapsedSeconds: 0, chargePct: 99 },
    { elapsedSeconds: 30, chargePct: 97 },
    { elapsedSeconds: 60, chargePct: 95 },
    { elapsedSeconds: 90, chargePct: 93 },
    { elapsedSeconds: 120, chargePct: 91 },
    { elapsedSeconds: 150, chargePct: 89 },
    { elapsedSeconds: 180, chargePct: 87 },
    { elapsedSeconds: 210, chargePct: 85 },
    { elapsedSeconds: 240, chargePct: 83 },
    { elapsedSeconds: 270, chargePct: 81 },
    { elapsedSeconds: 300, chargePct: 77 },
    { elapsedSeconds: 330, chargePct: 71 },
    { elapsedSeconds: 360, chargePct: 68 },
    { elapsedSeconds: 390, chargePct: 64 },
    { elapsedSeconds: 420, chargePct: 62 },
    { elapsedSeconds: 450, chargePct: 59 },
    { elapsedSeconds: 480, chargePct: 57 },
    { elapsedSeconds: 510, chargePct: 57 },
    { elapsedSeconds: 540, chargePct: 55 },
    { elapsedSeconds: 570, chargePct: 53 },
    { elapsedSeconds: 600, chargePct: 51 },
    { elapsedSeconds: 630, chargePct: 49 },
    { elapsedSeconds: 660, chargePct: 47 },
    { elapsedSeconds: 690, chargePct: 45 },
    { elapsedSeconds: 720, chargePct: 44 },
    { elapsedSeconds: 750, chargePct: 43 },
    { elapsedSeconds: 780, chargePct: 41 },
    { elapsedSeconds: 810, chargePct: 40 },
    { elapsedSeconds: 840, chargePct: 39 },
    { elapsedSeconds: 870, chargePct: 38 },
    { elapsedSeconds: 900, chargePct: 38 },
    { elapsedSeconds: 930, chargePct: 37 },
    { elapsedSeconds: 960, chargePct: 36 },
    { elapsedSeconds: 990, chargePct: 35 },
    { elapsedSeconds: 1020, chargePct: 35 },
    { elapsedSeconds: 1050, chargePct: 34 },
    { elapsedSeconds: 1080, chargePct: 34 },
    { elapsedSeconds: 1110, chargePct: 33 },
    { elapsedSeconds: 1140, chargePct: 33 },
    { elapsedSeconds: 1170, chargePct: 32 },
    { elapsedSeconds: 1200, chargePct: 32 },
    { elapsedSeconds: 1230, chargePct: 31 },
    { elapsedSeconds: 1260, chargePct: 30 },
    { elapsedSeconds: 1290, chargePct: 30 },
    { elapsedSeconds: 1320, chargePct: 29 },
    { elapsedSeconds: 1350, chargePct: 29 },
    { elapsedSeconds: 1380, chargePct: 28 },
    { elapsedSeconds: 1410, chargePct: 27 },
    { elapsedSeconds: 1440, chargePct: 26 },
    { elapsedSeconds: 1470, chargePct: 26 },
    { elapsedSeconds: 1500, chargePct: 25 },
    { elapsedSeconds: 1530, chargePct: 24 },
  ],
};

// ~25% load — loadPct INFERRED, not directly measured. See file header.
const LEVEL_2: DischargeCurve = {
  loadPct: 25,
  loadPctConfirmed: false,
  points: [
    { elapsedSeconds: 0, chargePct: 99 },
    { elapsedSeconds: 30, chargePct: 96 },
    { elapsedSeconds: 60, chargePct: 93 },
    { elapsedSeconds: 90, chargePct: 90 },
    { elapsedSeconds: 120, chargePct: 87 },
    { elapsedSeconds: 150, chargePct: 86 },
    { elapsedSeconds: 180, chargePct: 83 },
    { elapsedSeconds: 210, chargePct: 80 },
    { elapsedSeconds: 240, chargePct: 74 },
    { elapsedSeconds: 270, chargePct: 68 },
    { elapsedSeconds: 300, chargePct: 63 },
    { elapsedSeconds: 330, chargePct: 59 },
    { elapsedSeconds: 360, chargePct: 54 },
    { elapsedSeconds: 390, chargePct: 50 },
    { elapsedSeconds: 420, chargePct: 47 },
    { elapsedSeconds: 450, chargePct: 43 },
    { elapsedSeconds: 480, chargePct: 38 },
    { elapsedSeconds: 510, chargePct: 36 },
    { elapsedSeconds: 540, chargePct: 33 },
    { elapsedSeconds: 570, chargePct: 31 },
    { elapsedSeconds: 600, chargePct: 27 }, // real cutoff — FSD/LB fired here
  ],
};

// ~47% load, confirmed via upsc immediately before the test. Only reaches
// 68% charge — the test was stopped deliberately, live-watched, well short
// of a full curve. Extrapolating this one far past 68% would be guessing
// from a small fraction of real data — the estimator deliberately doesn't.
const LEVEL_3: DischargeCurve = {
  loadPct: 47,
  loadPctConfirmed: true,
  points: [
    { elapsedSeconds: 0, chargePct: 100 },
    { elapsedSeconds: 30, chargePct: 96 },
    { elapsedSeconds: 60, chargePct: 88 },
    { elapsedSeconds: 90, chargePct: 80 },
    { elapsedSeconds: 120, chargePct: 71 },
    { elapsedSeconds: 150, chargePct: 68 },
  ],
};

export const DISCHARGE_CURVES: DischargeCurve[] = [LEVEL_1, LEVEL_2, LEVEL_3];

// UPS nameplate real-power rating, from a live `upsc` read — used to convert
// a layout's total wattage into the load% these curves are indexed by.
export const UPS_REALPOWER_NOMINAL_WATTS = 510;
