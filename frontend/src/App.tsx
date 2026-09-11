import { useState } from "react";
import { Library } from "./pages/Library";
import { RackBuilder } from "./pages/RackBuilder";

type View = "build" | "catalog";

export default function App() {
  const [view, setView] = useState<View>("build");

  return (
    <>
      <nav className="view-nav">
        <button type="button" className={view === "build" ? "active" : ""} onClick={() => setView("build")}>
          Build
        </button>
        <button type="button" className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
          Catalog
        </button>
      </nav>
      {view === "build" ? <RackBuilder /> : <Library />}
    </>
  );
}
