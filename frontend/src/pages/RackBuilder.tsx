import { useEffect, useMemo, useState } from "react";
import {
  createLayout,
  fetchDevices,
  fetchKeystones,
  fetchRackProfile,
  fetchShelves,
  LayoutValidationError,
  type Device,
  type Keystone,
  type PlacedShelf,
  type RackProfile,
  type Shelf,
  type ValidationResult,
} from "../lib/api";
import { canPlaceAt } from "../lib/placement";
import { canPlaceHorizontally, snapToGrid } from "../lib/horizontalPlacement";
import { validateLayoutClient } from "../lib/validate";

const RACK_SIZE_OPTIONS = [5, 8, 10] as const;
const HORIZONTAL_GRID_MM = 2;
const PX_PER_MM = 2; // real to-scale rendering: 1mm = 2px

// Now only tracks shelf selection for vertical rack placement — device
// and keystone placement onto a shelf's face is real drag-and-drop now,
// not click-then-click, so there's no "selected device" state left to
// track here.
type Selection = { type: "shelf"; id: string } | null;

// What's actually being dragged, read out of the native HTML5 drag
// event's dataTransfer payload — real browser drag-and-drop, not a
// library, per the same "don't reach for a dependency before it's
// justified" call already made for the main rack elevation.
type DragPayload = { kind: "device" | "keystone"; id: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; id: string }
  | { status: "rejected"; validation: ValidationResult }
  | { status: "error"; message: string };

export function RackBuilder() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [keystones, setKeystones] = useState<Keystone[] | null>(null);
  const [rackProfile, setRackProfile] = useState<RackProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rackSizeU, setRackSizeU] = useState<number>(5);
  const [placedShelves, setPlacedShelves] = useState<PlacedShelf[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [layoutName, setLayoutName] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    Promise.all([fetchShelves(), fetchDevices(), fetchKeystones(), fetchRackProfile()])
      .then(([shelfData, deviceData, keystoneData, rackProfileData]) => {
        setShelves(shelfData);
        setDevices(deviceData);
        setKeystones(keystoneData);
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

  const keystonesById = useMemo(() => {
    const map = new Map<string, Keystone>();
    for (const k of keystones ?? []) map.set(k.id, k);
    return map;
  }, [keystones]);

  const validation = useMemo(() => {
    if (!rackProfile) return null;
    return validateLayoutClient(rackSizeU, placedShelves, shelvesById, devicesById, keystonesById, rackProfile);
  }, [rackSizeU, placedShelves, shelvesById, devicesById, keystonesById, rackProfile]);

  function selectShelf(id: string) {
    setSelection((current) => (current?.type === "shelf" && current.id === id ? null : { type: "shelf", id }));
  }

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

    setPlacedShelves((prev) => [...prev, { shelfId: selection.id, startU, placedDevices: [], placedKeystones: [] }]);
    setSelection(null);
  }

  function removeShelfAt(startU: number) {
    setPlacedShelves((prev) => prev.filter((p) => p.startU !== startU));
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

  function removeKeystoneFromShelf(startU: number, keystoneId: string) {
    setPlacedShelves((prev) =>
      prev.map((p) =>
        p.startU === startU
          ? { ...p, placedKeystones: (p.placedKeystones ?? []).filter((pk) => pk.keystoneId !== keystoneId) }
          : p
      )
    );
  }

  // Real drop handler for horizontal placement — reads what's being
  // dragged from the native dataTransfer payload, converts the drop's
  // pixel position into a real mm position relative to the face bar's
  // own bounding rect, snaps to the real 2mm grid, and runs the
  // mechanical overlap guard before accepting it. No fit/spacing
  // validation here — that's a separate, later check, same relationship
  // the vertical placement guard had to the width/depth/weight checks
  // before those existed.
  function handleDrop(e: React.DragEvent<HTMLDivElement>, startU: number, faceWidthMm: number) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    const payload: DragPayload = JSON.parse(raw);

    const rect = e.currentTarget.getBoundingClientRect();
    const dropXPx = e.clientX - rect.left;
    const rawMm = dropXPx / PX_PER_MM;
    const xPositionMm = snapToGrid(rawMm, HORIZONTAL_GRID_MM);
    if (xPositionMm > faceWidthMm) return; // dropped past the rendered face entirely

    const placement = placedShelves.find((p) => p.startU === startU);
    if (!placement) return;

    const existingItems = [
      ...placement.placedDevices.map((pd) => {
        const d = devicesById.get(pd.deviceId);
        return { xPositionMm: pd.xPositionMm ?? 0, widthMm: d?.widthMm ?? null };
      }),
      ...(placement.placedKeystones ?? []).map((pk) => {
        const k = keystonesById.get(pk.keystoneId);
        return { xPositionMm: pk.xPositionMm, widthMm: k?.widthMm ?? null };
      }),
    ];

    if (payload.kind === "device") {
      const device = devicesById.get(payload.id);
      if (!canPlaceHorizontally(device?.widthMm ?? null, xPositionMm, existingItems)) return;
      setPlacedShelves((prev) =>
        prev.map((p) =>
          p.startU === startU
            ? { ...p, placedDevices: [...p.placedDevices, { deviceId: payload.id, xPositionMm }] }
            : p
        )
      );
    } else {
      const keystone = keystonesById.get(payload.id);
      if (!canPlaceHorizontally(keystone?.widthMm ?? null, xPositionMm, existingItems)) return;
      setPlacedShelves((prev) =>
        prev.map((p) =>
          p.startU === startU
            ? { ...p, placedKeystones: [...(p.placedKeystones ?? []), { keystoneId: payload.id, xPositionMm }] }
            : p
        )
      );
    }
  }

  function handleDragStart(e: React.DragEvent, kind: "device" | "keystone", id: string) {
    const payload: DragPayload = { kind, id };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }

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

      // Real to-scale rendering when usableWidthMm is measured (only
      // one of the seven real seeded shelves has this so far); shelf.
      // widthMm — always known, rack-compliant — is used as an honest
      // approximate stand-in otherwise, clearly labeled as such rather
      // than silently treated as if it were the real usable figure.
      const faceWidthMm = shelf?.usableWidthMm ?? shelf?.widthMm ?? 254;
      const isApproximate = !shelf?.usableWidthMm;
      const faceWidthPx = faceWidthMm * PX_PER_MM;

      const placedItems = [
        ...placement.placedDevices.map((pd) => ({
          kind: "device" as const,
          id: pd.deviceId,
          xPositionMm: pd.xPositionMm ?? 0,
          name: devicesById.get(pd.deviceId)?.name ?? pd.deviceId,
          widthMm: devicesById.get(pd.deviceId)?.widthMm ?? null,
        })),
        ...(placement.placedKeystones ?? []).map((pk) => ({
          kind: "keystone" as const,
          id: pk.keystoneId,
          xPositionMm: pk.xPositionMm,
          name: keystonesById.get(pk.keystoneId)?.name ?? pk.keystoneId,
          widthMm: keystonesById.get(pk.keystoneId)?.widthMm ?? null,
        })),
      ];

      rows.push(
        <div key={`filled-${u}`} className="rack-row rack-row--filled">
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

            <div
              className="shelf-face-bar"
              style={{ width: `${faceWidthPx}px` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, u, faceWidthMm)}
            >
              {placedItems.map((item) => (
                <div
                  key={`${item.kind}-${item.id}-${item.xPositionMm}`}
                  className={`shelf-face-item shelf-face-item--${item.kind}`}
                  style={{
                    left: `${item.xPositionMm * PX_PER_MM}px`,
                    width: item.widthMm ? `${item.widthMm * PX_PER_MM}px` : "12px",
                  }}
                  title={`${item.name} @ ${item.xPositionMm}mm`}
                />
              ))}
            </div>
            {isApproximate && (
              <span className="shelf-face-note">
                Approximate — real usable width not yet measured for this shelf.
              </span>
            )}

            {placedItems.length > 0 && (
              <ul className="rack-row-devices">
                {placedItems.map((item) => (
                  <li key={`list-${item.kind}-${item.id}-${item.xPositionMm}`}>
                    <span>
                      {item.name} <span className="shelf-face-position">@ {item.xPositionMm}mm</span>
                    </span>
                    <button
                      type="button"
                      className="rack-row-remove rack-row-remove--small"
                      onClick={() =>
                        item.kind === "device" ? removeDeviceFromShelf(u, item.id) : removeKeystoneFromShelf(u, item.id)
                      }
                      aria-label={`Remove ${item.name} from ${shelf?.name ?? "shelf"}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
        <p>Select a shelf, click an open slot to place it. Drag a device or keystone onto a placed shelf's face.</p>
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
        <h2 id="shelf-picker-heading">Shelf</h2>
        <p className="section-note">
          Every real 10-inch shelf converges on ~254mm width, so building here uses the one standardized shelf —
          browse the full real catalog on the Catalog tab.
        </p>
        {!error && shelves === null && <p className="state-message">Loading shelf…</p>}
        {shelves !== null && shelves.filter((s) => s.isStandard).length === 0 && (
          <p className="state-message">No standardized shelf flagged in the catalog yet.</p>
        )}
        {shelves !== null && shelves.filter((s) => s.isStandard).length > 0 && (
          <ul className="shelf-picker">
            {shelves
              .filter((s) => s.isStandard)
              .map((s) => (
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
        <p className="section-note">Drag a device onto a placed shelf's face to position it.</p>
        {!error && devices === null && <p className="state-message">Loading devices…</p>}
        {devices !== null && devices.filter((d) => !d.isKitItem).length === 0 && (
          <p className="state-message">No placeable devices in the catalog yet.</p>
        )}
        {devices !== null && devices.filter((d) => !d.isKitItem).length > 0 && (
          <ul className="shelf-picker">
            {devices
              .filter((d) => !d.isKitItem)
              .map((d) => (
                <li key={d.id}>
                  <div
                    className="shelf-picker-item shelf-picker-item--draggable"
                    draggable
                    role="button"
                    tabIndex={0}
                    onDragStart={(e) => handleDragStart(e, "device", d.id)}
                  >
                    <span className="item-name">{d.name}</span>
                    <span className="shelf-picker-spec">
                      {d.widthMm ? `${d.widthMm}mm wide` : "width unmeasured"} · {d.depthMm}mm deep · {d.weightKg}kg ·{" "}
                      {d.wattage}W
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="catalog-section" aria-labelledby="keystone-picker-heading">
        <h2 id="keystone-picker-heading">Keystones</h2>
        <p className="section-note">Drag a keystone onto a placed shelf's face to position it.</p>
        {!error && keystones === null && <p className="state-message">Loading keystones…</p>}
        {keystones !== null && keystones.length === 0 && (
          <p className="state-message">No keystones in the catalog yet.</p>
        )}
        {keystones !== null && keystones.length > 0 && (
          <ul className="shelf-picker">
            {keystones.map((k) => (
              <li key={k.id}>
                <div
                  className="shelf-picker-item shelf-picker-item--draggable"
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={(e) => handleDragStart(e, "keystone", k.id)}
                >
                  <span className="item-name">{k.name}</span>
                  <span className="shelf-picker-spec">
                    {k.widthMm}mm × {k.heightMm}mm
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
