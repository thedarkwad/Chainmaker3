import type { Chain } from "@/chain/data/Chain";
import type { CalculatedData } from "@/chain/data/CalculatedData";
import { PurchaseType, type BasicPurchase } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import type {
  IRPurchaseListEntry,
  IRPurchaseListExport,
  IRPurchaseListGroup,
  PurchaseListOptions,
} from "./types";

export function buildPurchaseListIR(
  chain: Chain,
  calculatedData: Partial<CalculatedData>,
  characterId: Id<GID.Character>,
  plOptions: PurchaseListOptions,
): IRPurchaseListExport {
  const character = chain.characters.O[characterId];
  const characterName = character?.name ?? "Unknown";
  const isPrimary = character?.primary ?? false;

  const contentLabel =
    plOptions.content === "perks" ? "Perks"
    : plOptions.content === "items" ? "Items"
    : "Perks & Items";

  function buildEntry(p: BasicPurchase, jumpName: string | null): IRPurchaseListEntry {
    const subs: IRPurchaseListEntry[] = (p.subpurchases?.list ?? []).flatMap((subId) => {
      const sub = chain.purchases.O[subId] as BasicPurchase | undefined;
      return sub ? [buildEntry(sub, null)] : [];
    });
    return { name: p.name, description: p.description, jumpName, subpurchases: subs };
  }

  // ── Collect all qualifying purchases across all jumps ──
  const collected: Array<{ purchase: BasicPurchase; jumpName: string | null }> = [];

  for (const jumpId of chain.jumpList) {
    const jump = chain.jumps.O[jumpId];
    if (!jump) continue;
    if (!isPrimary && !jump.characters.includes(characterId)) continue;

    const rawJumpNumber = calculatedData.jumpNumber?.[jumpId] ?? 0;
    const jumpNumber = rawJumpNumber + (chain.chainSettings.startWithJumpZero ? 0 : 1);
    const jumpName = plOptions.showJump ? `Jump ${jumpNumber} — ${jump.name}` : null;

    const purchaseIds = jump.purchases?.[characterId] ?? [];
    for (const id of purchaseIds) {
      const p = chain.purchases.O[id] as BasicPurchase | undefined;
      if (!p) continue;
      if (p.type !== PurchaseType.Perk && p.type !== PurchaseType.Item) continue;
      if (plOptions.content === "perks" && p.type !== PurchaseType.Perk) continue;
      if (plOptions.content === "items" && p.type !== PurchaseType.Item) continue;
      // Exclude temporary purchases
      if (typeof (p as any).duration === "number" && (p as any).duration > 0) continue;
      collected.push({ purchase: p, jumpName });
    }
  }

  // ── Build groups ──
  const groups: IRPurchaseListGroup[] = [];

  if (plOptions.groupBy === "none") {
    groups.push({
      heading: "",
      entries: collected.map(({ purchase, jumpName }) => buildEntry(purchase, jumpName)),
    });
  } else if (plOptions.groupBy === "category") {
    const groupMap = new Map<string, IRPurchaseListEntry[]>();
    const uncategorized: IRPurchaseListEntry[] = [];

    for (const { purchase, jumpName } of collected) {
      const categoryIds = purchase.categories ?? [];
      const categoryRegistry =
        chain.purchaseCategories[purchase.type as PurchaseType.Perk | PurchaseType.Item];
      const entry = buildEntry(purchase, jumpName);
      let categorized = false;
      for (const catId of categoryIds) {
        const catName = categoryRegistry?.O[createId<GID.PurchaseCategory>(catId as number)];
        if (catName) {
          if (!groupMap.has(catName)) groupMap.set(catName, []);
          groupMap.get(catName)!.push(entry);
          categorized = true;
        }
      }
      if (!categorized) uncategorized.push(entry);
    }

    for (const [heading, entries] of groupMap) {
      groups.push({ heading, entries });
    }
    if (uncategorized.length > 0) {
      groups.push({ heading: "Uncategorized", entries: uncategorized });
    }
  } else {
    // groupBy === "tag"
    const groupMap = new Map<string, IRPurchaseListEntry[]>();
    const untagged: IRPurchaseListEntry[] = [];

    for (const { purchase, jumpName } of collected) {
      const tags = purchase.tags ?? [];
      const entry = buildEntry(purchase, jumpName);

      if (tags.length === 0) {
        untagged.push(entry);
      } else {
        for (const tag of tags) {
          if (!groupMap.has(tag)) groupMap.set(tag, []);
          groupMap.get(tag)!.push(entry);
        }
      }
    }

    for (const [heading, entries] of groupMap) {
      groups.push({ heading, entries });
    }
    if (untagged.length > 0) {
      groups.push({ heading: "Untagged", entries: untagged });
    }
  }

  return {
    chainName: chain.name,
    characterName,
    exportedAt: new Date().toISOString(),
    contentLabel,
    groups,
  };
}
