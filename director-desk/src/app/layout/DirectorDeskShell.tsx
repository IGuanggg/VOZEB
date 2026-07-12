import { useState, type ReactNode } from "react";
import { PanelLeft, SlidersHorizontal } from "lucide-react";
import { ObjectTreePanel } from "../../editor/panels/ObjectTreePanel";
import { RightPanel } from "../../editor/panels/RightPanel";
import { useDirectorStore } from "../../editor/store/directorStore";

export function DirectorDeskShell({ children }: { children: ReactNode }) {
  const viewportPanelsCollapsed = useDirectorStore((state) => state.viewportPanelsCollapsed);
  const [mobilePanel, setMobilePanel] = useState<"scene" | "properties" | null>(null);

  return (
    <div
      className={`director-shell director-shell-fullbleed${viewportPanelsCollapsed ? " is-sidebars-collapsed" : ""}`}
    >
      <section className="viewport-column" aria-label="3D视口">
        {children}
      </section>
      <div className="mobile-panel-switcher" role="group" aria-label="移动端面板">
        <button
          type="button"
          className={mobilePanel === "scene" ? "is-active" : undefined}
          aria-label="场景对象"
          aria-pressed={mobilePanel === "scene"}
          onClick={() => setMobilePanel((current) => (current === "scene" ? null : "scene"))}
        >
          <PanelLeft size={18} />
        </button>
        <button
          type="button"
          className={mobilePanel === "properties" ? "is-active" : undefined}
          aria-label="对象属性"
          aria-pressed={mobilePanel === "properties"}
          onClick={() => setMobilePanel((current) => (current === "properties" ? null : "properties"))}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      {mobilePanel ? <button type="button" className="mobile-panel-backdrop" aria-label="关闭移动端面板" onClick={() => setMobilePanel(null)} /> : null}
      <aside
        className={`left-sidebar director-sidebar${mobilePanel === "scene" ? " is-mobile-open" : ""}`}
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label="场景"
      >
        <ObjectTreePanel />
      </aside>
      <aside
        className={`right-sidebar director-sidebar${mobilePanel === "properties" ? " is-mobile-open" : ""}`}
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label="属性"
      >
        <RightPanel />
      </aside>
    </div>
  );
}
