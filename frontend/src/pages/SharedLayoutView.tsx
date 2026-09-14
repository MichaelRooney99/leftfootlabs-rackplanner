import { useEffect, useMemo, useState } from "react";
import { fetchDevices, fetchKeystones, fetchLayout, fetchShelves, type Device, type Keystone, type Layout, type Shelf } from "../lib/api";

// Deliberately read-only, not a second copy of RackBuilder's interactive
// state — layouts have no update endpoint (POST creates, GET reads,
// that's the whole API), so a saved layout is a real immutable snapshot.
// Rendering it as editable would imply a save-over-the-original that the
// backend doesn't actually support.
export function SharedLayoutView({ layoutId }: { layoutId: string }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [keystones, setKeystones] = useState<Keystone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchLayout(layoutId), fetchShelves(), fetchDevices(), fetchKeystones()])
      .then(([layoutData, shelfData, deviceData, keystoneData]) => {
        setLayout(layoutData);
        setShelves(shelfData);
        setDevices(deviceData);
        setKeystones(keystoneData);
      })
      .catch((err) => setError(err.message));
  }, [layoutId]);

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

  if (error) {
    return (
      <>
        <header className="page-header">
          <h1>Shared layout</h1>
        </header>
        <p className="state-message error">{error}</p>
      </>
    );
  }

  if (!layout || shelves === null || devices === null || keystones === null) {
    return <p className="state-message">Loading shared layout…</p>;
  }

  const rows = [];
  const consumedUs = new Set<number>();
  for (let u = layout.rackSizeU; u >= 1; u--) {
    if (consumedUs.has(u)) continue;

    const placement = layout.placedShelves.find((p) => p.startU === u);
    if (!placement) {
      rows.push(
        <div key={`empty-${u}`} className="rack-row rack-row--empty">
          <span className="rack-row-label">U{u}</span>
        </div>
      );
      continue;
    }

    const shelf = shelvesById.get(placement.shelfId);
    const uHeight = shelf?.uHeight ?? 1;
    for (let i = 0; i < uHeight; i++) consumedUs.add(u + i);

    const placedItems = [
      ...placement.placedDevices.map((pd) => ({
        id: pd.deviceId,
        name: devicesById.get(pd.deviceId)?.name ?? pd.deviceId,
        xPositionMm: pd.xPositionMm,
      })),
      ...(placement.placedKeystones ?? []).map((pk) => ({
        id: pk.keystoneId,
        name: keystonesById.get(pk.keystoneId)?.name ?? pk.keystoneId,
        xPositionMm: pk.xPositionMm,
      })),
    ];

    rows.push(
      <div key={`filled-${u}`} className="rack-row rack-row--filled" style={{ height: `${Math.max(uHeight * 2.5, 2.5 + placedItems.length * 1.4)}rem` }}>
        <span className="rack-row-label">U{u}</span>
        <div className="rack-row-shelf">
          <span className="rack-row-content">{shelf?.name ?? placement.shelfId}</span>
          {placedItems.length > 0 && (
            <ul className="rack-row-devices">
              {placedItems.map((item, i) => (
                <li key={`${item.id}-${i}`}>
                  <span>
                    {item.name}
                    {item.xPositionMm !== undefined && (
                      <span className="shelf-face-position"> @ {item.xPositionMm}mm</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>{layout.name}</h1>
        <p>
          {layout.rackSizeU}U rack, saved {new Date(layout.createdAt).toLocaleDateString()}. This is a
          read-only view of a saved layout — building your own starts fresh from the Build tab.
        </p>
      </header>
      <div className="rack-elevation">{rows}</div>
    </>
  );
}
