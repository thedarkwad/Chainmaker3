import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import { useChain, usePurchaseCategories } from "@/chain/state/hooks";
import { SearchPage } from "@/chain/components/SearchPage";

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute(
  "/chain/$chainId/char/$charId/items/supp/$supplementId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  component: ItemsSupplementTab,
});

// ─────────────────────────────────────────────────────────────────────────────

function ItemsSupplementTab() {
  const { chainId, charId, supplementId } = Route.useParams();
  const { tag: urlTag } = Route.useSearch();
  const charGid = createId<GID.Character>(+charId);
  const suppGid = createId<GID.Supplement>(+supplementId);

  const chain = useChain();
  const categories = usePurchaseCategories(PurchaseType.Item);

  // Collect all SupplementItem purchase IDs for this character + supplement,
  // in chain (jump-list) order.
  const itemIds = useMemo((): Id<GID.Purchase>[] => {
    if (!chain) return [];
    const ids: Id<GID.Purchase>[] = [];

    for (const jumpId of chain.jumpList) {
      const jump = chain.jumps.O[jumpId];
      if (!jump) continue;
      const charSupps = (
        jump.supplementPurchases as Record<number, Record<number, Id<GID.Purchase>[]>>
      )[charGid as number] ?? {};
      for (const pid of charSupps[suppGid as number] ?? []) {
        const p = chain.purchases.O[pid];
        if (p?.type === PurchaseType.SupplementItem) ids.push(pid);
      }
    }

    return ids;
  }, [chain, charGid, suppGid]);

  return (
    <SearchPage
      // key forces a full remount whenever the URL tag param changes so that
      // SearchPage's useState initializers re-run from the new default props.
      key={urlTag ?? ""}
      coreIds={itemIds}
      chainId={chainId}
      charId={charId}
      itemLabel="item"
      defaultView={urlTag ? "tag" : "chronological"}
      defaultSearch={urlTag ? `tag:"${urlTag}"` : ""}
      autoExpandTag={urlTag}
      categories={categories}
    />
  );
}
