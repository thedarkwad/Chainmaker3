import { Link } from "@tanstack/react-router";

export type TabDef = {
  key: string;
  label: string;
  to: string;
  params: Record<string, string>;
  dimmed?: boolean;
};

/** Renders a horizontal tab bar where each tab is a Link route. */
export function TabList({ tabs, activeTabKey }: { tabs: TabDef[]; activeTabKey: string }) {
  return (
    <div className="max-w-5xl px-4 py-2 flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const isActive = activeTabKey === tab.key;
        return (
          <Link
            key={tab.key}
            to={tab.to as never}
            params={tab.params as never}
            className={`relative block px-3 py-1 rounded-md text-sm whitespace-nowrap transition-colors ${
              isActive
                ? "bg-accent2-tint text-accent2 border-accent2 border"
                : tab.dimmed
                ? "text-ghost opacity-50"
                : "text-muted hover:text-ink"
            }`}
          >
            {/* Hidden bold spacer — reserves bold-text width so tabs never shift on activation */}
            <span
              className="font-semibold opacity-0 select-none pointer-events-none"
              aria-hidden="true"
            >
              {tab.label}
            </span>
            {/* Visible label — absolutely positioned over the spacer */}
            <span
              className={`absolute inset-0 flex items-center justify-center ${isActive ? "font-semibold" : ""}`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
