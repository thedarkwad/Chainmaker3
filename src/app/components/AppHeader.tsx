/**
 * AppHeader — shared top bar for Chain and JumpDoc editors.
 *
 * Renders:
 *   - Left: brand title (fixed width matching the sidebar on md+)
 *   - Center: `nav` slot — route-specific navigation buttons
 *   - Right: `actions` slot (optional save/export/etc.) + SettingsDropdown
 *
 * The `navButtonClass` helper is exported so layouts can style their
 * nav links consistently.
 */

import type { ReactNode } from "react";
import { SettingsDropdown } from "@/app/components/SettingsDropdown";
import type { LocalSettings } from "@/app/state/localSettings";
import { Link } from "@tanstack/react-router";

type AppHeaderProps = {
  /** Center navigation — typically a row of Link / span buttons. */
  nav: ReactNode;
  /** Optional right-side actions rendered before the settings gear. */
  actions?: ReactNode;
  transparent?: boolean;
  settings: LocalSettings;
  onUpdateSettings: (patch: Partial<LocalSettings>) => void;
};

export function AppHeader({
  nav,
  actions,
  settings,
  onUpdateSettings,
  transparent,
}: AppHeaderProps) {
  if (import.meta.env.VITE_PLATFORM === "electron") return null;
  return (
    <header
      className={`shrink-0 flex flex-col sm:flex-row sm:h-11 sm:items-center ${transparent ? "text-ink/90" : "bg-accent/60 text-white"} z-30`}
    >
      <div className="flex items-center h-11 sm:contents">
        <Link
          className={`shrink-0 ${transparent ? "" : "md:bg-accent/80 md:border-r border-r-accent"} h-11 flex items-center px-3 md:w-70 md:justify-center`}
          to={"/portal"}
        >
          <span
            className="inline text-xl md:text-2xl select-none whitespace-nowrap"
            style={{ fontFamily: "Roboto Slab, Sans Serif" }}
          >
            ChainMaker
          </span>
        </Link>

        <div className="ml-auto sm:ml-0 sm:order-last shrink-0 flex items-center gap-1 px-2 md:px-4">
          {actions}
          <SettingsDropdown settings={settings} onUpdate={onUpdateSettings} />
        </div>
      </div>

      {/* Row 2 on mobile (nav); center slot on sm+ */}
      <div className={`flex-1 min-w-0 flex items-center justify-center ${transparent || "sm:justify-start"} h-9 sm:h-auto gap-0.5 md:gap-1 md:px-2 overflow-x-auto`}>
        {nav}
      </div>
    </header>
  );
}

/** Returns the Tailwind class string for a header nav button. */
export function navButtonClass(active: boolean, small: boolean = false): string {
  return `shrink-0 whitespace-nowrap ${small ? "px-2" : "px-2 md:px-3"} py-1 rounded text-sm transition-colors ${
    active
      ? "bg-ink/20 font-semibold"
      : "opacity-90 hover:bg-ink/15 hover:opacity-full"
  }`;
}
