import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { CollapsibleSidebar } from "@/ui/CollapsibleSidebar";
import { TabList, type TabDef } from "@/ui/TabList";
import { SupplementConfigSidebar } from "./config/supp";
import { ElectronChainNav } from "@/chain/components/ElectronChainNav";

export const Route = createFileRoute("/chain/$chainId/config")({
  component: ChainConfigLayout,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTabs(chainId: string): TabDef[] {
  return [
    {
      key: "settings",
      label: "Chain Settings",
      to: "/chain/$chainId/config/",
      params: { chainId },
    },
    {
      key: "supp",
      label: "Supplements",
      to: "/chain/$chainId/config/supp",
      params: { chainId },
    },
    {
      key: "drawbacks",
      label: "Chain Drawbacks",
      to: "/chain/$chainId/config/drawbacks",
      params: { chainId },
    },
    {
      key: "notes",
      label: "Notes & House Rules",
      to: "/chain/$chainId/config/notes",
      params: { chainId },
    },
  ];
}

function getActiveTabKey(pathname: string, chainId: string): string {
  const marker = `/chain/${chainId}/config/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "settings";
  const suffix = pathname.slice(idx + marker.length).replace(/\/$/, "");
  return suffix === "" ? "settings" : suffix.split("/")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function ChainConfigLayout() {
  const { chainId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = buildTabs(chainId);
  const activeTabKey = getActiveTabKey(pathname, chainId);

  return (
    <div className="flex h-full">
      {/* Sidebar — supplement list when on supp tab, collapsible on small screens */}
      {activeTabKey === "supp" ? (
        <CollapsibleSidebar label="Supplements" breakpoint="lg">
          <SupplementConfigSidebar chainId={chainId} />
        </CollapsibleSidebar>
      ) : (
        <div className="hidden lg:block lg:w-70 lg:shrink-0" />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {import.meta.env.VITE_PLATFORM === "electron" && (
          <ElectronChainNav chainId={chainId} />
        )}
        {/* Tab bar */}
        <div className="shrink-0">
          <TabList tabs={tabs} activeTabKey={activeTabKey} />
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-5xl px-4">
            <Outlet />
            <div className="h-20 w-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
