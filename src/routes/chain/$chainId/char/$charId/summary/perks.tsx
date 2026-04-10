import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { SupplementType } from "@/chain/data/ChainSupplement";
import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import {
  useChain,
  useChainSupplements,
  useCharacterRegularPerkIds,
  usePurchaseCategories,
} from "@/chain/state/hooks";
import { SearchPage, type SupplementSource } from "@/chain/components/SearchPage";

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/chain/$chainId/char/$charId/summary/perks")({
  validateSearch: (search: Record<string, unknown>) => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  component: PerkListTab,
});

// ─────────────────────────────────────────────────────────────────────────────

function PerkListTab() {
  const { chainId, charId } = Route.useParams();
  const { tag: urlTag } = Route.useSearch();
  const charGid = createId<GID.Character>(+charId);

  const chain = useChain();
  const supplements = useChainSupplements();
  const regularPerkIds = useCharacterRegularPerkIds(charGid);
  const categories = usePurchaseCategories(PurchaseType.Perk);

  // One SupplementSource per perk-capable supplement that has at least one
  // perk recorded for this character.
  const supplementSources = useMemo((): SupplementSource[] => {
    if (!chain || !supplements) return [];

    return (
      Object.entries(supplements.O) as [string, { name: string; type: SupplementType }][]
    )
      .filter(([, s]) => s.type !== SupplementType.Item)
      .flatMap(([suppIdStr, s]) => {
        const suppId = createId<GID.Supplement>(+suppIdStr);
        const ids: Id<GID.Purchase>[] = [];

        for (const jumpId of chain.jumpList) {
          const jump = chain.jumps.O[jumpId];
          if (!jump) continue;
          const charSupps = (
            jump.supplementPurchases as Record<number, Record<number, Id<GID.Purchase>[]>>
          )[charGid as number] ?? {};
          for (const pid of charSupps[suppId as number] ?? []) {
            const p = chain.purchases.O[pid];
            if (p?.type === PurchaseType.SupplementPerk) ids.push(pid);
          }
        }

        // Only surface supplements that have perk data for this character.
        return ids.length > 0 ? [{ id: suppId, name: s.name, ids }] : [];
      });
  }, [chain, supplements, charGid]);

  return (
    <SearchPage
      // key forces a full remount whenever the URL tag param changes so that
      // SearchPage's useState initializers re-run from the new default props.
      key={urlTag ?? ""}
      coreIds={regularPerkIds}
      supplementSources={supplementSources}
      chainId={chainId}
      charId={charId}
      charGid={charGid}
      itemLabel="perk"
      defaultView={urlTag ? "tag" : "chronological"}
      defaultSearch={urlTag ? `tag:"${urlTag}"` : ""}
      autoExpandTag={urlTag}
      categories={categories}
    />
  );
}
