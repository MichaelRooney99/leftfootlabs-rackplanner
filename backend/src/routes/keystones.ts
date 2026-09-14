import { Router } from "express";
import { getAllKeystones, getKeystone } from "../db/keystones.js";

export const keystonesRouter = Router();

// Added in the same pass as the data-access layer this time, not
// discovered missing later the way routes/shelves.ts was — the whole
// point of that earlier gap was to not repeat it here.
keystonesRouter.get("/", (_req, res) => {
  res.json(getAllKeystones());
});

keystonesRouter.get("/:id", (req, res) => {
  const keystone = getKeystone(req.params.id);
  if (!keystone) {
    res.status(404).json({ error: "Keystone not found" });
    return;
  }
  res.json(keystone);
});
