import { useEffect, useState } from "react";
import { fetchDevices, type Device } from "../lib/api";

// Placeholder page — proves the frontend can round-trip the API before
// the actual rack elevation drag/place UI gets built on top of it.
export function DeviceLibrary() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices()
      .then(setDevices)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p>Error loading devices: {error}</p>;

  return (
    <div>
      <h1>Device Library</h1>
      <ul>
        {devices.map((d) => (
          <li key={d.id}>
            {d.name} — {d.u_height}U, {d.wattage}W
            {d.is_kit_item ? " (leftfootLabs kit)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
