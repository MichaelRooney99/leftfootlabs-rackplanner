import { useState } from "react";
import { Library } from "./pages/Library";
import { RackBuilder } from "./pages/RackBuilder";
import { SharedLayoutView } from "./pages/SharedLayoutView";

type View = "build" | "catalog" | "shared";

// A shared-layout link is just ?layout=<id> — read once on load to pick
// the initial view, not a real router. Switching to Build/Catalog after
// landing on a shared link just changes local state; it doesn't need to
// touch the URL, since there's nothing else in this app the URL needs to
// address yet.
function sharedLayoutIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("layout");
}

export default function App() {
  const [sharedId] = useState<string | null>(sharedLayoutIdFromUrl);
  const [view, setView] = useState<View>(sharedId ? "shared" : "build");

  return (
    <>
      <nav className="view-nav">
        <button type="button" className={view === "build" ? "active" : ""} onClick={() => setView("build")}>
          Build
        </button>
        <button type="button" className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
          Catalog
        </button>
        {sharedId && (
          <button type="button" className={view === "shared" ? "active" : ""} onClick={() => setView("shared")}>
            Shared layout
          </button>
        )}
      </nav>
      {view === "build" && <RackBuilder />}
      {view === "catalog" && <Library />}
      {view === "shared" && sharedId && <SharedLayoutView layoutId={sharedId} />}
    </>
  );
}
