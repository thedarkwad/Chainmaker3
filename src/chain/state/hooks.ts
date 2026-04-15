import { useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import { useShallow } from "zustand/react/shallow";
import type {
  Currency,
  CurrencyExchange,
  Jump,
  NarrativeBlurb,
  OriginCategory,
  Origin,
  PurchaseSubtype,
  JumpSource,
} from "@/chain/data/Jump";
import { DEFAULT_CURRENCY_ID, JumpSourceType } from "@/chain/data/Jump";
import type {
  CompanionTemplate,
  DrawbackTemplate,
  JumpDoc,
  OriginTemplate,
  ScenarioRewardTemplate,
} from "@/chain/data/JumpDoc";
import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";
import {
  CostModifier,
  DefaultSubtype,
  PurchaseType,
  RewardType,
  type AbstractPurchase,
  type BasicPurchase,
  type JumpPurchase,
  type ModifiedCost,
  type CompanionImport,
  type Drawback,
  type PurchaseGroup,
  type Scenario,
  type ScenarioReward,
  type StoredAlternativeCost,
  type StoredPurchasePrerequisite,
  type Subpurchase,
  type SupplementImport,
  type SupplementPurchase,
  type SupplementScenario,
  type Value,
  SimpleValue,
} from "@/chain/data/Purchase";
import {
  CompanionAccess,
  SupplementType,
  type ChainSupplement,
} from "@/chain/data/ChainSupplement";
import {
  createId,
  type GID,
  type Id,
  type LID,
  type TID,
  type PartialLookup,
  type Registry,
  Lookup,
} from "@/chain/data/types";
import type { Budget, CalculatedData, CharacterPassportStats } from "@/chain/data/CalculatedData";
import type { AltForm, ImgData } from "@/chain/data/AltForm";
import type { Character } from "@/chain/data/Character";
import { PersonalityComponent } from "@/chain/data/Character";
import type { BankSettings, Chain } from "@/chain/data/Chain";
import { LengthUnit, WeightUnit } from "@/chain/data/AltForm";
import { useChainStore } from "./Store";
import { createTrackedAction, type ChainUpdate } from "./StoreUtilities";
import { produce } from "immer";
import { adjustBank, adjustJumpOrganization } from "./calculations";
import { useClipboard } from "./clipboard";
import { jumpFromDoc, jumpWithDefaults } from "@/chain/data/newChain";
import {
  formatCostShortWithSubpurchases,
  formatCostDisplayWithSubpurchases,
} from "@/ui/CostDropdown";

// ─────────────────────────────────────────────────────────────────────────────
// Module-level utilities (not exported — internal to hooks.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Removes the first occurrence of `item` from `list` in-place. No-op if absent. */
function removeFromArray<T>(list: T[], item: T): void {
  const idx = list.indexOf(item);
  if (idx !== -1) list.splice(idx, 1);
}

/**
 * Returns a zero-amount Value initialised with one entry per currency in the jump.
 * Used when creating new purchases, drawbacks, scenarios, etc.
 */
function initializeCurrencyAmounts(jump: Jump): Value {
  return Object.keys(jump.currencies.O).map((cid) => ({
    currency: createId<LID.Currency>(+cid),
    amount: 0,
  }));
}

/** Applies a named tracked action to the chain store (undo-stack entry + Immer patch). */
function setTracked(name: string, updater: ChainUpdate): void {
  useChainStore.setState((s) => createTrackedAction(name, updater)(s));
}

// ─────────────────────────────────────────────────────────────────────────────

/** Returns the top-level Chain object. Re-renders whenever any part of the chain changes. */
export const useChain = () => useChainStore((s) => s.chain);

/** Returns the jump-number lookup from calculatedData (0-indexed sequential jump numbers). */
export const useJumpNumbers = () => useChainStore((s) => s.calculatedData.jumpNumber);

/**
 * Returns the ordered list of Character objects for the chain.
 * Only re-renders when the character list or individual character data changes —
 * not on purchase/budget mutations.
 */
export function useCharacterList(): Character[] {
  return useChainStore(
    useShallow((s): Character[] => {
      if (!s.chain) return [];
      return s.chain.characterList
        .map((id) => s.chain!.characters.O[id])
        .filter((c): c is Character => c != null);
    }),
  );
}

/**
/** Returns the chain's jumpList (ordered jump IDs). */
export const useJumpList = () => useChainStore(useShallow((s) => s.chain?.jumpList ?? []));

/** Returns the primary character's string ID and the first jump's string ID — used for nav links. */
export function useFirstNavIds(): { charId: string | null; jumpId: string | null } {
  const chain = useChain();
  return useMemo(() => {
    if (!chain) return { charId: null, jumpId: null };
    const primary = chain.characterList.map((id) => chain.characters.O[id]).find((c) => c?.primary);
    const charId = primary ? String(primary.id) : null;
    const jumpId = chain.jumpList[0] != null ? String(chain.jumpList[0]) : null;
    return { charId, jumpId };
  }, [chain]);
}

/** Returns the jump tree (top-level jumps with their supplement children).
 * Re-renders when jumpList order changes or when a jump object is mutated
 * (e.g. renamed, parent changed, purchase added/removed).  Does NOT re-render
 * on pure purchase-data edits (toggles, cost changes) since those only touch
 * chain.purchases.O, leaving chain.jumps.O structurally intact.
 */
export function useJumpTree(): { jump: Jump; supplements: Jump[] }[] {
  const jumpList = useChainStore(useShallow((s) => s.chain?.jumpList ?? []));
  const jumpsO = useChainStore((s) => s.chain?.jumps.O);
  return useMemo(() => {
    if (!jumpsO) return [];
    const allJumps = jumpList.map((id) => jumpsO[id]).filter((j): j is Jump => j != null);
    // Build supplement groups in one pass (O(n)) to avoid O(n²) inner filter.
    const suppsByParent = new Map<Id<GID.Jump>, Jump[]>();
    for (const j of allJumps) {
      if (j.parentJump !== undefined) {
        const arr = suppsByParent.get(j.parentJump);
        if (arr) arr.push(j);
        else suppsByParent.set(j.parentJump, [j]);
      }
    }
    return allJumps
      .filter((j) => j.parentJump === undefined)
      .map((j) => ({ jump: j, supplements: suppsByParent.get(j.id) ?? [] }));
  }, [jumpList, jumpsO]);
}

/** Returns the set of jump IDs (as numbers) accessible to the given character. */
const EMPTY_SET = new Set<number>();
export function useJumpAccess(charId: Id<GID.Character>): Set<number> | undefined {
  return useChainStore((s) => s.calculatedData.jumpAccess?.[charId] ?? EMPTY_SET);
}

/** Returns pre-computed passport stats for a character (age, jump count, purchase tallies, etc.). */
export function useCharacterPassportStats(
  charId: Id<GID.Character>,
): CharacterPassportStats | undefined {
  return useChainStore((s) => s.calculatedData.passportStats?.[charId]);
}

/** Returns supplement access sets for a character: suppId → Set of accessible jump IDs. */
export function useSupplementAccess(
  charId: Id<GID.Character>,
): Lookup<GID.Supplement, Set<number>> | undefined {
  return useChainStore((s) => s.calculatedData.supplementAccess?.[charId]);
}

/** Returns the computed budget for a character at a specific jump. */
export function useBudget(charId: Id<GID.Character>, jumpId: Id<GID.Jump>): Budget | undefined {
  return useChainStore((s) => s.calculatedData.budget?.[charId]?.[jumpId]);
}

/** Returns a single character by ID plus a stable tracked-action modifier. */
export function useCharacter(id: Id<GID.Character> | undefined) {
  const char = useChainStore((s) => (id != null ? s.chain?.characters.O[id] : undefined));

  const modify = useCallback(
    (name: string, updater: (c: Character) => void) => {
      if (id == null) return;
      setTracked(name, (chain) => {
        const c = chain.characters.O[id];
        if (c) updater(c);
      });
    },
    [id],
  );

  return { char, modify };
}

/** Returns a stable callback that reorders the chain's characterList. */
export function useReorderCharacters() {
  return useCallback((newOrder: Id<GID.Character>[]) => {
    setTracked("Reorder characters", (c) => {
      c.characterList = newOrder;
    });
  }, []);
}

/** Returns a stable callback that reorders the chain's jumpList.
 *  `blocks` is the new ordering as flat arrays: [[topId, sup1Id, sup2Id], [topId2], ...] */
export function useReorderJumps() {
  return useCallback((blocks: Id<GID.Jump>[][]) => {
    setTracked("Reorder jumps", (c) => {
      c.jumpList = blocks.flat();
    });
    adjustJumpOrganization();
  }, []);
}

/**
 * Inserts `newId` into `jumpList` after `insertAfter`, or appends to the end.
 * Extracted so both useAddJump and useAddJumpFromDoc share the same logic.
 */
function insertIntoJumpList(
  jumpList: Id<GID.Jump>[],
  newId: Id<GID.Jump>,
  insertAfter: Id<GID.Jump> | undefined,
): void {
  if (insertAfter !== undefined) {
    const idx = jumpList.findIndex((id) => id === insertAfter);
    if (idx !== -1) {
      jumpList.splice(idx + 1, 0, newId);
      return;
    }
  }
  jumpList.push(newId);
}

/** Returns a stable callback that creates a new jump with default currencies, subtypes,
 *  and origin categories, then inserts it after `insertAfter` (or appends if omitted).
 *  Pass `name` and optionally a `url` collected from the user before calling. */
export function useAddJump() {
  return useCallback((name: string, url: string, insertAfter?: Id<GID.Jump>): Id<GID.Jump> => {
    const newId = useChainStore.getState().chain!.jumps.fId;
    setTracked("Add jump", (c) => {
      const source: JumpSource = url
        ? { type: JumpSourceType.URL, URL: url }
        : { type: JumpSourceType.Unknown };
      const newJump: Jump = jumpWithDefaults(newId, name, source, c.chainSettings.defaultCP);
      c.jumps.O[newId] = newJump;
      c.jumps.fId = createId<GID.Jump>((newId as number) + 1);
      insertIntoJumpList(c.jumpList, newId, insertAfter);
    });
    adjustJumpOrganization();
    return newId;
  }, []);
}

export function useAddJumpFromDoc() {
  return useCallback(
    (doc: JumpDoc, docPublicUid: string, insertAfter?: Id<GID.Jump>): Id<GID.Jump> => {
      const newId = useChainStore.getState().chain!.jumps.fId;
      setTracked("Add jump from JumpDoc", (c) => {
        const newJump: Jump = jumpFromDoc(
          doc,
          docPublicUid,
          newId,
          c.chainSettings.defaultCP,
          c.chainSettings.ignoreDrawbackLimit,
        );

        c.jumps.O[newId] = newJump;
        c.jumps.fId = createId<GID.Jump>((newId as number) + 1);
        insertIntoJumpList(c.jumpList, newId, insertAfter);
      });
      adjustJumpOrganization();
      return newId;
    },
    [],
  );
}

/** Returns a stable callback that deletes a jump: removes all its purchases, drawbacks,
 *  scenarios, supplement purchases, and altforms. Any supplement children (jumps with
 *  parentJump === jumpId) become top-level jumps instead of being deleted. */
export function useDeleteJump() {
  return useCallback((jumpId: Id<GID.Jump>) => {
    setTracked("Delete jump", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;

      // Promote supplement children to top-level
      for (const id of c.jumpList) {
        const j = c.jumps.O[id];
        if (j && j.parentJump === jumpId) {
          delete j.parentJump;
        }
      }

      // Delete purchases (and their subpurchases) for all characters
      for (const charKey in jump.purchases) {
        for (const pId of (jump.purchases as any)[charKey] ?? []) {
          const bp = c.purchases.O[pId] as BasicPurchase | undefined;
          if (bp?.subpurchases?.list) {
            for (const subId of bp.subpurchases.list) delete c.purchases.O[subId];
          }
          delete c.purchases.O[pId];
        }
      }

      // Delete drawbacks
      for (const charKey in jump.drawbacks) {
        for (const pId of (jump.drawbacks as any)[charKey] ?? []) delete c.purchases.O[pId];
      }

      // Delete scenarios
      for (const charKey in jump.scenarios) {
        for (const pId of (jump.scenarios as any)[charKey] ?? []) delete c.purchases.O[pId];
      }

      // Delete supplement purchases
      for (const charKey in jump.supplementPurchases) {
        const bySup = (jump.supplementPurchases as any)[charKey] ?? {};
        for (const suppKey in bySup) {
          for (const pId of bySup[suppKey] ?? []) delete c.purchases.O[pId];
        }
      }

      // Delete altforms
      for (const charKey in jump.altForms) {
        for (const afId of (jump.altForms as any)[charKey] ?? []) delete c.altforms.O[afId];
      }

      //Delete obsoletions
      for (const id in jump.obsoletions) {
        delete (c.purchases.O[id as any] as SupplementPurchase).obsolete;
      }

      // Remove from jumpList and registry
      c.jumpList = c.jumpList.filter((id) => id !== jumpId);
      delete c.jumps.O[jumpId];
      c.budgetFlag += 1;
    });
    adjustJumpOrganization();
  }, []);
}

/** Currencies registry for a given jump. Returns undefined when the chain isn't loaded
 *  or the jumpId doesn't resolve (e.g. ChainDrawbacks with no jumpId). */
export const useCurrencies = (
  jumpId: Id<GID.Jump> | undefined,
): Registry<LID.Currency, Currency> | undefined =>
  useChainStore((s) => (jumpId != null ? s.chain?.jumps.O[jumpId]?.currencies : undefined));

/** Currency exchanges for a character in a jump, plus add/remove/update actions. */
export function useCurrencyExchanges(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const exchanges = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.currencyExchanges[charId] ?? []),
  );

  const addExchange = useCallback(() => {
    setTracked("Add currency exchange", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const currIds = Object.keys(jump.currencies.O).map(Number);
      if (currIds.length < 2) return;
      const newEx: CurrencyExchange = {
        oCurrency: createId<LID.Currency>(currIds[0]),
        tCurrency: createId<LID.Currency>(currIds[1]),
        oamount: 1,
        tamount: 1,
      };
      if (!jump.currencyExchanges[charId]) jump.currencyExchanges[charId] = [];
      jump.currencyExchanges[charId]!.push(newEx);
      c.budgetFlag += 1;
    });
  }, [jumpId, charId]);

  const removeExchange = useCallback(
    (idx: number) => {
      setTracked("Remove currency exchange", (c) => {
        const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
        if (list) list.splice(idx, 1);
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  const updateExchange = useCallback(
    (idx: number, updater: (ex: CurrencyExchange) => void) => {
      setTracked("Update currency exchange", (c) => {
        const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
        if (list?.[idx]) updater(list[idx] as CurrencyExchange);
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  const addFromDoc = useCallback(
    (opts: {
      templateIndex: number;
      oCurrency: Id<LID.Currency>;
      tCurrency: Id<LID.Currency>;
      oamount: number;
      tamount: number;
    }) => {
      setTracked("Add currency exchange", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        let existingExchange = jump.currencyExchanges[charId]?.find?.(
          (ex) => ex.templateIndex == opts.templateIndex,
        );

        if (existingExchange) {
          existingExchange.oamount += opts.oamount;
          existingExchange.tamount += opts.tamount;
        } else {
          const newEx: CurrencyExchange = {
            oCurrency: opts.oCurrency,
            tCurrency: opts.tCurrency,
            oamount: opts.oamount,
            tamount: opts.tamount,
            templateIndex: opts.templateIndex,
          };
          if (!jump.currencyExchanges[charId]) jump.currencyExchanges[charId] = [];
          jump.currencyExchanges[charId]!.push(newEx);
        }

        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  const removeDocExchange = useCallback(
    (opts: { templateIndex: number; oamount: number; tamount: number }) => {
      setTracked("Remove currency exchange", (c) => {
        const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
        if (!list) return;
        const idx = list.findIndex((e) => e.templateIndex === opts.templateIndex);
        if (idx !== -1) {
          list[idx].oamount -= opts.oamount;
          list[idx].tamount -= opts.tamount;
          if (list[idx].oamount <= 0) list.splice(idx, 1);
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  return { exchanges, addExchange, removeExchange, updateExchange, addFromDoc, removeDocExchange };
}

/** PurchaseSubtype registry for a given jump. */
export const usePurchaseSubtypes = (
  jumpId: Id<GID.Jump> | undefined,
): Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined =>
  useChainStore((s) => (jumpId != null ? s.chain?.jumps.O[jumpId]?.purchaseSubtypes : undefined));

/** Purchase categories for a given purchase type (Perk or Item only). */
export const usePurchaseCategories = (
  type: PurchaseType.Perk | PurchaseType.Item,
): Registry<GID.PurchaseCategory, string> | undefined =>
  useChainStore((s) => s.chain?.purchaseCategories[type]);

/** Purchase categories defined on a supplement (for SupplementPerk / SupplementItem). */
export const useSupplementPurchaseCategories = (
  suppId: Id<GID.Supplement> | undefined,
): Registry<GID.PurchaseCategory, string> | undefined =>
  useChainStore((s) =>
    suppId != null ? s.chain?.supplements.O[suppId]?.purchaseCategories : undefined,
  );

/** Returns just the name of a purchase by id, or undefined if not found. */
export function usePurchaseName(id: Id<GID.Purchase>): string | undefined {
  return useChainStore((s) => s.chain?.purchases.O[id]?.name);
}

/** Selects a single purchase by id and returns it with a set of tracked actions
 *  that write changes back to the store as undo-able updates. */
export function usePurchase<T extends AbstractPurchase | Drawback>(id: Id<GID.Purchase>) {
  const purchase = useChainStore((s) => s.chain?.purchases.O[id] as T | undefined);

  /** Mutate any fields on the purchase. */
  const modify = useCallback(
    (name: string, updater: (d: T) => void) => {
      setTracked(name, (chain) => {
        const target = chain.purchases.O[id];
        if (target) updater(target as T);
        chain.budgetFlag += 1;
      });
    },
    [id],
  );

  /**
   * Add a blank subpurchase to this purchase (must be a BasicPurchase).
   * Reads fId from the Immer draft — no getState() needed.
   */
  const addSubpurchase = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add subpurchase", (c) => {
      const parent = c.purchases.O[id] as BasicPurchase;
      if (!parent) return;
      const sub: Subpurchase = {
        id: newId,
        charId: parent.charId,
        jumpId: parent.jumpId,
        name: "",
        description: "",
        type: PurchaseType.Subpurchase,
        cost: { modifier: CostModifier.Full },
        value: [] as Value,
        parent: id,
      };
      c.purchases.O[newId] = sub;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!parent.subpurchases) parent.subpurchases = { stipend: [], list: [] };
      parent.subpurchases.list.push(newId);
    });
    return newId;
  }, [id]);

  /** Remove a subpurchase by id from both the registry and the parent's list. */
  const removeSubpurchase = useCallback(
    (subId: Id<GID.Purchase>) => {
      setTracked("Remove subpurchase", (c) => {
        delete c.purchases.O[subId];
        const parent = c.purchases.O[id] as BasicPurchase;
        if (parent?.subpurchases) removeFromArray(parent.subpurchases.list, subId);
        c.budgetFlag += 1;
      });
    },
    [id],
  );

  const reorderSubpurchases = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder subpurchases", (c) => {
        const parent = c.purchases.O[id] as BasicPurchase;
        if (parent?.subpurchases) parent.subpurchases.list = newIds;
      });
    },
    [id],
  );

  /** Delete all subpurchases for this purchase (e.g. when switching to a non-compound subtype). */
  const clearSubpurchases = useCallback(() => {
    setTracked("Clear subpurchases", (c) => {
      const parent = c.purchases.O[id] as BasicPurchase | undefined;
      if (!parent?.subpurchases?.list) return;
      for (const subId of parent.subpurchases.list) delete c.purchases.O[subId];
      parent.subpurchases.list = [];
      c.budgetFlag += 1;
    });
  }, [id]);

  const setSubpurchaseStipend = useCallback(
    (currId: Id<LID.Currency>, amount: number) => {
      setTracked("Set subpurchase stipend", (c) => {
        const parent = c.purchases.O[id] as BasicPurchase;
        if (!parent.subpurchases) parent.subpurchases = { stipend: [], list: [] };
        const idx = parent.subpurchases.stipend.findIndex((sv) => sv.currency === currId);
        if (amount === 0) {
          if (idx !== -1) parent.subpurchases.stipend.splice(idx, 1);
        } else if (idx !== -1) {
          parent.subpurchases.stipend[idx]!.amount = amount;
        } else {
          parent.subpurchases.stipend.push({ currency: currId, amount });
        }
        c.budgetFlag += 1;
      });
    },
    [id],
  );

  return {
    purchase,
    actions: {
      modify,
      addSubpurchase,
      removeSubpurchase,
      reorderSubpurchases,
      clearSubpurchases,
      setSubpurchaseStipend,
    },
  };
}

/**
 * Returns pre-formatted cost strings that include subpurchase totals, or null if the
 * purchase has no subpurchases. Uses `useShallow` to return stable string pairs so
 * Zustand v5 (useSyncExternalStore) never loops.
 *
 * - `short`   — total cost for collapsed view, e.g. "150 CP"
 * - `display` — annotated string for expanded view, e.g. "100 CP (reduced; total: 150 CP)"
 */
export function useSubpurchaseCostStrings(
  purchaseId: Id<GID.Purchase>,
): { short: string; display: string } | null {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return null;
      const purchase = s.chain.purchases.O[purchaseId] as BasicPurchase | undefined;
      if (!purchase?.subpurchases?.list.length) return null;
      const currencies = s.chain.jumps.O[purchase.jumpId]?.currencies;
      if (!currencies) return null;

      const { list, stipend } = purchase.subpurchases;
      const subs = list
        .map((id) => s.chain!.purchases.O[id] as Subpurchase | undefined)
        .filter((p): p is Subpurchase => p != null);

      return {
        short: formatCostShortWithSubpurchases(
          purchase.value,
          purchase.cost,
          subs,
          stipend,
          currencies,
        ),
        display: formatCostDisplayWithSubpurchases(
          purchase.value,
          purchase.cost,
          subs,
          stipend,
          currencies,
        ),
      };
    }),
  );
}

/**
 * Strips any capstone-booster text that was appended to other purchases by this purchase.
 * Call this before deleting a purchase so the boosts field is still readable.
 */
function stripBoostsFromPurchases(c: Chain, id: Id<GID.Purchase>) {
  const bp = c.purchases.O[id] as BasicPurchase | undefined;
  if (!bp?.boosts?.length) return;
  for (const { purchaseId, description } of bp.boosts) {
    const boosted = c.purchases.O[purchaseId] as BasicPurchase | undefined;
    if (!boosted) continue;
    const suffix = `\n\n${description}`;
    if (!boosted.description.includes(suffix)) continue;
    boosted.description = boosted.description.replace(suffix, "").trimEnd();
    queueNotification("boosterRemoved", boosted.name);
  }
}

/** Returns the ordered perk and item IDs for a character's slot in a jump,
 *  plus tracked add/remove actions.
 *
 *  Only includes purchases whose subtype has placement === "normal".
 *  Both ID arrays are stable references — they only change when the underlying
 *  list actually changes (useShallow element-wise comparison). */
export function useJumpBasicPurchases(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const perkIds = useChainStore(
    useShallow((s) => {
      const jump = s.chain?.jumps.O[jumpId];
      const list = jump?.purchases[charId] ?? [];
      return list.filter((id) => {
        const p = s.chain?.purchases.O[id] as BasicPurchase | undefined;
        return (
          p?.type === PurchaseType.Perk &&
          jump?.purchaseSubtypes.O[p.subtype]?.placement === "normal"
        );
      });
    }),
  );

  const itemIds = useChainStore(
    useShallow((s) => {
      const jump = s.chain?.jumps.O[jumpId];
      const list = jump?.purchases[charId] ?? [];
      return list.filter((id) => {
        const p = s.chain?.purchases.O[id] as BasicPurchase | undefined;
        return (
          p?.type === PurchaseType.Item &&
          jump?.purchaseSubtypes.O[p.subtype]?.placement === "normal"
        );
      });
    }),
  );

  const addPurchase = useCallback(
    (type: PurchaseType.Perk | PurchaseType.Item): Id<GID.Purchase> => {
      const newId = useChainStore.getState().chain!.purchases.fId;
      setTracked(type === PurchaseType.Perk ? "Add perk" : "Add item", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        // Initialise value with 0 for every currency in this jump.
        const initValue: Value = initializeCurrencyAmounts(jump);
        const purchase: BasicPurchase = {
          id: newId,
          charId,
          jumpId,
          name: "",
          description: "",
          type,
          cost: { modifier: CostModifier.Full },
          value: initValue,
          categories: [],
          tags: [],
          subtype: DefaultSubtype[type],
        };
        c.purchases.O[newId] = purchase;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!jump.purchases[charId]) jump.purchases[charId] = [];
        jump.purchases[charId]!.push(newId);
      });
      return newId;
    },
    [jumpId, charId],
  );

  const removePurchase = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove purchase", (c) => {
        // Delete any subpurchases first
        const bp = c.purchases.O[id] as BasicPurchase | undefined;
        if (bp?.subpurchases?.list) {
          for (const subId of bp.subpurchases.list) delete c.purchases.O[subId];
        }
        stripBoostsFromPurchases(c, id);
        // Clean up group membership before deleting
        if (bp?.purchaseGroup != null) {
          const g = c.purchaseGroups[charId]?.O[bp.purchaseGroup];
          if (g) {
            const gIdx = g.components.indexOf(id);
            if (gIdx !== -1) g.components.splice(gIdx, 1);
          }
        }
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (list) removeFromArray(list, id);
        c.budgetFlag += 1;
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const reorderPurchases = useCallback(
    (newIds: Id<GID.Purchase>[], type: PurchaseType.Perk | PurchaseType.Item) => {
      setTracked("Reorder purchases", (c) => {
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (!list) return;
        let cursor = 0;
        for (let i = 0; i < list.length; i++) {
          const p = c.purchases.O[list[i]] as BasicPurchase | undefined;
          if (
            p?.type === type &&
            c.jumps.O[jumpId]?.purchaseSubtypes.O[p.subtype]?.placement === "normal"
          ) {
            list[i] = newIds[cursor++];
          }
        }
      });
    },
    [jumpId, charId],
  );

  return { perkIds, itemIds, actions: { addPurchase, removePurchase, reorderPurchases } };
}

/** Returns the purchase IDs for a specific isolated subtype, plus add/remove actions.
 *  The new purchase's type is inferred from the subtype definition. */
export function useJumpSubtypePurchases(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  subtypeId: Id<LID.PurchaseSubtype>,
) {
  const purchaseIds = useChainStore(
    useShallow((s) => {
      const list = s.chain?.jumps.O[jumpId]?.purchases[charId] ?? [];
      return list.filter(
        (id) => (s.chain?.purchases.O[id] as BasicPurchase | undefined)?.subtype === subtypeId,
      );
    }),
  );

  const addPurchase = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add purchase", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const subtype = jump.purchaseSubtypes.O[subtypeId];
      if (!subtype) return;
      const initValue: Value = initializeCurrencyAmounts(jump);
      const purchase: BasicPurchase = {
        id: newId,
        charId,
        jumpId,
        name: "",
        description: "",
        type: subtype.type,
        cost: { modifier: CostModifier.Full },
        value: initValue,
        categories: [],
        tags: [],
        subtype: subtypeId,
      };
      c.purchases.O[newId] = purchase;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!jump.purchases[charId]) jump.purchases[charId] = [];
      jump.purchases[charId]!.push(newId);
    });
    return newId;
  }, [jumpId, charId, subtypeId]);

  const removePurchase = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove purchase", (c) => {
        // Delete any subpurchases first
        const bp = c.purchases.O[id] as BasicPurchase | undefined;
        if (bp?.subpurchases?.list) {
          for (const subId of bp.subpurchases.list) delete c.purchases.O[subId];
        }
        stripBoostsFromPurchases(c, id);
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (list) removeFromArray(list, id);
        c.budgetFlag += 1;
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const reorderPurchases = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder purchases", (c) => {
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (!list) return;
        let cursor = 0;
        for (let i = 0; i < list.length; i++) {
          const p = c.purchases.O[list[i]] as BasicPurchase | undefined;
          if (p?.subtype === subtypeId) list[i] = newIds[cursor++];
        }
      });
    },
    [jumpId, charId, subtypeId],
  );

  return { purchaseIds, actions: { addPurchase, removePurchase, reorderPurchases } };
}

/**
 * Given a purchase ID, returns the subtype's placement and type so the purchases
 * page can open the correct CollapsibleSection when scrollTo targets that purchase.
 * Returns undefined when the purchase or its subtype cannot be resolved.
 */
export function useScrollToPurchasePlacement(
  jumpId: Id<GID.Jump>,
  purchaseId: Id<GID.Purchase> | undefined,
):
  | {
      subtypeId: Id<LID.PurchaseSubtype>;
      placement: "normal" | "section";
      type: PurchaseType.Perk | PurchaseType.Item;
    }
  | undefined {
  return useChainStore(
    useShallow((s) => {
      if (!purchaseId) return undefined;
      const purchase = s.chain?.purchases.O[purchaseId];
      if (!purchase || (purchase.type !== PurchaseType.Perk && purchase.type !== PurchaseType.Item))
        return undefined;
      const subtype = s.chain?.jumps.O[jumpId]?.purchaseSubtypes.O[purchase.subtype];
      if (!subtype) return undefined;
      return {
        subtypeId: purchase.subtype,
        placement: subtype.placement,
        type: purchase.type as PurchaseType.Perk | PurchaseType.Item,
      };
    }),
  );
}

/** Returns the ordered IDs of purchaseSubtypes with placement === "section" for a jump.
 *  Used by the Perks & Items page to render extra CollapsibleSections. */
export function useJumpSectionSubtypeIds(jumpId: Id<GID.Jump>): Id<LID.PurchaseSubtype>[] {
  return useChainStore(
    useShallow((s) => {
      const subtypes = s.chain?.jumps.O[jumpId]?.purchaseSubtypes;
      if (!subtypes) return [];
      return (Object.entries(subtypes.O) as [string, PurchaseSubtype | undefined][])
        .filter(([, st]) => st?.placement === "section")
        .map(([id]) => createId<LID.PurchaseSubtype>(+id));
    }),
  );
}

/** Returns pre-calculated chain drawback IDs active for a character at a jump. */
export function useChainDrawbackIds(
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
): Id<GID.Purchase>[] {
  return useChainStore(
    useShallow((s) => s.calculatedData.chainDrawbacks?.[charId]?.[jumpId] ?? []),
  );
}

function makeStipendHook(field: "companionStipend" | "originStipend", label: string) {
  return function useStipend(jumpId: Id<GID.Jump>) {
    const stipend = useChainStore(
      useShallow(
        (s) => s.chain?.jumps.O[jumpId]?.[field] ?? { amount: 0, currency: DEFAULT_CURRENCY_ID },
      ),
    );

    const updateCurrency = useCallback(
      (curr: Id<LID.Currency>) => {
        setTracked(`Change ${label} currency`, (c) => {
          c.jumps.O[jumpId]![field] = {
            amount: c.jumps.O[jumpId]![field]?.amount ?? 0,
            currency: curr,
          };
          c.budgetFlag += 1;
        });
      },
      [jumpId],
    );

    const updateAmount = useCallback(
      (amount: number) => {
        setTracked(`Change ${label} amount`, (c) => {
          c.jumps.O[jumpId]![field] = {
            amount,
            currency: c.jumps.O[jumpId]![field]?.currency ?? DEFAULT_CURRENCY_ID,
          };
          c.budgetFlag += 1;
        });
      },
      [jumpId],
    );

    return { stipend, actions: { updateAmount, updateCurrency } };
  };
}

export const useJumpCompanionStipend = makeStipendHook("companionStipend", "companion stipend");
export const useJumpOriginStipend = makeStipendHook("originStipend", "origin stipend");

/** Returns pre-calculated retained drawback IDs carried into a jump for a character. */
export function useRetainedDrawbackIds(
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
): Id<GID.Purchase>[] {
  return useChainStore(
    useShallow((s) => s.calculatedData.retainedDrawbacks?.[charId]?.[jumpId] ?? []),
  );
}

/** Returns the drawback IDs for a character's slot in a jump, plus add/remove actions. */
export function useJumpDrawbacks(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const drawbackIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.drawbacks[charId] ?? []),
  );

  const addDrawback = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add drawback", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const initValue: Value = initializeCurrencyAmounts(jump);
      const drawback: Drawback = {
        id: newId,
        charId,
        jumpId,
        name: "",
        description: "",
        type: PurchaseType.Drawback,
        cost: { modifier: CostModifier.Full },
        value: initValue,
        duration: 1,
        itemStipend: 0,
        companionStipend: 0,
        overrides: {},
      };
      c.purchases.O[newId] = drawback as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
      jump.drawbacks[charId]!.push(newId);
    });
    return newId;
  }, [jumpId, charId]);

  const removeDrawback = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove drawback", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.drawbacks[charId];
        if (list) removeFromArray(list, id);
        c.budgetFlag += 1;
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const reorderDrawbacks = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder drawbacks", (c) => {
        c.jumps.O[jumpId]!.drawbacks[charId] = newIds;
      });
    },
    [jumpId, charId],
  );

  return { drawbackIds, actions: { addDrawback, removeDrawback, reorderDrawbacks } };
}

/** Returns the scenario IDs for a character's slot in a jump, plus add/remove actions. */
export function useJumpScenarios(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const scenarioIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.scenarios[charId] ?? []),
  );

  const addScenario = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add scenario", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const initValue: Value = initializeCurrencyAmounts(jump);
      const scenario: Scenario = {
        id: newId,
        charId,
        jumpId,
        name: "",
        description: "",
        type: PurchaseType.Scenario,
        cost: { modifier: CostModifier.Full },
        value: initValue,
        rewards: [],
      };
      c.purchases.O[newId] = scenario as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
      jump.scenarios[charId]!.push(newId);
    });
    return newId;
  }, [jumpId, charId]);

  const removeScenario = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove scenario", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.scenarios[charId];
        if (list) removeFromArray(list, id);
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  const reorderScenarios = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder scenarios", (c) => {
        c.jumps.O[jumpId]!.scenarios[charId] = newIds;
      });
    },
    [jumpId, charId],
  );

  return { scenarioIds, actions: { addScenario, removeScenario, reorderScenarios } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump overview hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the drawback CP limit for a jump (undefined if no limit is set). */
export function useJumpDrawbackLimit(jumpId: Id<GID.Jump>): number | undefined {
  return useChainStore((s) => s.chain?.jumps.O[jumpId]?.drawbackLimit ?? undefined);
}

/** Returns the abbreviation of the default currency for a jump (e.g. "CP"). */
export function useJumpDefaultCurrencyAbbrev(jumpId: Id<GID.Jump>): string {
  return useChainStore(
    (s) => s.chain?.jumps.O[jumpId]?.currencies.O[DEFAULT_CURRENCY_ID]?.abbrev ?? "CP",
  );
}

/** Returns { useNarrative, useAltForms } feature flags for a jump.
 *  Pass `charId` to have `useNarrative` respect `chainSettings.narratives` and character.primary:
 *  - "disabled"   → false for everyone
 *  - "restricted" → false for companions (non-primary)
 *  - "enabled"    → follows the jump-level toggle only */
export function useJumpSettings(jumpId: Id<GID.Jump>, charId?: Id<GID.Character>) {
  return useChainStore(
    useShallow((s) => {
      const j = s.chain?.jumps.O[jumpId];
      const chainAltForms = s.chain?.chainSettings.altForms ?? true;
      const narratives = s.chain?.chainSettings.narratives ?? "enabled";
      const isPrimary = charId != null ? (s.chain?.characters.O[charId]?.primary ?? false) : true;
      const narrativeAllowed =
        narratives === "disabled" ? false : narratives === "restricted" ? isPrimary : true;
      return {
        useNarrative: (j?.useNarrative ?? false) && narrativeAllowed,
        useAltForms: (j?.useAltForms ?? false) && chainAltForms,
      };
    }),
  );
}

/** Returns the notes string for a character in a jump, plus a modify action. */
export function useJumpNotes(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const notes = useChainStore((s) => s.chain?.jumps.O[jumpId]?.notes[charId] ?? "");

  const setNotes = useCallback(
    (value: string) => {
      setTracked("Edit notes", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        if (value === "") {
          delete jump.notes[charId];
        } else {
          jump.notes[charId] = value;
        }
      });
    },
    [jumpId, charId],
  );

  return { notes, setNotes };
}

/** Returns the NarrativeBlurb for a character in a jump, plus a modify action. */
export function useJumpNarrative(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const narrative = useChainStore(
    useShallow((s) => {
      const n = s.chain?.jumps.O[jumpId]?.narratives[charId];
      return n ?? null;
    }),
  );

  const setNarrative = useCallback(
    (updater: (draft: NarrativeBlurb) => void) => {
      setTracked("Edit narrative", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        if (!jump.narratives[charId]) {
          jump.narratives[charId] = { goals: "", challenges: "", accomplishments: "" };
        }
        updater(jump.narratives[charId]!);
      });
    },
    [jumpId, charId],
  );

  return { narrative, setNarrative };
}

/** Returns the originCategories registry for a jump. */
export const useJumpOriginCategories = (
  jumpId: Id<GID.Jump>,
): Registry<LID.OriginCategory, OriginCategory> | undefined =>
  useChainStore((s) => s.chain?.jumps.O[jumpId]?.originCategories);

export const useJumpCurrencies = (
  jumpId: Id<GID.Jump>,
): Registry<LID.Currency, Currency> | undefined =>
  useChainStore((s) => s.chain?.jumps.O[jumpId]?.currencies);

/**
 * Returns true if any prereq in the array is satisfied (OR semantics).
 * Empty prereqs array = always qualifies.
 */
function checkStoredAltCostPrereqs(
  prereqs: StoredAlternativeCost["prerequisites"],
  c: Chain,
  jump: Jump,
  charId: Id<GID.Character>,
): boolean {
  if (prereqs.length === 0) return true;
  const originsRec = jump.origins[charId] as
    | PartialLookup<LID.OriginCategory, Origin[]>
    | undefined;
  return prereqs.some((prereq) => {
    if (prereq.type === "origin") {
      for (const [catIdStr, cat] of Object.entries(jump.originCategories?.O ?? {})) {
        if (cat?.name === prereq.categoryName) {
          const catLid = createId<LID.OriginCategory>(+catIdStr);
          return (originsRec?.[catLid] ?? []).some(
            (o) => o.summary === prereq.originName || o.templateName === prereq.originName,
          );
        }
      }
      return false;
    }
    if (prereq.type === "drawback") {
      return (jump.drawbacks[charId] ?? []).some((id) => {
        const p = c.purchases.O[id];
        if (!p || !("template" in p)) return false;
        const jp = p as { template?: { jumpdoc: string; id: unknown } };
        return jp.template?.jumpdoc === prereq.docId && jp.template?.id === prereq.templateId;
      });
    }
    // type === "purchase"
    return (jump.purchases[charId] ?? []).some((id) => {
      const p = c.purchases.O[id];
      if (!p || !("template" in p)) return false;
      const jp = p as { template?: { jumpdoc: string; id: unknown } };
      return jp.template?.jumpdoc === prereq.docId && jp.template?.id === prereq.templateId;
    });
  });
}

/** Among qualifying mandatory alt costs, prefer a free one (all amounts 0); else return first. */
function findBestMandatoryAltCost(
  altCosts: StoredAlternativeCost[] | undefined,
  c: Chain,
  jump: Jump,
  charId: Id<GID.Character>,
): StoredAlternativeCost | undefined {
  if (!altCosts?.length) return undefined;
  const qualifying = altCosts.filter(
    (ac) => ac.mandatory && checkStoredAltCostPrereqs(ac.prerequisites, c, jump, charId),
  );
  if (!qualifying.length) return undefined;
  return qualifying.find((ac) => ac.value.every((v) => v.amount === 0)) ?? qualifying[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Batched toast notifications
// All modifier/cascade functions queue into this buffer; a single setTimeout
// per synchronous run flushes them together so multiple changes produce one toast.
// ─────────────────────────────────────────────────────────────────────────────

type PendingNotifications = {
  prerequisiteLost: string[];
  originLost: string[];
  synergyLost: string[];
  costReverted: string[];
  costUpdated: string[];
  boosterAdded: string[];
  boosterRemoved: string[];
};

let _pendingNotifications: PendingNotifications | null = null;

function queueNotification(type: keyof PendingNotifications, name: string): void {
  if (!_pendingNotifications) {
    _pendingNotifications = {
      prerequisiteLost: [],
      originLost: [],
      synergyLost: [],
      costReverted: [],
      costUpdated: [],
      boosterAdded: [],
      boosterRemoved: [],
    };
    setTimeout(flushNotifications, 0);
  }
  _pendingNotifications[type].push(name);
}

function flushNotifications(): void {
  const pending = _pendingNotifications;
  _pendingNotifications = null;
  if (!pending) return;

  const formatNames = (names: string[]): string => {
    const unique = [...new Set(names)];
    if (unique.length === 1) return `"${unique[0]}"`;
    if (unique.length === 2) return `"${unique[0]}" and "${unique[1]}"`;
    return (
      unique
        .slice(0, -1)
        .map((n) => `"${n}"`)
        .join(", ") + `, and "${unique[unique.length - 1]}"`
    );
  };
  const wasWere = (names: string[]) => (new Set(names).size === 1 ? "was" : "were");
  const costCosts = (names: string[]) => (new Set(names).size === 1 ? "cost" : "costs");

  if (pending.prerequisiteLost.length > 0)
    toast.warn(
      `${formatNames(pending.prerequisiteLost)} ${wasWere(pending.prerequisiteLost)} removed (prerequisite lost)`,
    );
  if (pending.originLost.length > 0)
    toast.warn(
      `${formatNames(pending.originLost)} ${wasWere(pending.originLost)} removed (origin no longer held)`,
    );
  if (pending.synergyLost.length > 0)
    toast.warn(
      `${formatNames(pending.synergyLost)} ${wasWere(pending.synergyLost)} removed (required origin no longer held)`,
    );
  if (pending.costReverted.length > 0)
    toast.warn(
      `${formatNames(pending.costReverted)} ${costCosts(pending.costReverted)} reverted to full`,
    );
  if (pending.costUpdated.length > 0)
    toast.info(`${formatNames(pending.costUpdated)} ${costCosts(pending.costUpdated)} updated`);
  if (pending.boosterAdded.length > 0)
    toast.info(`Combo text added to ${formatNames(pending.boosterAdded)}`);
  if (pending.boosterRemoved.length > 0)
    toast.info(`Combo text removed from ${formatNames(pending.boosterRemoved)}`);
}

/**
 * Recomputes synergy-affected origin costs within an Immer chain draft.
 * Removes access-restricted origins whose synergy origin is no longer held.
 */
function applyOriginSynergiesInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;
  const originsRec = jump.origins[charId] as
    | PartialLookup<LID.OriginCategory, Origin[]>
    | undefined;
  if (!originsRec) return;

  const toRemove: { catLid: Id<LID.OriginCategory>; idx: number; name: string }[] = [];

  for (const [catIdStr, list] of Object.entries(originsRec)) {
    if (!list) continue;
    const catLid = createId<LID.OriginCategory>(+catIdStr);
    for (let i = 0; i < list.length; i++) {
      const origin = list[i]!;
      if (!origin.synergyOrigins?.length) continue;
      const hasSynergy = origin.synergyOrigins.some(({ categoryName, originName }) => {
        for (const [cIdStr, cat] of Object.entries(jump.originCategories?.O ?? {})) {
          if (cat?.name === categoryName) {
            const cLid = createId<LID.OriginCategory>(+cIdStr);
            return (originsRec[cLid] ?? []).some(
              (o) => o.summary === originName || o.templateName === originName,
            );
          }
        }
        return false;
      });
      const base = origin.baseCost ?? origin.value;
      if (!hasSynergy && origin.synergyBenefit === "access") {
        toRemove.push({ catLid, idx: i, name: origin.summary });
      } else if (hasSynergy) {
        if (origin.synergyBenefit === "free") {
          origin.value.amount = 0;
        } else {
          const threshold = jump.currencies.O[base.currency]?.discountFreeThreshold;
          const discounted = Math.floor(base.amount / 2);
          origin.value.amount = threshold != null && base.amount <= threshold ? 0 : discounted;
        }
      } else {
        origin.value.amount = base.amount;
      }
    }
  }

  if (toRemove.length) {
    c.budgetFlag += 1;
    for (const { name } of toRemove) queueNotification("synergyLost", name);
    for (const { catLid, idx } of [...toRemove].sort((a, b) => b.idx - a.idx)) {
      const list = originsRec[catLid];
      if (list) {
        list.splice(idx, 1);
        if ((list as Origin[]).length === 0) delete originsRec[catLid];
      }
    }
    for (const { name } of toRemove) {
      // Inline stipend removal (mirrors removeOriginStipendDrawbacks in AnnotationInteractionHandler).
      const jump2 = c.jumps.O[jumpId];
      if (jump2) {
        const list2 = jump2.drawbacks[charId];
        if (list2) {
          const prefix = `${name} Stipend:`;
          const toRemoveIds = new Set<Id<GID.Purchase>>(
            list2.filter((id) => c.purchases.O[id]?.name?.startsWith(prefix)),
          );
          for (const id of toRemoveIds) delete c.purchases.O[id];
          jump2.drawbacks[charId] = list2.filter((id) => !toRemoveIds.has(id));
        }
      }
    }
  }
}

/**
 * Recomputes origin discounts AND mandatory alternative costs for purchases and
 * drawbacks within an Immer chain draft.
 * Called inside a createTrackedAction callback so it joins the same undo entry.
 *
 * Cost priority: Free(origin) > Custom(mandatory alt cost) > Reduced(origin) > Full.
 */
function applyPurchaseModifiersInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  docId: string,
  excludeId?: Id<GID.Purchase>,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;
  const origins = jump.origins[charId] as PartialLookup<LID.OriginCategory, Origin[]> | undefined;
  // For each templateId, only the first discounted copy is eligible to be Free.
  // Cast to a shape shared by BasicPurchase and CompanionImport — both carry these fields.
  type OriginDiscountable = {
    discountOrigins?: { categoryName: string; originName: string }[];
    originBenefit?: "discounted" | "free" | "access";
    template?: { jumpdoc: string; id: unknown };
    value: Value;
    cost: ModifiedCost;
    alternativeCosts?: StoredAlternativeCost[];
    subtype?: Id<LID.PurchaseSubtype>;
    usesFloatingDiscount?: boolean;
    optionalAltCost?: true;
    optionalAltCostBeforeDiscountsValue?: Value;
  };
  const freeSlotsUsed = new Set<number>();
  const toRemove: Id<GID.Purchase>[] = [];
  for (const id of jump.purchases[charId] ?? []) {
    if (id === excludeId) continue;
    const bp = c.purchases.O[id] as OriginDiscountable | undefined;
    if (!bp?.template) continue;
    if (bp.template.jumpdoc !== docId) continue;
    // Skip if neither origin discounts nor alt costs are stored.
    if (!bp.discountOrigins && !bp.alternativeCosts?.length) continue;

    const hasDiscount =
      bp.discountOrigins?.some(({ categoryName, originName }) => {
        for (const [idStr, cat] of Object.entries(jump.originCategories?.O ?? {})) {
          if (cat?.name === categoryName) {
            const catLid = createId<LID.OriginCategory>(+idStr);
            return (origins?.[catLid] ?? []).some(
              (o) => o.summary === originName || o.templateName === originName,
            );
          }
        }
        return false;
      }) ?? false;

    // Access-restricted purchases whose qualifying origin is no longer held are removed.
    if (!hasDiscount && bp.originBenefit === "access") {
      toRemove.push(id);
      continue;
    }

    // Origin-based floating discount subtypes: never auto-add discounts, only remove them.
    const isOriginBased =
      bp.subtype != null
        ? jump.purchaseSubtypes.O[bp.subtype]?.floatingDiscountMode === "origin"
        : false;
    if (isOriginBased) {
      if (!hasDiscount) {
        const oldModifier = bp.cost.modifier;
        bp.cost = { modifier: CostModifier.Full };
        delete bp.usesFloatingDiscount;
        if (oldModifier !== CostModifier.Full) {
          const name = (bp as { name?: string }).name ?? "Purchase";
          queueNotification("costReverted", name);
        }
      }
      // If origin is still held, leave cost unchanged (user controls the discount manually).
      continue;
    }

    const mandatoryAlt = findBestMandatoryAltCost(bp.alternativeCosts, c, jump, charId);
    const bpFull = bp as OriginDiscountable & { name?: string };

    // For beforeDiscounts alt costs (mandatory or optional), origin discounts apply to the alt
    // cost value. Use that value as the base for wouldBeFree/Reduced checks.
    const beforeDiscountsBase: Value | undefined = mandatoryAlt?.beforeDiscounts
      ? mandatoryAlt.value
      : bpFull.optionalAltCostBeforeDiscountsValue;

    let originIsFree = false;
    let originIsReduced = false;
    if (hasDiscount) {
      const templateKey = bp.template.id as number;
      const isFirstCopy = !freeSlotsUsed.has(templateKey);
      const discountBase = beforeDiscountsBase ?? bp.value;
      const wouldBeFree =
        isFirstCopy &&
        (bp.originBenefit === "free" ||
          discountBase.every((v) => {
            if (v.amount <= 0) return true;
            const currency = jump.currencies.O[v.currency];
            return (
              currency?.discountFreeThreshold !== undefined &&
              v.amount <= currency.discountFreeThreshold
            );
          }));
      if (wouldBeFree) {
        freeSlotsUsed.add(templateKey);
        originIsFree = true;
      } else {
        originIsReduced = true;
      }
    }

    const oldModifier = bp.cost.modifier;
    const oldModifiedTo: Value | number | undefined =
      oldModifier === CostModifier.Custom
        ? (bp.cost as { modifier: CostModifier.Custom; modifiedTo: Value | number }).modifiedTo
        : undefined;

    // Priority: beforeDiscounts-alt+origin > Free(origin) > Custom(mandatory alt) > Custom(optional alt, preserved) > Reduced(origin) > Full
    if (beforeDiscountsBase) {
      // Origin discount stacks on top of alt cost base.
      if (originIsFree) {
        bp.cost = { modifier: CostModifier.Free };
      } else if (originIsReduced) {
        bp.cost = {
          modifier: CostModifier.Custom,
          modifiedTo: beforeDiscountsBase.map((v) => ({
            amount: Math.floor(v.amount / 2),
            currency: v.currency,
          })),
        };
      } else {
        bp.cost = { modifier: CostModifier.Custom, modifiedTo: beforeDiscountsBase };
      }
      if (mandatoryAlt?.beforeDiscounts) delete bpFull.optionalAltCost;
    } else if (originIsFree) {
      bp.cost = { modifier: CostModifier.Free };
      delete bpFull.optionalAltCost;
      delete bpFull.optionalAltCostBeforeDiscountsValue;
    } else if (mandatoryAlt) {
      bp.cost = { modifier: CostModifier.Custom, modifiedTo: mandatoryAlt.value };
      delete bpFull.optionalAltCost;
      delete bpFull.optionalAltCostBeforeDiscountsValue;
    } else if (bpFull.optionalAltCost && bp.cost.modifier === CostModifier.Custom) {
      // Preserve user-chosen non-beforeDiscounts optional alt cost — do not touch bp.cost.
    } else if (originIsReduced) {
      bp.cost = { modifier: CostModifier.Reduced };
      delete bpFull.optionalAltCostBeforeDiscountsValue;
    } else {
      bp.cost = { modifier: CostModifier.Full };
      delete bpFull.optionalAltCostBeforeDiscountsValue;
    }

    const newModifier = bp.cost.modifier;
    const newModifiedTo: Value | number | undefined =
      newModifier === CostModifier.Custom
        ? (bp.cost as { modifier: CostModifier.Custom; modifiedTo: Value | number }).modifiedTo
        : undefined;
    const modifierChanged = newModifier !== oldModifier;
    const customValueChanged =
      !modifierChanged &&
      newModifier === CostModifier.Custom &&
      JSON.stringify(newModifiedTo) !== JSON.stringify(oldModifiedTo);
    if (modifierChanged || customValueChanged) {
      const name = bpFull.name ?? "Purchase";
      const wasDiscounted = oldModifier !== CostModifier.Full;
      const nowDiscounted = newModifier !== CostModifier.Full;
      if (wasDiscounted && !nowDiscounted) {
        queueNotification("costReverted", name);
      } else if (!wasDiscounted && nowDiscounted) {
        queueNotification("costUpdated", name);
      } else {
        // Cost changed between two discounted states (e.g. beforeDiscounts + origin stacking/unstacking).
        if (originIsFree || originIsReduced) {
          queueNotification("costUpdated", name);
        } else {
          queueNotification("costReverted", name);
        }
      }
    }
  }
  if (toRemove.length) {
    c.budgetFlag += 1;
    for (const id of toRemove) {
      const name = (c.purchases.O[id] as { name?: string } | undefined)?.name ?? "Purchase";
      queueNotification("originLost", name);
    }
    const removeSet = new Set(toRemove);
    for (const id of toRemove) {
      stripBoostsFromPurchases(c, id);
      delete c.purchases.O[id];
    }
    const list = jump.purchases[charId] as Id<GID.Purchase>[] | undefined;
    if (list) {
      jump.purchases[charId] = list.filter((id) => !removeSet.has(id)) as never;
    }
  }

  // Recompute mandatory alt costs on drawbacks from this doc.
  for (const id of jump.drawbacks[charId] ?? []) {
    if (id === excludeId) continue;
    const db = c.purchases.O[id] as
      | (Drawback & { alternativeCosts?: StoredAlternativeCost[] })
      | undefined;
    if (!db || db.type !== PurchaseType.Drawback) continue;
    const dbT = db as unknown as { template?: { jumpdoc: string; id: unknown } };
    if (dbT.template?.jumpdoc !== docId) continue;
    if (!db.alternativeCosts?.length) continue;
    const mandatoryAlt = findBestMandatoryAltCost(db.alternativeCosts, c, jump, charId);
    db.cost = mandatoryAlt
      ? { modifier: CostModifier.Custom, modifiedTo: mandatoryAlt.value }
      : { modifier: CostModifier.Full };
  }
}

/**
 * Collects every unique docId from purchases/drawbacks that have stored alt costs, then
 * calls `applyPurchaseModifiersInDraft` for each. Use this when a purchase or drawback is
 * added or removed — the change may qualify or disqualify a prereq for any other item.
 *
 * Pass `excludeId` to skip one specific purchase (e.g. the one just added, whose
 * cost was already set by `initialCost` and must not be overwritten by recalculation).
 */
function applyAllPurchaseModifiersInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  excludeId?: Id<GID.Purchase>,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;
  const docIds = new Set<string>();
  for (const id of [...(jump.purchases[charId] ?? []), ...(jump.drawbacks[charId] ?? [])]) {
    if (id === excludeId) continue;
    const p = c.purchases.O[id] as
      | { template?: { jumpdoc: string }; alternativeCosts?: unknown[] }
      | undefined;
    if (p?.alternativeCosts?.length && p.template?.jumpdoc) {
      docIds.add(p.template.jumpdoc);
    }
  }
  for (const docId of docIds) {
    applyPurchaseModifiersInDraft(c, jumpId, charId, docId, excludeId);
  }
  // Cascade-remove any purchases whose positive prereqs were just removed by access-blocking.
  applyPurchasePrereqCascadeInDraft(c, jumpId, charId);
}

/**
 * Cascade-removes BasicPurchases and Drawbacks whose positive prerequisites are no longer
 * satisfied. Iterates until stable so that chain removals (A requires B requires C) propagate.
 */
function applyPurchasePrereqCascadeInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;

  // Helper: check if a template reference is still present in a list.
  const templateHeld = (
    list: Id<GID.Purchase>[],
    docId: string,
    templateId: unknown,
    excludeId: Id<GID.Purchase>,
  ) =>
    list.some((pid) => {
      if (pid === excludeId) return false;
      const p = c.purchases.O[pid] as { template?: { jumpdoc: string; id: unknown } } | undefined;
      return p?.template?.jumpdoc === docId && p?.template?.id === templateId;
    });

  // Helper: resolve which list to check for a given prereq type.
  const prereqList = (prereq: StoredPurchasePrerequisite): Id<GID.Purchase>[] =>
    prereq.type === "purchase"
      ? (jump.purchases[charId] ?? [])
      : prereq.type === "drawback"
        ? (jump.drawbacks[charId] ?? [])
        : (jump.scenarios[charId] ?? []);

  let changed = true;
  while (changed) {
    changed = false;
    const purchasesToRemove: Id<GID.Purchase>[] = [];
    const drawbacksToRemove: Id<GID.Purchase>[] = [];
    const scenariosToRemove: Id<GID.Purchase>[] = [];

    for (const id of jump.purchases[charId] ?? []) {
      const p = c.purchases.O[id] as BasicPurchase | undefined;
      if (!p?.storedPrerequisites?.length) continue;
      for (const prereq of p.storedPrerequisites) {
        if (!prereq.positive) continue;
        if (!templateHeld(prereqList(prereq), prereq.docId, prereq.templateId, id)) {
          purchasesToRemove.push(id);
          break;
        }
      }
    }

    for (const id of jump.drawbacks[charId] ?? []) {
      const db = c.purchases.O[id] as Drawback | undefined;
      if (!db || db.type !== PurchaseType.Drawback) continue;
      if (!db.storedPrerequisites?.length) continue;
      for (const prereq of db.storedPrerequisites) {
        if (!prereq.positive) continue;
        if (!templateHeld(prereqList(prereq), prereq.docId, prereq.templateId, id)) {
          drawbacksToRemove.push(id);
          break;
        }
      }
    }

    for (const id of jump.scenarios[charId] ?? []) {
      const sc = c.purchases.O[id] as Scenario | undefined;
      if (!sc?.storedPrerequisites?.length) continue;
      for (const prereq of sc.storedPrerequisites) {
        if (!prereq.positive) continue;
        if (!templateHeld(prereqList(prereq), prereq.docId, prereq.templateId, id)) {
          scenariosToRemove.push(id);
          break;
        }
      }
    }

    if (purchasesToRemove.length) {
      changed = true;
      c.budgetFlag += 1;
      for (const id of purchasesToRemove) {
        const name = (c.purchases.O[id] as { name?: string } | undefined)?.name ?? "Purchase";
        queueNotification("prerequisiteLost", name);
      }
      const removeSet = new Set(purchasesToRemove);
      for (const id of purchasesToRemove) {
        stripBoostsFromPurchases(c, id);
        delete c.purchases.O[id];
      }
      const list = jump.purchases[charId] as Id<GID.Purchase>[] | undefined;
      if (list) jump.purchases[charId] = list.filter((id) => !removeSet.has(id)) as never;
    }

    if (drawbacksToRemove.length) {
      changed = true;
      c.budgetFlag += 1;
      for (const id of drawbacksToRemove) {
        const name = (c.purchases.O[id] as { name?: string } | undefined)?.name ?? "Drawback";
        queueNotification("prerequisiteLost", name);
      }
      removeDrawbacksInDraft(c, jumpId, charId, drawbacksToRemove);
    }

    if (scenariosToRemove.length) {
      changed = true;
      c.budgetFlag += 1;
      const removeSet = new Set(scenariosToRemove);
      for (const id of scenariosToRemove) {
        const name = (c.purchases.O[id] as { name?: string } | undefined)?.name ?? "Scenario";
        queueNotification("prerequisiteLost", name);
        const sc = c.purchases.O[id] as Scenario | undefined;
        // Remove any reward purchases that were granted for this scenario.
        if (sc?.type === PurchaseType.Scenario) {
          const docId = sc.template?.jumpdoc;
          const pl = jump.purchases[charId] as Id<GID.Purchase>[] | undefined;
          for (const reward of sc.rewards) {
            if (
              (reward.type === RewardType.Item || reward.type === RewardType.Perk) &&
              docId &&
              pl
            ) {
              const toRemove = pl.filter((pid) => {
                const p = c.purchases.O[pid] as
                  | { template?: { jumpdoc: string; id: unknown } }
                  | undefined;
                return p?.template?.jumpdoc === docId && p?.template?.id === reward.id;
              });
              for (const pid of toRemove) {
                delete c.purchases.O[pid];
                const idx = pl.indexOf(pid);
                if (idx !== -1) pl.splice(idx, 1);
              }
            }
          }
        }
        delete c.purchases.O[id];
      }
      const list = jump.scenarios[charId] as Id<GID.Purchase>[] | undefined;
      if (list) jump.scenarios[charId] = list.filter((id) => !removeSet.has(id)) as never;
    }
  }
}

/**
 * Creates a BasicPurchase inside an existing tracked-action draft.
 * Extracted so both useJumpDocPurchaseActions and useJumpDocScenarioActions can share
 * the creation logic without opening separate undo entries.
 */
function createBasicPurchaseInDraft(
  c: Chain,
  data: {
    jumpId: Id<GID.Jump>;
    charId: Id<GID.Character>;
    name: string;
    description: string;
    value: Value;
    templateId: Id<TID.Purchase>;
    docId: string;
    subtype: Id<LID.PurchaseSubtype>;
    type: PurchaseType.Perk | PurchaseType.Item;
    cost?: ModifiedCost;
    boosts?: { purchaseId: Id<GID.Purchase>; description: string }[];
    /** Booster purchases already held that boost this item. Registers this new purchase in each
     *  booster's boosts array so stripBoostsFromPurchases can find it on deletion. */
    reverseBoosts?: { boosterPurchaseId: Id<GID.Purchase>; description: string }[];
    discountOrigins?: { categoryName: string; originName: string }[];
    originBenefit?: "discounted" | "free" | "access";
    alternativeCosts?: StoredAlternativeCost[];
    optionalAltCost?: boolean;
    optionalAltCostBeforeDiscountsValue?: Value;
    storedPrerequisites?: StoredPurchasePrerequisite[];
    usesFloatingDiscount?: boolean;
    temporary?: boolean;
  },
): Id<GID.Purchase> {
  const newId = c.purchases.fId;
  const purchase: BasicPurchase = {
    id: newId,
    charId: data.charId,
    jumpId: data.jumpId,
    name: data.name,
    description: data.description,
    type: data.type,
    cost: data.cost ?? { modifier: CostModifier.Full },
    value: data.value,
    categories: [],
    tags: [],
    subtype: data.subtype,
    template: { jumpdoc: data.docId, id: data.templateId },
    ...(data.temporary ? { duration: 1 } : {}),
    ...(data.boosts?.length ? { boosts: data.boosts } : {}),
    ...(data.discountOrigins?.length ? { discountOrigins: data.discountOrigins } : {}),
    ...(data.originBenefit ? { originBenefit: data.originBenefit } : {}),
    ...(data.alternativeCosts?.length ? { alternativeCosts: data.alternativeCosts } : {}),
    ...(data.optionalAltCost ? { optionalAltCost: true as const } : {}),
    ...(data.optionalAltCostBeforeDiscountsValue?.length
      ? { optionalAltCostBeforeDiscountsValue: data.optionalAltCostBeforeDiscountsValue }
      : {}),
    ...(data.storedPrerequisites?.length ? { storedPrerequisites: data.storedPrerequisites } : {}),
    ...(data.usesFloatingDiscount ? { usesFloatingDiscount: true as const } : {}),
  };
  c.purchases.O[newId] = purchase;
  c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
  const jump = c.jumps.O[data.jumpId];
  if (jump) {
    if (!jump.purchases[data.charId]) jump.purchases[data.charId] = [];
    jump.purchases[data.charId]!.push(newId);
  }
  if (data.boosts?.length) {
    for (const { purchaseId, description } of data.boosts) {
      const boosted = c.purchases.O[purchaseId] as BasicPurchase | undefined;
      if (boosted && !boosted.description.includes(description)) {
        boosted.description = `${boosted.description}\n\n${description}`.trimStart();
        queueNotification("boosterAdded", boosted.name);
      }
    }
  }
  if (data.reverseBoosts?.length) {
    for (const { boosterPurchaseId, description } of data.reverseBoosts) {
      const booster = c.purchases.O[boosterPurchaseId] as BasicPurchase | undefined;
      if (!booster) continue;
      if (!booster.boosts) booster.boosts = [];
      if (!booster.boosts.some((b) => b.purchaseId === newId))
        booster.boosts.push({ purchaseId: newId, description });
    }
  }
  return newId;
}

/**
 * Actions for adding/removing BasicPurchases sourced from a JumpDoc annotation,
 * plus a function to find an existing purchase by its JumpDoc template reference.
 * Used by AnnotationInteractionHandler to handle purchase annotation clicks.
 */
export function useJumpDocPurchaseActions(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const purchaseIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.purchases[charId] ?? []),
  );

  const addFromTemplate = useCallback(
    (data: {
      name: string;
      description: string;
      value: Value;
      templateId: Id<TID.Purchase>;
      docId: string;
      subtype: Id<LID.PurchaseSubtype>;
      type: PurchaseType.Perk | PurchaseType.Item;
      boosts?: { purchaseId: Id<GID.Purchase>; description: string }[];
      reverseBoosts?: { boosterPurchaseId: Id<GID.Purchase>; description: string }[];
      initialCost?: ModifiedCost;
      discountOrigins?: { categoryName: string; originName: string }[];
      originBenefit?: "discounted" | "free" | "access";
      alternativeCosts?: StoredAlternativeCost[];
      optionalAltCost?: boolean;
      optionalAltCostBeforeDiscountsValue?: Value;
      storedPrerequisites?: StoredPurchasePrerequisite[];
      usesFloatingDiscount?: boolean;
      temporary?: boolean;
    }): Id<GID.Purchase> => {
      const newId = useChainStore.getState().chain!.purchases.fId;
      setTracked(data.type === PurchaseType.Perk ? "Add perk" : "Add item", (c) => {
        c.budgetFlag += 1;
        if (!c.jumps.O[jumpId]) return;
        createBasicPurchaseInDraft(c, {
          jumpId,
          charId,
          name: data.name,
          description: data.description,
          value: data.value,
          templateId: data.templateId,
          docId: data.docId,
          subtype: data.subtype,
          type: data.type,
          cost: data.initialCost,
          boosts: data.boosts,
          reverseBoosts: data.reverseBoosts,
          discountOrigins: data.discountOrigins,
          originBenefit: data.originBenefit,
          alternativeCosts: data.alternativeCosts,
          optionalAltCost: data.optionalAltCost,
          optionalAltCostBeforeDiscountsValue: data.optionalAltCostBeforeDiscountsValue,
          storedPrerequisites: data.storedPrerequisites,
          usesFloatingDiscount: data.usesFloatingDiscount,
          temporary: data.temporary,
        });
        // Exclude the newly-added purchase: its cost was already set by initialCost
        // (which may reflect a user-chosen optional alt cost) and must not be overwritten.
        applyAllPurchaseModifiersInDraft(c, jumpId, charId, newId);
      });
      return newId;
    },
    [jumpId, charId],
  );

  const removePurchase = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove purchase", (c) => {
        c.budgetFlag += 1;
        stripBoostsFromPurchases(c, id);
        delete c.purchases.O[id];
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const arr = jump.purchases[charId];
        if (!arr) return;
        const idx = arr.indexOf(id);
        if (idx !== -1) arr.splice(idx, 1);
        // Recalculate all alt costs and origin discounts — the removed purchase may have been
        // a prereq for another item's alt cost, or the free-slot promotion may shift.
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const findByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Purchase>): Id<GID.Purchase> | undefined => {
      const purchases = useChainStore.getState().chain?.purchases.O;
      if (!purchases) return undefined;
      return purchaseIds.find((id) => {
        const p = purchases[id] as BasicPurchase | undefined;
        return p?.template?.jumpdoc === docId && p?.template?.id === templateId;
      });
    },
    [purchaseIds],
  );

  const countByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Purchase>): number => {
      const purchases = useChainStore.getState().chain?.purchases.O;
      if (!purchases) return 0;
      return purchaseIds.filter((id) => {
        const p = purchases[id] as BasicPurchase | undefined;
        return p?.template?.jumpdoc === docId && p?.template?.id === templateId;
      }).length;
    },
    [purchaseIds],
  );

  /**
   * Returns the names of all currently held purchases that declare themselves
   * incompatible with the given template (negative storedPrerequisite pointing at it).
   * Used to enforce bidirectional incompatibilities at add-time.
   */
  const findReverseIncompatibilities = useCallback(
    (docId: string, templateId: Id<TID.Purchase>): string[] => {
      const purchases = useChainStore.getState().chain?.purchases.O;
      if (!purchases) return [];
      const names: string[] = [];
      for (const id of purchaseIds) {
        const p = purchases[id] as BasicPurchase | undefined;
        if (!p?.storedPrerequisites) continue;
        const blocks = p.storedPrerequisites.some(
          (prereq) =>
            !prereq.positive &&
            prereq.type === "purchase" &&
            prereq.docId === docId &&
            prereq.templateId === templateId,
        );
        if (blocks) names.push(p.name ?? "?");
      }
      return names;
    },
    [purchaseIds],
  );

  const getModifiersUpdater = useCallback(
    (docId: string): ((c: Chain) => void) =>
      (c) => {
        applyPurchaseModifiersInDraft(c, jumpId, charId, docId);
        applyOriginSynergiesInDraft(c, jumpId, charId);
        applyPurchasePrereqCascadeInDraft(c, jumpId, charId);
      },
    [jumpId, charId],
  );

  return {
    purchaseIds,
    addFromTemplate,
    removePurchase,
    findByTemplate,
    countByTemplate,
    getModifiersUpdater,
    findReverseIncompatibilities,
  };
}

/**
 * Recalculates the jump's duration based on all active drawback durationMods
 * sourced from the given JumpDoc.
 *
 * Base years = the "set" mod's value if one exists, otherwise `doc.duration.years`.
 * Final years = base + sum of all "inc" mod values.
 */
function applyDrawbackDurationModsInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  docId: string,
  doc: JumpDoc,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;

  let setYears: number | undefined;
  let incYears = 0;

  for (const charIdStr of Object.keys(jump.drawbacks)) {
    for (const dbId of (jump.drawbacks as Record<string, Id<GID.Purchase>[]>)[charIdStr] ?? []) {
      const drawback = c.purchases.O[dbId] as
        | { template?: { jumpdoc: string; id: unknown } }
        | undefined;
      if (drawback?.template?.jumpdoc !== docId) continue;
      const template = doc.availableDrawbacks.O[drawback.template.id as Id<TID.Drawback>] as
        | DrawbackTemplate
        | undefined;
      if (!template?.durationMod) continue;
      if (template.durationMod.type === "set") {
        setYears = template.durationMod.years;
      } else {
        incYears += template.durationMod.years;
      }
    }
  }

  if (setYears !== undefined) {
    jump.duration = { days: 0, months: 0, years: setYears + incYears };
  } else {
    jump.duration = { ...doc.duration, years: doc.duration.years + incYears };
  }
}

/**
 * Removes drawbacks from an Immer draft and recalculates jump duration for any
 * affected JumpDoc if the removed drawbacks had durationMods.
 * Shared between the explicit remove action and the prereq cascade.
 */
function removeDrawbacksInDraft(
  c: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  ids: Id<GID.Purchase>[],
): void {
  if (!ids.length) return;
  const jump = c.jumps.O[jumpId];
  if (!jump) return;

  // Collect template refs before deletion so we can check durationMods after.
  const templateRefs = ids
    .map(
      (id) =>
        (c.purchases.O[id] as { template?: { jumpdoc: string; id: unknown } } | undefined)
          ?.template,
    )
    .filter((t): t is { jumpdoc: string; id: unknown } => !!t);

  const removeSet = new Set(ids);
  // Strip any capstone-booster text these drawbacks applied to purchases.
  for (const id of ids) {
    const db = c.purchases.O[id] as Drawback | undefined;
    if (db && "boosts" in db && db.boosts?.length) {
      for (const { purchaseId, description } of db.boosts) {
        const boosted = c.purchases.O[purchaseId] as BasicPurchase | undefined;
        if (!boosted) continue;
        const suffix = `\n\n${description}`;
        if (!boosted.description.includes(suffix)) continue;
        boosted.description = boosted.description.replace(suffix, "").trimEnd();
        queueNotification("boosterRemoved", boosted.name);
      }
    }
  }
  for (const id of ids) delete c.purchases.O[id];
  const list = jump.drawbacks[charId] as Id<GID.Purchase>[] | undefined;
  if (list) jump.drawbacks[charId] = list.filter((id) => !removeSet.has(id)) as never;

  if (!templateRefs.length) return;
  const doc = useJumpDocStore.getState().doc;
  if (!doc) return;
  const affectedDocIds = new Set(templateRefs.map((t) => t.jumpdoc));
  for (const docId of affectedDocIds) {
    const hasDurationMod = templateRefs.some((t) => {
      if (t.jumpdoc !== docId) return false;
      return !!(doc.availableDrawbacks.O[t.id as Id<TID.Drawback>] as DrawbackTemplate | undefined)
        ?.durationMod;
    });
    if (hasDurationMod) applyDrawbackDurationModsInDraft(c, jumpId, docId, doc);
  }
}

/**
 * Actions for adding/removing Drawbacks sourced from a JumpDoc annotation,
 * plus a function to find an existing drawback by its JumpDoc template reference.
 */
export function useJumpDocDrawbackActions(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const drawbackIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.drawbacks[charId] ?? []),
  );

  const addFromTemplate = useCallback(
    (data: {
      name: string;
      description: string;
      value: Value;
      templateId: Id<TID.Drawback>;
      docId: string;
      initialCost?: ModifiedCost;
      alternativeCosts?: StoredAlternativeCost[];
      storedPrerequisites?: StoredPurchasePrerequisite[];
      boosts?: { purchaseId: Id<GID.Purchase>; description: string }[];
    }): Id<GID.Purchase> => {
      const newId = useChainStore.getState().chain!.purchases.fId;
      const doc = useJumpDocStore.getState().doc;
      const templateEntry = doc?.availableDrawbacks.O[data.templateId] as
        | DrawbackTemplate
        | undefined;
      const hasDurationMod = !!templateEntry?.durationMod;
      setTracked("Add drawback", (c) => {
        c.budgetFlag += 1;
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const drawback: Drawback = {
          id: newId,
          charId,
          jumpId,
          name: data.name,
          description: data.description,
          type: PurchaseType.Drawback,
          cost: data.initialCost ?? { modifier: CostModifier.Full },
          value: data.value,
          template: { jumpdoc: data.docId, id: data.templateId },
          duration: 1,
          itemStipend: 0,
          companionStipend: 0,
          overrides: {},
          ...(data.alternativeCosts?.length ? { alternativeCosts: data.alternativeCosts } : {}),
          ...(data.storedPrerequisites?.length
            ? { storedPrerequisites: data.storedPrerequisites }
            : {}),
          ...(data.boosts?.length ? { boosts: data.boosts } : {}),
        } as Drawback;
        c.purchases.O[newId] = drawback as never;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
        jump.drawbacks[charId]!.push(newId);
        // Apply capstone booster text to already-held purchases.
        if (data.boosts?.length) {
          for (const { purchaseId, description } of data.boosts) {
            const boosted = c.purchases.O[purchaseId] as BasicPurchase | undefined;
            if (boosted && !boosted.description.includes(description)) {
              boosted.description = `${boosted.description}\n\n${description}`.trimStart();
              queueNotification("boosterAdded", boosted.name);
            }
          }
        }
        applyAllPurchaseModifiersInDraft(c, jumpId, charId, newId);
        if (hasDurationMod && doc) applyDrawbackDurationModsInDraft(c, jumpId, data.docId, doc);
      });
      return newId;
    },
    [jumpId, charId],
  );

  const remove = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove drawback", (c) => {
        c.budgetFlag += 1;
        removeDrawbacksInDraft(c, jumpId, charId, [id]);
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const findByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Drawback>): Id<GID.Purchase> | undefined =>
      drawbackIds.find((id) => {
        const p = useChainStore.getState().chain?.purchases.O[id];
        if (!p || !("template" in p)) return false;
        const jp = p as { template?: { jumpdoc: string; id: unknown } };
        return jp.template?.jumpdoc === docId && jp.template?.id === (templateId as never);
      }),
    [drawbackIds],
  );

  const countByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Drawback>): number => {
      const purchases = useChainStore.getState().chain?.purchases.O;
      if (!purchases) return 0;
      return drawbackIds.filter((id) => {
        const p = purchases[id] as { template?: { jumpdoc: string; id: unknown } } | undefined;
        return p?.template?.jumpdoc === docId && p?.template?.id === (templateId as never);
      }).length;
    },
    [drawbackIds],
  );

  return { drawbackIds, addFromTemplate, remove, findByTemplate, countByTemplate };
}

/**
 * Actions for adding/removing Scenarios sourced from a JumpDoc annotation,
 * plus a function to find an existing scenario by its JumpDoc template reference.
 */
export function useJumpDocScenarioActions(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const scenarioIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.scenarios[charId] ?? []),
  );

  const addFromTemplate = useCallback(
    (data: {
      name: string;
      description: string;
      value: Value;
      templateId: Id<TID.Scenario>;
      docId: string;
      /** Optional reward group (one of the scenario's outcomes) to pre-populate. */
      rewardGroup?: { title: string; context: string; rewards: ScenarioRewardTemplate[] };
      storedPrerequisites?: StoredPurchasePrerequisite[];
    }): Id<GID.Purchase> => {
      // scenarioId is assigned inside the action after reward purchases have
      // incremented fId, so we don't clobber them by reusing the same ID.
      let scenarioId = createId<GID.Purchase>(0);
      setTracked("Add scenario", (c) => {
        c.budgetFlag += 1;
        const jump = c.jumps.O[jumpId];
        if (!jump) return;

        // Pre-populate rewards from the selected outcome group.
        const rewards: ScenarioReward[] = [];
        if (data.rewardGroup) {
          const doc = useJumpDocStore.getState().doc;
          for (const r of data.rewardGroup.rewards) {
            if (r.type === RewardType.Currency) {
              // Resolve TID.Currency → LID.Currency by abbrev.
              const abbrev = doc?.currencies.O[r.currency]?.abbrev;
              let currencyId = createId<LID.Currency>(0);
              if (abbrev) {
                for (const [idStr, c2] of Object.entries(jump.currencies?.O ?? {})) {
                  if (c2?.abbrev === abbrev) {
                    currencyId = createId<LID.Currency>(+idStr);
                    break;
                  }
                }
              }
              rewards.push({ type: RewardType.Currency, value: r.value, currency: currencyId });
            } else if (r.type === RewardType.Stipend) {
              const abbrev = doc?.currencies.O[r.currency]?.abbrev;
              let currencyId = createId<LID.Currency>(0);
              if (abbrev) {
                for (const [idStr, c2] of Object.entries(jump.currencies?.O ?? {})) {
                  if (c2?.abbrev === abbrev) {
                    currencyId = createId<LID.Currency>(+idStr);
                    break;
                  }
                }
              }
              const subtypeName = doc?.purchaseSubtypes.O[r.subtype]?.name;
              let subtypeId = createId<LID.PurchaseSubtype>(0);
              if (subtypeName) {
                for (const [idStr, s] of Object.entries(jump.purchaseSubtypes?.O ?? {})) {
                  if (s?.name === subtypeName) {
                    subtypeId = createId<LID.PurchaseSubtype>(+idStr);
                    break;
                  }
                }
              }
              rewards.push({
                type: RewardType.Stipend,
                value: r.value,
                currency: currencyId,
                subtype: subtypeId,
              });
            } else if (r.type === RewardType.Companion) {
              const ct = doc?.availableCompanions.O[r.id];
              if (!ct) continue;
              rewards.push({ type: RewardType.Companion, id: r.id, name: ct.name });
            } else {
              // Perk or Item — stored as a template reference; created via the annotation queue.
              if (!doc?.availablePurchases.O[r.id]) continue;
              rewards.push({ type: r.type, id: r.id });
            }
          }
        }

        // Read fId after reward purchases have been allocated.
        const newId = c.purchases.fId;
        scenarioId = newId;

        const scenario: Scenario = {
          id: newId,
          charId,
          jumpId,
          name: data.name,
          description: data.description,
          type: PurchaseType.Scenario,
          cost: { modifier: CostModifier.Full },
          value: data.value,
          template: { jumpdoc: data.docId, id: data.templateId },
          rewards,
          ...(data.storedPrerequisites?.length
            ? { storedPrerequisites: data.storedPrerequisites }
            : {}),
        };
        c.purchases.O[newId] = scenario;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
        jump.scenarios[charId]!.push(newId);
      });
      return scenarioId;
    },
    [jumpId, charId],
  );

  const remove = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove scenario", (c) => {
        c.budgetFlag += 1;
        const scenario = c.purchases.O[id] as Scenario | undefined;
        // Remove any perk/item purchases that were created as scenario rewards.
        if (scenario?.type === PurchaseType.Scenario) {
          const jump = c.jumps.O[jumpId];
          const docId = scenario.template?.jumpdoc;
          const pl = jump?.purchases[charId] as Id<GID.Purchase>[] | undefined;
          for (const reward of scenario.rewards) {
            if (
              (reward.type === RewardType.Item || reward.type === RewardType.Perk) &&
              docId &&
              pl
            ) {
              const toRemove = pl.filter((pid) => {
                const p = c.purchases.O[pid] as
                  | { template?: { jumpdoc: string; id: unknown } }
                  | undefined;
                return p?.template?.jumpdoc === docId && p?.template?.id === reward.id;
              });
              for (const pid of toRemove) {
                delete c.purchases.O[pid];
                const idx = pl.indexOf(pid);
                if (idx !== -1) pl.splice(idx, 1);
              }
            }
          }
        }
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.scenarios[charId];
        if (list) removeFromArray(list, id);
        // Cascade-remove any purchases/drawbacks/scenarios that required this scenario.
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  const findByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Scenario>): Id<GID.Purchase> | undefined =>
      scenarioIds.find((id) => {
        const p = useChainStore.getState().chain?.purchases.O[id];
        if (!p || !("template" in p)) return false;
        const jp = p as { template?: { jumpdoc: string; id: unknown } };
        return jp.template?.jumpdoc === docId && jp.template?.id === (templateId as never);
      }),
    [scenarioIds],
  );

  return { scenarioIds, addFromTemplate, remove, findByTemplate };
}

/**
 * Actions for adding/removing CompanionImports sourced from a JumpDoc annotation,
 * plus a function to find an existing import by its JumpDoc template reference.
 */
export function useJumpDocCompanionActions(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const importIds = useChainStore(
    useShallow((s) => {
      const list = s.chain?.jumps.O[jumpId]?.purchases[charId] ?? [];
      return (list as Id<GID.Purchase>[]).filter((id) => {
        const p = s.chain?.purchases.O[id];
        if (!p) return false;
        if (p.type === PurchaseType.Companion) return true;
        // Follower imports are stored as PurchaseType.Item with follower: true.
        return p.type === PurchaseType.Item && (p as BasicPurchase).follower === true;
      });
    }),
  );

  const addFromTemplate = useCallback(
    (data: {
      name: string;
      description: string;
      value: Value;
      templateId: Id<TID.Companion>;
      docId: string;
      companionIds: Id<GID.Character>[];
      allowances: { currencyAbbrev: string; amount: number }[];
      stipend: { currencyAbbrev: string; subtypeName: string; amount: number }[];
      initialCost?: ModifiedCost;
      discountOrigins?: { categoryName: string; originName: string }[];
      originBenefit?: "discounted" | "free" | "access";
      alternativeCosts?: StoredAlternativeCost[];
      optionalAltCost?: boolean;
      follower?: boolean;
      /** When set, creates a new character inside the same action and links the import to them. */
      createCharacterData?: {
        name: string;
        gender: string;
        species: string;
        backgroundSummary: string;
        backgroundDescription: string;
      };
    }): Id<GID.Purchase> => {
      const state = useChainStore.getState().chain!;
      const newId = state.purchases.fId;
      const newCharId = data.createCharacterData ? state.characters.fId : undefined;
      const newAltFormId = data.createCharacterData ? state.altforms.fId : undefined;

      if (data.follower) {
        setTracked("Add companion import", (c) => {
          c.budgetFlag += 1;
          const j = c.jumps.O[jumpId];
          if (!j) return;
          const purchase: BasicPurchase = {
            id: newId,
            charId,
            jumpId,
            name: data.name,
            description: data.description,
            type: PurchaseType.Item,
            categories: [],
            subtype: DefaultSubtype[PurchaseType.Item],
            tags: ["Follow"],
            cost: data.initialCost ?? { modifier: CostModifier.Full },
            value: data.value,
            template: { jumpdoc: data.docId, id: data.templateId },
            follower: true,
            ...(data.discountOrigins?.length ? { discountOrigins: data.discountOrigins } : {}),
            ...(data.originBenefit ? { originBenefit: data.originBenefit } : {}),
            ...(data.alternativeCosts?.length ? { alternativeCosts: data.alternativeCosts } : {}),
            ...(data.optionalAltCost ? { optionalAltCost: true as const } : {}),
          };
          c.purchases.O[newId] = purchase;
          c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
          if (!j.purchases[charId]) j.purchases[charId] = [];
          j.purchases[charId]!.push(newId);
        });
        return newId;
      }
      // Resolve TID-keyed template data to LID before entering the immer mutation.
      const jump = useChainStore.getState().chain?.jumps.O[jumpId];
      const currencies = jump?.currencies;
      const purchaseSubtypes = jump?.purchaseSubtypes;

      const resolvedAllowances: Lookup<LID.Currency, number> = {};
      for (const { currencyAbbrev, amount } of data.allowances) {
        for (const [idStr, curr] of Object.entries(currencies?.O ?? {})) {
          if (curr?.abbrev === currencyAbbrev) {
            resolvedAllowances[+idStr as Id<LID.Currency>] = amount;
            break;
          }
        }
      }

      const resolvedStipend: Record<number, Record<number, number>> = {};
      for (const { currencyAbbrev, subtypeName, amount } of data.stipend) {
        let currLid: number | undefined;
        for (const [idStr, curr] of Object.entries(currencies?.O ?? {})) {
          if (curr?.abbrev === currencyAbbrev) {
            currLid = +idStr;
            break;
          }
        }
        let stLid: number | undefined;
        for (const [idStr, st] of Object.entries(purchaseSubtypes?.O ?? {})) {
          if (st?.name === subtypeName) {
            stLid = +idStr;
            break;
          }
        }
        if (currLid !== undefined && stLid !== undefined) {
          if (!resolvedStipend[currLid]) resolvedStipend[currLid] = {};
          resolvedStipend[currLid]![stLid] = amount;
        }
      }

      setTracked("Add companion import", (c) => {
        c.budgetFlag += 1;
        const j = c.jumps.O[jumpId];
        if (!j) return;

        // Optionally create a new character in the same action.
        let companionIds = data.companionIds;
        if (data.createCharacterData && newCharId !== undefined && newAltFormId !== undefined) {
          const { name, gender, species, backgroundSummary, backgroundDescription } =
            data.createCharacterData;
          const altForm: AltForm = {
            id: newAltFormId,
            height: { value: 0, unit: LengthUnit.Centimeters },
            weight: { value: 0, unit: WeightUnit.Kilograms },
            sex: "",
            name: "",
            species,
            physicalDescription: "",
            capabilities: "",
          };
          c.altforms.O[newAltFormId] = altForm;
          c.altforms.fId = createId<GID.AltForm>((newAltFormId as number) + 1);
          const character: Character = {
            id: newCharId,
            name,
            gender,
            originalAge: 0,
            personality: {},
            background: { summary: backgroundSummary, description: backgroundDescription },
            notes: "",
            primary: false,
            originalForm: newAltFormId,
            originalImportTID: { docId: data.docId, templateId: data.templateId },
          };
          c.characters.O[newCharId] = character;
          c.characters.fId = createId<GID.Character>((newCharId as number) + 1);
          c.characterList.push(newCharId);
          companionIds = [newCharId];
        }

        const purchase: CompanionImport = {
          id: newId,
          charId,
          jumpId,
          name: data.name,
          description: data.description,
          type: PurchaseType.Companion,
          cost: data.initialCost ?? { modifier: CostModifier.Full },
          value: data.value,
          template: { jumpdoc: data.docId, id: data.templateId },
          importData: {
            characters: companionIds,
            allowances: resolvedAllowances,
            stipend: resolvedStipend,
          },
          ...(data.discountOrigins?.length ? { discountOrigins: data.discountOrigins } : {}),
          ...(data.originBenefit ? { originBenefit: data.originBenefit } : {}),
          ...(data.alternativeCosts?.length ? { alternativeCosts: data.alternativeCosts } : {}),
          ...(data.optionalAltCost ? { optionalAltCost: true as const } : {}),
        };
        c.purchases.O[newId] = purchase;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!j.purchases[charId]) j.purchases[charId] = [];
        j.purchases[charId]!.push(newId);
      });
      return newId;
    },
    [jumpId, charId],
  );

  const remove = useCallback(
    (id: Id<GID.Purchase>) => {
      // Read freebie info before entering the immer mutation.
      const chain = useChainStore.getState().chain;
      const doc = useJumpDocStore.getState().doc;
      const companionImport = chain?.purchases.O[id] as CompanionImport | undefined;
      const companionCharIds = companionImport?.importData.characters ?? [];
      const freebies =
        doc && companionImport?.template
          ? (
              doc.availableCompanions.O[companionImport.template.id] as
                | CompanionTemplate
                | undefined
            )?.freebies
          : undefined;

      setTracked("Remove companion import", (c) => {
        c.budgetFlag += 1;
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (list) {
          const idx = (list as Id<GID.Purchase>[]).indexOf(id);
          if (idx !== -1) (list as Id<GID.Purchase>[]).splice(idx, 1);
        }

        // Remove freebies that were applied to companion characters.
        if (freebies?.length && companionCharIds.length && doc && companionImport?.template) {
          const docId = companionImport.template.jumpdoc;
          for (const companionCharId of companionCharIds) {
            for (const freebie of freebies) {
              if (freebie.type === "purchase") {
                const purchaseList = c.jumps.O[jumpId]?.purchases[companionCharId];
                if (!purchaseList) continue;
                const toRemove = (purchaseList as Id<GID.Purchase>[]).filter((pid) => {
                  const p = c.purchases.O[pid] as
                    | { template?: { jumpdoc: string; id: unknown } }
                    | undefined;
                  return (
                    p?.template?.jumpdoc === docId && p?.template?.id === (freebie.id as never)
                  );
                });
                for (const pid of toRemove) {
                  delete c.purchases.O[pid];
                  const idx = (purchaseList as Id<GID.Purchase>[]).indexOf(pid);
                  if (idx !== -1) (purchaseList as Id<GID.Purchase>[]).splice(idx, 1);
                }
              } else if (freebie.type === "drawback") {
                const drawbackList = c.jumps.O[jumpId]?.drawbacks[companionCharId];
                if (!drawbackList) continue;
                const toRemove = (drawbackList as Id<GID.Purchase>[]).filter((pid) => {
                  const p = c.purchases.O[pid] as
                    | { template?: { jumpdoc: string; id: unknown } }
                    | undefined;
                  return (
                    p?.template?.jumpdoc === docId && p?.template?.id === (freebie.id as never)
                  );
                });
                for (const pid of toRemove) {
                  delete c.purchases.O[pid];
                  const idx = (drawbackList as Id<GID.Purchase>[]).indexOf(pid);
                  if (idx !== -1) (drawbackList as Id<GID.Purchase>[]).splice(idx, 1);
                }
              } else if (freebie.type === "origin") {
                const originTemplate = doc.origins.O[freebie.id] as OriginTemplate | undefined;
                if (!originTemplate) continue;
                const originName = originTemplate.name;
                const categoryName = doc.originCategories.O[originTemplate.type]?.name ?? "";
                // Resolve category LID by name (can't import from components/ into state/).
                let categoryLid: number | undefined;
                for (const [idStr, cat] of Object.entries(
                  c.jumps.O[jumpId]?.originCategories?.O ?? {},
                )) {
                  if (cat?.name === categoryName) {
                    categoryLid = +idStr;
                    break;
                  }
                }
                if (categoryLid === undefined) continue;
                const charOrigins = c.jumps.O[jumpId]?.origins[companionCharId];
                if (!charOrigins) continue;
                const catId = categoryLid as unknown as Id<LID.OriginCategory>;
                const before = charOrigins[catId];
                if (!before) continue;
                charOrigins[catId] = before.filter(
                  (o) => o.summary !== originName && o.templateName !== originName,
                );
              }
            }
          }
        }
      });
    },
    [jumpId, charId],
  );

  const findByTemplate = useCallback(
    (docId: string, templateId: Id<TID.Companion>): Id<GID.Purchase> | undefined =>
      importIds.find((id) => {
        const p = useChainStore.getState().chain?.purchases.O[id];
        if (!p || !("template" in p)) return false;
        const jp = p as { template?: { jumpdoc: string; id: unknown } };
        return jp.template?.jumpdoc === docId && jp.template?.id === (templateId as never);
      }),
    [importIds],
  );

  return { importIds, addFromTemplate, remove, findByTemplate };
}

/**
 * Returns the set of annotation keys that are currently selected for a character
 * in a jump, matched against the given JumpDoc. Used by JumpDocViewer to draw
 * selection outlines on the PDF overlay.
 *
 * Key format:
 *  - `"origin:${name}"` — origin held (matched by name / summary)
 *  - `"purchase:${tid}"` — perk or item held
 *  - `"companion:${tid}"` — companion held
 *  - `"drawback:${tid}"` — drawback held
 *  - `"scenarios:${tid}"` — scenario held
 */
export function useJumpDocSelectedAnnotations(
  jumpId: Id<GID.Jump> | undefined,
  charId: Id<GID.Character> | undefined,
  docId: string | undefined,
): Set<string> {
  const chain = useChain();
  return useMemo(() => {
    const result = new Set<string>();
    if (jumpId === undefined || charId === undefined || !docId || !chain) return result;
    const jump = chain.jumps.O[jumpId];
    if (!jump) return result;

    // Origins: match by name (summary).
    const origins = jump.origins[charId] as PartialLookup<LID.OriginCategory, Origin[]> | undefined;
    if (origins) {
      for (const list of Object.values(origins)) {
        for (const o of list ?? []) {
          result.add(`origin:${o.summary}`);
          if (o.templateName) result.add(`origin:${o.templateName}`);
        }
      }
    }

    // Purchases: perks, items (→ "purchase"), companions (→ "companion").
    for (const id of jump.purchases[charId] ?? []) {
      const p = chain.purchases.O[id];
      if (!p || !("template" in p) || !p.template || p.template.jumpdoc !== docId) continue;
      const isCompanion =
        p.type === PurchaseType.Companion ||
        (p.type === PurchaseType.Item && (p as BasicPurchase).follower === true);
      const prefix = isCompanion ? "companion" : "purchase";
      result.add(`${prefix}:${p.template.id}`);
    }

    // Drawbacks.
    for (const id of jump.drawbacks[charId] ?? []) {
      const p = chain.purchases.O[id];
      if (!p || !("template" in p) || !p.template || p.template.jumpdoc !== docId) continue;
      result.add(`drawback:${p.template.id}`);
    }

    // Scenarios.
    for (const id of jump.scenarios[charId] ?? []) {
      const p = chain.purchases.O[id];
      if (!p || !("template" in p) || !p.template || p.template.jumpdoc !== docId) continue;
      result.add(`scenarios:${p.template.id}`);
    }
    return result;
  }, [chain, jumpId, charId, docId]);
}

/** Returns the origins for a character in a jump (keyed by OriginCategory LID),
 *  plus an action to set all origins at once. */
export function useJumpOrigins(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const origins = useChainStore(
    (s) =>
      (s.chain?.jumps.O[jumpId]?.origins[charId] ?? null) as PartialLookup<
        LID.OriginCategory,
        Origin[]
      > | null,
  );

  const setOrigins = useCallback(
    (
      updater: (draft: NonNullable<PartialLookup<LID.OriginCategory, Origin[]>>) => void,
      extraMutation?: (c: Chain) => void,
    ) => {
      setTracked("Edit origins", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        if (!jump.origins[charId]) {
          (jump.origins as Record<number, Record<number, Origin[]>>)[charId as number] = {};
        }
        c.budgetFlag += 1;
        updater(jump.origins[charId] as NonNullable<PartialLookup<LID.OriginCategory, Origin[]>>);
        extraMutation?.(c);
        // Cascade: remove synergy-access origins that lost their required origin.
        applyOriginSynergiesInDraft(c, jumpId, charId);
        // Cascade: remove access-restricted purchases that lost their qualifying origin,
        // recompute all origin discounts / alt costs, and propagate prereq removals.
        applyAllPurchaseModifiersInDraft(c, jumpId, charId);
      });
    },
    [jumpId, charId],
  );

  return { origins, setOrigins };
}

/** Returns the alt-form IDs for a character in a jump, plus add/remove/reorder actions. */
export function useJumpAltForms(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const altFormIds = useChainStore(
    useShallow((s) => s.chain?.jumps.O[jumpId]?.altForms[charId] ?? []),
  );

  const addAltForm = useCallback((): Id<GID.AltForm> => {
    const newId = createId<GID.AltForm>(useChainStore.getState().chain!.altforms.fId as number);
    setTracked("Add alt-form", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const altForm: AltForm = {
        id: newId,
        name: "",
        species: "",
        sex: "",
        physicalDescription: "",
        capabilities: "",
        height: { value: Math.round(150 + Math.random() * 40), unit: LengthUnit.Centimeters },
        weight: { value: Math.round(50 + Math.random() * 50), unit: WeightUnit.Kilograms },
      };
      c.altforms.O[newId] = altForm;
      c.altforms.fId = createId<GID.AltForm>(newId + 1);
      if (!jump.altForms[charId]) jump.altForms[charId] = [];
      jump.altForms[charId]!.push(newId);
    });
    return newId;
  }, [jumpId, charId]);

  const removeAltForm = useCallback(
    (id: Id<GID.AltForm>) => {
      setTracked("Remove alt-form", (c) => {
        delete c.altforms.O[id];
        const list = c.jumps.O[jumpId]?.altForms[charId];
        if (list) removeFromArray(list, id);
      });
    },
    [jumpId, charId],
  );

  const reorderAltForms = useCallback(
    (newIds: Id<GID.AltForm>[]) => {
      setTracked("Reorder alt-forms", (c) => {
        const jump = c.jumps.O[jumpId];
        if (jump) jump.altForms[charId] = newIds;
      });
    },
    [jumpId, charId],
  );

  return { altFormIds, actions: { addAltForm, removeAltForm, reorderAltForms } };
}

/**
 * Returns all internal image IDs referenced by alt-forms in this chain.
 * Used for the one-time batch URL fetch when the chain loads.
 */
export function useAllAltFormImgIds(): string[] {
  const chain = useChain();
  return useMemo(() => {
    const ids: string[] = [];
    for (const af of Object.values(chain?.altforms.O ?? {})) {
      if (af?.image?.type === "internal") ids.push(af.image.imgId);
    }
    return ids;
  }, [chain?.altforms]);
}

/** Returns a single AltForm by id, plus a modify action. */
export function useAltForm(id: Id<GID.AltForm>) {
  const altForm = useChainStore((s) => s.chain?.altforms.O[id]);

  const modify = useCallback(
    (name: string, updater: (d: AltForm) => void) => {
      setTracked(name, (c) => {
        const target = c.altforms.O[id];
        if (target) updater(target);
      });
    },
    [id],
  );

  return { altForm, modify };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump config hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Jump-level config fields plus a generic `modifyJump` mutation. */
export function useJumpConfig(jumpId: Id<GID.Jump>) {
  const data = useChainStore(
    useShallow((s) => {
      const j = s.chain?.jumps.O[jumpId];
      if (!j) return null;
      return {
        name: j.name,
        source: j.source,
        duration: j.duration,
        parentJump: j.parentJump,
        useNarrative: j.useNarrative,
        useAltForms: j.useAltForms,
        useSupplements: j.useSupplements,
        drawbackLimit: j.drawbackLimit ?? null,
      };
    }),
  );

  const modifyJump = useCallback(
    (actionName: string, updater: (j: Jump) => void, bumpBudget?: boolean) => {
      setTracked(actionName, (c) => {
        const j = c.jumps.O[jumpId];
        if (j) updater(j);
        if (bumpBudget) c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  /** Unlinks the jump from its JumpDoc, stripping all template-derived fields from
   *  purchases and subtypes so no orphaned TID references remain. */
  const unlinkJumpDoc = useCallback(
    (pdfUrl: string | null | undefined) => {
      setTracked("Unlink JumpDoc", (c) => {
        const j = c.jumps.O[jumpId];
        if (!j) return;

        j.source = pdfUrl?.trim()
          ? { type: JumpSourceType.URL, URL: pdfUrl.trim() }
          : { type: JumpSourceType.Unknown };

        // Collect all purchase IDs belonging to this jump
        const purchaseIds: number[] = [];
        for (const key in j.purchases) purchaseIds.push(...((j.purchases as any)[key] ?? []));
        for (const key in j.drawbacks) purchaseIds.push(...((j.drawbacks as any)[key] ?? []));
        for (const key in j.scenarios) purchaseIds.push(...((j.scenarios as any)[key] ?? []));

        // Strip template link and jumpdoc-derived fields from each purchase
        for (const id of purchaseIds) {
          const p = c.purchases.O[id as any] as JumpPurchase | undefined;
          if (!p) continue;
          delete p.template;
          const bp = p as BasicPurchase;
          delete bp.storedPrerequisites;
          delete bp.alternativeCosts;
        }

        // Strip defaultCurrency (a JumpDoc-only hint) from all purchase subtypes
        for (const key in j.purchaseSubtypes.O) {
          const subtype = j.purchaseSubtypes.O[key as any];
          if (subtype) delete subtype.defaultCurrency;
        }
      });
    },
    [jumpId],
  );

  return { data, modifyJump, unlinkJumpDoc };
}

/** Actions for changing a jump's parent.
 *  `setParent` re-parents any current children of `jumpId` to the new parent as well,
 *  keeping the tree valid. Both actions call `adjustJumpOrganization` automatically. */
export function useSetJumpParent(jumpId: Id<GID.Jump>) {
  const setParent = useCallback(
    (parentId: Id<GID.Jump>) => {
      setTracked("Set parent jump", (c) => {
        const j = c.jumps.O[jumpId];
        if (!j) return;

        // Collect jumpId + its current children before re-parenting.
        const toMove = c.jumpList.filter(
          (id) =>
            (id as number) === (jumpId as number) ||
            (c.jumps.O[id]?.parentJump as number) === (jumpId as number),
        );

        // Update parentJump for this jump and re-parent its children to the new parent.
        j.parentJump = parentId;
        for (const id of toMove) {
          if ((id as number) !== (jumpId as number)) {
            const child = c.jumps.O[id];
            if (child) child.parentJump = parentId;
          }
        }

        // Move the block to the end of parentId's block in jumpList.
        const toMoveSet = new Set(toMove.map((id) => id as number));
        c.jumpList = c.jumpList.filter((id) => !toMoveSet.has(id as number));
        const parentIdx = c.jumpList.findIndex((id) => (id as number) === (parentId as number));
        let insertAt = parentIdx !== -1 ? parentIdx + 1 : c.jumpList.length;
        while (
          insertAt < c.jumpList.length &&
          c.jumps.O[c.jumpList[insertAt]]?.parentJump !== undefined
        ) {
          insertAt++;
        }
        c.jumpList.splice(insertAt, 0, ...toMove);
      });
      adjustJumpOrganization();
    },
    [jumpId],
  );

  const unsetParent = useCallback(() => {
    setTracked("Set as main jump", (c) => {
      const j = c.jumps.O[jumpId];
      if (j) delete j.parentJump;
    });
    adjustJumpOrganization();
  }, [jumpId]);

  return { setParent, unsetParent };
}

/** Returns the JumpDoc publicUid if this jump's source is a JumpDoc, otherwise undefined. */
export function useJumpDocId(jumpId: Id<GID.Jump>): string | undefined {
  return useChainStore((s) => {
    const j = s.chain?.jumps.O[jumpId];
    return j?.source.type === JumpSourceType.Jumpdoc ? j.source.docId : undefined;
  });
}

/** All jumps in chain order — used for the supplement parent selector. */
export function useAllJumps(): Jump[] {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Jump[];
      return s.chain.jumpList.map((id) => s.chain!.jumps.O[id]).filter((j): j is Jump => j != null);
    }),
  );
}

/** Returns true if the jump has a parentJump (i.e. it is a supplement jump). */
export function useJumpIsSuplement(jumpId: Id<GID.Jump>): boolean {
  return useChainStore((s) => s.chain?.jumps.O[jumpId]?.parentJump !== undefined);
}

/** IDs of jumps whose parentJump is `jumpId` (i.e. supplement children). */
export function useJumpChildren(jumpId: Id<GID.Jump>): Id<GID.Jump>[] {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.Jump>[];
      return s.chain.jumpList.filter((id) => s.chain!.jumps.O[id]?.parentJump === jumpId);
    }),
  );
}

/** Currencies registry for a jump plus add / modify / remove actions. */
export function useJumpCurrencyConfig(jumpId: Id<GID.Jump>) {
  const currencies = useChainStore((s) => s.chain?.jumps.O[jumpId]?.currencies);

  const addCurrency = useCallback(() => {
    setTracked("Add currency", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const newId = jump.currencies.fId;
      jump.currencies.O[newId] = { name: "", abbrev: "", budget: 0, essential: false };
      jump.currencies.fId = createId<LID.Currency>(newId + 1);
    });
  }, [jumpId]);

  const modifyCurrency = useCallback(
    (id: Id<LID.Currency>, actionName: string, updater: (c: Currency) => void) => {
      setTracked(actionName, (c) => {
        const cur = c.jumps.O[jumpId]?.currencies.O[id];
        if (cur) updater(cur);
        c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  const removeCurrency = useCallback(
    (id: Id<LID.Currency>) => {
      setTracked("Remove currency", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;

        const fixVal = (val: Value) => {
          for (const sv of val) if (sv.currency === id) sv.currency = createId<LID.Currency>(0);
        };

        // Subtype stipends
        for (const stId in jump.purchaseSubtypes.O) {
          const st = jump.purchaseSubtypes.O[stId as any];
          if (st) fixVal(st.stipend as Value);
        }

        // Purchases, subpurchase stipends, and subpurchase values
        for (const cStr in jump.purchases) {
          for (const pId of (jump.purchases as any)[cStr] ?? []) {
            const p = c.purchases.O[pId];
            if (!p || !Array.isArray(p.value)) continue;
            fixVal(p.value as Value);
            const bp = p as BasicPurchase;
            if (bp.subpurchases?.stipend) fixVal(bp.subpurchases.stipend as Value);
            for (const subId of bp.subpurchases?.list ?? []) {
              const sub = c.purchases.O[subId];
              if (sub && Array.isArray(sub.value)) fixVal(sub.value as Value);
            }
          }
        }

        // Drawback values
        for (const cStr in jump.drawbacks) {
          for (const pId of (jump.drawbacks as any)[cStr] ?? []) {
            const p = c.purchases.O[pId];
            if (p && Array.isArray(p.value)) fixVal(p.value as Value);
          }
        }

        // Scenario rewards (Currency and Stipend reward types carry a currency field)
        for (const cStr in jump.scenarios) {
          for (const pId of (jump.scenarios as any)[cStr] ?? []) {
            const p = c.purchases.O[pId] as Scenario | undefined;
            if (!p) continue;
            for (const r of p.rewards) {
              if ((r as any).currency !== undefined && (r as any).currency === id)
                (r as any).currency = createId<LID.Currency>(0);
            }
          }
        }

        // Origin values
        for (const cStr in jump.origins) {
          const charOrigins = (jump.origins as any)[cStr];
          for (const catStr in charOrigins) {
            for (const origin of charOrigins[catStr] ?? []) {
              if ((origin.value.currency as number) === (id as number))
                origin.value.currency = createId<LID.Currency>(0);
            }
          }
        }

        delete jump.currencies.O[id];
        c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  return { currencies, actions: { addCurrency, modifyCurrency, removeCurrency } };
}

/** PurchaseSubtype registry for a jump plus add / modify / remove actions. */
export function useJumpSubtypeConfig(jumpId: Id<GID.Jump>) {
  const subtypes = useChainStore((s) => s.chain?.jumps.O[jumpId]?.purchaseSubtypes);

  const addSubtype = useCallback(() => {
    setTracked("Add purchase subtype", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const newId = jump.purchaseSubtypes.fId;
      jump.purchaseSubtypes.O[newId] = {
        name: "",
        stipend: [],
        type: PurchaseType.Perk,
        essential: false,
        allowSubpurchases: false,
        placement: "normal",
      };
      jump.purchaseSubtypes.fId = createId<LID.PurchaseSubtype>((newId as number) + 1);
    });
  }, [jumpId]);

  const modifySubtype = useCallback(
    (id: Id<LID.PurchaseSubtype>, actionName: string, updater: (st: PurchaseSubtype) => void) => {
      setTracked(actionName, (c) => {
        const st = c.jumps.O[jumpId]?.purchaseSubtypes.O[id];
        if (st) updater(st);
        c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  const removeSubtype = useCallback(
    (id: Id<LID.PurchaseSubtype>) => {
      setTracked("Remove purchase subtype", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;

        const deletedSt = jump.purchaseSubtypes.O[id];
        const fallbackId =
          deletedSt?.type === PurchaseType.Item
            ? DefaultSubtype[PurchaseType.Item]
            : DefaultSubtype[PurchaseType.Perk];

        // Reassign purchases that used the deleted subtype
        for (const cStr in jump.purchases) {
          for (const pId of (jump.purchases as any)[cStr] ?? []) {
            const p = c.purchases.O[pId] as BasicPurchase | undefined;
            if (!p || (p.type !== PurchaseType.Perk && p.type !== PurchaseType.Item)) continue;
            if ((p.subtype as number) !== (id as number)) continue;
            p.subtype = fallbackId;
            // If this purchase has subpurchases, ensure the target subtype allows them
            if (p.subpurchases?.list?.length) {
              const targetSt = jump.purchaseSubtypes.O[fallbackId as any];
              if (targetSt && !targetSt.allowSubpurchases) targetSt.allowSubpurchases = true;
            }
          }
        }

        // Null out drawback subtypes that referenced the deleted subtype (makes them Allowances)
        for (const cStr in jump.drawbacks) {
          for (const pId of (jump.drawbacks as any)[cStr] ?? []) {
            const p = c.purchases.O[pId] as Drawback | undefined;
            if (!p || p.type !== PurchaseType.Drawback) continue;
            if ((p.subtype as number) === (id as number)) p.subtype = null;
          }
        }

        // Reassign scenario stipend rewards that referenced the deleted subtype
        for (const cStr in jump.scenarios) {
          for (const pId of (jump.scenarios as any)[cStr] ?? []) {
            const p = c.purchases.O[pId] as Scenario | undefined;
            if (!p) continue;
            for (const r of p.rewards)
              if (
                (r as any).subtype !== undefined &&
                ((r as any).subtype as number) === (id as number)
              )
                (r as any).subtype = fallbackId;
          }
        }

        delete jump.purchaseSubtypes.O[id];
        c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  const disableSubpurchases = useCallback(
    (id: Id<LID.PurchaseSubtype>) => {
      setTracked("Disable subpurchases", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const st = jump.purchaseSubtypes.O[id];
        if (st) st.allowSubpurchases = false;
        for (const cStr in jump.purchases) {
          for (const pId of (jump.purchases as any)[cStr] ?? []) {
            const p = c.purchases.O[pId] as BasicPurchase | undefined;
            if (!p || (p.type !== PurchaseType.Perk && p.type !== PurchaseType.Item)) continue;
            if ((p.subtype as number) !== (id as number)) continue;
            if (!p.subpurchases?.list?.length) continue;
            for (const subId of p.subpurchases.list) delete c.purchases.O[subId];
            delete p.subpurchases;
          }
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId],
  );

  return { subtypes, actions: { addSubtype, modifySubtype, removeSubtype, disableSubpurchases } };
}

/** OriginCategory registry for a jump plus add / modify / remove actions. */
export function useJumpOriginCategoryConfig(jumpId: Id<GID.Jump>) {
  const originCategories = useChainStore((s) => s.chain?.jumps.O[jumpId]?.originCategories);

  const addOriginCategory = useCallback(() => {
    setTracked("Add origin category", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const newId = jump.originCategories.fId;
      jump.originCategories.O[newId] = { name: "", singleLine: true, multiple: false };
      jump.originCategories.fId = createId<LID.OriginCategory>((newId as number) + 1);
    });
  }, [jumpId]);

  const modifyOriginCategory = useCallback(
    (id: Id<LID.OriginCategory>, actionName: string, updater: (oc: OriginCategory) => void) => {
      setTracked(actionName, (c) => {
        const oc = c.jumps.O[jumpId]?.originCategories.O[id];
        if (oc) updater(oc);
      });
    },
    [jumpId],
  );

  const removeOriginCategory = useCallback(
    (id: Id<LID.OriginCategory>) => {
      setTracked("Remove origin category", (c) => {
        const jump = c.jumps.O[jumpId];
        if (jump) delete jump.originCategories.O[id];
      });
    },
    [jumpId],
  );

  return {
    originCategories,
    actions: { addOriginCategory, modifyOriginCategory, removeOriginCategory },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain / summary hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the name of a jump. Empty string when the jump doesn't exist. */
export const useJumpName = (jumpId: Id<GID.Jump> | undefined): string =>
  useChainStore((s) => (jumpId != null ? (s.chain?.jumps.O[jumpId]?.name ?? "") : ""));

/** Returns the chain's supplement registry (or undefined when no chain is loaded). */
export const useChainSupplements = () => useChainStore((s) => s.chain?.supplements);

/** Returns a stable flat array of all regular Perk IDs for a character,
 *  in chronological jump order across the entire chain.
 *  Supplement perks are excluded — query those separately. */
export function useCharacterRegularPerkIds(charId: Id<GID.Character>): Id<GID.Purchase>[] {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.Purchase>[];
      const result: Id<GID.Purchase>[] = [];
      for (const jumpId of s.chain.jumpList) {
        const jump = s.chain.jumps.O[jumpId];
        if (!jump) continue;
        const list = jump.purchases[charId] ?? [];
        for (const id of list) {
          const p = s.chain.purchases.O[id] as BasicPurchase | undefined;
          if (p?.type === PurchaseType.Perk) result.push(id);
        }
      }
      return result;
    }),
  );
}

/** Returns a stable flat array of all regular Item IDs for a character,
 *  in chronological jump order across the entire chain.
 *  Supplement items are excluded — query those separately. */
export function useCharacterRegularItemIds(charId: Id<GID.Character>): Id<GID.Purchase>[] {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.Purchase>[];
      const result: Id<GID.Purchase>[] = [];
      for (const jumpId of s.chain.jumpList) {
        const jump = s.chain.jumps.O[jumpId];
        if (!jump) continue;
        const list = jump.purchases[charId] ?? [];
        for (const id of list) {
          const p = s.chain.purchases.O[id] as BasicPurchase | undefined;
          if (p?.type === PurchaseType.Item) result.push(id);
        }
      }
      return result;
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain notes
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_NOTE_IDS: number[] = [];

export function useChainNoteIds(): number[] {
  return useChainStore((s) => s.chain?.notesList ?? EMPTY_NOTE_IDS);
}

export function useChainNote(id: number) {
  const note = useChainStore((s) => s.chain?.notes[id]);
  const setTitle = useCallback(
    (title: string) => {
      setTracked("Edit note title", (c) => {
        if (c.notes[id]) c.notes[id]!.title = title;
      });
    },
    [id],
  );
  const setBody = useCallback(
    (body: string) => {
      setTracked("Edit note", (c) => {
        if (c.notes[id]) c.notes[id]!.body = body;
      });
    },
    [id],
  );
  return { note, setTitle, setBody };
}

export function useAddChainNote() {
  return useCallback(() => {
    const state = useChainStore.getState().chain;
    if (!state) return;
    const newId = state.notesList.length === 0 ? 0 : Math.max(...state.notesList) + 1;
    setTracked("Add note", (c) => {
      c.notes[newId] = { id: newId, title: "", body: "" };
      c.notesList.push(newId);
    });
  }, []);
}

export function useDeleteChainNote() {
  return useCallback((id: number) => {
    setTracked("Delete note", (c) => {
      delete c.notes[id];
      c.notesList = c.notesList.filter((nId) => nId !== id);
    });
  }, []);
}

export function useReorderChainNotes() {
  return useCallback((newOrder: number[]) => {
    setTracked("Reorder notes", (c) => {
      c.notesList = newOrder;
    });
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain-level config hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Chain settings (chainSettings) plus a modify action. */
export function useChainSettingsConfig() {
  const settings = useChainStore(useShallow((s) => s.chain?.chainSettings ?? null));
  const modify = useCallback((name: string, updater: (cs: Chain["chainSettings"]) => void) => {
    setTracked(name, (c) => updater(c.chainSettings));
  }, []);
  return { settings, modify };
}

/** Disables allowPerkGroups or allowItemGroups, deletes all groups of that type,
 *  and clears purchaseGroup from all member purchases. */
export function useDisablePurchaseGroups() {
  return useCallback((type: PurchaseType.Perk | PurchaseType.Item) => {
    const flag = type === PurchaseType.Perk ? "allowPerkGroups" : ("allowItemGroups" as const);
    setTracked(`Disable ${type === PurchaseType.Perk ? "perk" : "item"} fusions`, (c) => {
      c.chainSettings[flag] = false;
      for (const charId of c.characterList) {
        const reg = c.purchaseGroups[charId];
        if (!reg) continue;
        for (const [idStr, group] of Object.entries(reg.O)) {
          if (!group || group.type !== type) continue;
          for (const purchId of group.components) {
            const p = c.purchases.O[purchId] as BasicPurchase | undefined;
            if (p) p.purchaseGroup = undefined;
          }
          delete reg.O[createId<GID.PurchaseGroup>(+idStr)];
        }
      }
      c.budgetFlag += 1;
    });
  }, []);
}

/** Bank settings (bankSettings) plus a modify action. */
export function useBankSettingsConfig() {
  const bank = useChainStore(useShallow((s) => s.chain?.bankSettings ?? null));
  const modify = useCallback((name: string, updater: (b: BankSettings) => void) => {
    setTracked(name, (c) => updater(c.bankSettings));
    const { chain, calculatedData: cd } = useChainStore.getState();
    if (!chain || !cd.jumpChunks || !cd.jumpNumber) return;

    // Accumulate new values in-order so previous-chunk balances are available per character.
    const newBankBalance = {} as CalculatedData["bankBalance"];
    const newTotalBankDeposit = {} as CalculatedData["totalBankDeposit"];
    chain.characterList.forEach((charId) => {
      newBankBalance[charId] = {} as CalculatedData["bankBalance"][typeof charId];
      newTotalBankDeposit[charId] = {} as CalculatedData["totalBankDeposit"][typeof charId];
      chain.jumpList.forEach((jumpId) => {
        const { balance, totalDeposit } = adjustBank(
          chain,
          charId,
          jumpId,
          cd.jumpChunks!,
          cd.jumpNumber!,
          newBankBalance,
          chain.bankSettings.interestRate,
          chain.bankSettings.depositRatio,
        );
        newBankBalance[charId][jumpId] = balance;
        newTotalBankDeposit[charId][jumpId] = totalDeposit;
      });
    });

    useChainStore.setState((s) =>
      produce(s, (st) => {
        st.calculatedData.bankBalance = newBankBalance;
        st.calculatedData.totalBankDeposit = newTotalBankDeposit;
      }),
    );
  }, []);
  return { bank, modify };
}

/** Bank deposit for a specific character+jump: current value, calculated totals, and a setter. */
export function useBankDeposit(charId: Id<GID.Character>, jumpId: Id<GID.Jump>) {
  const enabled = useChainStore((s) => s.chain?.bankSettings.enabled ?? false);
  const maxDeposit = useChainStore((s) => s.chain?.bankSettings.maxDeposit ?? 0);
  const bankBalance = useChainStore((s) => s.calculatedData.bankBalance?.[charId]?.[jumpId] ?? 0);
  const totalBankDeposit = useChainStore(
    (s) => s.calculatedData.totalBankDeposit?.[charId]?.[jumpId] ?? 0,
  );
  const depositAmount = useChainStore((s) => s.chain?.jumps.O[jumpId]?.bankDeposits[charId] ?? 0);
  const currency = useChainStore(
    (s) => s.chain?.jumps.O[jumpId]?.currencies.O[DEFAULT_CURRENCY_ID]?.abbrev ?? "CP",
  );
  const adjustedDeposit = useChainStore((s) =>
    depositAmount > 0
      ? Math.floor(depositAmount * ((s.chain?.bankSettings?.depositRatio ?? 0) / 100))
      : depositAmount,
  );

  const setDeposit = useCallback(
    (amount: number) => {
      setTracked("Set bank deposit", (chain) => {
        const jump = chain.jumps.O[jumpId];
        if (!jump) return;
        jump.bankDeposits[charId] = amount;
        chain.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  return {
    enabled,
    maxDeposit,
    bankBalance,
    totalBankDeposit,
    depositAmount,
    adjustedDeposit,
    currency,
    setDeposit,
  };
}

/** Purchase categories for a given type plus add/rename/remove actions. */
export function useChainPurchaseCategoryConfig(type: PurchaseType.Perk | PurchaseType.Item) {
  const categories = useChainStore((s) => s.chain?.purchaseCategories[type]);

  const addCategory = useCallback(() => {
    setTracked("Add category", (c) => {
      const cat = c.purchaseCategories[type];
      cat.O[cat.fId] = "";
      cat.fId = createId<GID.PurchaseCategory>((cat.fId as number) + 1);
    });
  }, [type]);

  const renameCategory = useCallback(
    (id: Id<GID.PurchaseCategory>, name: string) => {
      setTracked("Rename category", (c) => {
        c.purchaseCategories[type].O[id] = name;
      });
    },
    [type],
  );

  const removeCategory = useCallback(
    (id: Id<GID.PurchaseCategory>) => {
      setTracked("Remove category", (c) => {
        delete c.purchaseCategories[type].O[id];
      });
    },
    [type],
  );

  return { categories, actions: { addCategory, renameCategory, removeCategory } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain drawback hooks
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_CHAIN_DRAWBACK_IDS: Id<GID.Purchase>[] = [];

/** Returns the chain-level drawback IDs in order. */
export function useChainDrawbackList(): Id<GID.Purchase>[] {
  return useChainStore((s) => s.chain?.chainDrawbackList ?? EMPTY_CHAIN_DRAWBACK_IDS);
}

/** Returns a callback that creates a new ChainDrawback and appends it to chainDrawbackList. */
export function useAddChainDrawback() {
  return useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add chain drawback", (c) => {
      const drawback: Drawback = {
        id: newId,
        name: "",
        description: "",
        type: PurchaseType.ChainDrawback,
        cost: { modifier: CostModifier.Full },
        value: 0,
        overrides: {},
      } as never;
      c.purchases.O[newId] = drawback as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      c.chainDrawbackList.push(newId);
      c.budgetFlag += 1;
    });
    return newId;
  }, []);
}

/** Returns a callback that removes a ChainDrawback from the store and list. */
export function useRemoveChainDrawback() {
  return useCallback((id: Id<GID.Purchase>) => {
    setTracked("Remove chain drawback", (c) => {
      delete c.purchases.O[id];
      const idx = c.chainDrawbackList.indexOf(id);
      if (idx !== -1) c.chainDrawbackList.splice(idx, 1);
      c.budgetFlag += 1;
    });
  }, []);
}

/** Returns a callback that replaces chainDrawbackList (used for drag-and-drop reordering). */
export function useReorderChainDrawbacks() {
  return useCallback((newIds: Id<GID.Purchase>[]) => {
    setTracked("Reorder chain drawbacks", (c) => {
      c.chainDrawbackList = newIds;
    });
  }, []);
}

export function useChainName() {
  const name = useChainStore((s) => s.chain?.name ?? "");
  const rename = useCallback((newName: string) => {
    setTracked("Rename chain", (c) => {
      c.name = newName;
    });
  }, []);
  return { name, rename };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain supplements
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a single chain-level supplement by ID. */
export const useChainSupplement = (suppId: Id<GID.Supplement>): ChainSupplement | undefined =>
  useChainStore((s) => s.chain?.supplements.O[suppId]);

/** Returns the ordered list of supplement IDs for the chain config page. */
export function useChainSupplementIds(): Id<GID.Supplement>[] {
  return useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.Supplement>[];
      return Object.keys(s.chain.supplements.O).map((k) => createId<GID.Supplement>(+k));
    }),
  );
}

/** Shifts all supplement purchases and investments for suppId by `delta` chunks.
 *  Content whose target chunk index is out of range is deleted. */
function shiftSuppContent(
  c: Chain,
  jumpChunks: Id<GID.Jump>[][],
  suppId: Id<GID.Supplement>,
  delta: number,
): void {
  if (delta === 0) return;
  // Collect chunk indices that have content for this supplement.
  const hasData: number[] = [];
  for (let ci = 0; ci < jumpChunks.length; ci++) {
    const chunk = jumpChunks[ci]!;
    let found = false;
    outer: for (const jId of chunk) {
      const jump = c.jumps.O[jId];
      if (!jump) continue;
      for (const charIdStr in jump.supplementPurchases) {
        const bySup = (jump.supplementPurchases as any)[charIdStr];
        if ((bySup?.[suppId as number] as unknown[] | undefined)?.length) {
          found = true;
          break outer;
        }
      }
      for (const charIdStr in jump.supplementInvestments) {
        const bySup = (jump.supplementInvestments as any)[charIdStr];
        if (bySup?.[suppId as number] != null) {
          found = true;
          break outer;
        }
      }
    }
    if (found) hasData.push(ci);
  }
  // Process high→low for delta>0 (avoid overwriting), low→high for delta<0.
  if (delta > 0) hasData.sort((a, b) => b - a);
  else hasData.sort((a, b) => a - b);
  for (const ci of hasData) {
    const targetCi = ci + delta;
    const srcChunk = jumpChunks[ci]!;
    if (targetCi < 0 || targetCi >= jumpChunks.length) {
      // Overflow: delete content at srcChunk.
      for (const jId of srcChunk) {
        const jump = c.jumps.O[jId];
        if (!jump) continue;
        for (const charIdStr in jump.supplementPurchases) {
          const bySup = (jump.supplementPurchases as any)[charIdStr];
          if (!bySup) continue;
          for (const pid of (bySup[suppId as number] ?? []) as Id<GID.Purchase>[])
            delete c.purchases.O[pid];
          delete bySup[suppId as number];
        }
        for (const charIdStr in jump.supplementInvestments) {
          const bySup = (jump.supplementInvestments as any)[charIdStr];
          if (bySup) delete bySup[suppId as number];
        }
      }
    } else {
      migrateSuppChunk(c, suppId, srcChunk, jumpChunks[targetCi]![0]!);
    }
  }
}

/** Moves all supplement purchases and investments for every character from
 *  every jump in `fromJumps` to `targetJumpId`, updating per-purchase jumpId fields. */
function migrateSuppChunk(
  c: Chain,
  suppId: Id<GID.Supplement>,
  fromJumps: readonly Id<GID.Jump>[],
  targetJumpId: Id<GID.Jump>,
): void {
  const targetJump = c.jumps.O[targetJumpId];
  if (!targetJump) return;
  for (const charIdStr in c.characters.O) {
    const charGid = createId<GID.Character>(+charIdStr);
    let aggregatedPurchases: Id<GID.Purchase>[] = [];
    let aggregatedInvestment = 0;
    for (const fromJumpId of fromJumps) {
      if ((fromJumpId as number) === (targetJumpId as number)) continue;
      const fromJump = c.jumps.O[fromJumpId];
      if (!fromJump) continue;
      const bySup = (fromJump.supplementPurchases as any)[charGid as number];
      if (bySup) {
        aggregatedPurchases = [
          ...aggregatedPurchases,
          ...((bySup[suppId as number] ?? []) as Id<GID.Purchase>[]),
        ];
        delete bySup[suppId as number];
      }
      const byInv = (fromJump.supplementInvestments as any)[charGid as number];
      if (byInv) {
        aggregatedInvestment += byInv[suppId as number] ?? 0;
        delete byInv[suppId as number];
      }
    }
    if (aggregatedPurchases.length > 0) {
      for (const pid of aggregatedPurchases) {
        const p = c.purchases.O[pid] as any;
        if (p && "jumpId" in p) p.jumpId = targetJumpId;
      }
      if (!(targetJump.supplementPurchases as any)[charGid as number])
        (targetJump.supplementPurchases as any)[charGid as number] = {};
      const dst = (targetJump.supplementPurchases as any)[charGid as number];
      dst[suppId as number] = [...(dst[suppId as number] ?? []), ...aggregatedPurchases];
    }
    if (aggregatedInvestment !== 0) {
      if (!(targetJump.supplementInvestments as any)[charGid as number])
        (targetJump.supplementInvestments as any)[charGid as number] = {};
      const dst = (targetJump.supplementInvestments as any)[charGid as number];
      dst[suppId as number] = (dst[suppId as number] ?? 0) + aggregatedInvestment;
    }
  }
}

/** Returns true if any supplement has at least one purchase or investment across any jump. */
export function useAnySupplementHasData(): boolean {
  const chain = useChain();
  return useMemo(() => {
    if (!chain) return false;
    for (const jumpId of chain.jumpList) {
      const jump = chain.jumps.O[jumpId];
      if (!jump) continue;
      for (const charIdStr in jump.supplementPurchases) {
        const bySup = (jump.supplementPurchases as any)[charIdStr];
        if (bySup && Object.keys(bySup).some((k) => (bySup[k] as unknown[])?.length > 0))
          return true;
      }
      for (const charIdStr in jump.supplementInvestments) {
        const bySup = (jump.supplementInvestments as any)[charIdStr];
        if (bySup && Object.keys(bySup).some((k) => (bySup[k] as number | undefined) != null))
          return true;
      }
    }
    return false;
  }, [chain]);
}

/**
 * Returns whether toggling startWithJumpZero in each direction would actually
 * call shiftSuppContent on a supplement that has data — i.e. whether the
 * confirmation dialog should be shown.
 *
 * - enabling: any supplement has data (all are shifted)
 * - disabling: any supplement with initialJump !== 0 has data
 *   (supplements at initialJump === 0 are just renumbered, no content moves)
 */
export function useJumpZeroChangeWouldShiftData(): { enabling: boolean; disabling: boolean } {
  const chain = useChain();
  return useMemo(() => {
    if (!chain) return { enabling: false, disabling: false };
    let enabling = false;
    let disabling = false;
    for (const suppIdStr in chain.supplements.O) {
      const suppId = createId<GID.Supplement>(+suppIdStr);
      const supp = chain.supplements.O[suppId];
      if (!supp) continue;
      let hasData = false;
      outer: for (const jumpId of chain.jumpList) {
        const jump = chain.jumps.O[jumpId];
        if (!jump) continue;
        for (const charIdStr in jump.supplementPurchases) {
          const bySup = (jump.supplementPurchases as any)[charIdStr];
          if ((bySup?.[suppId as number] as unknown[] | undefined)?.length) {
            hasData = true;
            break outer;
          }
        }
        for (const charIdStr in jump.supplementInvestments) {
          const bySup = (jump.supplementInvestments as any)[charIdStr];
          if (bySup?.[suppId as number] != null) {
            hasData = true;
            break outer;
          }
        }
      }
      if (!hasData) continue;
      enabling = true;
      if (supp.initialJump !== 0) disabling = true;
      if (enabling && disabling) break;
    }
    return { enabling, disabling };
  }, [chain]);
}

/** Full CRUD for chain-level supplements (config page). */
export function useChainSupplementsConfig() {
  const addSupplement = useCallback((): Id<GID.Supplement> => {
    const newId = useChainStore.getState().chain!.supplements.fId;
    setTracked("Add supplement", (c) => {
      const supp: ChainSupplement = {
        id: newId,
        name: "",
        singleJump: false,
        initialJump: 1,
        investmentRatio: 0,
        maxInvestment: 0,
        initialStipend: 100,
        perJumpStipend: 0,
        companionAccess: CompanionAccess.Unavailable,
        currency: "SP",
        source: { type: JumpSourceType.Unknown },
        enableScenarios: false,
        purchaseCategories: {
          fId: createId<GID.PurchaseCategory>(0),
          O: {} as Registry<GID.PurchaseCategory, string>["O"],
        },
        type: SupplementType.Perk,
      };
      c.supplements.O[newId] = supp;
      c.supplements.fId = createId<GID.Supplement>((newId as number) + 1);
    });
    return newId;
  }, []);

  const removeSupplement = useCallback((id: Id<GID.Supplement>) => {
    setTracked("Remove supplement", (c) => {
      delete c.supplements.O[id];
      // Cascade: delete all purchases and investments for this supplement across all jumps.
      for (const jumpIdStr in c.jumps.O) {
        const jump = c.jumps.O[createId<GID.Jump>(+jumpIdStr)];
        if (!jump) continue;
        for (const charIdStr in jump.supplementPurchases) {
          const bySup = (jump.supplementPurchases as any)[charIdStr];
          if (!bySup) continue;
          const purchaseIds: Id<GID.Purchase>[] = bySup[id as number] ?? [];
          for (const pId of purchaseIds) delete c.purchases.O[pId];
          delete bySup[id as number];
        }
        for (const charIdStr in jump.supplementInvestments) {
          const bySup = (jump.supplementInvestments as any)[charIdStr];
          if (bySup) delete bySup[id as number];
        }
      }
      c.budgetFlag += 1;
    });
  }, []);

  const modifySupplement = useCallback(
    (id: Id<GID.Supplement>, label: string, updater: (s: ChainSupplement) => void) => {
      setTracked(label, (c) => {
        const supp = c.supplements.O[id];
        if (supp) updater(supp);
      });
    },
    [],
  );

  const addCategory = useCallback((suppId: Id<GID.Supplement>) => {
    setTracked("Add supplement category", (c) => {
      const supp = c.supplements.O[suppId];
      if (!supp) return;
      const newCatId = supp.purchaseCategories.fId;
      supp.purchaseCategories.O[newCatId] = "";
      supp.purchaseCategories.fId = createId<GID.PurchaseCategory>((newCatId as number) + 1);
    });
  }, []);

  const removeCategory = useCallback(
    (suppId: Id<GID.Supplement>, catId: Id<GID.PurchaseCategory>) => {
      setTracked("Remove supplement category", (c) => {
        const supp = c.supplements.O[suppId];
        if (!supp) return;
        delete supp.purchaseCategories.O[catId];
      });
    },
    [],
  );

  const renameCategory = useCallback(
    (suppId: Id<GID.Supplement>, catId: Id<GID.PurchaseCategory>, name: string) => {
      setTracked("Rename supplement category", (c) => {
        const supp = c.supplements.O[suppId];
        if (!supp) return;
        supp.purchaseCategories.O[catId] = name;
      });
    },
    [],
  );

  // Single-jump only — migrates purchases from old chunk to new chunk.
  const setInitialJump = useCallback((suppId: Id<GID.Supplement>, newDisplayNumber: number) => {
    const state = useChainStore.getState();
    const supp = state.chain?.supplements.O[suppId];
    if (!supp || !supp.singleJump || supp.initialJump === newDisplayNumber) return;
    const jumpChunks = state.calculatedData.jumpChunks;
    const offset = state.chain!.chainSettings.startWithJumpZero ? 0 : 1;
    const oldChunk = jumpChunks?.[supp.initialJump - offset] as Id<GID.Jump>[] | undefined;
    const newChunk = jumpChunks?.[newDisplayNumber - offset] as Id<GID.Jump>[] | undefined;
    setTracked("Set initial jump", (c) => {
      const s2 = c.supplements.O[suppId];
      if (!s2) return;
      s2.initialJump = newDisplayNumber;
      if (oldChunk && newChunk) {
        migrateSuppChunk(c, suppId, oldChunk, newChunk[0]!);
        c.budgetFlag += 1;
      }
    });
  }, []);

  // Multi-jump: delete content before the new start OR shift all content by delta chunks.
  const migrateMultiJump = useCallback(
    (suppId: Id<GID.Supplement>, newDisplayNumber: number, strategy: "delete" | "shift") => {
      const state = useChainStore.getState();
      const supp = state.chain?.supplements.O[suppId];
      if (!supp || supp.singleJump || supp.initialJump === newDisplayNumber) return;
      const jumpChunks = state.calculatedData.jumpChunks;
      if (!jumpChunks) return;
      const offset = state.chain!.chainSettings.startWithJumpZero ? 0 : 1;
      const newStartIdx = newDisplayNumber - offset;
      const oldInitialJump = supp.initialJump;
      setTracked("Move supplement start", (c) => {
        const s2 = c.supplements.O[suppId];
        if (!s2) return;
        s2.initialJump = newDisplayNumber;
        if (strategy === "delete") {
          for (let ci = 0; ci < newStartIdx && ci < jumpChunks.length; ci++) {
            for (const jId of jumpChunks[ci]!) {
              const jump = c.jumps.O[jId];
              if (!jump) continue;
              for (const charIdStr in jump.supplementPurchases) {
                const bySup = (jump.supplementPurchases as any)[charIdStr];
                if (!bySup) continue;
                for (const pid of (bySup[suppId] ?? []) as Id<GID.Purchase>[])
                  delete c.purchases.O[pid];
                delete bySup[suppId];
              }
              for (const charIdStr in jump.supplementInvestments) {
                const bySup = (jump.supplementInvestments as any)[charIdStr];
                if (bySup) delete bySup[suppId];
              }
            }
          }
        } else {
          shiftSuppContent(c, jumpChunks, suppId, newDisplayNumber - oldInitialJump);
        }
        c.budgetFlag += 1;
      });
    },
    [],
  );

  // Shifts all supplement content by ±1 chunk and toggles startWithJumpZero.
  // Supplements with initialJump=0 when turning off are just renumbered to 1 (same chunk).
  const shiftAllSupplementsForJumpZeroChange = useCallback((on: boolean) => {
    const state = useChainStore.getState();
    const jumpChunks = state.calculatedData.jumpChunks;
    if (!jumpChunks) return;
    const delta = on ? 1 : -1;
    setTracked("Toggle jump-zero start", (c) => {
      c.chainSettings.startWithJumpZero = on;
      for (const suppIdStr in c.supplements.O) {
        const sId = createId<GID.Supplement>(+suppIdStr);
        const supp = c.supplements.O[sId];
        if (!supp) continue;
        if (!on && supp.initialJump === 0) {
          // Supplement was at jump 0 (chunk[0]); just renumber — content stays in chunk[0].
          supp.initialJump = 1;
        } else {
          shiftSuppContent(c, jumpChunks, sId, delta);
        }
      }
      c.budgetFlag += 1;
    });
  }, []);

  const convertToSingleJump = useCallback(
    (suppId: Id<GID.Supplement>, strategy: "delete" | "shunt") => {
      const state = useChainStore.getState();
      const supp = state.chain?.supplements.O[suppId];
      if (!supp) return;

      const jumpChunks = state.calculatedData.jumpChunks;
      const offset = state.chain!.chainSettings.startWithJumpZero ? 0 : 1;
      const keepChunkIdx = supp.initialJump - offset;
      const keepChunk = jumpChunks?.[keepChunkIdx] as Id<GID.Jump>[] | undefined;

      setTracked("Convert to single jump", (c) => {
        const s2 = c.supplements.O[suppId];
        if (!s2) return;
        s2.singleJump = true;
        if (!jumpChunks || !keepChunk) return;

        const keepSet = new Set(keepChunk.map((id) => id as number));

        if (strategy === "delete") {
          for (const jumpIdStr in c.jumps.O) {
            const jId = createId<GID.Jump>(+jumpIdStr);
            if (keepSet.has(jId as number)) continue;
            const jump = c.jumps.O[jId];
            if (!jump) continue;
            for (const charIdStr in jump.supplementPurchases) {
              const bySup = (jump.supplementPurchases as any)[charIdStr];
              if (!bySup) continue;
              for (const pid of (bySup[suppId as number] ?? []) as Id<GID.Purchase>[])
                delete c.purchases.O[pid];
              delete bySup[suppId as number];
            }
            for (const charIdStr in jump.supplementInvestments) {
              const bySup = (jump.supplementInvestments as any)[charIdStr];
              if (bySup) delete bySup[suppId as number];
            }
          }
        } else {
          // Shunt: move all purchases outside the keep chunk into it.
          for (const chunk of jumpChunks) {
            if (chunk.some((jId) => keepSet.has(jId as number))) continue;
            migrateSuppChunk(c, suppId, chunk, keepChunk[0]);
          }
        }
        c.budgetFlag += 1;
      });
    },
    [],
  );

  const setCompanionAccess = useCallback((suppId: Id<GID.Supplement>, access: CompanionAccess) => {
    setTracked("Set companion access", (c) => {
      const supp = c.supplements.O[suppId];
      if (!supp) return;
      const wasImports = supp.companionAccess === CompanionAccess.Imports;
      const wasAvailable = supp.companionAccess === CompanionAccess.Available;
      supp.companionAccess = access;
      // When changing away from Imports, delete all SupplementImport purchases.
      if (wasImports && access !== CompanionAccess.Imports) {
        for (const jumpIdStr in c.jumps.O) {
          const jump = c.jumps.O[createId<GID.Jump>(+jumpIdStr)];
          if (!jump) continue;
          for (const charIdStr in jump.supplementPurchases) {
            const bySup = (jump.supplementPurchases as any)[charIdStr];
            if (!bySup) continue;
            const allIds: Id<GID.Purchase>[] = bySup[suppId as number] ?? [];
            const toDelete = allIds.filter(
              (pid) => c.purchases.O[pid]?.type === PurchaseType.SupplementImport,
            );
            for (const pid of toDelete) delete c.purchases.O[pid];
            bySup[suppId as number] = allIds.filter((pid) => !toDelete.includes(pid));
          }
        }
        c.budgetFlag += 1;
      }
      // When changing away from Available, delete companion (non-primary) investments.
      if (wasAvailable && access !== CompanionAccess.Available) {
        for (const jumpIdStr in c.jumps.O) {
          const jump = c.jumps.O[createId<GID.Jump>(+jumpIdStr)];
          if (!jump) continue;
          for (const charIdStr in jump.supplementInvestments) {
            const charGid = createId<GID.Character>(+charIdStr);
            if (c.characters.O[charGid]?.primary) continue;
            const bySup = (jump.supplementInvestments as any)[charIdStr];
            if (bySup) delete bySup[suppId as number];
          }
        }
        c.budgetFlag += 1;
      }
    });
  }, []);

  return {
    actions: {
      addSupplement,
      removeSupplement,
      modifySupplement,
      setInitialJump,
      migrateMultiJump,
      shiftAllSupplementsForJumpZeroChange,
      convertToSingleJump,
      setCompanionAccess,
      addCategory,
      removeCategory,
      renameCategory,
    },
  };
}

export function useSupplementBudget(
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
): number | undefined {
  return useChainStore((s) => s.calculatedData.supplementBudgets?.[charId]?.[jumpId]?.[suppId]);
}

export function useSupplementInvestment(
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
) {
  const value = useChainStore(
    (s) => s.chain?.jumps.O[jumpId]?.supplementInvestments?.[charId]?.[suppId] ?? 0,
  );
  const chunkTotal = useChainStore(
    (s) => s.calculatedData.supplementInvestments?.[charId]?.[jumpId]?.[suppId] ?? 0,
  );

  const setValue = useCallback(
    (amount: number) => {
      setTracked("Set supplement investment", (chain) => {
        const jump = chain.jumps.O[jumpId];
        if (!jump) return;
        if (!jump.supplementInvestments[charId]) jump.supplementInvestments[charId] = {} as any;
        (jump.supplementInvestments[charId] as any)[suppId] = amount;
        chain.budgetFlag += 1;
      });
    },
    [jumpId, charId, suppId],
  );

  return { value, setValue, chunkTotal };
}

/** Returns the ordered supplement purchase IDs for a character+jump+supplement slot,
 *  filtered to the given type, plus tracked add/remove/reorder actions. */
export function useJumpSupplementPurchases(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId: Id<GID.Supplement>,
  type: PurchaseType.SupplementPerk | PurchaseType.SupplementItem,
) {
  const purchaseIds = useChainStore(
    useShallow((s) => {
      const all = s.chain?.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId] ?? [];
      return (all as Id<GID.Purchase>[]).filter((id) => s.chain?.purchases.O[id]?.type === type);
    }),
  );

  const addPurchase = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked(
      type === PurchaseType.SupplementPerk ? "Add supplement perk" : "Add supplement item",
      (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const purchase: SupplementPurchase = {
          id: newId,
          charId,
          jumpId,
          name: "",
          description: "",
          type,
          cost: { modifier: CostModifier.Full },
          value: 0,
          categories: [],
          tags: [],
          supplement: suppId,
        };
        c.purchases.O[newId] = purchase as never;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!(jump.supplementPurchases as any)[charId as number])
          (jump.supplementPurchases as any)[charId as number] = {};
        const bySup = (jump.supplementPurchases as any)[charId as number];
        if (!bySup[suppId as number]) bySup[suppId as number] = [];
        bySup[suppId as number].push(newId);
        c.budgetFlag += 1;
      },
    );
    return newId;
  }, [jumpId, charId, suppId, type]);

  const removePurchase = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove purchase", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId];
        if (list) {
          const idx = (list as Id<GID.Purchase>[]).indexOf(id);
          if (idx !== -1) (list as Id<GID.Purchase>[]).splice(idx, 1);
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId, suppId],
  );

  const reorderPurchases = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder purchases", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const all = [...((jump.supplementPurchases[charId]?.[suppId] ?? []) as Id<GID.Purchase>[])];
        // Replace type-matching entries with the reordered list, preserve others in place.
        let ni = 0;
        const result = all.map((id) => (c.purchases.O[id]?.type === type ? newIds[ni++]! : id));
        (jump.supplementPurchases as any)[charId as number] ??= {};
        (jump.supplementPurchases as any)[charId as number][suppId as number] = result;
      });
    },
    [jumpId, charId, suppId, type],
  );

  return { purchaseIds, actions: { addPurchase, removePurchase, reorderPurchases } };
}

export function useJumpSupplementScenarios(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId: Id<GID.Supplement>,
) {
  const scenarioIds = useChainStore(
    useShallow((s) => {
      const all = s.chain?.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId] ?? [];
      return (all as Id<GID.Purchase>[]).filter(
        (id) => s.chain?.purchases.O[id]?.type === PurchaseType.SupplementScenario,
      );
    }),
  );

  const addScenario = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add milestone", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const scenario: SupplementScenario = {
        id: newId,
        charId,
        jumpId,
        name: "",
        description: "",
        type: PurchaseType.SupplementScenario,
        cost: { modifier: CostModifier.Full },
        value: 0,
        categories: [],
        tags: [],
        supplement: suppId,
        rewards: [],
      };
      c.purchases.O[newId] = scenario as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!(jump.supplementPurchases as any)[charId as number])
        (jump.supplementPurchases as any)[charId as number] = {};
      const bySup = (jump.supplementPurchases as any)[charId as number];
      if (!bySup[suppId as number]) bySup[suppId as number] = [];
      bySup[suppId as number].push(newId);
      c.budgetFlag += 1;
    });
    return newId;
  }, [jumpId, charId, suppId]);

  const removeScenario = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove milestone", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId];
        if (list) {
          const idx = (list as Id<GID.Purchase>[]).indexOf(id);
          if (idx !== -1) (list as Id<GID.Purchase>[]).splice(idx, 1);
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId, suppId],
  );

  const reorderScenarios = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder milestones", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const all = [...((jump.supplementPurchases[charId]?.[suppId] ?? []) as Id<GID.Purchase>[])];
        let ni = 0;
        const result = all.map((id) =>
          c.purchases.O[id]?.type === PurchaseType.SupplementScenario ? newIds[ni++]! : id,
        );
        (jump.supplementPurchases as any)[charId as number] ??= {};
        (jump.supplementPurchases as any)[charId as number][suppId as number] = result;
      });
    },
    [jumpId, charId, suppId],
  );

  return { scenarioIds, actions: { addScenario, removeScenario, reorderScenarios } };
}

/** Updates calculatedData.companionSupplementPercentage by `delta` for each companion. */
function applyCSPDelta(
  primaryId: Id<GID.Character>,
  jId: Id<GID.Jump>,
  sId: Id<GID.Supplement>,
  companions: Id<GID.Character>[],
  delta: number,
) {
  if (delta === 0 || companions.length === 0) return;
  useChainStore.setState(
    produce((s) => {
      const cd = s.calculatedData;
      if (!cd.companionSupplementPercentage) cd.companionSupplementPercentage = {} as never;
      const csp = cd.companionSupplementPercentage;
      for (const companionId of companions) {
        if (!csp[companionId]) csp[companionId] = {} as never;
        if (!csp[companionId][primaryId]) csp[companionId][primaryId] = {} as never;
        if (!csp[companionId][primaryId][jId]) csp[companionId][primaryId][jId] = {} as never;
        const cur: number = csp[companionId][primaryId][jId][sId] ?? 0;
        csp[companionId][primaryId][jId][sId] = Math.max(0, cur + delta);
      }
    }),
  );
}

export function useJumpSupplementImports(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId: Id<GID.Supplement>,
) {
  const importIds = useChainStore(
    useShallow((s) => {
      const all = s.chain?.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId] ?? [];
      return (all as Id<GID.Purchase>[]).filter(
        (id) => s.chain?.purchases.O[id]?.type === PurchaseType.SupplementImport,
      );
    }),
  );

  const addImport = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add supplement import", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const purchase: SupplementImport = {
        id: newId,
        charId,
        name: "",
        description: "",
        type: PurchaseType.SupplementImport,
        cost: { modifier: CostModifier.Full },
        value: 0,
        importData: { characters: [], allowance: 0, percentage: 0 },
        supplement: suppId,
        jumpId,
      };
      c.purchases.O[newId] = purchase as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!(jump.supplementPurchases as any)[charId as number])
        (jump.supplementPurchases as any)[charId as number] = {};
      const bySup = (jump.supplementPurchases as any)[charId as number];
      if (!bySup[suppId as number]) bySup[suppId as number] = [];
      bySup[suppId as number].push(newId);
      c.budgetFlag += 1;
    });
    return newId;
  }, [jumpId, charId, suppId]);

  const removeImport = useCallback(
    (id: Id<GID.Purchase>) => {
      const si = useChainStore.getState().chain?.purchases.O[id] as SupplementImport | undefined;
      const oldChars = si?.importData.characters ?? [];
      const oldPct = si?.importData.percentage ?? 0;
      setTracked("Remove supplement import", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.supplementPurchases[charId]?.[suppId];
        if (list) {
          const idx = (list as Id<GID.Purchase>[]).indexOf(id);
          if (idx !== -1) (list as Id<GID.Purchase>[]).splice(idx, 1);
        }
        c.budgetFlag += 1;
      });
      applyCSPDelta(charId, jumpId, suppId, oldChars, -oldPct);
    },
    [jumpId, charId, suppId],
  );

  const reorderImports = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder supplement imports", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const all = [...((jump.supplementPurchases[charId]?.[suppId] ?? []) as Id<GID.Purchase>[])];
        let ni = 0;
        const result = all.map((id) =>
          c.purchases.O[id]?.type === PurchaseType.SupplementImport ? newIds[ni++]! : id,
        );
        (jump.supplementPurchases as any)[charId as number] ??= {};
        (jump.supplementPurchases as any)[charId as number][suppId as number] = result;
      });
    },
    [jumpId, charId, suppId],
  );

  return { importIds, actions: { addImport, removeImport, reorderImports } };
}

export function useSupplementImport(id: Id<GID.Purchase>) {
  const supplementImport = useChainStore(
    (s) => s.chain?.purchases.O[id] as SupplementImport | undefined,
  );

  const modify = useCallback(
    (name: string, updater: (p: SupplementImport) => void) => {
      const before = useChainStore.getState().chain?.purchases.O[id] as
        | SupplementImport
        | undefined;
      const oldChars = [...(before?.importData.characters ?? [])];
      const oldPct = before?.importData.percentage ?? 0;
      const primaryId = before?.charId;
      const jId = before?.jumpId;
      const sId = before?.supplement;
      setTracked(name, (c) => {
        const target = c.purchases.O[id] as SupplementImport | undefined;
        if (target) updater(target);
        c.budgetFlag += 1;
      });
      if (!primaryId || !jId || !sId) return;
      const after = useChainStore.getState().chain?.purchases.O[id] as SupplementImport | undefined;
      const newChars = after?.importData.characters ?? [];
      const newPct = after?.importData.percentage ?? 0;
      const oldSet = new Set(oldChars.map(Number));
      const newSet = new Set(newChars.map(Number));
      const removed = oldChars.filter((c) => !newSet.has(Number(c)));
      const added = newChars.filter((c) => !oldSet.has(Number(c)));
      const kept = newChars.filter((c) => oldSet.has(Number(c)));
      applyCSPDelta(primaryId, jId, sId, removed, -oldPct);
      applyCSPDelta(primaryId, jId, sId, added, newPct);
      if (oldPct !== newPct) applyCSPDelta(primaryId, jId, sId, kept, newPct - oldPct);
    },
    [id],
  );

  return { supplementImport, modify };
}

/** Returns all SupplementPurchase entries for a character+supplement from jumps
 *  strictly before the given jump in jumpList (siblings excluded).
 *
 *  Visibility rules:
 *  - No `obsolete`: shown normally.
 *  - `obsolete === currentJumpId`: shown greyed out (first marked here).
 *  - `obsolete` points to a future jump: shown normally (not yet retired).
 *  - `obsolete` points to an earlier jump: excluded (already hidden since then).
 */
export function usePreviousSupplementPurchases(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId: Id<GID.Supplement>,
): { id: Id<GID.Purchase>; isObsolete: boolean }[] {
  const chain = useChain();
  return useMemo(() => {
    if (!chain) return [];
    const currentIdx = chain.jumpList.findIndex((id) => (id as number) === (jumpId as number));
    if (currentIdx === -1) return [];
    const result: { id: Id<GID.Purchase>; isObsolete: boolean }[] = [];
    for (let i = 0; i < currentIdx; i++) {
      const prevJumpId = chain.jumpList[i]!;
      const ids =
        (chain.jumps.O[prevJumpId]?.supplementPurchases[charId]?.[suppId] as
          | Id<GID.Purchase>[]
          | undefined) ?? [];
      for (const id of ids) {
        const p = chain.purchases.O[id] as SupplementPurchase | undefined;
        if (!p) continue;
        // Exclude milestones and companion imports — only perks/items belong here.
        if (p.type !== PurchaseType.SupplementPerk && p.type !== PurchaseType.SupplementItem)
          continue;
        if (p.obsolete !== undefined) {
          const obsoleteIdx = chain.jumpList.findIndex(
            (jid) => (jid as number) === (p.obsolete as number),
          );
          // Hidden if made obsolete in an earlier jump
          if (obsoleteIdx !== -1 && obsoleteIdx < currentIdx) continue;
          // Greyed out only if first made obsolete at the current jump
          if (obsoleteIdx === currentIdx) {
            result.push({ id, isObsolete: true });
            continue;
          }
        }
        result.push({ id, isObsolete: false });
      }
    }
    return result;
  }, [chain, jumpId, charId, suppId]);
}

/** Checks all purchase-ID arrays on a jump (purchases, drawbacks, scenarios,
 *  supplementPurchases) for duplicate entries and removes them in a single
 *  tracked action. Returns a stable callback — call it inside a useEffect when
 *  the jump loads. No action is dispatched when no duplicates are found. */
export function useDeduplicateJumpPurchases() {
  return useCallback((jumpId: Id<GID.Jump>) => {
    const state = useChainStore.getState();
    const jump = state.chain?.jumps.O[jumpId];
    if (!jump) return;

    // Helper: detect duplicates in a flat ID array.
    function hasDupes(ids: Id<GID.Purchase>[]): boolean {
      return ids.length !== new Set(ids.map((id) => id as number)).size;
    }

    // Helper: deduplicate while preserving first-occurrence order.
    function dedupe(ids: Id<GID.Purchase>[]): Id<GID.Purchase>[] {
      const seen = new Set<number>();
      return ids.filter((id) => {
        const n = id as number;
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      });
    }

    // Check whether any deduplication is needed before touching the store.
    let needsFix = false;
    outer: {
      for (const charKey in jump.purchases) {
        if (hasDupes((jump.purchases as any)[charKey] ?? [])) {
          needsFix = true;
          break outer;
        }
      }
      for (const charKey in jump.drawbacks) {
        if (hasDupes((jump.drawbacks as any)[charKey] ?? [])) {
          needsFix = true;
          break outer;
        }
      }
      for (const charKey in jump.scenarios) {
        if (hasDupes((jump.scenarios as any)[charKey] ?? [])) {
          needsFix = true;
          break outer;
        }
      }
      for (const charKey in jump.supplementPurchases) {
        const bySup = (jump.supplementPurchases as any)[charKey] ?? {};
        for (const suppKey in bySup) {
          if (hasDupes(bySup[suppKey] ?? [])) {
            needsFix = true;
            break outer;
          }
        }
      }
    }

    if (!needsFix) return;

    setTracked("Remove duplicate purchases", (c) => {
      const j = c.jumps.O[jumpId];
      if (!j) return;
      for (const charKey in j.purchases) {
        (j.purchases as any)[charKey] = dedupe((j.purchases as any)[charKey] ?? []);
      }
      for (const charKey in j.drawbacks) {
        (j.drawbacks as any)[charKey] = dedupe((j.drawbacks as any)[charKey] ?? []);
      }
      for (const charKey in j.scenarios) {
        (j.scenarios as any)[charKey] = dedupe((j.scenarios as any)[charKey] ?? []);
      }
      for (const charKey in j.supplementPurchases) {
        const bySup = (j.supplementPurchases as any)[charKey] ?? {};
        for (const suppKey in bySup) {
          bySup[suppKey] = dedupe(bySup[suppKey] ?? []);
        }
      }
    });
  }, []);
}

/** Returns a stable callback that marks or un-marks a SupplementPurchase as obsolete
 *  at the given jump. Setting `makeObsolete=true` moves the obsolete marker to
 *  `currentJumpId` (removing it from any previous jump's obsoletions array). */
export function useSetObsolete() {
  return useCallback(
    (purchaseId: Id<GID.Purchase>, currentJumpId: Id<GID.Jump>, makeObsolete: boolean) => {
      setTracked(makeObsolete ? "Mark purchase obsolete" : "Un-mark purchase obsolete", (c) => {
        const purchase = c.purchases.O[purchaseId] as SupplementPurchase | undefined;
        if (!purchase) return;
        if (makeObsolete) {
          // Remove from old jump's obsoletions
          if (purchase.obsolete !== undefined) {
            const oldJump = c.jumps.O[purchase.obsolete];
            if (oldJump) {
              (oldJump.obsoletions as Id<GID.Purchase>[]) = (
                oldJump.obsoletions as Id<GID.Purchase>[]
              ).filter((id) => id !== purchaseId);
            }
          }
          purchase.obsolete = currentJumpId;
          const currentJump = c.jumps.O[currentJumpId];
          if (
            currentJump &&
            !(currentJump.obsoletions as Id<GID.Purchase>[]).some((id) => id === purchaseId)
          ) {
            (currentJump.obsoletions as Id<GID.Purchase>[]).push(purchaseId);
          }
        } else {
          if (purchase.obsolete !== undefined) {
            const oldJump = c.jumps.O[purchase.obsolete];
            if (oldJump) {
              (oldJump.obsoletions as Id<GID.Purchase>[]) = (
                oldJump.obsoletions as Id<GID.Purchase>[]
              ).filter((id) => id !== purchaseId);
            }
          }
          delete purchase.obsolete;
        }
      });
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Character management hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a stable callback that creates a new character (with a blank
 *  original-form AltForm) and appends it to characterList.
 *  Pass `primary: true` to create a primary jumper instead of a companion. */
export function useAddCharacter() {
  return useCallback((primary: boolean = false): Id<GID.Character> => {
    const state = useChainStore.getState().chain!;
    const newCharId = state.characters.fId;
    const newAltFormId = state.altforms.fId;
    setTracked(primary ? "Add primary jumper" : "Add companion", (c) => {
      const altForm: AltForm = {
        id: newAltFormId,
        height: { value: 0, unit: LengthUnit.Centimeters },
        weight: { value: 0, unit: WeightUnit.Kilograms },
        sex: "",
        name: "",
        species: "",
        physicalDescription: "",
        capabilities: "",
      };
      c.altforms.O[newAltFormId] = altForm;
      c.altforms.fId = createId<GID.AltForm>((newAltFormId as number) + 1);

      const character: Character = {
        id: newCharId,
        name: "[new character]",
        gender: "Mysterious",
        originalAge: Math.floor(Math.random() * 20 + 14),
        personality: {},
        background: { summary: "Typical Universe Denizen", description: "" },
        notes: "",
        primary,
        originalForm: newAltFormId,
      };
      c.characters.O[newCharId] = character;
      c.characters.fId = createId<GID.Character>((newCharId as number) + 1);
      c.characterList.push(newCharId);
    });
    return newCharId;
  }, []);
}

type CompanionDraft = {
  name: string;
  gender: string;
  age: number;
  backgroundSummary: string;
  backgroundDescription: string;
  personality: string;
  image?: ImgData;
};

/**
 * Returns a stable callback that creates a new companion with the given draft
 * values in a single tracked action.  The original alt-form is pre-populated
 * with the companion's name and gender, plus a randomised height (155–190 cm)
 * and weight (50–90 kg).
 */
export function useCreateCompanion() {
  return useCallback((draft: CompanionDraft): Id<GID.Character> => {
    const state = useChainStore.getState().chain!;
    const newCharId = state.characters.fId;
    const newAltFormId = state.altforms.fId;
    const heightCm = Math.floor(Math.random() * 36 + 155);
    const weightKg = Math.floor(Math.random() * 41 + 50);
    setTracked("Add companion", (c) => {
      const altForm: AltForm = {
        id: newAltFormId,
        name: draft.name || "New Companion",
        sex: draft.gender,
        species: "",
        physicalDescription: "",
        capabilities: "",
        height: { value: heightCm, unit: LengthUnit.Centimeters },
        weight: { value: weightKg, unit: WeightUnit.Kilograms },
      };
      if (draft.image) altForm.image = draft.image;
      c.altforms.O[newAltFormId] = altForm;
      c.altforms.fId = createId<GID.AltForm>((newAltFormId as number) + 1);

      const character: Character = {
        id: newCharId,
        name: draft.name || "New Companion",
        gender: draft.gender,
        originalAge: draft.age,
        personality: draft.personality
          ? { [PersonalityComponent.Personality]: draft.personality }
          : {},
        background: { summary: draft.backgroundSummary, description: draft.backgroundDescription },
        notes: "",
        primary: false,
        originalForm: newAltFormId,
      };
      c.characters.O[newCharId] = character;
      c.characters.fId = createId<GID.Character>((newCharId as number) + 1);
      c.characterList.push(newCharId);
    });
    return newCharId;
  }, []);
}

/** Returns a stable callback that fully removes a character and all their
 *  associated data: alt-forms, purchases, drawbacks, scenarios, supplement
 *  purchases, narratives, origins, notes, etc. across every jump.
 *  Will not remove the last primary jumper. */
export function useRemoveCharacter() {
  return useCallback((charId: Id<GID.Character>) => {
    setTracked("Remove character", (c) => {
      const char = c.characters.O[charId];
      if (!char) return;

      // Guard: never delete the last primary jumper
      if (char.primary) {
        const primaryCount = Object.values(c.characters.O).filter((ch) => ch?.primary).length;
        if (primaryCount <= 1) return;
      }

      const purchasesToDelete = new Set<Id<GID.Purchase>>();
      const altFormsToDelete = new Set<Id<GID.AltForm>>();
      altFormsToDelete.add(char.originalForm);

      for (const jumpId of c.jumpList) {
        const jump = c.jumps.O[jumpId];
        if (!jump) continue;

        // Collect purchases to delete
        for (const pId of (jump.purchases as any)[charId] ?? []) purchasesToDelete.add(pId);
        for (const pId of (jump.drawbacks as any)[charId] ?? []) purchasesToDelete.add(pId);
        for (const pId of (jump.scenarios as any)[charId] ?? []) purchasesToDelete.add(pId);
        const suppPurchases = (jump.supplementPurchases as any)[charId];
        if (suppPurchases) {
          for (const suppId in suppPurchases) {
            for (const pId of suppPurchases[suppId] ?? []) purchasesToDelete.add(pId);
          }
        }

        // Collect alt-forms to delete
        for (const afId of (jump.altForms as any)[charId] ?? []) altFormsToDelete.add(afId);

        // Clean up companion-import references in other characters' purchases
        for (const ownerKey in jump.purchases) {
          const list = (jump.purchases as any)[ownerKey] as Id<GID.Purchase>[] | undefined;
          if (!list) continue;
          for (const pId of list) {
            const p = c.purchases.O[pId] as CompanionImport | undefined;
            if (p?.type === PurchaseType.Companion) {
              p.importData.characters = p.importData.characters.filter(
                (id) => (id as number) !== (charId as number),
              );
            }
          }
        }

        // Remove all per-character keys from this jump
        jump.characters = jump.characters.filter((id) => (id as number) !== (charId as number));
        delete (jump.purchases as any)[charId];
        delete (jump.drawbacks as any)[charId];
        delete (jump.scenarios as any)[charId];
        delete (jump.supplementPurchases as any)[charId];
        delete (jump.supplementInvestments as any)[charId];
        delete (jump.altForms as any)[charId];
        delete (jump.bankDeposits as any)[charId];
        delete (jump.currencyExchanges as any)[charId];
        delete (jump.notes as any)[charId];
        delete (jump.narratives as any)[charId];
        delete (jump.origins as any)[charId];
      }

      // Delete from registries
      for (const pId of purchasesToDelete) delete c.purchases.O[pId];
      for (const afId of altFormsToDelete) delete c.altforms.O[afId];

      delete c.characters.O[charId];
      c.characterList = c.characterList.filter((id) => (id as number) !== (charId as number));
    });
  }, []);
}

/** Returns all characters in the chain as `{ id, name }[]` in list order.
 *  Stable — only re-renders when characterList or character names actually change. */
export function useAllCharacters(): { id: Id<GID.Character>; name: string }[] {
  // useShallow on a number array is stable (Object.is works for primitives).
  const characterList = useChainStore(useShallow((s) => s.chain?.characterList ?? []));
  // characters.O is an Immer-stable object reference; only changes on actual mutations.
  const characterObj = useChainStore((s) => s.chain?.characters.O);
  return useMemo(
    () => characterList.map((id) => ({ id, name: characterObj?.[id]?.name ?? "" })),
    [characterList, characterObj],
  );
}

/** Returns the ordered list of companion-import purchase IDs for a
 *  (jumpId, charId) slot, plus add / remove / reorder actions. */
export function useCompanionImports(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  const importIds = useChainStore(
    useShallow((s) => {
      const list = s.chain?.jumps.O[jumpId]?.purchases[charId] ?? [];
      return (list as Id<GID.Purchase>[]).filter(
        (id) => s.chain?.purchases.O[id]?.type === PurchaseType.Companion,
      );
    }),
  );

  const addImport = useCallback((): Id<GID.Purchase> => {
    const newId = useChainStore.getState().chain!.purchases.fId;
    setTracked("Add companion import", (c) => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      const purchase: CompanionImport = {
        id: newId,
        charId,
        jumpId,
        name: "",
        description: "",
        type: PurchaseType.Companion,
        cost: { modifier: CostModifier.Full },
        value: [],
        importData: { characters: [], allowances: {} as any, stipend: {} as any },
      };
      c.purchases.O[newId] = purchase as never;
      c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
      if (!jump.purchases[charId]) jump.purchases[charId] = [];
      jump.purchases[charId]!.push(newId);
      c.budgetFlag += 1;
    });
    return newId;
  }, [jumpId, charId]);

  const removeImport = useCallback(
    (id: Id<GID.Purchase>) => {
      setTracked("Remove companion import", (c) => {
        delete c.purchases.O[id];
        const list = c.jumps.O[jumpId]?.purchases[charId];
        if (list) {
          const idx = (list as Id<GID.Purchase>[]).indexOf(id);
          if (idx !== -1) (list as Id<GID.Purchase>[]).splice(idx, 1);
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );

  const reorderImports = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder companion imports", (c) => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const all = [...((jump.purchases[charId] ?? []) as Id<GID.Purchase>[])];
        let ni = 0;
        const result = all.map((id) =>
          c.purchases.O[id]?.type === PurchaseType.Companion ? newIds[ni++]! : id,
        );
        (jump.purchases as any)[charId as number] = result;
      });
    },
    [jumpId, charId],
  );

  return { importIds, actions: { addImport, removeImport, reorderImports } };
}

/** Returns a single companion import by purchase ID, plus a modify action. */
export function useCompanionImport(id: Id<GID.Purchase>) {
  const companionImport = useChainStore(
    (s) => s.chain?.purchases.O[id] as CompanionImport | undefined,
  );

  const modify = useCallback(
    (name: string, updater: (p: CompanionImport) => void) => {
      setTracked(name, (c) => {
        const target = c.purchases.O[id] as CompanionImport | undefined;
        if (target) updater(target);
        c.budgetFlag += 1;
      });
    },
    [id],
  );

  return { companionImport, modify };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Returns chain summary data for the scope/character selectors on the share page. */
export function useExportChainSummary(): {
  chainName: string;
  characters: { id: Id<GID.Character>; name: string; primary: boolean }[];
  jumps: { id: Id<GID.Jump>; name: string; number: number }[];
} {
  const chain = useChain();
  // Select jumpNumber separately so useMemo can depend on a stable reference.
  const jumpNumbers = useChainStore((s) => s.calculatedData.jumpNumber);

  return useMemo(() => {
    if (!chain) return { chainName: "", characters: [], jumps: [] };

    const characters = chain.characterList.map((id) => {
      const c = chain.characters.O[id];
      return { id, name: c?.name ?? "", primary: c?.primary ?? false };
    });

    const offset = chain.chainSettings.startWithJumpZero ? 0 : 1;
    const jumps = chain.jumpList.map((id) => {
      const j = chain.jumps.O[id];
      const number = ((jumpNumbers as any)?.[id as unknown as number] ?? 0) + offset;
      return { id, name: j?.name ?? "", number };
    });

    return { chainName: chain.name, characters, jumps };
  }, [chain, jumpNumbers]);
}

/** Returns a snapshot of chain + calculatedData for IR building.
 *  Call this inside a Generate button handler — not for reactive rendering. */
export function useExportSnapshot() {
  const chain = useChainStore((s) => s.chain);
  const calculatedData = useChainStore((s) => s.calculatedData);
  return useMemo(() => ({ chain, calculatedData }), [chain, calculatedData]);
}

// ── Copy/paste purchases ──────────────────────────────────────────────────────

/**
 * Builds a snapshot of a purchase tree (root + all subpurchases) for clipboard storage.
 * Used so cross-chain paste can reconstruct purchases whose IDs don't exist in the target chain.
 */
export function buildPurchaseSnapshot(c: Chain, rootId: Id<GID.Purchase>): Record<number, unknown> {
  const snapshot: Record<number, unknown> = {};
  function collect(id: Id<GID.Purchase>) {
    const p = c.purchases.O[id];
    if (!p) return;
    snapshot[id as number] = p;
    const list = (p as BasicPurchase).subpurchases?.list;
    if (list) for (const subId of list) collect(subId);
  }
  collect(rootId);
  return snapshot;
}

/** Deep-copies a purchase (and its subpurchases) into the chain's purchases map,
 *  assigning fresh IDs. Cross-jump pastes reset value to zeros and subtype to default.
 *  `snapshot` is used for cross-chain paste when the source purchase no longer exists
 *  in `c.purchases.O`. */
function deepCopyPurchase(
  c: Chain,
  srcId: Id<GID.Purchase>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId?: Id<GID.Supplement>,
  snapshot?: Record<number, unknown>,
): Id<GID.Purchase> {
  const src = snapshot?.[srcId as number] as (typeof c.purchases.O)[typeof srcId] | undefined;
  if (!src) return srcId;

  const newId = c.purchases.fId;
  c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);

  const srcJumpId = (src as JumpPurchase).jumpId;
  const sameJump = srcJumpId === jumpId;
  const targetJump = c.jumps.O[jumpId];

  // Shallow-clone, then fix up fields below
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const copy: any = { ...src, id: newId, charId, jumpId };

  // Cross-jump paste: collapse the source value into a single DEFAULT_CURRENCY amount
  // by summing all currency components. Same-jump paste keeps the value as-is.
  if (!sameJump && Array.isArray(src.value)) {
    const total = (src.value as SimpleValue[]).reduce(
      (sum: number, sv) => sum + (sv.amount ?? 0),
      0,
    );
    copy.value = [{ currency: DEFAULT_CURRENCY_ID, amount: total }];
  }

  switch (src.type) {
    case PurchaseType.Perk:
    case PurchaseType.Item: {
      const bp = src as BasicPurchase;
      if (!sameJump)
        copy.subtype = DefaultSubtype[src.type as PurchaseType.Perk | PurchaseType.Item];
      copy.boosts = undefined;
      copy.purchaseGroup = undefined;
      copy.categories = [...bp.categories];
      copy.tags = [...bp.tags];
      if (bp.subpurchases) {
        const newSubIds: Id<GID.Purchase>[] = [];
        for (const subId of bp.subpurchases.list) {
          const newSubId = deepCopyPurchase(c, subId, jumpId, charId, undefined, snapshot);
          const newSub = c.purchases.O[newSubId] as Subpurchase | undefined;
          if (newSub) (newSub as any).parent = newId;
          newSubIds.push(newSubId);
        }
        copy.subpurchases = {
          stipend: sameJump ? (bp.subpurchases.stipend ?? []).map((sv) => ({ ...sv })) : [],
          list: newSubIds,
        };
      } else {
        copy.subpurchases = undefined;
      }
      break;
    }
    case PurchaseType.Drawback:
    case PurchaseType.ChainDrawback:
      // overrides are jump-specific; clear them on paste
      (copy as Drawback).overrides = {};
      break;
    case PurchaseType.SupplementPerk:
    case PurchaseType.SupplementItem:
      if (suppId != null) (copy as SupplementPurchase).supplement = suppId;
      break;
    default:
      break;
  }

  c.purchases.O[newId] = copy;
  return newId;
}

/** Appends the new purchase ID into the correct list for the given clipboard key. */
function pushPastedPurchase(
  c: Chain,
  newId: Id<GID.Purchase>,
  key: string,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  suppId?: Id<GID.Supplement>,
): void {
  const jump = c.jumps.O[jumpId];
  if (!jump) return;

  if (suppId !== undefined) {
    if (!jump.supplementPurchases[charId]) jump.supplementPurchases[charId] = {};
    const bySup = jump.supplementPurchases[charId];
    if (!bySup[suppId]) bySup[suppId] = [];
    bySup[suppId].push(newId);
  } else if (key === "perk" || key === "item") {
    if (!jump.purchases[charId]) jump.purchases[charId] = [];
    jump.purchases[charId]!.push(newId);
  } else if (key === "drawback") {
    if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
    jump.drawbacks[charId]!.push(newId);
  } else if (key === "scenario") {
    if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
    jump.scenarios[charId]!.push(newId);
  }
}

// ── Purchase Groups ────────────────────────────────────────────────────────────

/** Returns whether purchase groups are enabled for the given type. */
export function usePurchaseGroupsEnabled(type: PurchaseType.Perk | PurchaseType.Item): boolean {
  return useChainStore((s) =>
    type === PurchaseType.Perk
      ? (s.chain?.chainSettings.allowPerkGroups ?? false)
      : (s.chain?.chainSettings.allowItemGroups ?? false),
  );
}

/** Returns group IDs (for the given type) that have ≥1 component in this jump/char. */
export function useJumpPurchaseGroups(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  type: PurchaseType.Perk | PurchaseType.Item,
) {
  const groupIds = useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.PurchaseGroup>[];
      const registry = s.chain.purchaseGroups[charId];
      if (!registry) return [] as Id<GID.PurchaseGroup>[];
      return (Object.entries(registry.O) as [string, PurchaseGroup | undefined][])
        .filter(([, group]) => {
          if (!group || group.type !== type) return false;
          return group.components.some((purchId) => {
            const p = s.chain!.purchases.O[purchId] as BasicPurchase | undefined;
            return p?.jumpId === jumpId;
          });
        })
        .map(([id]) => createId<GID.PurchaseGroup>(+id));
    }),
  );

  const createGroup = useCallback(
    (name: string, description: string): Id<GID.PurchaseGroup> => {
      const fId =
        useChainStore.getState().chain?.purchaseGroups[charId]?.fId ??
        createId<GID.PurchaseGroup>(0);
      setTracked("Create purchase group", (c) => {
        if (!c.purchaseGroups[charId]) {
          c.purchaseGroups[charId] = {
            fId: createId<GID.PurchaseGroup>(1),
            O: {} as Registry<GID.PurchaseGroup, PurchaseGroup>["O"],
          };
        }
        const reg = c.purchaseGroups[charId]!;
        reg.O[fId] = { type, name, description, components: [] };
        reg.fId = createId<GID.PurchaseGroup>((fId as number) + 1);
      });
      return fId;
    },
    [charId, type],
  );

  const deleteGroup = useCallback(
    (groupId: Id<GID.PurchaseGroup>) => {
      setTracked("Delete purchase group", (c) => {
        const reg = c.purchaseGroups[charId];
        if (!reg) return;
        const group = reg.O[groupId];
        if (!group) return;
        for (const purchId of group.components) {
          const p = c.purchases.O[purchId] as BasicPurchase | undefined;
          if (p) p.purchaseGroup = undefined;
        }
        delete reg.O[groupId];
      });
    },
    [charId],
  );

  return { groupIds, actions: { createGroup, deleteGroup } };
}

/** Returns group data + component IDs visible in the given jump, plus mutation actions. */
export function usePurchaseGroup(
  groupId: Id<GID.PurchaseGroup>,
  charId: Id<GID.Character>,
  jumpId?: Id<GID.Jump>,
) {
  const group = useChainStore(
    useShallow((s) => s.chain?.purchaseGroups[charId]?.O[groupId] ?? null),
  );

  const componentIds = useChainStore(
    useShallow((s) => {
      if (!s.chain) return [] as Id<GID.Purchase>[];
      const g = s.chain.purchaseGroups[charId]?.O[groupId];
      if (!g) return [] as Id<GID.Purchase>[];
      if (jumpId == null) return g.components.filter(() => true);
      return g.components.filter((purchId) => {
        const p = s.chain!.purchases.O[purchId] as BasicPurchase | undefined;
        return p?.jumpId === jumpId;
      });
    }),
  );

  const modify = useCallback(
    (name: string, updater: (g: PurchaseGroup) => void) => {
      setTracked(name, (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (g) updater(g);
      });
    },
    [groupId, charId],
  );

  const addComponent = useCallback(
    (purchaseId: Id<GID.Purchase>) => {
      setTracked("Add to purchase group", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g || g.components.includes(purchaseId)) return;
        g.components.push(purchaseId);
        const p = c.purchases.O[purchaseId] as BasicPurchase | undefined;
        if (p) p.purchaseGroup = groupId;
        c.budgetFlag += 1;
      });
    },
    [groupId, charId],
  );

  const removeComponent = useCallback(
    (purchaseId: Id<GID.Purchase>) => {
      setTracked("Remove from purchase group", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g) return;
        const idx = g.components.indexOf(purchaseId);
        if (idx !== -1) g.components.splice(idx, 1);
        const p = c.purchases.O[purchaseId] as BasicPurchase | undefined;
        if (p) p.purchaseGroup = undefined;
        c.budgetFlag += 1;
      });
    },
    [groupId, charId],
  );

  const reorderComponents = useCallback(
    (newIds: Id<GID.Purchase>[]) => {
      setTracked("Reorder group components", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g) return;
        if (jumpId == null) {
          g.components.splice(0, g.components.length, ...newIds);
        } else {
          let cursor = 0;
          for (let i = 0; i < g.components.length; i++) {
            const p = c.purchases.O[g.components[i]] as BasicPurchase | undefined;
            if (p?.jumpId === jumpId) {
              g.components[i] = newIds[cursor++];
            }
          }
        }
      });
    },
    [groupId, charId, jumpId],
  );

  return {
    group,
    componentIds,
    actions: { modify, addComponent, removeComponent, reorderComponents },
  };
}

/** Returns all groups for a character+type — used by the group selection modal. */
export function useAllPurchaseGroups(
  charId: Id<GID.Character>,
  type: PurchaseType.Perk | PurchaseType.Item,
): Array<{ id: Id<GID.PurchaseGroup>; name: string; description: string }> {
  // Serialize to a stable string so Zustand's useSyncExternalStore doesn't loop.
  // useShallow + object literals fails because Object.is(newObj, prevObj) is always false.
  const json = useChainStore((s) => {
    if (!s.chain) return "[]";
    const registry = s.chain.purchaseGroups[charId];
    if (!registry) return "[]";
    const items = (Object.entries(registry.O) as [string, PurchaseGroup | undefined][])
      .filter(([, g]) => g?.type === type)
      .map(([id, g]) => ({ id: +id, name: g!.name, description: g!.description }));
    return JSON.stringify(items);
  });
  return useMemo(() => {
    const items = JSON.parse(json) as { id: number; name: string; description: string }[];
    return items.map(({ id, name, description }) => ({
      id: createId<GID.PurchaseGroup>(id),
      name,
      description,
    }));
  }, [json]);
}

/** Returns the name of a purchase group, or null if the group doesn't exist. */
export function usePurchaseGroupName(
  charId: Id<GID.Character> | undefined,
  groupId: Id<GID.PurchaseGroup> | undefined,
): string | null {
  return useChainStore((s) => {
    if (charId == null || groupId == null) return null;
    return s.chain?.purchaseGroups[charId]?.O[groupId]?.name ?? null;
  });
}

/** Standalone mutation actions for purchase groups, not bound to a specific group ID. */
export function usePurchaseGroupActions(charId: Id<GID.Character>) {
  const addToGroup = useCallback(
    (purchaseId: Id<GID.Purchase>, groupId: Id<GID.PurchaseGroup>) => {
      setTracked("Add to purchase group", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g || g.components.includes(purchaseId)) return;
        g.components.push(purchaseId);
        const p = c.purchases.O[purchaseId] as BasicPurchase | undefined;
        if (p) p.purchaseGroup = groupId;
        c.budgetFlag += 1;
      });
    },
    [charId],
  );

  const removeFromGroup = useCallback(
    (purchaseId: Id<GID.Purchase>, groupId: Id<GID.PurchaseGroup>) => {
      setTracked("Remove from purchase group", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g) return;
        const idx = g.components.indexOf(purchaseId);
        if (idx !== -1) g.components.splice(idx, 1);
        const p = c.purchases.O[purchaseId] as BasicPurchase | undefined;
        if (p) p.purchaseGroup = undefined;
        c.budgetFlag += 1;
      });
    },
    [charId],
  );

  const createGroup = useCallback(
    (
      type: PurchaseType.Perk | PurchaseType.Item,
      name: string,
      description: string,
    ): Id<GID.PurchaseGroup> => {
      const fId =
        useChainStore.getState().chain?.purchaseGroups[charId]?.fId ??
        createId<GID.PurchaseGroup>(0);
      setTracked("Create purchase group", (c) => {
        if (!c.purchaseGroups[charId]) {
          c.purchaseGroups[charId] = {
            fId: createId<GID.PurchaseGroup>(1),
            O: {} as Registry<GID.PurchaseGroup, PurchaseGroup>["O"],
          };
        }
        const reg = c.purchaseGroups[charId]!;
        reg.O[fId] = { type, name, description, components: [] };
        reg.fId = createId<GID.PurchaseGroup>((fId as number) + 1);
      });
      return fId;
    },
    [charId],
  );

  const updateGroup = useCallback(
    (groupId: Id<GID.PurchaseGroup>, name: string, description: string) => {
      setTracked("Edit group", (c) => {
        const g = c.purchaseGroups[charId]?.O[groupId];
        if (!g) return;
        g.name = name;
        g.description = description;
      });
    },
    [charId],
  );

  return { addToGroup, removeFromGroup, createGroup, updateGroup };
}

/** Returns a callback that pastes all clipboard entries with the given key into
 *  this jump/character's appropriate purchase list. */
export function usePastePurchases(jumpId: Id<GID.Jump>, charId: Id<GID.Character>) {
  return useCallback(
    (key: string, suppId?: Id<GID.Supplement>) => {
      const entries = useClipboard.getState().entries.filter((e) => e.key === key);
      if (entries.length === 0) return;
      setTracked("Paste purchases", (c) => {
        for (const { id: srcId, snapshot } of entries) {
          if (!c.purchases.O[srcId] && !snapshot?.[srcId as number]) continue;
          const newId = deepCopyPurchase(c, srcId, jumpId, charId, suppId, snapshot);
          pushPastedPurchase(c, newId, key, jumpId, charId, suppId);
        }
        c.budgetFlag += 1;
      });
    },
    [jumpId, charId],
  );
}

/**
 * Returns origin/currency context needed by JumpDocViewer to compute effective
 * hover-tooltip cost strings (discounts, alt costs). Returns null when no jump
 * or character context is available (standalone doc view).
 */
export function useJumpDocHoverContext(
  jumpId: Id<GID.Jump> | undefined,
  charId: Id<GID.Character> | undefined,
): {
  origins: PartialLookup<LID.OriginCategory, Origin[]> | null;
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined;
  currencies: Registry<LID.Currency, Currency> | undefined;
} | null {
  const chain = useChain();
  return useMemo(() => {
    if (!chain || jumpId === undefined || charId === undefined) return null;
    const jump = chain.jumps.O[jumpId];
    if (!jump) return null;
    return {
      origins: (jump.origins[charId] ?? null) as PartialLookup<LID.OriginCategory, Origin[]> | null,
      originCategories: jump.originCategories as
        | Registry<LID.OriginCategory, OriginCategory>
        | undefined,
      currencies: jump.currencies as Registry<LID.Currency, Currency> | undefined,
    };
  }, [chain, jumpId, charId]);
}
