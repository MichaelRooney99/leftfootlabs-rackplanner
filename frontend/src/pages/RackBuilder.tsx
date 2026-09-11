import { useEffect, useMemo, useState } from "react";
import { fetchShelves, type PlacedShelf, type Shelf } from "../lib/api";
import { canPlaceAt } from "../lib/placement";

const RACK_SIZE_OPTIONS = [5, 8, 10] as const;

export function RackBuilder() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rackSizeU, setRackSizeU] = useState<number>(5);
  const [placedShelves, setPlacedShelves] = useState<PlacedShelf[]>([]);
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);

  useEffect(() => {
    fetchShelves()
      .then(setShelves)
      .catch((err) => setError(err.message));
  }, []);

  const shelvesById = useMemo(() => {
    const map = new Map<string, Shelf>();
    for (const s of shelves ?? []) map.set(s.id, s);
    return map;
  }, [shelves]);

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
    if (!selectedShelfId) return;
    const shelf = shelvesById.get(selectedShelfId);
    if (!shelf) return;
    if (!canPlaceAt(shelf, startU, rackSizeU, placedShelves, shelvesById)) return;

    setPlacedShelves((prev) => [...prev, { shelfId: selectedShelfId, startU, placedDevices: [] }]);
    setSelectedShelfId(null);
  }

  function removeShelfAt(startU: number) {
    setPlacedShelves((prev) => prev.filter((p) => p.startU !== startU));
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
      rows.push(
        <div key={`filled-${u}`} className="rack-row rack-row--filled" style={{ height: `${uHeight * 2.5}rem` }}>
          <span className="rack-row-label">U{u}</span>
          <span className="rack-row-content">{shelf?.name ?? placement.shelfId}</span>
          <button type="button" className="rack-row-remove" onClick={() => removeShelfAt(u)} aria-label={`Remove ${shelf?.name ?? "shelf"} from U${u}`}>
            ×
          </button>
        </div>
      );
      continue;
    }

    const selectedShelf = selectedShelfId ? shelvesById.get(selectedShelfId) : null;
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
        <p>Select a shelf below, then click an open slot in the rack to place it.</p>
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
                  className={`shelf-picker-item ${selectedShelfId === s.id ? "shelf-picker-item--selected" : ""}`}
                  onClick={() => setSelectedShelfId((current) => (current === s.id ? null : s.id))}
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
    </>
  );
}
