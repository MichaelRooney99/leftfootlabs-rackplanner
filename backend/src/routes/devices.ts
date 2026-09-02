import { Router } from "express";
import { getAllApprovedDevices, getDevice } from "../db/devices.js";

export const devicesRouter = Router();

// Both routes now return the shared Device shape (camelCase) via the
// db/devices.ts mapping — previously these handlers shipped raw SQLite
// rows (snake_case) straight to the client, which is what forced
// frontend/src/lib/api.ts to hand-declare its own separate snake_case
// Device interface. The wire format now matches the shared type, so no
// client-side mapping step is needed at all.
devicesRouter.get("/", (_req, res) => {
  res.json(getAllApprovedDevices());
});

devicesRouter.get("/:id", (req, res) => {
  const device = getDevice(req.params.id);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(device);
});
