import { describe, it, expect } from "vitest";
import { validateLayoutClient } from "./validate";
import type { Device, Keystone, PlacedShelf, RackProfile, Shelf } from "./api";

function makeShelf(overrides: Partial<Shelf> & { id: string }): Shelf {
  return {
    name: `Test Shelf ${overrides.id}`,
    manufacturer: null,
    widthMm: 254,
    uHeight: 1,
    maxDepthMm: 200,
    maxWeightKg: null,
    usableWidthMm: null,
    isStandard: false,
    source: "curated",
    status: "approved",
    ...overrides,
  };
}

function makeDevice(overrides: Partial<Device> & { id: string }): Device {
  return {
    name: `Test Device ${overrides.id}`,
    manufacturer: null,
    uHeight: 1,
    depthMm: 50,
    weightKg: 1,
    wattage: 10,
    widthMm: null,
    source: "curated",
    status: "approved",
    isKitItem: false,
    ...overrides,
  };
}

function makeKeystone(overrides: Partial<Keystone> & { id: string }): Keystone {
  return {
    name: `Test Keystone ${overrides.id}`,
    widthMm: 14.5,
    heightMm: 16,
    ...overrides,
  };
}

const RACK_PROFILE: RackProfile = { widthMm: 254, toleranceMm: 2, uHeightMm: 44.45, minSpacingMm: 8 };

describe("validateLayoutClient — parity with the backend's validateLayout", () => {
  const compliantShelf = makeShelf({ id: "compliant", widthMm: 254 });
  const boundaryShelf = makeShelf({ id: "boundary", widthMm: 252 }); // delta exactly 2mm
  const badWidthShelf = makeShelf({ id: "bad-width", widthMm: 300 });
  const capacityShelf = makeShelf({ id: "capacity", widthMm: 254, maxDepthMm: 100, maxWeightKg: 5 });
  const nullWeightShelf = makeShelf({ id: "null-weight", widthMm: 254, maxWeightKg: null });
  const measuredWidthShelf = makeShelf({ id: "measured-width", widthMm: 254, usableWidthMm: 214 });

  const shelvesById = new Map(
    [compliantShelf, boundaryShelf, badWidthShelf, capacityShelf, nullWeightShelf, measuredWidthShelf].map((s) => [
      s.id,
      s,
    ])
  );

  const shallowLight = makeDevice({ id: "shallow-light", depthMm: 50, weightKg: 2 });
  const deep = makeDevice({ id: "deep", depthMm: 150, weightKg: 2 });
  const mediumWeight = makeDevice({ id: "medium-weight", depthMm: 50, weightKg: 3 });
  const wideDevice = makeDevice({ id: "wide", widthMm: 20 });
  const narrowDevice = makeDevice({ id: "narrow", widthMm: 10 });
  const noWidthDevice = makeDevice({ id: "no-width", widthMm: null });

  const devicesById = new Map(
    [shallowLight, deep, mediumWeight, wideDevice, narrowDevice, noWidthDevice].map((d) => [d.id, d])
  );

  const realKeystone = makeKeystone({ id: "keystone-standard", widthMm: 14.5, heightMm: 16 });
  const keystonesById = new Map([realKeystone].map((k) => [k.id, k]));

  function build(placedShelves: PlacedShelf[], rackSizeU = 5) {
    return validateLayoutClient(rackSizeU, placedShelves, shelvesById, devicesById, keystonesById, RACK_PROFILE);
  }

  it("an empty layout is trivially valid", () => {
    const result = build([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("two shelves at the same U position collide", () => {
    const result = build([
      { shelfId: compliantShelf.id, startU: 1, placedDevices: [] },
      { shelfId: boundaryShelf.id, startU: 1, placedDevices: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "collision")).toBe(true);
  });

  it("a shelf placed past the top of the rack fails with exceeds_rack_height", () => {
    const result = build([{ shelfId: compliantShelf.id, startU: 3, placedDevices: [] }], 2);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("exceeds_rack_height");
  });

  it("a shelf right at the tolerance boundary passes — inclusive, not strict", () => {
    const result = build([{ shelfId: boundaryShelf.id, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(true);
  });

  it("a shelf clearly outside the rack-width tolerance fails with exceeds_rack_width", () => {
    const result = build([{ shelfId: badWidthShelf.id, startU: 1, placedDevices: [] }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("exceeds_rack_width");
  });

  it("a device that individually exceeds a shelf's depth fails with depth_exceeds_shelf", () => {
    const result = build([{ shelfId: capacityShelf.id, startU: 1, placedDevices: [{ deviceId: deep.id }] }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "depth_exceeds_shelf" && e.deviceId === deep.id)).toBe(true);
  });

  it("two devices individually within weight limits fail once their combined total exceeds capacity", () => {
    const result = build([
      {
        shelfId: capacityShelf.id,
        startU: 1,
        placedDevices: [{ deviceId: mediumWeight.id }, { deviceId: mediumWeight.id }],
      },
    ]);
    expect(result.valid).toBe(false);
    const weightErrors = result.errors.filter((e) => e.kind === "weight_exceeds_shelf");
    expect(weightErrors).toHaveLength(1);
  });

  it("a shelf with an unmeasured (null) weight capacity skips the weight check entirely", () => {
    const heavyDevice = makeDevice({ id: "heavy", depthMm: 50, weightKg: 999 });
    const localDevicesById = new Map([...devicesById, [heavyDevice.id, heavyDevice]]);
    const result = validateLayoutClient(
      5,
      [{ shelfId: nullWeightShelf.id, startU: 1, placedDevices: [{ deviceId: heavyDevice.id }] }],
      shelvesById,
      localDevicesById,
      keystonesById,
      RACK_PROFILE
    );
    expect(result.valid).toBe(true);
  });

  it("an item too close to the shelf's left ear fails with insufficient_ear_clearance, checked from position alone", () => {
    const result = build([
      { shelfId: nullWeightShelf.id, startU: 1, placedDevices: [{ deviceId: wideDevice.id, xPositionMm: 5 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === wideDevice.id)).toBe(true);
  });

  it("left-ear clearance is still checked even when the item's own width is unmeasured", () => {
    const result = build([
      { shelfId: nullWeightShelf.id, startU: 1, placedDevices: [{ deviceId: noWidthDevice.id, xPositionMm: 3 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].kind).toBe("insufficient_ear_clearance");
  });

  it("right-ear clearance and exceeds_shelf_face_width are both genuinely unchecked when usableWidthMm is unmeasured", () => {
    const result = build([
      { shelfId: nullWeightShelf.id, startU: 1, placedDevices: [{ deviceId: wideDevice.id, xPositionMm: 1000 }] },
    ]);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width")).toBe(false);
  });

  it("an item that overflows a real measured usable width fails with exceeds_shelf_face_width", () => {
    const result = build([
      { shelfId: measuredWidthShelf.id, startU: 1, placedDevices: [{ deviceId: wideDevice.id, xPositionMm: 200 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width")).toBe(true);
  });

  it("an item that fits within usable width but violates the right-ear buffer fails with insufficient_ear_clearance", () => {
    const result = build([
      { shelfId: measuredWidthShelf.id, startU: 1, placedDevices: [{ deviceId: narrowDevice.id, xPositionMm: 200 }] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance")).toBe(true);
    expect(result.errors.some((e) => e.kind === "exceeds_shelf_face_width")).toBe(false);
  });

  it("two items closer together than 8mm fail with insufficient_spacing", () => {
    const result = build([
      {
        shelfId: nullWeightShelf.id,
        startU: 1,
        placedDevices: [
          { deviceId: wideDevice.id, xPositionMm: 20 },
          { deviceId: narrowDevice.id, xPositionMm: 45 },
        ],
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_spacing")).toBe(true);
  });

  it("a real placed keystone gets the same width-fit checks as a device", () => {
    const result = build([
      {
        shelfId: nullWeightShelf.id,
        startU: 1,
        placedDevices: [],
        placedKeystones: [{ keystoneId: realKeystone.id, xPositionMm: 2 }],
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.kind === "insufficient_ear_clearance" && e.deviceId === realKeystone.id)).toBe(true);
  });

  it("a fully compliant multi-shelf layout with devices passes with zero errors", () => {
    const result = build([
      { shelfId: compliantShelf.id, startU: 1, placedDevices: [{ deviceId: shallowLight.id }] },
      { shelfId: nullWeightShelf.id, startU: 2, placedDevices: [] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
