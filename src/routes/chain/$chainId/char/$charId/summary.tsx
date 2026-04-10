import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { SupplementType, type ChainSupplement } from "@/chain/data/ChainSupplement";
import { useChain, useCharacter, useChainSettingsConfig } from "@/chain/state/hooks";
import { CharacterSidebar } from "@/chain/components/CharacterSidebar";
import { ElectronChainNav } from "@/chain/components/ElectronChainNav";
import { TabList, type TabDef } from "@/ui/TabList";
import { createId, type GID } from "@/chain/data/types";

export const Route = createFileRoute("/chain/$chainId/char/$charId/summary")({
  component: SummaryLayout,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSummaryTabs(
  supplements: Record<string, ChainSupplement | undefined>,
  routeParams: { chainId: string; charId: string },
  altFormsEnabled: boolean,
  narrativesVisible: boolean,
): TabDef[] {
  const base = routeParams;

  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Background",
      to: "/chain/$chainId/char/$charId/summary/",
      params: base,
    },
    {
      key: "perks",
      label: "Perk List",
      to: "/chain/$chainId/char/$charId/summary/perks",
      params: base,
    },
    ...(altFormsEnabled
      ? [
          {
            key: "altforms",
            label: "Alt-Forms",
            to: "/chain/$chainId/char/$charId/summary/altforms" as const,
            params: base,
          },
        ]
      : []),
  ];

  // One tab per perk-capable supplement (Item-type supplements have no perk list).
  for (const [id, sup] of Object.entries(supplements)) {
    if (sup && sup.type !== SupplementType.Item) {
      tabs.push({
        key: `supp/${id}`,
        label: sup.name,
        to: "/chain/$chainId/char/$charId/summary/supp/$supplementId",
        params: { ...base, supplementId: id },
      });
    }
  }

  if (narrativesVisible) {
    tabs.push({
      key: "narratives",
      label: "Narrative Summary",
      to: "/chain/$chainId/char/$charId/summary/narratives",
      params: base,
    });
  }

  return tabs;
}

/** Extract the tab key from the current pathname, relative to char/$charId/summary/.
 *  e.g. ".../summary/perks"    → "perks"
 *       ".../summary/"          → "overview"
 *       ".../summary/supp/3"   → "supp/3" */
function getActiveSummaryTabKey(pathname: string, charId: string): string {
  const marker = `/char/${charId}/summary/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "overview";
  const suffix = pathname.slice(idx + marker.length).replace(/\/$/, "");
  return suffix === "" ? "overview" : suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary layout component
// ─────────────────────────────────────────────────────────────────────────────

function SummaryLayout() {
  const { chainId, charId } = Route.useParams();
  const chain = useChain();
  const { settings } = useChainSettingsConfig();
  const { char } = useCharacter(createId<GID.Character>(+charId));
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const narratives = settings?.narratives ?? "enabled";
  const isPrimary = char?.primary ?? false;
  const narrativesVisible =
    narratives === "disabled" ? false :
    narratives === "restricted" ? isPrimary :
    true;

  const supplements = chain?.supplements.O ?? {};
  const tabs = buildSummaryTabs(
    supplements,
    { chainId, charId },
    settings?.altForms ?? true,
    narrativesVisible,
  );
  const activeTabKey = getActiveSummaryTabKey(pathname, charId);

  return (
    <div className="flex h-full">
      <CharacterSidebar
        chain={chain}
        chainId={chainId}
        currentCharId={+charId}
        charLinkTo="/chain/$chainId/char/$charId/summary/"
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
