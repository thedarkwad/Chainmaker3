/**
 * jumpDocHooks.ts — named Zustand hooks for the JumpDoc store.
 *
 * Follow the same conventions as hooks.ts:
 *   - Never call useJumpDocStore inline in a component.
 *   - Every selector is a named hook defined here.
 *   - Use useShallow for selectors that return multiple fields.
 *   - Mutations go through createJumpDocTrackedAction.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useJumpDocStore, createJumpDocTrackedAction } from "./JumpDocStore";
import type {
  JumpDoc,
  DocCurrencyExchange,
  OriginTemplate,
  PurchaseTemplate,
  DrawbackTemplate,
  ScenarioTemplate,
  PageRect,
  BasicPurchaseTemplate,
  FreeFormOrigin,
  CompanionTemplate,
  DocOriginCategory,
  AlternativeCost,
  PurchasePrerequisite,
} from "@/chain/data/JumpDoc";
import type { SimpleValue } from "@/chain/data/Purchase";
import type { Currency, PurchaseSubtype } from "@/chain/data/Jump";
import { TID, LID, type Id, type Registry, registryAdd, createId } from "@/chain/data/types";
import { PurchaseType, RewardType } from "@/chain/data/Purchase";
import type { ScenarioRewardTemplate } from "@/chain/data/JumpDoc";
import { ParsedEntry } from "@/routes/jumpdoc/$docId/index";

// ── Top-level doc ─────────────────────────────────────────────────────────────

/** Returns the top-level JumpDoc object. Re-renders on any change. */
export const useJumpDoc = () => useJumpDocStore((s) => s.doc);

/** Returns the JumpDoc name, or undefined if no doc is loaded. */
export const useJumpDocName = () => useJumpDocStore((s) => s.doc?.name);

/** Returns the JumpDoc PDF URL, or undefined if no doc is loaded. */
export const useJumpDocPdfUrl = () => useJumpDocStore((s) => s.doc?.url);

/** Returns a stable callback that renames the JumpDoc. */
export function useRenameJumpDoc() {
  return (name: string) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Rename JumpDoc", (d) => {
        d.name = name;
      }),
    );
  };
}

export function useModifyJumpDoc() {
  return (actionName: string, updater: (doc: JumpDoc) => void) => {
    useJumpDocStore.setState(createJumpDocTrackedAction(actionName, (d) => updater(d)));
  };
}

// ── Currencies ────────────────────────────────────────────────────────────────

/**
 * Returns the currencies registry cast to LID namespace for use with
 * CostDropdown (which expects Registry<LID.Currency, Currency>).
 */
export function useJumpDocCurrenciesRegistry(): Registry<TID.Currency, Currency> | undefined {
  return useJumpDocStore((s) => s.doc?.currencies);
}

export function useJumpDocCurrencyIds(): Id<TID.Currency>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.currencies.O).map(Number) as Id<TID.Currency>[]) : [],
    ),
  );
}

export function useJumpDocCurrency(id: Id<TID.Currency>): Currency | undefined {
  return useJumpDocStore((s) => s.doc?.currencies.O[id]);
}

export function useModifyJumpDocCurrency(id: Id<TID.Currency>) {
  return (actionName: string, updater: (c: Currency) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const c = d.currencies.O[id];
        if (c) updater(c);
      }),
    );
  };
}

export function useAddJumpDocCurrency() {
  return (): Id<TID.Currency> => {
    let newId!: Id<TID.Currency>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Currency", (d) => {
        newId = registryAdd(d.currencies, {
          name: "",
          abbrev: "??",
          budget: 1000,
          essential: false,
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocCurrency() {
  return (id: Id<TID.Currency>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Currency", (d) => {
        delete d.currencies.O[id];
        // Clear defaultCurrency on any subtype referencing this currency
        for (const sub of Object.values(d.purchaseSubtypes.O)) {
          if (sub && sub.defaultCurrency === id) {
            delete sub.defaultCurrency;
          }
        }
        // Remove exchanges that reference this currency
        if (d.availableCurrencyExchanges) {
          d.availableCurrencyExchanges = d.availableCurrencyExchanges.filter(
            (ex) => ex.oCurrency !== id && ex.tCurrency !== id,
          );
        }
        // Reset originStipend/companionStipend to currency 0 if they referenced the deleted one.
        // SimpleValue on JumpDoc stores TID IDs in a LID-typed field (pre-existing inconsistency).
        if (d.originStipend && (d.originStipend.currency as number) === (id as number)) {
          (d.originStipend as { currency: number }).currency = 0;
        }
        if (d.companionStipend && (d.companionStipend.currency as number) === (id as number)) {
          (d.companionStipend as { currency: number }).currency = 0;
        }
      }),
    );
  };
}

// ── Currency Exchanges (JumpDoc templates) ────────────────────────────────────

const EMPTY_DOC_EXCHANGES: DocCurrencyExchange[] = [];

export function useJumpDocExchanges(): DocCurrencyExchange[] {
  return useJumpDocStore((s) => s.doc?.availableCurrencyExchanges ?? EMPTY_DOC_EXCHANGES);
}

export function useAddJumpDocExchange() {
  return (oCurrency: Id<TID.Currency>, tCurrency: Id<TID.Currency>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Exchange", (d) => {
        if (!d.availableCurrencyExchanges) d.availableCurrencyExchanges = [];
        d.availableCurrencyExchanges.push({ oCurrency, tCurrency, oamount: 0, tamount: 0 });
      }),
    );
  };
}

export function useModifyJumpDocExchange() {
  return (actionName: string, updater: (exs: DocCurrencyExchange[]) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        if (!d.availableCurrencyExchanges) d.availableCurrencyExchanges = [];
        updater(d.availableCurrencyExchanges);
      }),
    );
  };
}

export function useRemoveJumpDocExchange() {
  return (idx: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Exchange", (d) => {
        d.availableCurrencyExchanges?.splice(idx, 1);
      }),
    );
  };
}

export function useAddBoundToExchange() {
  return (idx: number, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Exchange", (d) => {
        const ex = d.availableCurrencyExchanges?.[idx];
        if (!ex) return;
        if (!ex.bounds) ex.bounds = [];
        ex.bounds.push(...rects);
      }),
    );
  };
}

export function useRemoveBoundFromExchange() {
  return (idx: number, boundIdx: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Exchange", (d) => {
        d.availableCurrencyExchanges?.[idx]?.bounds?.splice(boundIdx, 1);
      }),
    );
  };
}

// ── Origin Categories ─────────────────────────────────────────────────────────

export function useJumpDocOriginCategoryIds(): Id<TID.OriginCategory>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.originCategories.O).map(Number) as Id<TID.OriginCategory>[]) : [],
    ),
  );
}

export function useJumpDocOriginCategory(
  id: Id<TID.OriginCategory>,
): DocOriginCategory | undefined {
  return useJumpDocStore((s) => s.doc?.originCategories.O[id]);
}

export function useModifyJumpDocOriginCategory(id: Id<TID.OriginCategory>) {
  return (actionName: string, updater: (c: DocOriginCategory) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const c = d.originCategories.O[id];
        if (c) updater(c);
      }),
    );
  };
}

export function useAddJumpDocOriginCategory() {
  return (): Id<TID.OriginCategory> => {
    let newId!: Id<TID.OriginCategory>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Origin Category", (d) => {
        newId = registryAdd(d.originCategories, {
          name: "",
          max: 1,
          singleLine: false,
          multiple: false,
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocOriginCategory() {
  return (id: Id<TID.OriginCategory>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Origin Category", (d) => {
        delete d.originCategories.O[id];
      }),
    );
  };
}

// ── Purchase Subtypes ─────────────────────────────────────────────────────────

export function useJumpDocPurchaseSubtypeIds(): Id<TID.PurchaseSubtype>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.purchaseSubtypes.O).map(Number) as Id<TID.PurchaseSubtype>[]) : [],
    ),
  );
}

export function useJumpDocPurchaseSubtype(
  id: Id<TID.PurchaseSubtype>,
): PurchaseSubtype<TID.Currency> | undefined {
  return useJumpDocStore((s) => s.doc?.purchaseSubtypes.O[id]);
}

export function useModifyJumpDocPurchaseSubtype(id: Id<TID.PurchaseSubtype>) {
  return (actionName: string, updater: (s: PurchaseSubtype<TID.Currency>) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const sub = d.purchaseSubtypes.O[id];
        if (sub) updater(sub);
      }),
    );
  };
}

export function useAddJumpDocPurchaseSubtype() {
  return (type: PurchaseType.Perk | PurchaseType.Item): Id<TID.PurchaseSubtype> => {
    let newId!: Id<TID.PurchaseSubtype>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Purchase Subtype", (d) => {
        newId = registryAdd(d.purchaseSubtypes, {
          name: "",
          stipend: [],
          type,
          essential: false,
          allowSubpurchases: false,
          placement: "normal",
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocPurchaseSubtype() {
  return (id: Id<TID.PurchaseSubtype>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Purchase Subtype", (d) => {
        delete d.purchaseSubtypes.O[id];
      }),
    );
  };
}

// ── Origins ───────────────────────────────────────────────────────────────────

export function useJumpDocOriginIds(): Id<TID.Origin>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.origins.O).map(Number) as Id<TID.Origin>[]) : [],
    ),
  );
}

export function useJumpDocOrigin(id: Id<TID.Origin>): OriginTemplate | undefined {
  return useJumpDocStore((s) => s.doc?.origins.O[id]);
}

export function useModifyJumpDocOrigin(id: Id<TID.Origin>) {
  return (actionName: string, updater: (t: OriginTemplate) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const t = d.origins.O[id];
        if (t) updater(t);
      }),
    );
  };
}

export function useAddJumpDocOrigin() {
  return (
    bounds?: PageRect[],
    categoryId?: Id<TID.OriginCategory>,
    parsed?: ParsedEntry,
  ): Id<TID.Origin> => {
    let newId!: Id<TID.Origin>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Origin", (d) => {
        newId = registryAdd(d.origins, {
          name: parsed?.title ?? "",
          cost: {
            amount: parsed?.amount ?? 0,
            currency: parsed?.currency ?? createId<TID.Currency>(0),
          },
          type: categoryId!,
          ...(bounds ? { bounds } : {}),
          description: parsed?.desc ?? "",
        });
      }),
    );
    return newId;
  };
}

/** Removes an origin and cleans up all references to it across the document. */
function removeOriginFromDoc(d: JumpDoc, id: Id<TID.Origin>) {
  delete d.origins.O[id];

  // Remove from other origins' synergies
  for (const origin of Object.values(d.origins.O)) {
    if (origin?.synergies) origin.synergies = origin.synergies.filter((s) => s !== id);
  }

  // Remove origin from purchases and strip it from alternative cost prerequisites
  for (const purchase of Object.values(d.availablePurchases.O)) {
    if (!purchase) continue;
    purchase.origins = purchase.origins.filter((o) => o !== id);
    if (purchase.alternativeCosts) {
      for (const ac of purchase.alternativeCosts) {
        ac.prerequisites = ac.prerequisites.filter((p) => !(p.type === "origin" && p.id === id));
      }
    }
  }

  // Remove origin from companions and strip it from alternative cost prerequisites
  for (const companion of Object.values(d.availableCompanions.O)) {
    if (!companion) continue;
    if (companion.origins) companion.origins = companion.origins.filter((o) => o !== id);
    if (companion.alternativeCosts) {
      for (const ac of companion.alternativeCosts) {
        ac.prerequisites = ac.prerequisites.filter((p) => !(p.type === "origin" && p.id === id));
      }
    }
  }

  // Strip from drawback and scenario alternative cost prerequisites
  for (const drawback of Object.values(d.availableDrawbacks.O)) {
    if (drawback?.alternativeCosts) {
      for (const ac of drawback.alternativeCosts) {
        ac.prerequisites = ac.prerequisites.filter((p) => !(p.type === "origin" && p.id === id));
      }
    }
  }
  for (const scenario of Object.values(d.availableScenarios.O)) {
    if (scenario?.alternativeCosts) {
      for (const ac of scenario.alternativeCosts) {
        ac.prerequisites = ac.prerequisites.filter((p) => !(p.type === "origin" && p.id === id));
      }
    }
  }
}

export function useRemoveJumpDocOrigin() {
  return (id: Id<TID.Origin>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Origin", (d) => {
        removeOriginFromDoc(d, id);
      }),
    );
  };
}

export function useAddBoundToOrigin() {
  return (id: Id<TID.Origin>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Origin", (d) => {
        const t = d.origins.O[id];
        if (t) {
          if (!t.bounds) t.bounds = [];
          t.bounds.push(...rects);
        }
      }),
    );
  };
}

// ── Purchases ─────────────────────────────────────────────────────────────────

export function useJumpDocPurchaseIds(): Id<TID.Purchase>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.availablePurchases.O).map(Number) as Id<TID.Purchase>[]) : [],
    ),
  );
}

export function useJumpDocPurchase(id: Id<TID.Purchase>): BasicPurchaseTemplate | undefined {
  return useJumpDocStore((s) => s.doc?.availablePurchases.O[id]);
}

export function useModifyJumpDocPurchase(id: Id<TID.Purchase>) {
  return (actionName: string, updater: (t: BasicPurchaseTemplate) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const t = d.availablePurchases.O[id];
        if (t) updater(t);
      }),
    );
  };
}

// ── Symmetric prerequisite add / remove ───────────────────────────────────────

type PrereqSourceType = "purchase" | "drawback" | "scenario";

/** Returns the prerequisites array for a template, initialising it if absent. Returns null if the template doesn't exist. */
function getDocPrereqs(
  d: JumpDoc,
  type: PrereqSourceType,
  id: number,
): PurchasePrerequisite[] | null {
  if (type === "purchase") {
    const t = d.availablePurchases.O[id as Id<TID.Purchase>];
    if (!t) return null;
    if (!t.prerequisites) t.prerequisites = [];
    return t.prerequisites;
  }
  if (type === "drawback") {
    const t = d.availableDrawbacks.O[id as Id<TID.Drawback>];
    if (!t) return null;
    if (!t.prerequisites) t.prerequisites = [];
    return t.prerequisites;
  }
  const t = d.availableScenarios.O[id as Id<TID.Scenario>];
  if (!t) return null;
  if (!t.prerequisites) t.prerequisites = [];
  return t.prerequisites;
}

/**
 * Adds a prerequisite/incompatibility to a template.
 * When the entry is an incompatibility (`positive: false`), also adds the
 * reverse entry to the target template so the relationship is symmetric.
 */
export function useAddJumpDocPrereq(sourceType: PrereqSourceType, sourceId: number) {
  return (prereq: PurchasePrerequisite) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Prerequisite", (d) => {
        const srcPrereqs = getDocPrereqs(d, sourceType, sourceId);
        if (srcPrereqs) srcPrereqs.push(prereq);

        if (!prereq.positive) {
          const reversePrereq: PurchasePrerequisite =
            sourceType === "purchase"
              ? { type: "purchase", id: sourceId as Id<TID.Purchase>, positive: false }
              : sourceType === "drawback"
                ? { type: "drawback", id: sourceId as Id<TID.Drawback>, positive: false }
                : { type: "scenario", id: sourceId as Id<TID.Scenario>, positive: false };
          const tgtPrereqs = getDocPrereqs(d, prereq.type, prereq.id as number);
          if (
            tgtPrereqs &&
            !tgtPrereqs.some((p) => p.type === reversePrereq.type && p.id === reversePrereq.id && !p.positive)
          ) {
            tgtPrereqs.push(reversePrereq);
          }
        }
      }),
    );
  };
}

/**
 * Removes a prerequisite/incompatibility from a template by index.
 * When the removed entry is an incompatibility (`positive: false`), also
 * removes the reverse entry from the target template.
 */
export function useRemoveJumpDocPrereq(sourceType: PrereqSourceType, sourceId: number) {
  return (index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Prerequisite", (d) => {
        const srcPrereqs = getDocPrereqs(d, sourceType, sourceId);
        if (!srcPrereqs) return;
        const prereq = srcPrereqs[index];
        if (!prereq) return;
        srcPrereqs.splice(index, 1);

        if (!prereq.positive) {
          const tgtPrereqs = getDocPrereqs(d, prereq.type, prereq.id as number);
          if (tgtPrereqs) {
            const reverseIdx = tgtPrereqs.findIndex(
              (p) => p.type === sourceType && p.id === sourceId && !p.positive,
            );
            if (reverseIdx !== -1) tgtPrereqs.splice(reverseIdx, 1);
          }
        }
      }),
    );
  };
}

export function useAddJumpDocPurchase() {
  return (
    subtypeId: Id<TID.PurchaseSubtype>,
    bounds?: PageRect[],
    parsed?: ParsedEntry,
  ): Id<TID.Purchase> => {
    let newId!: Id<TID.Purchase>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Purchase", (d) => {
        newId = registryAdd(d.availablePurchases, {
          name: parsed?.title ?? "",
          description: parsed?.desc ?? "",
          cost: [
            {
              amount: parsed?.amount ?? 0,
              currency: parsed?.currency ?? createId<TID.Currency>(0),
            },
          ],
          boosted: [],
          capstoneBooster: false,
          temporary: false,
          origins: [],
          allowMultiple: false,
          subtype: subtypeId,
          ...(bounds ? { bounds } : {}),
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocPurchase() {
  return (id: Id<TID.Purchase>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Purchase", (d) => {
        delete d.availablePurchases.O[id];
      }),
    );
  };
}

export function useAddBoundToPurchase() {
  return (id: Id<TID.Purchase>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Purchase", (d) => {
        const t = d.availablePurchases.O[id];
        if (t) {
          if (!t.bounds) t.bounds = [];
          t.bounds.push(...rects);
        }
      }),
    );
  };
}

// ── Drawbacks ─────────────────────────────────────────────────────────────────

export function useJumpDocDrawbackIds(): Id<TID.Drawback>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.availableDrawbacks.O).map(Number) as Id<TID.Drawback>[]) : [],
    ),
  );
}

export function useJumpDocDrawback(
  id: Id<TID.Drawback>,
): DrawbackTemplate | undefined {
  return useJumpDocStore((s) => s.doc?.availableDrawbacks.O[id]);
}

export function useModifyJumpDocDrawback(id: Id<TID.Drawback>) {
  return (actionName: string, updater: (t: DrawbackTemplate) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const t = d.availableDrawbacks.O[id];
        if (t) updater(t);
      }),
    );
  };
}

export function useAddJumpDocDrawback() {
  return (bounds?: PageRect[], parsed?: ParsedEntry): Id<TID.Drawback> => {
    let newId!: Id<TID.Drawback>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Drawback", (d) => {
        newId = registryAdd<TID.Drawback, DrawbackTemplate>(d.availableDrawbacks, {
          name: parsed?.title ?? "",
          description: parsed?.desc ?? "",
          cost: [
            {
              amount: parsed?.amount ?? 0,
              currency: parsed?.currency ?? createId<TID.Currency>(0),
            },
          ],
          allowMultiple: false,
          ...(bounds ? { bounds } : {}),
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocDrawback() {
  return (id: Id<TID.Drawback>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Drawback", (d) => {
        delete d.availableDrawbacks.O[id];
      }),
    );
  };
}

export function useAddBoundToDrawback() {
  return (id: Id<TID.Drawback>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Drawback", (d) => {
        const t = d.availableDrawbacks.O[id];
        if (t) {
          if (!t.bounds) t.bounds = [];
          t.bounds.push(...rects);
        }
      }),
    );
  };
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

export function useJumpDocScenarioIds(): Id<TID.Scenario>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.availableScenarios.O).map(Number) as Id<TID.Scenario>[]) : [],
    ),
  );
}

export function useJumpDocScenario(id: Id<TID.Scenario>): ScenarioTemplate | undefined {
  return useJumpDocStore((s) => s.doc?.availableScenarios.O[id]);
}

export function useModifyJumpDocScenario(id: Id<TID.Scenario>) {
  return (actionName: string, updater: (t: ScenarioTemplate) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const t = d.availableScenarios.O[id];
        if (t) updater(t);
      }),
    );
  };
}

export function useAddJumpDocScenario() {
  return (bounds?: PageRect[], description?: string): Id<TID.Scenario> => {
    let newId!: Id<TID.Scenario>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Scenario", (d) => {
        newId = registryAdd(d.availableScenarios, {
          name: "",
          description: description ?? "",
          allowMultiple: false,
          rewardGroups: [],
          ...(bounds ? { bounds } : {}),
        });
      }),
    );
    return newId;
  };
}

export function useAddJumpDocScenarioOutcome(id: Id<TID.Scenario>) {
  return () => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Outcome", (d) => {
        const t = d.availableScenarios.O[id];
        if (t) {
          if (!t.rewardGroups) t.rewardGroups = [];
          t.rewardGroups.push({ title: "", context: "", rewards: [] });
        }
      }),
    );
  };
}

export function useRemoveJumpDocScenarioOutcome(id: Id<TID.Scenario>) {
  return (groupIndex: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Outcome", (d) => {
        d.availableScenarios.O[id]?.rewardGroups?.splice(groupIndex, 1);
      }),
    );
  };
}

export function useRemoveJumpDocScenario() {
  return (id: Id<TID.Scenario>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Scenario", (d) => {
        delete d.availableScenarios.O[id];
      }),
    );
  };
}

export function useAddBoundToScenario() {
  return (id: Id<TID.Scenario>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Scenario", (d) => {
        const t = d.availableScenarios.O[id];
        if (t) {
          if (!t.bounds) t.bounds = [];
          t.bounds.push(...rects);
        }
      }),
    );
  };
}

// ── Companions ────────────────────────────────────────────────────────────────

export function useJumpDocCompanionIds(): Id<TID.Companion>[] {
  return useJumpDocStore(
    useShallow((s) =>
      s.doc ? (Object.keys(s.doc.availableCompanions.O).map(Number) as Id<TID.Companion>[]) : [],
    ),
  );
}

export function useJumpDocCompanion(id: Id<TID.Companion>): CompanionTemplate | undefined {
  return useJumpDocStore((s) => s.doc?.availableCompanions.O[id]);
}

export function useModifyJumpDocCompanion(id: Id<TID.Companion>) {
  return (actionName: string, updater: (t: CompanionTemplate) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const t = d.availableCompanions.O[id];
        if (t) updater(t);
      }),
    );
  };
}

export function useAddJumpDocCompanion() {
  return (bounds?: PageRect[], parsed?: ParsedEntry): Id<TID.Companion> => {
    let newId!: Id<TID.Companion>;
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Companion", (d) => {
        newId = registryAdd(d.availableCompanions, {
          name: parsed?.title ?? "",
          description: parsed?.desc ?? "",
          cost: [
            {
              amount: parsed?.amount ?? 0,
              currency: parsed?.currency ?? createId<TID.Currency>(0),
            },
          ],
          count: 1,
          specificCharacter: false,
          allowances: {},
          stipend: {},
          ...(bounds ? { bounds } : {}),
        });
      }),
    );
    return newId;
  };
}

export function useRemoveJumpDocCompanion() {
  return (id: Id<TID.Companion>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Companion", (d) => {
        delete d.availableCompanions.O[id];
      }),
    );
  };
}

export function useAddBoundToCompanion() {
  return (id: Id<TID.Companion>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Companion", (d) => {
        const t = d.availableCompanions.O[id];
        if (t) {
          if (!t.bounds) t.bounds = [];
          t.bounds.push(...rects);
        }
      }),
    );
  };
}

export function useRemoveBoundFromCompanion() {
  return (id: Id<TID.Companion>, index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Companion", (d) => {
        d.availableCompanions.O[id]?.bounds?.splice(index, 1);
      }),
    );
  };
}

// ── Derived: flat list for PdfViewer ─────────────────────────────────────────

export type BoundedTemplate = {
  id: number;
  type: string;
  name: string;
  bounds: PageRect[];
};

export function useAllBoundedTemplates(): BoundedTemplate[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const out: BoundedTemplate[] = [];

    for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
      if (!cat) continue;
      if (cat.singleLine) {
        // One entry per freeform option that has bounds
        const options = cat.options ?? [];
        options.forEach((opt, idx) => {
          if ((opt.bounds?.length ?? 0) > 0)
            out.push({
              id: idx,
              type: `freeform-${idStr}`,
              name: opt.name || `Option ${idx + 1}`,
              bounds: opt.bounds!,
            });
        });
      } else {
        // Random-choice bound for this category
        const random = cat.random;
        if (random?.bounds?.length)
          out.push({
            id: +idStr,
            type: "origin-random",
            name: `${cat.name} (random)`,
            bounds: random.bounds,
          });
      }
    }

    for (const [idStr, t] of Object.entries(doc.origins.O))
      if (t)
        out.push({
          id: +idStr,
          type: `origin-${t.type}`,
          name: t.name,
          bounds: t.bounds ?? [],
        });
    for (const [idStr, t] of Object.entries(doc.availablePurchases.O))
      if (t && t.subtype !== undefined)
        out.push({
          id: +idStr,
          type: `purchase-${t.subtype}`,
          name: t.name,
          bounds: t.bounds ?? [],
        });
    for (const [idStr, t] of Object.entries(doc.availableCompanions.O))
      if (t) out.push({ id: +idStr, type: "companion", name: t.name, bounds: t.bounds ?? [] });
    for (const [idStr, t] of Object.entries(doc.availableDrawbacks.O))
      if (t) out.push({ id: +idStr, type: "drawback", name: t.name, bounds: t.bounds ?? [] });
    for (const [idStr, t] of Object.entries(doc.availableScenarios.O))
      if (t) out.push({ id: +idStr, type: "scenario", name: t.name, bounds: t.bounds ?? [] });
    (doc.availableCurrencyExchanges ?? []).forEach((ex, idx) => {
      if ((ex.bounds?.length ?? 0) > 0) {
        const fromAbbrev = doc.currencies.O[ex.oCurrency]?.abbrev ?? "?";
        const toAbbrev = doc.currencies.O[ex.tCurrency]?.abbrev ?? "?";
        out.push({
          id: idx,
          type: "currency-exchange",
          name: `${ex.oamount} ${fromAbbrev} → ${ex.tamount} ${toAbbrev}`,
          bounds: ex.bounds!,
        });
      }
    });
    return out;
  }, [doc?.originCategories, doc?.origins, doc?.availablePurchases, doc?.availableDrawbacks, doc?.availableScenarios, doc?.availableCompanions, doc?.availableCurrencyExchanges, doc?.currencies]);
}

// ── Origins grouped by category ──────────────────────────────────────────────

export type OriginGroup = {
  /** null = "Uncategorized" */
  catId: Id<TID.OriginCategory>;
  catName: string;
  origins: { id: Id<TID.Origin>; name: string }[];
};

/**
 * Returns all origin categories (even empty ones) with their origins nested,
 * plus an "Uncategorized" group at the end for origins with no valid category.
 */
export function useJumpDocOriginsGrouped(): OriginGroup[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const groups: OriginGroup[] = [];
    const catMap = new Map<number, OriginGroup>();

    for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
      if (!cat) continue;
      if (cat.singleLine) continue;
      const catId = +idStr as Id<TID.OriginCategory>;
      const group: OriginGroup = {
        catId,
        catName: cat.name,
        origins: Object.entries(doc.origins.O)
          .filter(([_, o]) => o.type == catId)
          .map(([idString, o]) => ({
            name: o.name,
            id: +idString as Id<TID.Origin>,
          })),
      };
      catMap.set(+idStr, group);
      groups.push(group);
    }

    return groups;
  }, [doc]);
}

// ── Remove bounds by index ────────────────────────────────────────────────────

export function useRemoveBoundFromOrigin() {
  return (id: Id<TID.Origin>, index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Origin", (d) => {
        d.origins.O[id]?.bounds?.splice(index, 1);
      }),
    );
  };
}

export function useRemoveBoundFromPurchase() {
  return (id: Id<TID.Purchase>, index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Purchase", (d) => {
        d.availablePurchases.O[id]?.bounds?.splice(index, 1);
      }),
    );
  };
}

export function useRemoveBoundFromDrawback() {
  return (id: Id<TID.Drawback>, index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Drawback", (d) => {
        d.availableDrawbacks.O[id]?.bounds?.splice(index, 1);
      }),
    );
  };
}

export function useRemoveBoundFromScenario() {
  return (id: Id<TID.Scenario>, index: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Scenario", (d) => {
        d.availableScenarios.O[id]?.bounds?.splice(index, 1);
      }),
    );
  };
}

// ── Dynamic section hooks ──────────────────────────────────────────────────────

/** IDs of origin categories where singleLine === false (i.e. "Multiple Choice"). */
export function useJumpDocNonSingleLineOriginCategoryIds(): Id<TID.OriginCategory>[] {
  return useJumpDocStore(
    useShallow((s) => {
      if (!s.doc) return [];
      return Object.entries(s.doc.originCategories.O)
        .filter(([, cat]) => cat && !cat.singleLine)
        .map(([idStr]) => +idStr as Id<TID.OriginCategory>);
    }),
  );
}

/** IDs of origins belonging to a specific origin category. */
export function useJumpDocOriginIdsByCategory(catId: Id<TID.OriginCategory>): Id<TID.Origin>[] {
  return useJumpDocStore(
    useShallow((s) => {
      if (!s.doc) return [];
      return Object.entries(s.doc.origins.O)
        .filter(([, t]) => t && t.type === catId)
        .map(([idStr]) => +idStr as Id<TID.Origin>);
    }),
  );
}

/** Removes all origins belonging to the given category and cleans up all references to them. */
export function useRemoveJumpDocOriginsByCategory() {
  return (catId: Id<TID.OriginCategory>) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Origins in Category", (d) => {
        const toRemove = Object.entries(d.origins.O)
          .filter(([, t]) => t?.type === catId)
          .map(([idStr]) => +idStr as Id<TID.Origin>);
        for (const id of toRemove) {
          removeOriginFromDoc(d, id);
        }
      }),
    );
  };
}

// ── FreeForm options (singleLine categories) ──────────────────────────────────

type CatWithOptions = { singleLine: true; options: FreeFormOrigin[] };
type CatWithRandom = { singleLine: false; random?: { cost: SimpleValue; bounds?: PageRect[] } };

/** Returns the FreeFormOrigin options array for a singleLine category. */
export function useJumpDocFreeFormOptions(catId: Id<TID.OriginCategory>): FreeFormOrigin[] {
  return useJumpDocStore(
    useShallow((s) => {
      const c = s.doc?.originCategories.O[catId] as CatWithOptions | undefined;
      return c?.options ?? [];
    }),
  );
}

/** Returns the `random` field for a non-singleLine category, or undefined. */
export function useJumpDocOriginRandom(
  catId: Id<TID.OriginCategory>,
): { cost: SimpleValue<TID.Currency>; bounds?: PageRect[] } | undefined {
  return useJumpDocStore((s) => {
    const c = s.doc?.originCategories.O[catId];
    return c && !c.singleLine ? c.random : undefined;
  });
}

/** Mutate the FreeFormOrigin options array for a singleLine category. */
export function useModifyJumpDocFreeFormOptions(catId: Id<TID.OriginCategory>) {
  return (actionName: string, updater: (options: FreeFormOrigin[]) => void) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const c = d.originCategories.O[catId] as CatWithOptions | undefined;
        if (!c) return;
        if (!c.options) c.options = [];
        updater(c.options);
      }),
    );
  };
}

/** Add a PDF rect bound to a specific singleLine option. */
export function useAddBoundToFreeFormOption() {
  return (catId: Id<TID.OriginCategory>, optIdx: number, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Option", (d) => {
        const c = d.originCategories.O[catId] as CatWithOptions | undefined;
        if (!c?.options) return;
        const opt = c.options[optIdx];
        if (!opt) return;
        if (!opt.bounds) opt.bounds = [];
        opt.bounds.push(...rects);
      }),
    );
  };
}

/** Remove a PDF rect bound from a specific singleLine option. */
export function useRemoveBoundFromFreeFormOption() {
  return (catId: Id<TID.OriginCategory>, optIdx: number, boundIdx: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Option", (d) => {
        const c = d.originCategories.O[catId] as CatWithOptions | undefined;
        c?.options[optIdx]?.bounds?.splice(boundIdx, 1);
      }),
    );
  };
}

/** Add a PDF rect bound to a non-singleLine category's `random` field. */
export function useAddBoundToOriginRandom() {
  return (catId: Id<TID.OriginCategory>, rects: PageRect[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Bound to Random", (d) => {
        const c = d.originCategories.O[catId] as CatWithRandom | undefined;
        if (!c || c.singleLine || !c.random) return;
        if (!c.random.bounds) c.random.bounds = [];
        c.random.bounds.push(...rects);
      }),
    );
  };
}

/** Remove a PDF rect bound from a non-singleLine category's `random` field. */
export function useRemoveBoundFromOriginRandom() {
  return (catId: Id<TID.OriginCategory>, boundIdx: number) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Remove Bound from Random", (d) => {
        const c = d.originCategories.O[catId] as CatWithRandom | undefined;
        if (!c || c.singleLine || !c.random?.bounds) return;
        c.random.bounds.splice(boundIdx, 1);
      }),
    );
  };
}

/** Purchase subtype IDs sorted: PurchaseType.Perk entries first, then PurchaseType.Item. */
export function useJumpDocPurchaseSubtypeIdsSorted(): Id<TID.PurchaseSubtype>[] {
  return useJumpDocStore(
    useShallow((s) => {
      if (!s.doc) return [];
      return Object.entries(s.doc.purchaseSubtypes.O)
        .filter((e) => !!e[1])
        .sort(([, a], [, b]) => (a.type === b.type ? 0 : a.type === PurchaseType.Perk ? -1 : 1))
        .map(([idStr]) => +idStr as Id<TID.PurchaseSubtype>);
    }),
  );
}

/** All purchases with capstoneBooster: true — used by BoostedEditor. */
export function useJumpDocCapstoneBoosterPurchases(): { id: Id<TID.Purchase>; name: string }[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    return Object.entries(doc.availablePurchases.O)
      .filter(([, t]) => t?.capstoneBooster)
      .map(([idStr, t]) => ({ id: +idStr as Id<TID.Purchase>, name: t!.name }));
  }, [doc]);
}

/** All purchases AND drawbacks with capstoneBooster: true — used by BoostedEditor. */
export function useJumpDocCapstoneBoosterItems(): {
  id: number;
  name: string;
  kind: "purchase" | "drawback";
}[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const purchases = Object.entries(doc.availablePurchases.O)
      .filter(([, t]) => t?.capstoneBooster)
      .map(([idStr, t]) => ({ id: +idStr, name: t!.name, kind: "purchase" as const }));
    const drawbacks = Object.entries(doc.availableDrawbacks.O)
      .filter(([, t]) => t?.capstoneBooster)
      .map(([idStr, t]) => ({ id: +idStr, name: t!.name, kind: "drawback" as const }));
    return [...purchases, ...drawbacks];
  }, [doc]);
}

/** IDs of purchases assigned to a specific subtype. */
export function useJumpDocPurchaseIdsBySubtype(
  subtypeId: Id<TID.PurchaseSubtype>,
): Id<TID.Purchase>[] {
  return useJumpDocStore(
    useShallow((s) => {
      if (!s.doc) return [];
      return Object.entries(s.doc.availablePurchases.O)
        .filter(([, t]) => t != null && t.subtype === subtypeId)
        .map(([idStr]) => +idStr as unknown as Id<TID.Purchase>);
    }),
  );
}

/** Returns a function that appends alt costs to all purchase templates with a given subtype. */
export function useAddAltCostToSubtypePurchases() {
  return (subtypeId: Id<TID.PurchaseSubtype>, altCosts: AlternativeCost[]) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction("Add Alt Costs to Subtype", (d) => {
        for (const t of Object.values(d.availablePurchases.O)) {
          if (!t || t.subtype !== subtypeId) continue;
          t.alternativeCosts = [...(t.alternativeCosts ?? []), ...altCosts];
        }
      }),
    );
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export type ToolDefinition = {
  /** Unique key: "origin-{catId}", "purchase-{subtypeId}", "drawback", "scenario" */
  key: string;
  label: string;
  color: string;
};

/**
 * Returns the ordered list of draw tools derived from the current doc:
 * non-singleLine origin categories (green), perk subtypes (blue),
 * item subtypes (amber), drawback (red), scenario (purple).
 */
export function useJumpDocToolDefinitions(): ToolDefinition[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const tools: ToolDefinition[] = [];

    for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
      if (!cat || cat.singleLine) continue;
      tools.push({ key: `origin-${idStr}`, label: cat.name, color: "#22c55e" });
    }

    const subtypeEntries = (
      Object.entries(doc.purchaseSubtypes.O) as [
        string,
        PurchaseSubtype<TID.Currency> | undefined,
      ][]
    )
      .filter((e) => !!e[1])
      .sort(([, a], [, b]) => (a?.type === b?.type ? 0 : a?.type === PurchaseType.Perk ? -1 : 1));
    for (const [idStr, s] of subtypeEntries) {
      tools.push({
        key: `purchase-${idStr}`,
        label: s?.name ?? "",
        color: s?.type === PurchaseType.Perk ? "#38bdf8" : "#f59e0b",
      });
    }

    tools.push({ key: "companion", label: "Companion", color: "#06b6d4" });
    tools.push({ key: "drawback", label: "Drawback", color: "#ef4444" });
    tools.push({ key: "scenario", label: "Scenario", color: "#a855f7" });
    return tools;
  }, [doc?.originCategories, doc?.purchaseSubtypes]);
}

// ── Discount origin groups ─────────────────────────────────────────────────────

/**
 * Returns non-singleLine origin categories that have `providesDiscounts: true`,
 * each paired with the list of origins belonging to it. Used by PurchaseCard
 * to render discount-origin pill selectors.
 */
export function useJumpDocDiscountOriginGroups(): OriginGroup[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const out: OriginGroup[] = [];
    for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
      if (!cat || cat.singleLine || !cat.providesDiscounts) continue;
      const catId = +idStr as unknown as Id<TID.OriginCategory>;
      const origins = Object.entries(doc.origins.O)
        .filter(([, o]) => o && (o.type as unknown as number) === (catId as unknown as number))
        .map(([oidStr, o]) => ({ id: +oidStr as unknown as Id<TID.Origin>, name: o!.name }));
      out.push({ catId, catName: cat.name, origins });
    }
    return out;
  }, [doc]);
}

// ── Scenario reward picker helpers ────────────────────────────────────────────

export type PurchaseWithType = {
  id: Id<TID.Purchase>;
  name: string;
  rewardType: RewardType.Perk | RewardType.Item;
  subtypeName: string;
};

/**
 * Returns all purchase templates joined with their subtype type,
 * filtered to Perk and Item only. Used by the scenario reward purchase picker.
 */
export function useJumpDocPurchasesWithRewardType(): PurchaseWithType[] {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return [];
    const out: PurchaseWithType[] = [];
    for (const [idStr, t] of Object.entries(doc.availablePurchases.O)) {
      if (!t) continue;
      const subtype = doc.purchaseSubtypes.O[t.subtype];
      if (!subtype) continue;
      if (subtype.type !== PurchaseType.Perk && subtype.type !== PurchaseType.Item) continue;
      out.push({
        id: +idStr as Id<TID.Purchase>,
        name: t.name,
        rewardType: subtype.type === PurchaseType.Perk ? RewardType.Perk : RewardType.Item,
        subtypeName: subtype.name,
      });
    }
    return out;
  }, [doc]);
}

/** Returns the first subtype ID of the given PurchaseType, or undefined. */
export function useJumpDocFirstSubtypeIdByType(
  type: PurchaseType.Perk | PurchaseType.Item,
): Id<TID.PurchaseSubtype> | undefined {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return undefined;
    for (const [idStr, s] of Object.entries(doc.purchaseSubtypes.O)) {
      if (s && s.type === type) return +idStr as Id<TID.PurchaseSubtype>;
    }
    return undefined;
  }, [doc, type]);
}

/** Returns the first currency ID in the doc, or 0 if none. Used for reward defaults. */
export function useJumpDocFirstCurrencyId(): Id<TID.Currency> {
  return useJumpDocStore((s) => {
    const keys = Object.keys(s.doc?.currencies.O ?? {});
    return keys.length > 0 ? (+keys[0]! as Id<TID.Currency>) : (0 as Id<TID.Currency>);
  });
}

// ── Alternative cost prerequisites ────────────────────────────────────────────

export type PrerequisiteItems = {
  origins: { id: Id<TID.Origin>; name: string; categoryId: Id<TID.OriginCategory>; categoryName: string }[];
  drawbacks: { id: Id<TID.Drawback>; name: string }[];
  purchases: { id: Id<TID.Purchase>; name: string; subtypeId: Id<TID.PurchaseSubtype>; subtypeName: string }[];
  scenarios: { id: Id<TID.Scenario>; name: string }[];
};

/**
 * Returns all origins, drawbacks, and purchases as flat lists for the
 * alternative cost prerequisite picker.
 */
export function useJumpDocPrerequisiteItems(): PrerequisiteItems {
  const doc = useJumpDoc();
  return useMemo(() => {
    if (!doc) return { origins: [], drawbacks: [], purchases: [], scenarios: [] };
    const origins = Object.entries(doc.origins.O)
      .filter(([, t]) => t)
      .map(([idStr, t]) => {
        const categoryId = t!.type;
        const category = doc.originCategories.O[categoryId];
        return {
          id: +idStr as Id<TID.Origin>,
          name: t!.name,
          categoryId,
          categoryName: category?.name ?? "",
        };
      });
    const drawbacks = Object.entries(doc.availableDrawbacks.O)
      .filter(([, t]) => t)
      .map(([idStr, t]) => ({ id: +idStr as Id<TID.Drawback>, name: t!.name }));
    const purchases = Object.entries(doc.availablePurchases.O)
      .filter(([, t]) => t)
      .map(([idStr, t]) => {
        const subtypeId = t!.subtype;
        const subtype = doc.purchaseSubtypes.O[subtypeId];
        return { id: +idStr as Id<TID.Purchase>, name: t!.name, subtypeId, subtypeName: subtype?.name ?? "" };
      });
    const scenarios = Object.entries(doc.availableScenarios.O)
      .filter(([, t]) => t)
      .map(([idStr, t]) => ({ id: +idStr as Id<TID.Scenario>, name: t!.name }));
    return { origins, drawbacks, purchases, scenarios };
  }, [doc]);
}

/** Modifies a specific outcome (rewardGroup) within a scenario. */
export function useModifyJumpDocScenarioOutcome(id: Id<TID.Scenario>) {
  return (
    actionName: string,
    groupIndex: number,
    updater: (group: { title: string; context: string; rewards: ScenarioRewardTemplate[] }) => void,
  ) => {
    useJumpDocStore.setState(
      createJumpDocTrackedAction(actionName, (d) => {
        const group = d.availableScenarios.O[id]?.rewardGroups?.[groupIndex];
        if (group) updater(group);
      }),
    );
  };
}
