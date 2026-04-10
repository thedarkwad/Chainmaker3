import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { SupplementType } from "@/chain/data/ChainSupplement";
import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import {
  useChain,
  useChainSupplements,
  useCharacterRegularItemIds,
  usePurchaseCategories,
} from "@/chain/state/hooks";
import { SearchPage, type SupplementSource } from "@/chain/components/SearchPage";

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/chain/$chainId/char/$charId/items/")({
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    ...(typeof search.tag === "string" ? { tag: search.tag } : {}),
  }),
  component: ItemListTab,
});

// ─────────────────────────────────────────────────────────────────────────────

function ItemListTab() {
  const { chainId, charId } = Route.useParams();
  const { tag: urlTag } = Route.useSearch();
  const charGid = createId<GID.Character>(+charId);

  const chain = useChain();
  const supplements = useChainSupplements();
  const regularItemIds = useCharacterRegularItemIds(charGid);
  const categories = usePurchaseCategories(PurchaseType.Item);

  // One SupplementSource per item-capable supplement that has at least one
  // item recorded for this character.
  const supplementSources = useMemo((): SupplementSource[] => {
    if (!chain || !supplements) return [];

    return (
      Object.entries(supplements.O) as [string, { name: string; type: SupplementType }][]
    )
      .filter(([, s]) => s.type === SupplementType.Item)
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
            if (p?.type === PurchaseType.SupplementItem) ids.push(pid);
          }
        }

        // Only surface supplements that have item data for this character.
        return ids.length > 0 ? [{ id: suppId, name: s.name, ids }] : [];
      });
  }, [chain, supplements, charGid]);

  return (
    <SearchPage
      // key forces a full remount whenever the URL tag param changes so that
      // SearchPage's useState initializers re-run from the new default props.
      key={urlTag ?? ""}
      coreIds={regularItemIds}
      supplementSources={supplementSources}
      chainId={chainId}
      charId={charId}
      charGid={charGid}
      itemLabel="item"
      defaultView={urlTag ? "tag" : "chronological"}
      defaultSearch={urlTag ? `tag:"${urlTag}"` : ""}
      autoExpandTag={urlTag}
      categories={categories}
    />
  );
}
