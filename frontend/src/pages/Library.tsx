import { useEffect, useState } from "react";
import { fetchDevices, fetchShelves, type Device, type Shelf } from "../lib/api";

// Replaces DeviceLibrary.tsx's placeholder, which only ever proved the API
// round-tripped devices. This shows both shelves and devices — the real
// two-tier catalog someone building a layout actually browses, shelves
// first since that's the real build order (place a shelf, then place
// devices onto it).
export function Library() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchShelves(), fetchDevices()])
      .then(([shelfData, deviceData]) => {
        setShelves(shelfData);
        setDevices(deviceData);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <header className="page-header">
        <h1>Hardware catalog</h1>
        <p>
          Real measured shelves and devices. Every dimension shown is a
          real number, not an estimate — a blank capacity means it hasn't
          been measured yet, not that it's zero.
        </p>
      </header>

      {error && <p className="state-message error">Catalog failed to load: {error}</p>}

      <section className="catalog-section" aria-labelledby="shelves-heading">
        <h2 id="shelves-heading">Shelves</h2>
        <p className="section-note">
          The part that clips into a 10-inch rack's rails. Width is
          checked against the universal rack standard; max depth and max
          weight are this shelf's real capacity for whatever sits on it.
        </p>
        {!error && shelves === null && <p className="state-message">Loading shelves…</p>}
        {shelves !== null && shelves.length === 0 && (
          <p className="state-message">No shelves in the catalog yet.</p>
        )}
        {shelves !== null && shelves.length > 0 && (
          <table className="spec-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="numeric">Width (mm)</th>
                <th className="numeric">Max depth (mm)</th>
                <th className="numeric">U</th>
                <th className="numeric">Max weight (kg)</th>
              </tr>
            </thead>
            <tbody>
              {shelves.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="item-name">{s.name}</span>
                    {s.manufacturer && <span className="item-manufacturer">{s.manufacturer}</span>}
                  </td>
                  <td className="numeric">{s.widthMm}</td>
                  <td className="numeric">{s.maxDepthMm}</td>
                  <td className="numeric">{s.uHeight}</td>
                  <td className="numeric">
                    {s.maxWeightKg === null ? <span className="unmeasured">—</span> : s.maxWeightKg}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="catalog-section" aria-labelledby="devices-heading">
        <h2 id="devices-heading">Devices</h2>
        <p className="section-note">
          Placed on a shelf, not directly in the rack — each device's own
          depth and weight are what get checked against whichever shelf
          it's on.
        </p>
        {!error && devices === null && <p className="state-message">Loading devices…</p>}
        {devices !== null && devices.length === 0 && (
          <p className="state-message">No devices in the catalog yet.</p>
        )}
        {devices !== null && devices.length > 0 && (
          <table className="spec-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="numeric">U</th>
                <th className="numeric">Depth (mm)</th>
                <th className="numeric">Weight (kg)</th>
                <th className="numeric">Wattage (W)</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="item-name">
                      {d.name}
                      {d.isKitItem && <span className="kit-badge">kit</span>}
                    </span>
                    {d.manufacturer && <span className="item-manufacturer">{d.manufacturer}</span>}
                  </td>
                  <td className="numeric">{d.uHeight}</td>
                  <td className="numeric">{d.depthMm}</td>
                  <td className="numeric">{d.weightKg}</td>
                  <td className="numeric">{d.wattage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
