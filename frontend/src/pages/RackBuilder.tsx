import { useEffect, useMemo, useState } from "react";
import { fetchDevices, fetchShelves, type Device, type PlacedShelf, type Shelf } from "../lib/api";
import { canPlaceAt } from "../lib/placement";

const RACK_SIZE_OPTIONS = [5, 8, 10] as const;

// A single selection slot rather than two separate "selectedShelfId" /
// "selectedDeviceId" states — picking a device always means "I'm about to
// place this on a shelf," and picking a shelf always means "I'm about to
// place this in an open rack slot." The two are mutually exclusive by
// construction this way, instead of by remembering to clear the other
// state by hand at every selection site.
type Selection = { type: "shelf"; id: string } | { type: "device"; id: string } | null;

export function RackBuilder() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rackSizeU, setRackSizeU] = useState<number>(5);
  const [placedShelves, setPlacedShelves] = useState<PlacedShelf[]>([]);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    Promise.all([fetchShelves(), fetchDevices()])
      .then(([shelfData, deviceData]) => {
        setShelves(shelfData);
        setDevices(deviceData);
      })
      .catch((err) => setError(err.message));
  }, []);

  const shelvesById = useMemo(() => {
    const map = new Map<string, Shelf>();
    for (const s of shelves ?? []) map.set(s.id, s);
    return map;
  }, [shelves]);

  const devicesById = useMemo(() => {
    const map = new Map<string, Device>();
    for (const d of devices ?? []) map.set(d.id, d);
    return map;
  }, [devices]);

  function selectShelf(id: string) {
    setSelection((current) => (current?.type === "shelf" && current.id === id ? null : { type: "shelf", id }));
  }

  function selectDevice(id: string) {
    setSelection((current) => (current?.type === "device" && current.id === id ? null : { type: "device", id }));
  }

  // Changing rack size after shelves are already placed could leave some
  // of them hanging past the new (smaller) height — rather than silently
  // dropping placements, block shrinking below whatever's already placed.
  function handleRackSizeChange(newSize: number) {
    const highestOccupiedU = placedShelves.reduce((max, p) => {
      const shelf = shelvesById.get(p.shelfId);
      const endU = shelf ? p.startU + shelf.uHeight - 1 : p.startU;
      return Math.max(max, endU);
    }, 0);
    if (newSize < highestOccupiedU) {
      setError(`Can't shrink to ${newSize}U — a placed shelf already occupies U${highestOccupiedU}. Remove it first.`);
      return;
    }
    setError(null);
    setRackSizeU(newSize);
  }

  function placeSelectedShelfAt(startU: number) {
    if (selection?.type !== "shelf") return;
    const shelf = shelvesById.get(selection.id);
    if (!shelf) return;
    if (!canPlaceAt(shelf, startU, rackSizeU, placedShelves, shelvesById)) return;

    setPlacedShelves((prev) => [...prev, { shelfId: selection.id, startU, placedDevices: [] }]);
    setSelection(null);
  }

  function removeShelfAt(startU: number) {
    setPlacedShelves((prev) => prev.filter((p) => p.startU !== startU));
  }

  // No fit check here yet — this is mechanical placement only, same as
  // shelf placement was before the width check existed. Depth/weight
  // capacity is real-time validation, still its own next piece.
  function placeSelectedDeviceOnShelf(startU: number) {
    if (selection?.type !== "device") return;
    const deviceId = selection.id;

    setPlacedShelves((prev) =>
      prev.map((p) => (p.startU === startU ? { ...p, placedDevices: [...p.placedDevices, { deviceId }] } : p))
    );
    setSelection(null);
  }

  function removeDeviceFromShelf(startU: number, deviceId: string) {
    setPlacedShelves((prev) =>
      prev.map((p) =>
        p.startU === startU
          ? { ...p, placedDevices: p.placedDevices.filter((pd) => pd.deviceId !== deviceId) }
          : p
      )
    );
  }

  // Rendered top-down (highest U first) to match how a physical rack
  // actually reads — U1 is the bottom of the rack, not the top.
  const rows = [];
  const consumedUs = new Set<number>();
  for (let u = rackSizeU; u >= 1; u--) {
    if (consumedUs.has(u)) continue;

    const placement = placedShelves.find((p) => p.startU === u);
    if (placement) {
      const shelf = shelvesById.get(placement.shelfId);
      const uHeight = shelf?.uHeight ?? 1;
      for (let i = 0; i < uHeight; i++) consumedUs.add(u + i);

      const deviceDropEligible = selection?.type === "device";
      const selectedDevice = deviceDropEligible ? devicesById.get(selection.id) : undefined;

      rows.push(
        <div
          key={`filled-${u}`}
          className={`rack-row rack-row--filled ${deviceDropEligible ? "rack-row--eligible" : ""}`}
          style={{ height: `${Math.max(uHeight * 2.5, 2.5 + placement.placedDevices.length * 1.4)}rem` }}
          onClick={deviceDropEligible ? () => placeSelectedDeviceOnShelf(u) : undefined}
          role={deviceDropEligible ? "button" : undefined}
          tabIndex={deviceDropEligible ? 0 : undefined}
        >
          <span className="rack-row-label">U{u}</span>
          <div className="rack-row-shelf">
            <div className="rack-row-shelf-header">
              <span className="rack-row-content">{shelf?.name ?? placement.shelfId}</span>
              <button
                type="button"
                className="rack-row-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeShelfAt(u);
                }}
                aria-label={`Remove ${shelf?.name ?? "shelf"} from U${u}`}
              >
                ×
              </button>
            </div>
            {placement.placedDevices.length > 0 && (
              <ul className="rack-row-devices">
                {placement.placedDevices.map((pd, i) => {
                  const device = devicesById.get(pd.deviceId);
                  return (
                    <li key={`${pd.deviceId}-${i}`}>
                      <span>{device?.name ?? pd.deviceId}</span>
                      <button
                        type="button"
                        className="rack-row-remove rack-row-remove--small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDeviceFromShelf(u, pd.deviceId);
                        }}
                        aria-label={`Remove ${device?.name ?? "device"} from ${shelf?.name ?? "shelf"}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {deviceDropEligible && <span className="rack-row-hint">Click to add {selectedDevice?.name}</span>}
          </div>
        </div>
      );
      continue;
    }

    const selectedShelf = selection?.type === "shelf" ? shelvesById.get(selection.id) : null;
    const eligible = selectedShelf ? canPlaceAt(selectedShelf, u, rackSizeU, placedShelves, shelvesById) : false;

    rows.push(
      <div
        key={`empty-${u}`}
        className={`rack-row rack-row--empty ${eligible ? "rack-row--eligible" : ""}`}
        onClick={eligible ? () => placeSelectedShelfAt(u) : undefined}
        role={eligible ? "button" : undefined}
        tabIndex={eligible ? 0 : undefined}
      >
        <span className="rack-row-label">U{u}</span>
        {eligible && <span className="rack-row-hint">Click to place {selectedShelf?.name}</span>}
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>Build a rack</h1>
        <p>Select a shelf, click an open slot to place it. Select a device, click a placed shelf to add it there.</p>
      </header>

      {error && <p className="state-message error">{error}</p>}

      <div className="rack-size-picker">
        <label htmlFor="rack-size">Rack size</label>
        <select id="rack-size" value={rackSizeU} onChange={(e) => handleRackSizeChange(Number(e.target.value))}>
          {RACK_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}U
            </option>
          ))}
        </select>
      </div>

      <div className="rack-elevation">{rows}</div>

      <section className="catalog-section" aria-labelledby="shelf-picker-heading">
        <h2 id="shelf-picker-heading">Shelves</h2>
        {!error && shelves === null && <p className="state-message">Loading shelves…</p>}
        {shelves !== null && shelves.length === 0 && <p className="state-message">No shelves in the catalog yet.</p>}
        {shelves !== null && shelves.length > 0 && (
          <ul className="shelf-picker">
            {shelves.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`shelf-picker-item ${selection?.type === "shelf" && selection.id === s.id ? "shelf-picker-item--selected" : ""}`}
                  onClick={() => selectShelf(s.id)}
                >
                  <span className="item-name">{s.name}</span>
                  <span className="shelf-picker-spec">
                    {s.widthMm}mm × {s.uHeight}U
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="catalog-section" aria-labelledby="device-picker-heading">
        <h2 id="device-picker-heading">Devices</h2>
        {!error && devices === null && <p className="state-message">Loading devices…</p>}
        {devices !== null && devices.filter((d) => !d.isKitItem).length === 0 && (
          <p className="state-message">No placeable devices in the catalog yet.</p>
        )}
        {devices !== null && devices.filter((d) => !d.isKitItem).length > 0 && (
          <ul className="shelf-picker">
            {devices
              .filter((d) => !d.isKitItem) // the leftfootLabs frame is informational-only, never placed
              .map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`shelf-picker-item ${selection?.type === "device" && selection.id === d.id ? "shelf-picker-item--selected" : ""}`}
                    onClick={() => selectDevice(d.id)}
                  >
                    <span className="item-name">{d.name}</span>
                    <span className="shelf-picker-spec">
                      {d.depthMm}mm deep · {d.weightKg}kg · {d.wattage}W
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}
