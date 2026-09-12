import { useEffect, useMemo, useState } from "react";
import {
  createLayout,
  fetchDevices,
  fetchRackProfile,
  fetchShelves,
  LayoutValidationError,
  type Device,
  type PlacedShelf,
  type RackProfile,
  type Shelf,
  type ValidationResult,
} from "../lib/api";
import { canPlaceAt } from "../lib/placement";
import { validateLayoutClient } from "../lib/validate";

const RACK_SIZE_OPTIONS = [5, 8, 10] as const;

// A single selection slot rather than two separate "selectedShelfId" /
// "selectedDeviceId" states — picking a device always means "I'm about to
// place this on a shelf," and picking a shelf always means "I'm about to
// place this in an open rack slot." The two are mutually exclusive by
// construction this way, instead of by remembering to clear the other
// state by hand at every selection site.
type Selection = { type: "shelf"; id: string } | { type: "device"; id: string } | null;

// The real outcome of a save attempt, not just a boolean — "saved" needs
// the real link, and "rejected" needs the real server-side errors, which
// are worth showing distinctly from the live client pre-check above them.
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; id: string }
  | { status: "rejected"; validation: ValidationResult }
  | { status: "error"; message: string };

export function RackBuilder() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [rackProfile, setRackProfile] = useState<RackProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rackSizeU, setRackSizeU] = useState<number>(5);
  const [placedShelves, setPlacedShelves] = useState<PlacedShelf[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [layoutName, setLayoutName] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    Promise.all([fetchShelves(), fetchDevices(), fetchRackProfile()])
      .then(([shelfData, deviceData, rackProfileData]) => {
        setShelves(shelfData);
        setDevices(deviceData);
        setRackProfile(rackProfileData);
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

  // Real-time pre-check — recomputed on every placement change, using the
  // exact same function the backend's own validateLayout is faithfully
  // ported from (see lib/validate.ts). This is UX only: the server is
  // still the final authority at save time, and Save & Share (still to
  // come) has to handle a real 422 from the server regardless of what
  // this says, since the two could theoretically drift.
  const validation = useMemo(() => {
    if (!rackProfile) return null;
    return validateLayoutClient(rackSizeU, placedShelves, shelvesById, devicesById, rackProfile);
  }, [rackSizeU, placedShelves, shelvesById, devicesById, rackProfile]);

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

  // Attempting the save is not gated on the live client pre-check passing
  // — that check is UX guidance, the server's real response is what
  // actually decides, per the explicit "server as final authority" call.
  // Someone can click Save & Share with visible issues still showing and
  // find out for real what the server thinks, rather than being blocked
  // by a client-side guess.
  async function handleSave() {
    setSaveState({ status: "saving" });
    try {
      const { id } = await createLayout(layoutName || "Untitled layout", rackSizeU, placedShelves);
      setSaveState({ status: "saved", id });
    } catch (err) {
      if (err instanceof LayoutValidationError) {
        setSaveState({ status: "rejected", validation: err.validation });
      } else {
        setSaveState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    }
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

      {validation && !validation.valid && (
        <div className="validation-panel" role="alert">
          <h2 className="validation-panel-heading">Issues ({validation.errors.length})</h2>
          <ul>
            {validation.errors.map((e, i) => (
              <li key={i} className={`validation-item validation-item--${e.kind}`}>
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="save-share">
        <input
          type="text"
          className="layout-name-input"
          placeholder="Name this layout"
          value={layoutName}
          onChange={(e) => setLayoutName(e.target.value)}
        />
        <button type="button" className="save-button" onClick={handleSave} disabled={saveState.status === "saving"}>
          {saveState.status === "saving" ? "Saving…" : "Save & Share"}
        </button>
      </div>

      {saveState.status === "saved" && (
        <p className="state-message save-success">
          Saved. Share this link: <code>{`${window.location.origin}${window.location.pathname}?layout=${saveState.id}`}</code>
        </p>
      )}

      {saveState.status === "rejected" && (
        <div className="validation-panel" role="alert">
          <h2 className="validation-panel-heading">
            The server rejected this save ({saveState.validation.errors.length} issue
            {saveState.validation.errors.length === 1 ? "" : "s"})
          </h2>
          <ul>
            {saveState.validation.errors.map((e, i) => (
              <li key={i} className={`validation-item validation-item--${e.kind}`}>
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {saveState.status === "error" && <p className="state-message error">Save failed: {saveState.message}</p>}

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
