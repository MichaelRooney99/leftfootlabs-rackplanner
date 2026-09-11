import { Router } from "express";
import { getAllApprovedShelves, getShelf } from "../db/shelves.js";

export const shelvesRouter = Router();

// Same shape as devicesRouter — both routes return the shared Shelf type
// (camelCase) via db/shelves.ts's mapping, no raw row ever leaves the
// data-access layer.
shelvesRouter.get("/", (_req, res) => {
  res.json(getAllApprovedShelves());
});

shelvesRouter.get("/:id", (req, res) => {
  const shelf = getShelf(req.params.id);
  if (!shelf) {
    res.status(404).json({ error: "Shelf not found" });
    return;
  }
  res.json(shelf);
});
