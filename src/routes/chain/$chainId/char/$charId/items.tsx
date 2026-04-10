import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { SupplementType, type ChainSupplement } from "@/chain/data/ChainSupplement";
import { useChain } from "@/chain/state/hooks";
import { CharacterSidebar } from "@/chain/components/CharacterSidebar";
import { ElectronChainNav } from "@/chain/components/ElectronChainNav";
import { TabList, type TabDef } from "@/ui/TabList";

export const Route = createFileRoute("/chain/$chainId/char/$charId/items")({
  component: ItemsLayout,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildItemsTabs(
  supplements: Record<string, ChainSupplement | undefined>,
  routeParams: { chainId: string; charId: string },
): TabDef[] {
  const base = routeParams;

  const tabs: TabDef[] = [
    {
      key: "items",
      label: "Item List",
      to: "/chain/$chainId/char/$charId/items/",
      params: base,
    },
  ];

  // One tab per item-capable supplement (Perk-only supplements have no item list).
  for (const [id, sup] of Object.entries(supplements)) {
    if (sup && sup.type === SupplementType.Item) {
      tabs.push({
        key: `supp/${id}`,
        label: sup.name,
        to: "/chain/$chainId/char/$charId/items/supp/$supplementId",
        params: { ...base, supplementId: id },
      });
    }
  }

  return tabs;
}

/** Extract the tab key from the current pathname, relative to char/$charId/items/.
 *  e.g. ".../items/"          → "items"
 *       ".../items/supp/3"   → "supp/3" */
function getActiveItemsTabKey(pathname: string, charId: string): string {
  const marker = `/char/${charId}/items/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "items";
  const suffix = pathname.slice(idx + marker.length).replace(/\/$/, "");
  return suffix === "" ? "items" : suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Items layout component
// ─────────────────────────────────────────────────────────────────────────────

function ItemsLayout() {
  const { chainId, charId } = Route.useParams();
  const chain = useChain();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const supplements = chain?.supplements.O ?? {};
  const tabs = buildItemsTabs(supplements, { chainId, charId });
  const activeTabKey = getActiveItemsTabKey(pathname, charId);

  return (
    <div className="flex h-full">
      <CharacterSidebar
        chain={chain}
        chainId={chainId}
        currentCharId={+charId}
        charLinkTo="/chain/$chainId/char/$charId/items/"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {import.meta.env.VITE_PLATFORM === "electron" && (
          <ElectronChainNav chainId={chainId} charId={charId} />
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
