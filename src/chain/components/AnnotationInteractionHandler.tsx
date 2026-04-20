import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "react-toastify";
import { SegmentedControl } from "@/ui/SegmentedControl";
import {
  createId,
  GID,
  Id,
  LID,
  PartialIndex,
  PartialLookup,
  Registry,
  registryAdd,
  TID,
} from "../data/types";
import {
  setTracked,
  useAllCharacters,
  useChain,
  useCreateCompanion,
  useRemoveCharacter,
  useUpdateStack,
} from "../state/hooks";
import { useChainStore } from "../state/Store";
import {
  AnnotationAction,
  AnnotationInteraction,
  BuildListener,
  JumpDocBuildData,
  useViewerActionStore,
} from "../state/ViewerActionStore";
import { Chain } from "../data/Chain";
import {
  BasicPurchase,
  CompanionImport,
  CostModifier,
  JumpPurchase,
  ModifiedCost,
  PurchaseType,
  purchaseValue,
  RewardType,
  SimpleValue,
  Scenario,
  ScenarioReward,
  Value,
} from "../data/Purchase";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import {
  AlternativeCostPrerequisite,
  Annotation,
  BasicPurchaseTemplate,
  CompanionTemplate,
  DocOriginCategory,
  DrawbackDurationMod,
  DrawbackTemplate,
  JumpDoc,
  JumpDocPrerequisite,
  OriginTemplate,
  PurchaseTemplate,
  ScenarioTemplate,
  stripTemplating,
} from "../data/JumpDoc";
import { InteractionPreviewCard } from "./InteractionPreviewCard";
import { CompanionMultiSelect } from "./CompanionMultiSelect";
import { NewCompanionModal } from "./NewCompanionModal";
import {
  applyTags,
  extractTags,
  originTemplateInfo,
  resolveOriginTemplate,
  TagField,
} from "./annotationResolvers";
import { formatCostDisplay, formatCostShort } from "@/ui/CostDropdown";
import { convertWhitespace, objFilter } from "@/utilities/miscUtilities";
import { Currency, DEFAULT_CURRENCY_ID } from "../data/Jump";
import { formatDuration } from "@/utilities/units";

const MySwal = withReactContent(Swal);

export type AnnotationInteractionHandlerProps = {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  doc: JumpDoc;
};

export type PossibleCost = ModifiedCost<TID.Currency> & {
  cost: Value<TID.Currency>;
  floatingDiscountOption?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper for Chain Mutation Hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Sub-route destinations used by `ChainMutators.navigate`. */
export type MutatorNavTarget =
  | { sub: "purchases"; scrollTo?: Id<GID.Purchase> }
  | {
      sub: "drawbacks";
      scrollTo?: Id<GID.Purchase>;
      extraSearch?: Record<string, string>;
    }
  | { sub: "companions"; scrollTo?: Id<GID.Purchase> }
  | { sub: ""; extraSearch?: Record<string, string> };

export type ChainMutators = {
  /** Navigate after a successful interaction. Suppressed after the first call per interaction batch. */
  navigate: (target: MutatorNavTarget) => void;
  addPurchaseFromTemplate: (
    data: {
      template: BasicPurchaseTemplate | DrawbackTemplate;
      type: "purchase" | "drawback";
      tags: Record<string, string>;
      cost: PossibleCost;
      reward?: Id<TID.Scenario>;
      freebie?: Id<TID.Companion>;
      customDuration?: number;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  addOriginFromTemplate: (
    ata: {
      template: OriginTemplate;
      tags: Record<string, string>;
      cost: SimpleValue<TID.Currency>;
      freebie?: Id<TID.Companion>;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<TID.Origin>;
  repricePurchase: (
    id: Id<GID.Purchase>,
    cost: PossibleCost,
    doc: JumpDoc,
  ) => void;
  repriceOrigin: (
    templateId: Id<TID.Origin>,
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    build: JumpDocBuildData,
    doc: JumpDoc,
  ) => void;
  removePurchase: (id: Id<GID.Purchase>, build: JumpDocBuildData) => void;
  addScenarioFromTemplate: (
    data: {
      template: ScenarioTemplate;
      tags: Record<string, string>;
      rewardGroupIndex: number | undefined;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  addCompanionImport: (
    data: {
      template: CompanionTemplate;
      companionIds: Id<GID.Character>[];
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  createCompanion: (data: {
    template: CompanionTemplate;
    name: string;
    gender: string;
    species: string;
  }) => Id<GID.Character>;
  addFollower: (
    data: {
      template: CompanionTemplate;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  removeCharacters: (ids: Id<GID.Character>[]) => void;
  removeOrigin: (
    templateId: Id<TID.Origin>,
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
  ) => void;
  setFreeFormOrigin: (
    data: {
      categoryId: Id<TID.OriginCategory>;
      value: string;
      cost: SimpleValue<TID.Currency>;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => void;
  addCurrencyExchangeFromDoc: (
    opts: {
      templateIndex: number;
      oCurrency: Id<TID.Currency>;
      tCurrency: Id<TID.Currency>;
      oamount: number;
      tamount: number;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => void;
  removeCurrencyExchangeFromDoc: (
    opts: { templateIndex: number; oamount: number; tamount: number },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
  ) => void;
};

/**
 * Creates a BuildListener that fires when any value in the deps array changes.
 * On first build the deps are stored but the action does not fire.
 * Semantics mirror React's useEffect dependency array.
 */
export function createListener(
  action: (
    build: JumpDocBuildData,
    chain: Chain,
    doc: JumpDoc,
    mutators: ChainMutators,
  ) => void,
  deps: (build: JumpDocBuildData) => readonly unknown[],
): BuildListener {
  let prev: readonly unknown[] | undefined;
  return {
    condition: build => {
      const next = deps(build);
      if (!prev) {
        prev = next;
        return true;
      }
      return next.some((d, i) => d !== prev![i]);
    },
    action: (build, chain, doc, mutators) => {
      prev = deps(build);
      action(build, chain, doc, mutators);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listener factories
// ─────────────────────────────────────────────────────────────────────────────

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

/** Removes purchases/drawbacks/scenarios/companion imports whose prereqs or origin-access restrictions are no longer satisfied. */
export function createPrereqRemovalListener(): BuildListener {
  const shouldRemove = (
    template: {
      prerequisites?: JumpDocPrerequisite[];
      originBenefit?: string;
      origins?: Id<TID.Origin>[];
    },
    build: JumpDocBuildData,
    doc: JumpDoc,
  ) => {
    const hasPrereqError = (template.prerequisites ?? []).some(
      p => getPrereqError(p, build, doc) !== undefined,
    );
    const hasAccessError =
      template.originBenefit === "access" &&
      (template.origins ?? []).length > 0 &&
      (template.origins ?? []).every(o =>
        build.origins.every(bo => bo.template?.id !== o),
      );
    return hasPrereqError || hasAccessError;
  };

  return createListener(
    (build, chain, doc, mutators) => {
      const removed: string[] = [];
      const removeAll = (gids: Id<GID.Purchase>[]) => {
        for (const gid of [...gids]) {
          removed.push(chain.purchases.O[gid]?.name ?? "?");
          mutators.removePurchase(gid, build);
        }
      };
      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        const template = doc.availablePurchases.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.purchases[tid] ?? []);
      }
      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        const template = doc.availableDrawbacks.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.drawbacks[tid] ?? []);
      }
      for (const tidStr in build.scenarios) {
        const tid = createId<TID.Scenario>(+tidStr);
        const template = doc.availableScenarios.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.scenarios[tid] ?? []);
      }
      for (const tidStr in build.companionImports) {
        const tid = createId<TID.Companion>(+tidStr);
        const template = doc.availableCompanions.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.companionImports[tid] ?? []);
      }
      if (removed.length) toast.info(`Removed: ${fmtNames(removed)}`);
    },
    build => [
      Object.keys(build.purchases).length,
      Object.keys(build.drawbacks).length,
      Object.keys(build.scenarios).length,
      Object.keys(build.companionImports).length,
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
    ],
  );
}

const valuesEqualTID = (
  a: Value<TID.Currency>,
  b: Value<TID.Currency>,
): boolean => {
  const normalize = (v: Value<TID.Currency>) =>
    [...v].sort((x, y) => (x.currency as number) - (y.currency as number));
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length !== nb.length) return false;
  return na.every(
    (sv, i) => sv.currency === nb[i]!.currency && sv.amount === nb[i]!.amount,
  );
};

/** Reprices TID-linked purchases whose stored cost no longer matches any currently valid cost option. */
export function createRepricePurchasesListener(): BuildListener {
  return createListener(
    (build, currentChain, doc, mutators) => {
      const repriced: string[] = [];
      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        const template = doc.availablePurchases.O[tid];
        if (!template) continue;
        const gids = build.purchases[tid] ?? [];

        for (let i = 0; i < gids.length; i++) {
          const gid = gids[i]!;
          const p = currentChain.purchases.O[gid] as JumpPurchase | undefined;
          if (
            (p as BasicPurchase).reward ??
            (p as BasicPurchase).freebie !== undefined
          )
            continue;
          if (!p?.template?.originalCost) continue;
          const originalCost = p.template.originalCost as PossibleCost;
          const originalEffective = purchaseValue(
            originalCost.cost,
            originalCost,
          ) as Value<TID.Currency>;

          const possibleCosts = computePossibleCosts(
            template,
            build,
            doc,
            i === 0,
          );
          const allCosts = [possibleCosts.default, ...possibleCosts.options];
          const costsToCheck = originalCost.floatingDiscountOption
            ? allCosts.filter(c => c.floatingDiscountOption)
            : allCosts;

          const stillValid = costsToCheck.some(c =>
            valuesEqualTID(
              originalEffective,
              purchaseValue(c.cost, c) as Value<TID.Currency>,
            ),
          );

          if (!stillValid) {
            repriced.push(p.name);
            mutators.repricePurchase(
              gid,
              { ...possibleCosts.default, floatingDiscountOption: undefined },
              doc,
            );
          }
        }
      }
      if (repriced.length)
        toast.info(`Prices adjusted on ${fmtNames(repriced)}`);
    },
    build => [
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
      Object.keys(build.drawbacks).length,
      Object.keys(build.purchases).length,
    ],
  );
}

/** Appends or strips booster-text on TID-linked purchases and drawbacks as booster presence changes. */
export function createBoosterTextListener(): BuildListener {
  const reconcileBoosts = (
    gid: Id<GID.Purchase>,
    boosted: DrawbackTemplate["boosted"],
    build: JumpDocBuildData,
    c: Chain,
    added: string[],
    removed: string[],
  ) => {
    const p = c.purchases.O[gid] as JumpPurchase | undefined;
    if (!p) return;
    for (const { description, booster, boosterKind } of boosted) {
      const boosterPresent =
        boosterKind === "drawback"
          ? (build.drawbacks[booster as any] ?? []).length > 0
          : (build.purchases[booster as any] ?? []).length > 0;
      const suffix = `${description}`;
      const alreadyApplied = p.boosts?.some?.(b => b.purchaseId == booster);

      if (boosterPresent && !alreadyApplied) {
        p.description = p.description.trimEnd() + "\n\n" + suffix;
        if (!p.boosts) p.boosts = [];
        p.boosts.push({ purchaseId: booster as Id<GID.Purchase>, description });
        added.push(p.name);
      } else if (!boosterPresent && alreadyApplied) {
        p.description = p.description.replace(suffix, "").trimEnd();
        p.boosts = (p.boosts ?? []).filter(b => b.purchaseId !== booster);
        removed.push(p.name);
      }
    }
  };

  return createListener(
    (build, _, doc) => {
      const added: string[] = [];
      const removed: string[] = [];
      setTracked("Reconcile booster text", c => {
        for (const tidStr in build.purchases) {
          const tid = createId<TID.Purchase>(+tidStr);
          const template = doc.availablePurchases.O[tid];
          if (!template?.boosted.length) continue;
          for (const gid of build.purchases[tid] ?? [])
            reconcileBoosts(
              gid,
              template.boosted as DrawbackTemplate["boosted"],
              build,
              c as Chain,
              added,
              removed,
            );
        }
        for (const tidStr in build.drawbacks) {
          const tid = createId<TID.Drawback>(+tidStr);
          const template = doc.availableDrawbacks.O[tid];
          if (!template?.boosted?.length) continue;
          for (const gid of build.drawbacks[tid] ?? [])
            reconcileBoosts(
              gid,
              template.boosted,
              build,
              c as Chain,
              added,
              removed,
            );
        }
        c.budgetFlag += 1;
      });
      if (added.length) toast.info(`Boosts added to ${fmtNames(added)}`);
      if (removed.length)
        toast.info(`Boosts removed from ${fmtNames(removed)}`);
    },
    build => [
      Object.keys(build.purchases).length,
      Object.keys(build.drawbacks).length,
    ],
  );
}

/** Removes or reprices origins whose synergy prerequisites are no longer satisfied. */
export function createOriginSynergyListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, _chain, doc, mutators) => {
      const removed: string[] = [];
      const repriced: string[] = [];
      for (const origin of build.origins) {
        if (!origin.template) continue;
        const template = doc.origins.O[origin.template.id];
        if (!template?.synergies?.length) continue;

        const synergyPresent = template.synergies.some(sid =>
          build.origins.some(o => o.template?.id === sid),
        );

        if (template.synergyBenefit === "access") {
          if (!synergyPresent) {
            removed.push(template.name);
            mutators.removeOrigin(template.id, jumpId, charId);
          }
        } else if (
          template.synergyBenefit === "discounted" ||
          template.synergyBenefit === "free"
        ) {
          const originalCost = origin.template.originalCost;
          if (!originalCost) continue;
          const originalHadSynergy =
            originalCost.modifier !== CostModifier.Full ||
            (originalCost.cost[0]?.amount ?? template.cost.amount) <
              template.cost.amount;
          if (synergyPresent !== originalHadSynergy) {
            repriced.push(template.name);
            mutators.repriceOrigin(template.id, jumpId, charId, build, doc);
          }
        }
      }
      if (removed.length) toast.info(`Removed: ${fmtNames(removed)}`);
      if (repriced.length)
        toast.info(`Prices adjusted on ${fmtNames(repriced)}`);
    },
    build => [
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
    ],
  );
}

/** Creates or removes origin stipend drawbacks as the active origin set changes. */
export function createOriginStipendListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, _chain, doc, _mutators) => {
      const created: string[] = [];
      const removed: string[] = [];
      setTracked("Reconcile origin stipends", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;

        const activeOriginTids = new Set(
          build.origins.map(o => o.template?.id).filter(id => id != null),
        );

        for (const tidStr in build.stipend) {
          const originTid = createId<TID.Origin>(+tidStr);
          if (!activeOriginTids.has(originTid)) {
            for (const gid of build.stipend[originTid] ?? []) {
              removed.push(c.purchases.O[gid]?.name ?? "?");
              delete c.purchases.O[gid];
              const list = jump.drawbacks[charId] as
                | Id<GID.Purchase>[]
                | undefined;
              if (list) {
                const idx = list.indexOf(gid);
                if (idx !== -1) list.splice(idx, 1);
              }
            }
          }
        }

        for (const origin of build.origins) {
          if (!origin.template) continue;
          const template = doc.origins.O[origin.template.id];
          if (!template?.originStipend?.length) continue;
          const existing = build.stipend?.[template.id] ?? [];

          const docCat = doc.originCategories.O[template.type];
          const categoryName = docCat?.name ?? "";

          for (const entry of template.originStipend) {
            if (entry.amount <= 0) continue;
            const subtypeName =
              doc.purchaseSubtypes.O[entry.purchaseSubtype]?.name ?? "";
            const alreadyExists = existing.some(gid => {
              const p = c.purchases.O[gid] as any;
              return (
                p?.stipend === template.id &&
                (p as any)._stipendSubtype === entry.purchaseSubtype
              );
            });
            if (alreadyExists) continue;

            const lidCurrency = convertCurrencyId(
              entry.currency,
              doc,
              jump.currencies,
            );
            const lidSubtype = convertSubtypeId(
              entry.purchaseSubtype,
              doc,
              jump.purchaseSubtypes,
            );
            if (lidSubtype == null) continue;

            const name = `${template.name} ${subtypeName} Stipend`;
            created.push(name);
            const newId = c.purchases.fId;
            const newDrawback = {
              id: newId,
              charId,
              jumpId,
              name,
              description: `Stipend from the ${template.name} ${categoryName} for ${subtypeName} purchases.`,
              type: PurchaseType.Drawback,
              cost: { modifier: CostModifier.Full },
              value: [{ amount: entry.amount, currency: lidCurrency }],
              overrides: {},
              stipend: template.id,
              _stipendSubtype: entry.purchaseSubtype,
            };
            c.purchases.O[newId] = newDrawback as never;
            c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
            if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
            jump.drawbacks[charId]!.push(newId);
          }
        }

        c.budgetFlag += 1;
      });
      if (removed.length) toast.info(`Removed stipends: ${fmtNames(removed)}`);
      if (created.length) toast.info(`Added stipends: ${fmtNames(created)}`);
    },
    build => [
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
    ],
  );
}

/** Recomputes jump duration from the base doc duration plus all active drawback/scenario duration mods.
 *  "set" and "choice" mods establish the base; "inc" mods stack on top. */
export function createDurationListener(
  jumpId: Id<GID.Jump>,
  doc: JumpDoc,
): BuildListener {
  const durationModDrawbackTids = Object.keys(doc.availableDrawbacks.O)
    .map(s => createId<TID.Drawback>(+s))
    .filter(tid => doc.availableDrawbacks.O[tid]?.durationMod);
  const durationScenarioModTids = Object.keys(doc.availableScenarios.O)
    .map(s => createId<TID.Scenario>(+s))
    .filter(tid => doc.availableScenarios.O[tid]?.durationMod);

  return createListener(
    (build, chain, doc, _mutators) => {
      let base = doc.duration.years;
      let increment = 0;

      const applyMod = (mod: DrawbackDurationMod, gids: Id<GID.Purchase>[]) => {
        if (mod.type === "set") {
          base = mod.years;
        } else if (mod.type === "choice") {
          for (const gid of gids) {
            const p = chain.purchases.O[gid] as
              | { customDuration?: number }
              | undefined;
            base = p?.customDuration ?? 0;
          }
        } else {
          increment += mod.years * gids.length;
        }
      };

      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        const mod = doc.availableDrawbacks.O[tid]?.durationMod;
        if (mod) applyMod(mod, build.drawbacks[tid] ?? []);
      }
      for (const tidStr in build.scenarios) {
        const tid = createId<TID.Scenario>(+tidStr);
        const mod = doc.availableScenarios.O[tid]?.durationMod;
        if (mod) applyMod(mod, build.scenarios[tid] ?? []);
      }

      const newYears = base + increment;
      const newDuration = {
        days: doc.duration.days,
        months: doc.duration.months,
        years: newYears,
      };
      let changed = false;
      setTracked("Update jump duration", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        if (!jump.originalDuration)
          jump.originalDuration = { ...jump.duration };

        const prev = jump.originalDuration;
        if (
          prev &&
          prev.years === newYears &&
          prev.months === newDuration.months &&
          prev.days === newDuration.days
        )
          return;
        changed = true;
        jump.duration = newDuration;
        jump.originalDuration = newDuration;
      });
      if (changed)
        toast.info(`Jump duration updated to ${formatDuration(newYears)}`);
    },
    build => [
      ...durationModDrawbackTids.map(
        tid => (build.drawbacks[tid] ?? []).length,
      ),
      ...durationScenarioModTids.map(
        tid => (build.scenarios[tid] ?? []).length,
      ),
    ],
  );
}

/** Removes reward purchases whose granting scenario is no longer in the build. */
export function createScenarioRewardListener(): BuildListener {
  return createListener(
    (build, chain, _doc, mutators) => {
      const removed: string[] = [];
      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        for (const gid of build.purchases[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.reward) continue;
          const scenarioPresent =
            (build.scenarios[p.reward as any] ?? []).length > 0;
          if (!scenarioPresent) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }
      if (removed.length)
        toast.info(`Removed reward purchases: ${fmtNames(removed)}`);
    },
    build => [Object.keys(build.scenarios).length],
  );
}

/** Removes freebie purchases, drawbacks, and origins whose granting companion import is no longer in the build.
 *  Runs once on first build (empty deps). */
export function createFreebieCleanupListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, chain, _doc, mutators) => {
      const removed: string[] = [];

      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        for (const gid of build.purchases[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.freebie) continue;
          if ((build.companionImports[p.freebie] ?? []).length === 0) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }

      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        for (const gid of build.drawbacks[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.freebie) continue;
          if ((build.companionImports[p.freebie] ?? []).length === 0) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }

      for (const origin of build.origins) {
        if (!origin.freebie || !origin.template) continue;
        if ((build.companionImports[origin.freebie] ?? []).length === 0) {
          removed.push(origin.summary);
          mutators.removeOrigin(origin.template.id, jumpId, charId);
        }
      }

      if (removed.length)
        toast.info(`Removed freebie items: ${fmtNames(removed)}`);
    },
    () => [],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tag fields UI
// ─────────────────────────────────────────────────────────────────────────────

function TagFieldsSection({
  tags,
  tagValues,
  choiceContext,
  onChangeTag,
}: {
  tags: TagField[];
  tagValues: Record<string, string>;
  choiceContext?: string;
  onChangeTag: (name: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-2 rounded-md border-edge bg-tint border">
      {tags.map(tag => (
        <label key={tag.name} className="contents">
          <div
            className={`text-xs font-semibold text-muted text-right min-w-min max-w-max w-30 justify-self-end ${!tag.multiline ? "self-stretch items-center flex" : ""}`}
          >
            {tag.name
              .split(" ")
              .map(w => w[0].toUpperCase() + w.slice(1))
              .join(" ")}
            :
          </div>
          {tag.multiline ? (
            <textarea
              className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              rows={3}
              value={tagValues[tag.name] ?? ""}
              ref={el => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onChange={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
                onChangeTag(tag.name, e.target.value);
              }}
            />
          ) : (
            <input
              type="text"
              className="h-min bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              value={tagValues[tag.name] ?? ""}
              onChange={e => onChangeTag(tag.name, e.target.value)}
            />
          )}
        </label>
      ))}
      <div />
      {choiceContext && (
        <div className="text-xs text-ghost flex flex-col gap-1.5 max-w-sm">
          {convertWhitespace(choiceContext)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog wrapper (shown inside SweetAlert2)
// ─────────────────────────────────────────────────────────────────────────────

function InteractionDialog({
  interactions,
  build,
  mutators,
  onClose,
}: {
  interactions: AnnotationInteraction<object>[];
  build: JumpDocBuildData;
  mutators: ChainMutators;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionState, setInteractionState] = useState<object>(
    () => interactions[0]?.initialize(build) ?? {},
  );

  useEffect(() => {
    setInteractionState(interactions[activeIndex]?.initialize(build) ?? {});
  }, [activeIndex]);

  const enqueueInteractions = useViewerActionStore(s => s.enqueueInteractions);

  let interaction = interactions[activeIndex];
  let errorMessage = interaction.error(build);
  let actions = (
    typeof interaction.actions == "function"
      ? interaction.actions(build)
      : interaction.actions
  )
    .filter(a => a.condition(build))
    .map(a => ({
      label:
        typeof a.name == "function" ? a.name(build, interactionState) : a.name,
      variant: a.variant ?? "confirm",
      blocker:
        typeof a.blocker == "function"
          ? a.blocker(build, interactionState)
          : a.blocker,
      onConfirm: () =>
        a
          .execute(build, mutators, interactionState)
          .forEach(followup =>
            "interaction" in followup
              ? enqueueInteractions(followup.interaction, followup.character)
              : enqueueInteractions([followup]),
          ),
    }));

  return (
    <div className="bg-surface rounded-xl border border-edge shadow-xl text-left w-max max-w-[90vw] md:max-w-[70vw] lg:max-w-[60vw] justify-items-center overflow-visible">
      {interactions.length > 1 && (
        <>
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink border-b border-edge">
            Multiple options — choose one:
          </p>
          <div className="flex flex-row flex-wrap justify-center gap-1 mx-2 mt-2 max-w-100">
            {interactions.map(({ name, initialize }, i) => (
              <button
                onClick={() => {
                  if (i != activeIndex) {
                    setActiveIndex(i);
                    setInteractionState(
                      interactions[activeIndex].initialize(build),
                    );
                  }
                }}
                className={`text-xs px-2 py-0.5 rounded-full border ${i == activeIndex ? "bg-accent2-tint text-accent2 border-accent2-ring" : "text-muted border-transparent hover:text-ink hover:border-edge hover:bg-tint"}`}
              >
                {stripTemplating(
                  typeof name == "function"
                    ? name(build, initialize(build))
                    : name,
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col max-w-120 w-full">
        <InteractionPreviewCard
          typeName={interaction.typeName}
          description={
            typeof interaction.description == "function"
              ? interaction.description(build, interactionState)
              : interaction.description
          }
          name={
            typeof interaction.name == "function"
              ? interaction.name(build, interactionState)
              : interaction.name
          }
          costStr={
            typeof interaction.costStr == "function"
              ? interaction.costStr(build, interactionState)
              : interaction.costStr
          }
          info={
            typeof interaction.info == "function"
              ? interaction.info(build, interactionState)
              : interaction.info
          }
          warning={
            typeof interaction.warning == "function"
              ? interaction.warning(build, interactionState)
              : interaction.warning
          }
          actions={actions}
          onClose={onClose}
          errorMessage={errorMessage}
        >
          <interaction.preview
            buildData={build}
            setState={partial => {
              setInteractionState(s => ({ ...s, ...partial }));
            }}
            state={interactionState}
          />
        </InteractionPreviewCard>
      </div>
    </div>
  );
}

function computeBuildData(
  chain: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc?: JumpDoc,
): JumpDocBuildData {
  let jump = chain.jumps.O[jumpId];

  let purchases: PartialIndex<TID.Purchase, GID.Purchase> = {};
  let drawbacks: PartialIndex<TID.Drawback, GID.Purchase> = {};
  let scenarios: PartialIndex<TID.Scenario, GID.Purchase> = {};
  let companionImports: PartialIndex<TID.Companion, GID.Purchase> = {};

  [
    ...(jump.purchases[charId] ?? []),
    ...(jump.drawbacks[charId] ?? []),
    ...(jump.scenarios[charId] ?? []),
  ]?.forEach(pId => {
    let purchase = chain.purchases.O[pId] as JumpPurchase;
    if (!purchase) return;
    if (purchase.template?.id !== undefined)
      switch (purchase.type) {
        case PurchaseType.Perk:
        case PurchaseType.Item:
          if (!purchases[purchase.template.id as Id<TID.Purchase>])
            purchases[purchase.template.id as Id<TID.Purchase>] = [];
          purchases[purchase.template.id as Id<TID.Purchase>]!.push(
            purchase.id,
          );
          break;
        case PurchaseType.Companion:
          if (!companionImports[purchase.template.id as Id<TID.Companion>])
            companionImports[purchase.template.id as Id<TID.Companion>] = [];
          companionImports[purchase.template.id as Id<TID.Companion>]!.push(
            purchase.id,
          );
          break;
        case PurchaseType.Drawback:
          if (!drawbacks[purchase.template.id as Id<TID.Drawback>])
            drawbacks[purchase.template.id as Id<TID.Drawback>] = [];
          drawbacks[purchase.template.id as Id<TID.Drawback>]!.push(
            purchase.id,
          );
          break;
        case PurchaseType.Scenario:
          if (!scenarios[purchase.template.id as Id<TID.Scenario>])
            scenarios[purchase.template.id as Id<TID.Scenario>] = [];
          scenarios[purchase.template.id as Id<TID.Scenario>]!.push(
            purchase.id,
          );
          break;
      }
  });

  let stipend: PartialIndex<TID.Origin, GID.Purchase> | undefined;
  if (doc) {
    const hasOriginStipend = Object.values(doc.origins.O).some(t =>
      t?.originStipend?.some(e => e.amount > 0),
    );
    if (hasOriginStipend) {
      stipend = {};
      for (const pId of jump.drawbacks[charId] ?? []) {
        const p = chain.purchases.O[pId];
        if (!p) continue;
        const stipendTid = (p as any).stipend as Id<TID.Origin> | undefined;
        if (stipendTid != null) {
          if (!stipend[stipendTid]) stipend[stipendTid] = [];
          stipend[stipendTid]!.push(pId);
        }
      }
    }
  }

  return {
    purchases,
    drawbacks,
    scenarios,
    companionImports,
    currencyExchanges: jump.currencyExchanges[charId] ?? [],
    origins: Object.values(jump.origins[charId] ?? {}).flat(),
    ...(stipend !== undefined ? { stipend } : {}),
  };
}

function getPrereqError(
  prereq: JumpDocPrerequisite,
  build: JumpDocBuildData,
  doc: JumpDoc,
): string | undefined {
  let has: boolean;
  let name: string;
  switch (prereq.type) {
    case "drawback":
      has = (build.drawbacks[prereq.id] ?? []).length > 0;
      name = (doc.availableDrawbacks.O[prereq.id] ?? []).name;
      break;
    case "purchase":
      has = (build.purchases[prereq.id] ?? []).length > 0;
      name = (doc.availablePurchases.O[prereq.id] ?? []).name;
      break;
    case "scenario":
      has = (build.scenarios[prereq.id] ?? []).length > 0;
      name = (doc.availableScenarios.O[prereq.id] ?? []).name;
      break;
    case "origin":
      has = build.origins.some(o => o.template?.id == prereq.id);
      name = doc.origins.O[prereq.id].name;
  }
  if (!has && prereq.positive) return `Restricted to holders of "${name}".`;
  if (has && !prereq.positive) return `Incompatible with "${name}".`;
}

function computePossibleCosts(
  template: PurchaseTemplate<TID>,
  build: JumpDocBuildData,
  doc: JumpDoc,
  isFirstCopy?: boolean,
) {
  let isPurchase = (template as BasicPurchaseTemplate).subtype !== undefined;
  let floatingDiscountMode = isPurchase
    ? (doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype]
        .floatingDiscountMode ??
      (doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype]
        .floatingDiscountThresholds?.length
        ? "free"
        : undefined))
    : undefined;
  let maxFloatingDiscountThreshold: PartialLookup<TID.Currency, number> = {};

  if (floatingDiscountMode) {
    for (let sv of doc.purchaseSubtypes.O[
      (template as BasicPurchaseTemplate).subtype
    ].floatingDiscountThresholds ?? [])
      maxFloatingDiscountThreshold[sv.currency] = Math.max(
        maxFloatingDiscountThreshold[sv.currency] ?? 0,
        sv.amount,
      );
  }

  let floatingDiscount = (c: PossibleCost) =>
    (purchaseValue(c.cost, c) as Value<TID.Currency>).every(
      c => c.amount <= (maxFloatingDiscountThreshold[c.currency] ?? 0),
    );

  let applyOrigin: (c: PossibleCost) => PossibleCost = c => {
    if (
      !build.origins.some(
        o => o.template && (template.origins ?? []).includes(o.template.id),
      )
    )
      return c;

    if (floatingDiscountMode == "origin" && floatingDiscount(c)) {
      return { ...c, floatingDiscountOption: true };
    }

    switch (template.originBenefit ?? "discounted") {
      case "free":
        return {
          ...c,
          modifier: CostModifier.Free,
        };
      case "discounted":
        if (
          c.cost.every(
            c =>
              c.amount <=
              (doc.currencies.O[c.currency].discountFreeThreshold ?? 0),
          )
        )
          return { ...c, modifier: CostModifier.Free };
        switch (c.modifier) {
          case CostModifier.Full:
            return { ...c, modifier: CostModifier.Reduced };
          case CostModifier.Reduced:
            return {
              ...c,
              modifier: CostModifier.Custom,
              modifiedTo: purchaseValue<TID.Currency>(
                purchaseValue<TID.Currency>(c.cost, {
                  modifier: CostModifier.Reduced,
                }),
                { modifier: CostModifier.Reduced },
              ) as Value<TID.Currency>,
            };
          case CostModifier.Custom:
            return {
              ...c,
              modifier: CostModifier.Custom,
              modifiedTo: purchaseValue<TID.Currency>(c.modifiedTo, {
                modifier: CostModifier.Reduced,
              }) as Value<TID.Currency>,
            };
          case CostModifier.Free:
            return c;
        }
      default:
        return c;
    }
  };

  let cost = applyOrigin({ cost: template.cost, modifier: CostModifier.Full });
  let costOptions = [];

  for (const altCost of template.alternativeCosts ?? []) {
    let f = (a: (p: AlternativeCostPrerequisite) => boolean) =>
      altCost.AND
        ? altCost.prerequisites.some(a)
        : altCost.prerequisites.every(a);
    if (
      f(prereq => {
        if (
          isFirstCopy &&
          prereq.type === "purchase" &&
          (prereq.id as number) === (template.id as number)
        )
          return true;
        switch (prereq.type) {
          case "purchase":
            return (build.purchases[prereq.id] ?? []).length === 0;
          case "drawback":
            return (build.drawbacks[prereq.id] ?? []).length === 0;
          case "origin":
            return !build.origins.some(o => o.template?.id === prereq.id);
        }
      })
    )
      break;
    let newCost: PossibleCost = {
      cost: template.cost,
      modifier: CostModifier.Custom as const,
      modifiedTo: altCost.value,
    };
    if (altCost.beforeDiscounts) {
      newCost.floatingDiscountOption =
        floatingDiscountMode == "free" && floatingDiscount(newCost);
      newCost = applyOrigin(newCost);
    }
    if (altCost.mandatory) cost = newCost;
    else costOptions.push(newCost);
  }
  if (floatingDiscountMode == "free" && floatingDiscount(cost))
    cost.floatingDiscountOption = true;

  return { default: cost, options: costOptions };
}

export function purchaseInteraction<A extends TID.Drawback | TID.Purchase>(
  type: A extends TID.Purchase ? "purchase" : "drawback",
  template: A extends TID.Purchase ? BasicPurchaseTemplate : DrawbackTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  override?: {
    cost: PossibleCost;
    type: "scenario" | "import";
    source?: Id<TID.Scenario> | Id<TID.Companion>;
  },
): AnnotationInteraction<Record<string, string>> {
  const tags = extractTags([template.name, template.description]);
  const hasTags = tags.length > 0;

  const copies = (build: JumpDocBuildData) =>
    (type == "purchase" ? build.purchases : build.drawbacks)[
      template.id as any
    ] ?? [];

  const baseDescription = (build: JumpDocBuildData) => {
    let activeBoosters =
      template?.boosted?.filter?.(
        ({ booster, boosterKind }) =>
          (boosterKind == "drawback" ? build.drawbacks : build.purchases)[
            booster as any
          ]?.length,
      ) ?? [];
    return `${template.description}\n\n${activeBoosters.map(b => b.description).join("\n\n")}`;
  };

  let getCost = (build: JumpDocBuildData) =>
    override
      ? { default: override.cost, options: [] }
      : computePossibleCosts(template, build, doc);

  let error = (build: JumpDocBuildData) => {
    let prereqErrors = (template.prerequisites ?? [])
      .map(p => getPrereqError(p, build, doc))
      .filter(err => err) as string[];
    let originError: string | undefined = undefined;
    if (
      template.originBenefit == "access" &&
      template.origins?.every?.(o =>
        build.origins.every(bo => bo.template?.id != o),
      )
    ) {
      originError = `Restricted to holders of ${template.origins?.map((o, i) => `${i == (template.origins?.length ?? 0) - 1 && i > 0 && "or "}"${doc.origins.O[o].name}"`).join(", ")}.`;
    }
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError ?? ""}`;
  };

  let actions: (
    build: JumpDocBuildData,
  ) => AnnotationAction<Record<string, string>>[] = build => {
    let cost = getCost(build);
    const seen = new Set<string>();
    const flatCosts = [cost.default, ...cost.options].filter(c => {
      const key = formatCostShort(c.cost, c, doc.currencies);
      return seen.size === seen.add(key).size ? false : true;
    });
    let floatingDiscountCosts = flatCosts.filter(c => c.floatingDiscountOption);

    return [
      {
        name: "Remove",
        variant: "danger",
        condition: build => copies(build).length > 0,
        execute: (build, mutators) => {
          mutators.removePurchase(copies(build)[0], build);
          mutators.navigate({
            sub: type === "drawback" ? "drawbacks" : "purchases",
          });
          return [];
        },
      },
      ...flatCosts.map(c => ({
        name: `Add (${formatCostShort(c.cost, c, doc.currencies)})`,
        condition: (build: JumpDocBuildData) =>
          copies(build).length == 0 || template.allowMultiple,
        execute: (
          _: JumpDocBuildData,
          mutators: ChainMutators,
          state: Record<string, string>,
        ) => {
          const customDuration =
            state._duration !== undefined
              ? parseInt(state._duration, 10)
              : undefined;
          const newId = mutators.addPurchaseFromTemplate(
            {
              template,
              cost: { ...c, floatingDiscountOption: undefined },
              tags: state,
              type,
              reward:
                override?.type == "scenario"
                  ? (override?.source as any)
                  : undefined,
              freebie:
                override?.type === "import"
                  ? (override.source as Id<TID.Companion>)
                  : undefined,
              customDuration:
                customDuration !== undefined && !isNaN(customDuration)
                  ? customDuration
                  : undefined,
            },
            jumpId,
            charId,
            doc,
          );
          navAfterAdd(newId, mutators);
          return [];
        },
      })),
      ...floatingDiscountCosts.map(c => ({
        name: `Use Floating Discount(${formatCostDisplay(
          c.cost,
          c,
          doc.currencies,
        )})`,
        condition: (build: JumpDocBuildData) =>
          copies(build).length == 0 || template.allowMultiple,
        execute: (
          _: JumpDocBuildData,
          mutators: ChainMutators,
          state: Record<string, string>,
        ) => {
          const customDuration =
            state._duration !== undefined
              ? parseInt(state._duration, 10)
              : undefined;
          const newId = mutators.addPurchaseFromTemplate(
            {
              template,
              cost: c,
              tags: state,
              type,
              reward:
                override?.type == "scenario"
                  ? (override?.source as any)
                  : undefined,
              freebie:
                override?.type === "import"
                  ? (override.source as Id<TID.Companion>)
                  : undefined,
              customDuration:
                customDuration !== undefined && !isNaN(customDuration)
                  ? customDuration
                  : undefined,
            },
            jumpId,
            charId,
            doc,
          );
          navAfterAdd(newId, mutators);
          return [];
        },
      })),
    ];
  };

  const subtypePlacement =
    type === "purchase"
      ? doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype]
          ?.placement
      : undefined;

  const navAfterAdd = (
    newId: Id<GID.Purchase> | undefined,
    mutators: ChainMutators,
  ) => {
    if (newId === undefined) return;
    if (type === "drawback") {
      mutators.navigate({ sub: "drawbacks", scrollTo: newId });
    } else if (subtypePlacement !== "route") {
      mutators.navigate({ sub: "purchases", scrollTo: newId });
    }
  };

  const durationMod =
    type === "drawback"
      ? (template as DrawbackTemplate).durationMod
      : undefined;
  const isUserChoiceDuration = durationMod?.type === "choice";

  return {
    initialize: (): Record<string, string> =>
      isUserChoiceDuration ? { _duration: "1" } : {},
    error,
    preview: (props: {
      buildData: JumpDocBuildData;
      state: Record<string, string>;
      setState: (partial: Partial<Record<string, string>>) => void;
    }) =>
      hasTags || isUserChoiceDuration ? (
        <div className="flex flex-col gap-2">
          {hasTags && (
            <TagFieldsSection
              tags={tags}
              tagValues={props.state}
              choiceContext={template.choiceContext}
              onChangeTag={(name, value) => props.setState({ [name]: value })}
            />
          )}
          {isUserChoiceDuration && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ghost shrink-0">Duration:</span>
              <input
                type="number"
                min={1}
                value={props.state._duration ?? "1"}
                onChange={e => props.setState({ _duration: e.target.value })}
                className="w-16 text-xs bg-canvas border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring transition-colors"
              />
              <span className="text-xs text-ghost shrink-0">yr</span>
            </div>
          )}
        </div>
      ) : null,
    typeName: type[0].toUpperCase() + type.slice(1),
    name: (_, tagValues) =>
      hasTags ? applyTags(template.name, tagValues) : template.name,
    description: (build, tagValues) =>
      hasTags
        ? applyTags(baseDescription(build), tagValues)
        : baseDescription(build),
    costStr: build =>
      formatCostDisplay(
        getCost(build).default.cost,
        getCost(build).default,
        doc.currencies,
      ),
    shortCostStr: build =>
      formatCostShort(
        getCost(build).default.cost,
        getCost(build).default,
        doc.currencies,
      ),
    info: build =>
      copies(build).length > 0
        ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: _ => tags.length > 0 || isUserChoiceDuration,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario interaction
// ─────────────────────────────────────────────────────────────────────────────

type ScenarioRewardGroup = NonNullable<
  ScenarioTemplate["rewardGroups"]
>[number];
type ScenarioInteractionState = {
  tags: Record<string, string>;
  selectedOutcome: number;
};

function RewardLine({
  reward,
  doc,
}: {
  reward: ScenarioRewardGroup["rewards"][number];
  doc: JumpDoc;
}) {
  if (reward.type === RewardType.Currency) {
    const abbrev = doc.currencies.O[reward.currency]?.abbrev ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev}
      </span>
    );
  }
  if (reward.type === RewardType.Stipend) {
    const abbrev = doc.currencies.O[reward.currency]?.abbrev ?? "?";
    const subtypeName = doc.purchaseSubtypes.O[reward.subtype]?.name ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev} ({subtypeName} stipend)
      </span>
    );
  }
  if (reward.type === RewardType.Companion) {
    const companion = doc.availableCompanions.O[reward.id];
    return (
      <span className="text-xs text-ink">
        Companion import: {companion?.name}
      </span>
    );
  }
  const purchase = doc.availablePurchases.O[reward.id];
  return <span className="text-xs text-ink">{purchase?.name}</span>;
}

function ScenarioOutcomeSelector({
  groups,
  selectedIndex,
  onSelect,
  doc,
}: {
  groups: ScenarioRewardGroup[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  doc: JumpDoc;
}) {
  const group = groups[selectedIndex];
  return (
    <div className="flex flex-col gap-2 pb-1">
      <div className="flex flex-wrap items-center gap-1.5 pl-3">
        <span className="text-xs text-muted font-semibold shrink-0">
          Outcome:
        </span>
        {groups.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              selectedIndex === i
                ? "bg-accent2-tint text-accent2 border-accent2"
                : "bg-surface text-ink border-edge hover:border-accent2 hover:text-accent2"
            }`}
          >
            {g.title || `Outcome ${i + 1}`}
          </button>
        ))}
      </div>
      {group && (
        <div className="flex flex-col justify-center gap-2 rounded border border-accent-ring/15 bg-tint/50 p-5">
          {group.context && (
            <div className="text-xs text-muted flex flex-col gap-1">
              {convertWhitespace(group.context)}
            </div>
          )}
          {group.rewards.length > 0 && (
            <div className="flex flex-row flex-wrap gap-x-1.5 text-xs">
              <span className="font-medium">Rewards:</span>
              {group.rewards.map((r, i) => (
                <span key={i}>
                  <RewardLine reward={r} doc={doc} />
                  {i < group.rewards.length - 1 ? "; " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Companion import interaction
// ─────────────────────────────────────────────────────────────────────────────

type CompanionInteractionState = {
  follower: boolean;
  selectedIds: Id<GID.Character>[];
  charName: string;
  charSpecies: string;
  charGender: string;
  showNewCompanionModal: boolean;
  tags: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Origin interaction
// ─────────────────────────────────────────────────────────────────────────────

type OriginInteractionState = {
  tags: Record<string, string>;
  selections: Record<string, { idx: number; freeform: string }>;
};

type OriginOptionEntry = {
  isFreeform: boolean;
  displayName: string;
  rawName: string | null;
  costStr: string | undefined;
};

type OriginOptionGroup = {
  categoryName: string;
  catId: Id<TID.OriginCategory>;
  options: OriginOptionEntry[];
};

function buildOriginOptionGroups(
  optionIndices: PartialLookup<TID.OriginCategory, number[]>,
  doc: JumpDoc,
): OriginOptionGroup[] {
  const groups: OriginOptionGroup[] = [];
  for (const catIdStr in optionIndices) {
    const catId = createId<TID.OriginCategory>(+catIdStr);
    const indices = optionIndices[catId] ?? [];
    const category = doc.originCategories.O[catId];
    if (!category || !category.singleLine) continue;
    const options: OriginOptionEntry[] = (indices as number[]).flatMap(i => {
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[i];
      if (!opt) return [];
      const isFreeform = opt.type === "freeform";
      const currency = doc.currencies.O[opt.cost.currency];
      const costStr = currency
        ? `${opt.cost.amount} ${currency.abbrev}`
        : undefined;
      return [
        {
          isFreeform,
          displayName: isFreeform
            ? `Manually set ${category.name}`
            : stripTemplating(opt.name),
          rawName: isFreeform ? null : opt.name,
          costStr,
        },
      ];
    });
    if (options.length > 0)
      groups.push({ categoryName: category.name, catId, options });
  }
  return groups;
}

function OriginOptionSelector({
  group,
  selectedIdx,
  freeformText,
  onSelect,
  onFreeformChange,
}: {
  group: OriginOptionGroup;
  selectedIdx: number;
  freeformText: string;
  onSelect: (i: number) => void;
  onFreeformChange: (v: string) => void;
}) {
  const selectedOpt = group.options[selectedIdx];
  const onlyFreeform =
    group.options.length === 1 && group.options[0]!.isFreeform;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-ghost font-medium uppercase tracking-wide">
        {group.categoryName}
      </p>
      {onlyFreeform ? (
        <input
          type="text"
          className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
          placeholder="Enter value…"
          value={freeformText}
          onChange={e => onFreeformChange(e.target.value)}
        />
      ) : (
        group.options.map((opt, i) => {
          const { main, aux } = opt.rawName
            ? originTemplateInfo(opt.rawName)
            : { main: opt.displayName, aux: undefined };
          return (
            <>
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                className={`text-left flex items-center px-3 py-2 rounded border transition-colors ${
                  i === selectedIdx
                    ? "border-accent2-ring bg-accent2-tint text-ink"
                    : "border-edge text-muted hover:border-trim hover:text-ink"
                }`}
              >
                <span className="text-sm font-medium inline-flex items-center">
                  {opt.isFreeform ? opt.displayName : main}
                </span>
                {opt.costStr && (
                  <span className="text-xs text-ghost ml-2">
                    [{opt.costStr}]
                  </span>
                )}
                {aux && aux.length > 0 && (
                  <div className="text-xs text-ghost flex flex-col gap-0.5">
                    {aux.map((s, j) => (
                      <p key={j}>{s}</p>
                    ))}
                  </div>
                )}
              </button>
              {selectedOpt?.isFreeform && selectedIdx === i && (
                <input
                  key={`freeform-${i}`}
                  type="text"
                  className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
                  placeholder="Enter value…"
                  value={freeformText}
                  onChange={e => onFreeformChange(e.target.value)}
                />
              )}
            </>
          );
        })
      )}
    </div>
  );
}

function OriginOptionGroups({
  groups,
  state,
  onChange,
}: {
  groups: OriginOptionGroup[];
  state: OriginInteractionState["selections"];
  onChange: (catIdStr: string, idx: number, freeform: string) => void;
}) {
  return (
    <div className={`flex flex-col ${groups.length > 1 ? "gap-3" : "gap-1"}`}>
      {groups.map(g => {
        const catIdStr = String(g.catId);
        const { idx, freeform } = state[catIdStr] ?? { idx: 0, freeform: "" };
        return (
          <OriginOptionSelector
            key={catIdStr}
            group={g}
            selectedIdx={idx}
            freeformText={freeform}
            onSelect={i => onChange(catIdStr, i, "")}
            onFreeformChange={v => onChange(catIdStr, idx, v)}
          />
        );
      })}
    </div>
  );
}

export function originInteraction(
  template: OriginTemplate | undefined,
  optionIndices: PartialLookup<TID.OriginCategory, number[]>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  costOverride?: SimpleValue<TID.Currency>,
  companionTid?: Id<TID.Companion>,
): AnnotationInteraction<OriginInteractionState> {
  const groups = buildOriginOptionGroups(optionIndices, doc);
  const tags = template
    ? extractTags([template.name, template.description ?? ""])
    : [];
  const hasTags = tags.length > 0;

  const optionsTypeName =
    groups.length === 1 ? groups[0]!.categoryName : "Origin Options";
  const typeName = template
    ? (doc.originCategories.O[template.type]?.name ?? "Origin")
    : optionsTypeName;

  const alreadyPresent = (build: JumpDocBuildData) =>
    template !== undefined &&
    build.origins.some(o => o.template?.id == template.id);

  const getCost = (build: JumpDocBuildData): SimpleValue<TID.Currency> => {
    if (costOverride) return costOverride;
    if (!template) return { amount: 0, currency: 0 as any };
    const hasSynergy = template.synergies?.some(sid =>
      build.origins.some(o => o.template?.id == sid),
    );
    if (!hasSynergy) return template.cost;
    switch (template.synergyBenefit) {
      case "free":
        return { amount: 0, currency: 0 as any };
      case "discounted": {
        const threshold =
          doc.currencies.O[template.cost.currency]?.discountFreeThreshold;
        if (threshold != null && template.cost.amount <= threshold)
          return { amount: 0, currency: 0 as any };
        return {
          amount: Math.floor(template.cost.amount / 2),
          currency: template.cost.currency,
        };
      }
      default:
        return template.cost;
    }
  };

  const optionsCostStr = (
    state: OriginInteractionState,
  ): string | undefined => {
    const totals: Partial<Record<number, number>> = {};
    for (const catIdStr in optionIndices) {
      const catId = createId<TID.OriginCategory>(+catIdStr);
      const category = doc.originCategories.O[catId];
      if (!category?.singleLine) continue;
      const { idx } = state.selections[catIdStr] ?? { idx: 0 };
      const availIndices = optionIndices[catId] ?? [];
      const optionDocIdx = availIndices[idx];
      if (optionDocIdx === undefined) continue;
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[optionDocIdx];
      if (!opt) continue;
      const currKey = opt.cost.currency as unknown as number;
      totals[currKey] = (totals[currKey] ?? 0) + opt.cost.amount;
    }
    const parts = Object.entries(totals).map(([currIdStr, amount]) => {
      const curr = doc.currencies.O[createId<TID.Currency>(+currIdStr)];
      return `${amount} ${curr?.abbrev ?? "?"}`;
    });
    return parts.length > 0 ? parts.join(", ") : undefined;
  };

  const error = (build: JumpDocBuildData) => {
    if (!template) return undefined;
    if (
      template.synergyBenefit === "access" &&
      template.synergies?.every(sid =>
        build.origins.every(o => o.template?.id != sid),
      )
    ) {
      const originList =
        template.synergies
          ?.map(sid => doc.origins.O[sid]?.name ?? "?")
          .join(", ") ?? "";
      return `This origin is restricted to holders of: ${originList}.`;
    }
    return undefined;
  };

  const executeOptions = (
    mutators: ChainMutators,
    state: OriginInteractionState,
  ) => {
    for (const catIdStr in optionIndices) {
      const catId = createId<TID.OriginCategory>(+catIdStr);
      const category = doc.originCategories.O[catId];
      if (!category?.singleLine) continue;
      const { idx, freeform } = state.selections[catIdStr] ?? {
        idx: 0,
        freeform: "",
      };
      const availIndices = optionIndices[catId] ?? [];
      const optionDocIdx = availIndices[idx];
      if (optionDocIdx === undefined) continue;
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[optionDocIdx];
      if (!opt) continue;
      const value =
        opt.type === "freeform" ? freeform : resolveOriginTemplate(opt.name);
      mutators.setFreeFormOrigin(
        { categoryId: catId, value, cost: opt.cost },
        jumpId,
        charId,
        doc,
      );
    }
  };

  const actions = (
    _: JumpDocBuildData,
  ): AnnotationAction<OriginInteractionState>[] => [
    {
      name: "Remove",
      variant: "danger",
      condition: build => alreadyPresent(build),
      execute: (_, mutators) => {
        mutators.removeOrigin(template!.id, jumpId, charId);
        mutators.navigate({ sub: "" });
        return [];
      },
    },
    {
      name: template
        ? (build, state) => {
            const cost = getCost(build);
            const optStr = optionsCostStr(state);
            const base = formatCostDisplay(
              [cost!],
              { modifier: CostModifier.Full },
              doc.currencies,
            );
            return `Use Origin (${optStr ? `${base} + ${optStr}` : base})`;
          }
        : "Set Options",
      condition: build => !alreadyPresent(build),
      execute: (build, mutators, state) => {
        if (template) {
          mutators.addOriginFromTemplate(
            {
              template,
              tags: state.tags,
              cost: getCost(build)!,
              freebie: companionTid,
            },
            jumpId,
            charId,
            doc,
          );
        }
        executeOptions(mutators, state);
        mutators.navigate({ sub: "", extraSearch: { origin: "1" } });
        return [];
      },
    },
  ];

  const hasOptions = groups.length > 0;
  const needsChoice = groups.some(
    g => g.options.length >= 2 || g.options.some(o => o.isFreeform),
  );

  return {
    initialize: () => ({
      tags: {},
      selections: Object.fromEntries(
        groups.map(g => [String(g.catId), { idx: 0, freeform: "" }]),
      ),
    }),
    error,
    preview: props => {
      if (alreadyPresent(props.buildData)) return undefined;
      if (!hasTags && !hasOptions) return undefined;
      return (
        <>
          {hasTags && (
            <TagFieldsSection
              tags={tags}
              tagValues={props.state.tags}
              choiceContext={template?.choiceContext}
              onChangeTag={(name, value) =>
                props.setState({ tags: { ...props.state.tags, [name]: value } })
              }
            />
          )}
          {hasOptions && (
            <OriginOptionGroups
              groups={groups}
              state={props.state.selections}
              onChange={(catIdStr, idx, freeform) =>
                props.setState({
                  selections: {
                    ...props.state.selections,
                    [catIdStr]: { idx, freeform },
                  },
                })
              }
            />
          )}
        </>
      );
    },
    typeName,
    name: template
      ? hasTags
        ? (_, state) => applyTags(template.name, state.tags)
        : template.name
      : `Set ${optionsTypeName}`,
    description: template?.description || undefined,
    costStr: (build, state) => {
      if (alreadyPresent(build)) return undefined;
      const cost = getCost(build);
      const base = template
        ? formatCostDisplay(
            [cost!],
            { modifier: CostModifier.Full },
            doc.currencies,
          )
        : undefined;
      const optStr = optionsCostStr(state);
      if (base && optStr) return `${base} + ${optStr}`;
      return base ?? optStr;
    },
    shortCostStr: build => {
      if (alreadyPresent(build)) return undefined;
      const cost = getCost(build);
      return template
        ? formatCostShort(
            [cost],
            { modifier: CostModifier.Full },
            doc.currencies,
          )
        : undefined;
    },
    info: build => (alreadyPresent(build) ? "Already selected" : undefined),
    actions,
    forcePreview: build => !alreadyPresent(build) && (needsChoice || hasTags),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin randomizer interaction
// ─────────────────────────────────────────────────────────────────────────────

export function randomizerInteraction(
  categoryId: Id<TID.OriginCategory>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): AnnotationInteraction<{}> {
  const category = doc.originCategories.O[categoryId] as DocOriginCategory & {
    singleLine: false;
  };
  const randomCost = category.random!.cost;

  const costStr = randomCost
    ? formatCostDisplay(
        [randomCost],
        { modifier: CostModifier.Full },
        doc.currencies,
      )
    : undefined;
  const shortCostStr = randomCost
    ? formatCostShort(
        [randomCost],
        { modifier: CostModifier.Full },
        doc.currencies,
      )
    : undefined;

  const getAvailable = (_: JumpDocBuildData): OriginTemplate[] => {
    const result: OriginTemplate[] = [];
    for (const idStr in doc.origins.O) {
      const tid = createId<TID.Origin>(+idStr);
      const template = doc.origins.O[tid];
      if (!template || template.type !== categoryId) continue;
      result.push(template);
    }
    return result;
  };

  return {
    initialize: () => ({}),
    error: () => undefined,
    preview: () => undefined,
    typeName: "Randomizer",
    name: category.name,
    costStr,
    shortCostStr,
    actions: [
      {
        name: "Randomize",
        condition: () => true,
        execute: build => {
          const available = getAvailable(build);
          if (available.length === 0) return [];
          const template =
            available[Math.floor(Math.random() * available.length)]!;
          return [
            originInteraction(
              template,
              {},
              doc,
              jumpId,
              charId,
              template.cost,
            ) as AnnotationInteraction<object>,
          ];
        },
      },
    ],
    forcePreview: () => true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency exchange interaction
// ─────────────────────────────────────────────────────────────────────────────

export function currencyExchangeInteraction(
  ann: Annotation<"currency-exchange">,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): AnnotationInteraction<{ count: number }> {
  const oCurrencyAbbrev = doc.currencies.O[ann.oCurrency]?.abbrev ?? "?";
  const tCurrencyAbbrev = doc.currencies.O[ann.tCurrency]?.abbrev ?? "?";

  const takenCount = (build: JumpDocBuildData) =>
    build.currencyExchanges
      .filter(e => e.templateIndex === ann.docIndex)
      .reduce((n, ex) => n + Math.floor(ex.oamount / ann.oamount), 0);

  return {
    initialize: build => ({ count: takenCount(build) }),
    error: () => undefined,
    typeName: "Currency Exchange",
    name: `Exchange – ${ann.oamount} ${oCurrencyAbbrev} → ${ann.tamount} ${tCurrencyAbbrev}`,
    description: `Trade ${ann.oamount} ${oCurrencyAbbrev} for ${ann.tamount} ${tCurrencyAbbrev}`,
    preview: ({ state, setState }) => (
      <div className="px-2 pb-2 flex items-center gap-3">
        <span className="text-xs text-muted">Times taken:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setState({ count: Math.max(0, state.count - 1) })}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            −
          </button>
          <span className="w-8 text-center text-sm tabular-nums">
            {state.count}
          </span>
          <button
            type="button"
            onClick={() => setState({ count: state.count + 1 })}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            +
          </button>
        </div>
      </div>
    ),
    actions: [
      {
        name: "Apply",
        variant: "confirm",
        condition: () => true,
        execute: (build, mutators, state) => {
          const current = takenCount(build);
          const delta = state.count - current;
          if (delta > 0) {
            for (let i = 0; i < delta; i++) {
              mutators.addCurrencyExchangeFromDoc(
                {
                  templateIndex: ann.docIndex,
                  oCurrency: ann.oCurrency,
                  tCurrency: ann.tCurrency,
                  oamount: ann.oamount,
                  tamount: ann.tamount,
                },
                jumpId,
                charId,
                doc,
              );
            }
          } else if (delta < 0) {
            for (let i = 0; i < -delta; i++) {
              mutators.removeCurrencyExchangeFromDoc(
                {
                  templateIndex: ann.docIndex,
                  oamount: ann.oamount,
                  tamount: ann.tamount,
                },
                jumpId,
                charId,
              );
            }
          }
          if (delta !== 0)
            mutators.navigate({
              sub: "drawbacks",
              extraSearch: { exchange: "1" },
            });
          return [];
        },
      },
    ],
    forcePreview: () => true,
  };
}

function buildFreebieInteractions(
  importId: Id<TID.Companion>,
  freebies: NonNullable<CompanionTemplate["freebies"]>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  companionCharIds: Id<GID.Character>[],
): {
  interaction: [AnnotationInteraction<object>];
  character: Id<GID.Character>;
}[] {
  const freeOverride = {
    cost: {
      cost: [] as Value<TID.Currency>,
      modifier: CostModifier.Free,
    } as PossibleCost,
    type: "import" as const,
    source: importId,
  };
  const result: {
    interaction: [AnnotationInteraction<object>];
    character: Id<GID.Character>;
  }[] = [];
  for (const companionCharId of companionCharIds) {
    for (const freebie of freebies) {
      if (freebie.type === "purchase") {
        const tmpl = doc.availablePurchases.O[freebie.id];
        if (tmpl)
          result.push({
            interaction: [
              purchaseInteraction(
                "purchase",
                tmpl,
                doc,
                jumpId,
                companionCharId,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ],
            character: +companionCharId as any,
          });
      } else if (freebie.type === "drawback") {
        const tmpl = doc.availableDrawbacks.O[freebie.id];
        if (tmpl)
          result.push({
            interaction: [
              purchaseInteraction(
                "drawback",
                tmpl,
                doc,
                jumpId,
                companionCharId,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ],
            character: +companionCharId as any,
          });
      } else {
        result.push({
          interaction: [
            originInteraction(
              doc.origins.O[freebie.id],
              {},
              doc,
              jumpId,
              companionCharId,
              undefined,
              importId,
            ) as AnnotationInteraction<object>,
          ],
          character: +companionCharId as any,
        });
      }
    }
  }
  return result;
}

function buildConfirmDeleteInteraction(
  existingId: Id<GID.Purchase>,
  charIdsToDelete: Id<GID.Character>[],
  message: string,
): AnnotationInteraction<object> {
  return {
    initialize: () => ({}),
    error: () => undefined,
    preview: () => undefined,
    typeName: "Companion Import",
    name: "Confirm Deletion",
    description: message,
    actions: [
      {
        name: "Confirm Delete",
        variant: "danger",
        condition: () => true,
        execute: (build, mutators) => {
          mutators.removeCharacters(charIdsToDelete);
          mutators.removePurchase(existingId, build);
          mutators.navigate({ sub: "companions" });
          return [];
        },
      },
      {
        name: "Cancel",
        variant: "warn",
        condition: () => true,
        execute: () => {
          return [];
        },
      },
    ],
    forcePreview: () => true,
  };
}

function CompanionCharField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <span className="text-xs text-muted shrink-0 w-14 text-right">
        {label}:
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 text-xs bg-tint border border-edge rounded px-1.5 py-0.5 text-ink focus:outline-none focus:border-accent"
        placeholder={label.toLowerCase()}
      />
    </>
  );
}

function CompanionPreviewInner({
  template,
  adding,
  state,
  setState,
  selfCharId,
}: {
  template: CompanionTemplate;
  adding: boolean;
  state: CompanionInteractionState;
  setState: (partial: Partial<CompanionInteractionState>) => void;
  selfCharId: Id<GID.Character>;
}) {
  const allChars = useAllCharacters();
  const tags = extractTags([template.name, template.description]);
  const hasTags = tags.length > 0;
  const selectableChars = allChars.filter(c => c.id !== selfCharId);
  const selectedChars = state.selectedIds
    .map(id => selectableChars.find(c => c.id === id))
    .filter(
      (c): c is { id: Id<GID.Character>; name: string } => c !== undefined,
    );
  const availableChars = selectableChars.filter(
    c => !state.selectedIds.includes(c.id),
  );

  return (
    <>
      {state.showNewCompanionModal && (
        <NewCompanionModal
          onDone={newId =>
            setState({
              selectedIds: [...state.selectedIds, newId],
              showNewCompanionModal: false,
            })
          }
          onCancel={() => setState({ showNewCompanionModal: false })}
        />
      )}
      {hasTags && (
        <TagFieldsSection
          tags={tags}
          tagValues={state.tags}
          choiceContext={template.choiceContext}
          onChangeTag={(name, value) =>
            setState({ tags: { ...state.tags, [name]: value } })
          }
        />
      )}
      {adding && (
        <div className="px-2 pb-1">
          <SegmentedControl
            value={state.follower ? "follower" : "companion"}
            onChange={v => setState({ follower: v === "follower" })}
            options={[
              { value: "companion", label: "Companion" },
              { value: "follower", label: "Follower" },
            ]}
          />
        </div>
      )}
      {adding && template.specificCharacter && !state.follower && (
        <div className="px-2 pb-2 grid grid-cols-[auto_1fr] gap-1.5 self-center items-center">
          <CompanionCharField
            label="Name"
            value={state.charName}
            onChange={v => setState({ charName: v })}
          />
          <CompanionCharField
            label="Species"
            value={state.charSpecies}
            onChange={v => setState({ charSpecies: v })}
          />
          <CompanionCharField
            label="Gender"
            value={state.charGender}
            onChange={v => setState({ charGender: v })}
          />
        </div>
      )}
      {adding && !template.specificCharacter && !state.follower && (
        <div className="px-2 pb-2 flex flex-col gap-1.5">
          <span className="text-xs text-muted font-medium">
            Chosen Companions ({state.selectedIds.length} of {template.count}):
          </span>
          <CompanionMultiSelect
            selected={selectedChars}
            available={availableChars}
            onAdd={id => setState({ selectedIds: [...state.selectedIds, id] })}
            onRemove={id =>
              setState({
                selectedIds: state.selectedIds.filter(cid => cid !== id),
              })
            }
            onNew={() => setState({ showNewCompanionModal: true })}
            max={template.count}
          />
        </div>
      )}
    </>
  );
}

export function companionImportInteraction(
  template: CompanionTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): AnnotationInteraction<CompanionInteractionState> {
  const copies = (build: JumpDocBuildData) =>
    build.companionImports[template.id as any] ?? [];
  const getCost = (build: JumpDocBuildData) =>
    computePossibleCosts(
      { ...template, allowMultiple: !template.specificCharacter },
      build,
      doc,
    );

  const error = (build: JumpDocBuildData) => {
    const prereqErrors = (template.prerequisites ?? [])
      .map(p => getPrereqError(p, build, doc))
      .filter(e => e) as string[];
    let originError: string | undefined;
    if (
      template.originBenefit == "access" &&
      template.origins?.every?.(o =>
        build.origins.every(bo => bo.template?.id != o),
      )
    ) {
      originError = `Restricted to holders of ${template.origins
        ?.map(
          (o, i) =>
            `${i == (template.origins?.length ?? 0) - 1 && i > 0 ? "or " : ""}"${doc.origins.O[o].name}"`,
        )
        .join(", ")}.`;
    }
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError ?? ""}`;
  };

  const actions = (
    _: JumpDocBuildData,
  ): AnnotationAction<CompanionInteractionState>[] => [
    {
      name: "Remove",
      variant: "danger",
      condition: build => copies(build).length > 0,
      execute: (build, mutators) => {
        const existingId = copies(build)[0];
        const storeState = useChainStore.getState();
        const chain = storeState.chain;
        const jumpAccess = storeState.calculatedData.jumpAccess;
        const purchase = chain?.purchases.O[existingId];
        if (purchase?.type === PurchaseType.Companion) {
          const ci = purchase as CompanionImport;
          const linkedChars = ci.importData.characters.filter(
            cid =>
              chain?.characters.O[cid]?.originalImportTID?.templateId ===
              template.id,
          );
          if (linkedChars.length > 0) {
            const isActive = (cid: Id<GID.Character>) => {
              const access = jumpAccess?.[cid];
              if (access && [...access].some(jid => jid !== (jumpId as number)))
                return true;
              if ((chain?.jumps.O[jumpId]?.purchases[cid]?.length ?? 0) > 0)
                return true;
              if ((chain?.jumps.O[jumpId]?.drawbacks[cid]?.length ?? 0) > 0)
                return true;
              return false;
            };
            const activeChars = linkedChars
              .map(cid => ({
                id: cid,
                name: chain?.characters.O[cid]?.name ?? "",
              }))
              .filter(({ id }) => isActive(id));
            if (activeChars.length > 0) {
              const names = activeChars.map(c => c.name).join(", ");
              return [
                buildConfirmDeleteInteraction(
                  existingId,
                  linkedChars,
                  `This will also delete: ${names}. They have activity elsewhere. Are you sure?`,
                ),
              ];
            }
            mutators.removeCharacters(linkedChars);
          }
        }
        mutators.removePurchase(existingId, build);
        return [];
      },
    },
    {
      name: build => {
        const cost = getCost(build);
        return `Add (${formatCostDisplay(cost.default.cost, cost.default, doc.currencies)})`;
      },
      condition: build =>
        copies(build).length === 0 || !template.specificCharacter,
      blocker: (_, state) =>
        !state.follower &&
        !template.specificCharacter &&
        state.selectedIds.length === 0
          ? "You must select or create at least one character in order to add them as a companion."
          : undefined,
      execute: (_, mutators, state) => {
        if (state.follower) {
          const newId = mutators.addFollower({ template }, jumpId, charId, doc);
          if (newId !== undefined)
            mutators.navigate({ sub: "purchases", scrollTo: newId });
          return [];
        }
        if (template.specificCharacter) {
          const newCharId = mutators.createCompanion({
            template,
            name: state.charName,
            gender: state.charGender,
            species: state.charSpecies,
          });
          const newId = mutators.addCompanionImport(
            { template, companionIds: [newCharId] },
            jumpId,
            charId,
            doc,
          );
          if (newId !== undefined)
            mutators.navigate({ sub: "purchases", scrollTo: newId });
          return buildFreebieInteractions(
            template.id,
            template.freebies ?? [],
            doc,
            jumpId,
            [newCharId],
          );
        }
        const newId = mutators.addCompanionImport(
          { template, companionIds: state.selectedIds },
          jumpId,
          charId,
          doc,
        );
        if (newId !== undefined)
          mutators.navigate({ sub: "purchases", scrollTo: newId });
        return buildFreebieInteractions(
          template.id,
          template.freebies ?? [],
          doc,
          jumpId,
          state.selectedIds,
        );
      },
    },
  ];

  return {
    initialize: () => ({
      follower: false,
      selectedIds: [],
      charName: template.characterInfo?.[0]?.name ?? "",
      charSpecies: template.characterInfo?.[0]?.species ?? "",
      charGender: template.characterInfo?.[0]?.gender ?? "",
      showNewCompanionModal: false,
      tags: {},
    }),
    error,
    preview: props => (
      <CompanionPreviewInner
        template={template}
        adding={
          copies(props.buildData).length === 0 || !template.specificCharacter
        }
        state={props.state}
        setState={props.setState}
        selfCharId={charId}
      />
    ),
    typeName: "Companion Import",
    name: template.name,
    description: template.description || undefined,
    costStr: build =>
      formatCostDisplay(
        getCost(build).default.cost,
        getCost(build).default,
        doc.currencies,
      ),
    shortCostStr: build =>
      formatCostShort(
        getCost(build).default.cost,
        getCost(build).default,
        doc.currencies,
      ),
    info: build =>
      copies(build).length > 0
        ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: () => true,
  };
}

export function scenarioInteraction(
  template: ScenarioTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): AnnotationInteraction<ScenarioInteractionState> {
  const tags = extractTags([template.name, template.description]);
  const hasTags = tags.length > 0;
  const rewardGroups = template.rewardGroups ?? [];

  const copies = (build: JumpDocBuildData) =>
    build.scenarios[template.id as any] ?? [];

  const error = (build: JumpDocBuildData) => {
    let prereqErrors = (template.prerequisites ?? [])
      .map(p => getPrereqError(p, build, doc))
      .filter(err => err) as string[];
    let originError: string | undefined = undefined;
    if (
      template.originBenefit == "access" &&
      template.origins?.every?.(o =>
        build.origins.every(bo => bo.template?.id != o),
      )
    ) {
      originError = `Restricted to holders of ${template.origins
        ?.map(
          (o, i) =>
            `${i == (template.origins?.length ?? 0) - 1 && i > 0 ? "or " : ""}"${doc.origins.O[o].name}"`,
        )
        .join(", ")}.`;
    }
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError ?? ""}`;
  };

  const actions = (
    _: JumpDocBuildData,
  ): AnnotationAction<ScenarioInteractionState>[] => [
    {
      name: "Remove",
      variant: "danger",
      condition: build => copies(build).length > 0,
      execute: (build, mutators) => {
        mutators.removePurchase(copies(build)[0], build);
        mutators.navigate({ sub: "drawbacks" });
        return [];
      },
    },
    {
      name: "Add",
      condition: build => copies(build).length == 0 || template.allowMultiple,
      execute: (_, mutators, { tags: tagValues, selectedOutcome }) => {
        const newId = mutators.addScenarioFromTemplate(
          {
            template,
            tags: tagValues,
            rewardGroupIndex:
              rewardGroups.length > 0 ? selectedOutcome : undefined,
          },
          jumpId,
          charId,
          doc,
        );
        if (newId !== undefined)
          mutators.navigate({ sub: "drawbacks", scrollTo: newId });

        const group = rewardGroups[selectedOutcome];
        if (!group) return [];

        const freeOverride = {
          cost: {
            cost: [] as Value<TID.Currency>,
            modifier: CostModifier.Free,
          } as PossibleCost,
          type: "scenario" as const,
          source: template.id,
        };

        const purchaseRewards = group.rewards
          .filter(
            (
              r,
            ): r is Extract<
              typeof r,
              { type: RewardType.Item | RewardType.Perk }
            > => r.type === RewardType.Item || r.type === RewardType.Perk,
          )
          .flatMap(r => {
            const tmpl = doc.availablePurchases.O[r.id];
            return [
              purchaseInteraction(
                "purchase",
                tmpl,
                doc,
                jumpId,
                charId,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ];
          });

        const companionRewards = group.rewards
          .filter(
            (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
              r.type === RewardType.Companion,
          )
          .flatMap(r => {
            const tmpl = doc.availableCompanions.O[r.id];
            if (!tmpl) return [];
            return [
              companionImportInteraction(
                tmpl,
                doc,
                jumpId,
                charId,
              ) as AnnotationInteraction<object>,
            ];
          });

        return [...purchaseRewards, ...companionRewards];
      },
    },
  ];

  return {
    initialize: () => ({ tags: {}, selectedOutcome: 0 }),
    error,
    preview: props => {
      const adding = copies(props.buildData).length === 0;
      if (!hasTags && (!adding || rewardGroups.length === 0)) return undefined;
      return (
        <>
          {hasTags && (
            <TagFieldsSection
              tags={tags}
              tagValues={props.state.tags}
              choiceContext={template.choiceContext}
              onChangeTag={(name, value) =>
                props.setState({ tags: { ...props.state.tags, [name]: value } })
              }
            />
          )}
          {adding && rewardGroups.length > 0 && (
            <ScenarioOutcomeSelector
              groups={rewardGroups}
              selectedIndex={props.state.selectedOutcome}
              onSelect={i => props.setState({ selectedOutcome: i })}
              doc={doc}
            />
          )}
        </>
      );
    },
    typeName: "Scenario",
    name: (_, { tags: tagValues }) =>
      hasTags ? applyTags(template.name, tagValues) : template.name,
    description: (_, { tags: tagValues }) =>
      hasTags
        ? applyTags(template.description, tagValues)
        : template.description,
    info: build =>
      copies(build).length > 0
        ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: build =>
      hasTags || (copies(build).length === 0 && rewardGroups.length > 1),
  };
}

function convertCurrencyId(
  id: Id<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
): Id<LID.Currency> {
  for (let currIdStr in currencies.O) {
    if (currencies.O[+currIdStr as any].name == doc.currencies.O[id].name)
      return +currIdStr as Id<LID.Currency>;
  }
  return DEFAULT_CURRENCY_ID;
}

function convertValue(
  v: Value<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
): Value<LID.Currency> {
  return v.map(({ amount, currency }) => ({
    amount,
    currency: convertCurrencyId(currency, doc, currencies),
  }));
}

function convertSubtypeId(
  id: Id<TID.PurchaseSubtype>,
  doc: JumpDoc,
  subtypes: Registry<LID.PurchaseSubtype, { name: string }>,
): Id<LID.PurchaseSubtype> | undefined {
  const name = doc.purchaseSubtypes.O[id]?.name;
  if (!name) return undefined;
  for (const lidStr in subtypes.O) {
    if (subtypes.O[+lidStr as Id<LID.PurchaseSubtype>]?.name === name)
      return +lidStr as Id<LID.PurchaseSubtype>;
  }
  return undefined;
}

function convertModifiedCost(
  v: ModifiedCost<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
): ModifiedCost {
  switch (v.modifier) {
    case CostModifier.Full:
    case CostModifier.Reduced:
    case CostModifier.Free:
      return v;
    case CostModifier.Custom:
      return {
        modifier: CostModifier.Custom,
        modifiedTo: convertValue(
          v.modifiedTo as Value<TID.Currency>,
          doc,
          currencies,
        ),
      };
  }
}

export function useChainMutators(): Omit<ChainMutators, "navigate"> {
  const createCompanion = useCreateCompanion();
  const removeCharacterFn = useRemoveCharacter();

  return {
    addPurchaseFromTemplate: useCallback(
      (
        { template, type, tags, cost, reward, freebie, customDuration },
        jumpId,
        charId,
        doc,
      ) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add purchase", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          c.budgetFlag += 1;
          if (type == "purchase") {
            let subtype = +Object.keys(jump.purchaseSubtypes.O).filter(
              id =>
                jump.purchaseSubtypes.O[+id as any].templateId ==
                (template as BasicPurchaseTemplate).subtype,
            )[0] as Id<LID.PurchaseSubtype>;
            if (subtype === undefined) return;
            newId = registryAdd(c.purchases, {
              charId,
              jumpId,
              name: applyTags(template.name, tags),
              description: applyTags(template.description, tags),
              type: jump.purchaseSubtypes.O[subtype].type,
              cost: convertModifiedCost(cost, doc, jump.currencies),
              reward,
              ...(freebie !== undefined ? { freebie } : {}),
              value: convertValue(template.cost, doc, jump.currencies),
              categories: [],
              tags: [],
              subtype,
              template: {
                id: template.id as any,
                jumpdoc: "",
                originalCost: cost,
              },
            });
            if (!jump.purchases[charId]) jump.purchases[charId] = [];
            jump.purchases[charId]!.push(newId);
          } else {
            newId = registryAdd(c.purchases, {
              charId,
              jumpId,
              duration: 1,
              overrides: {},
              name: applyTags(template.name, tags),
              description: applyTags(template.description, tags),
              type: PurchaseType.Drawback,
              cost: convertModifiedCost(cost, doc, jump.currencies),
              value: convertValue(template.cost, doc, jump.currencies),
              template: {
                id: template.id as any,
                jumpdoc: "",
                originalCost: cost,
              },
              ...(freebie !== undefined ? { freebie } : {}),
              ...(customDuration !== undefined ? { customDuration } : {}),
            });
            if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
            jump.drawbacks[charId]!.push(newId);
          }
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    addOriginFromTemplate: useCallback(
      ({ template, tags, cost, freebie }, jumpId, charId, doc) => {
        setTracked("Add origin", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;

          // Find the LID.OriginCategory that links to this template's TID category.
          let categoryLid: Id<LID.OriginCategory> | undefined;
          for (const lidStr in jump.originCategories.O) {
            const cat =
              jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
            if (cat?.template?.id === template.type) {
              categoryLid = +lidStr as Id<LID.OriginCategory>;
              break;
            }
          }
          if (categoryLid === undefined) return;

          const chainCat = jump.originCategories.O[categoryLid];
          const docCat = doc.originCategories.O[template.type];
          const effectiveMax = chainCat?.multiple ? (docCat?.max ?? 1) : 1;

          const origins = jump.origins[charId] as
            | Record<Id<LID.OriginCategory>, import("../data/Jump").Origin[]>
            | undefined;
          const list = origins?.[categoryLid] ?? [];

          // Evict the first entry if already at capacity.
          if (list.length >= effectiveMax && list.length > 0) {
            list.splice(0, 1);
          }

          const convertedCost = {
            amount: cost.amount,
            currency: convertCurrencyId(cost.currency, doc, jump.currencies),
          };

          const newOrigin: import("../data/Jump").Origin = {
            summary: applyTags(template.name, tags),
            ...(template.description
              ? { description: applyTags(template.description, tags) }
              : {}),
            value: convertedCost,
            template: {
              jumpdoc: "",
              id: template.id,
              originalCost: { cost: [cost], modifier: CostModifier.Full },
            },
            ...(freebie !== undefined ? { freebie } : {}),
          };

          if (!jump.origins[charId]) (jump.origins as any)[charId] = {};
          const categoryOrigins = jump.origins[charId] as any;
          if (!categoryOrigins[categoryLid]) categoryOrigins[categoryLid] = [];
          categoryOrigins[categoryLid].push(newOrigin);

          c.budgetFlag += 1;
        });
        return template.id;
      },
      [],
    ),
    addScenarioFromTemplate: useCallback(
      ({ template, tags, rewardGroupIndex }, jumpId, charId, doc) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add scenario", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const initValue: Value = Object.keys(jump.currencies.O).map(cid => ({
            currency: createId<LID.Currency>(+cid),
            amount: 0,
          }));
          const rewardTemplates =
            rewardGroupIndex != null
              ? (template.rewardGroups?.[rewardGroupIndex]?.rewards ?? [])
              : [];
          const rewards: ScenarioReward[] = [];
          for (const r of rewardTemplates) {
            if (r.type === RewardType.Currency) {
              rewards.push({
                type: r.type,
                value: r.value,
                currency: convertCurrencyId(r.currency, doc, jump.currencies),
              });
            } else if (r.type === RewardType.Stipend) {
              const subtype = convertSubtypeId(
                r.subtype,
                doc,
                jump.purchaseSubtypes,
              );
              if (subtype == null) continue;
              rewards.push({
                type: r.type,
                value: r.value,
                currency: convertCurrencyId(r.currency, doc, jump.currencies),
                subtype,
              });
            } else if (
              r.type === RewardType.Item ||
              r.type === RewardType.Perk
            ) {
              rewards.push({ type: r.type, id: r.id });
            } else if (r.type === RewardType.Companion) {
              rewards.push({
                type: r.type,
                id: r.id,
                name: doc.availableCompanions.O[r.id]?.name ?? "",
              });
            }
          }
          newId = c.purchases.fId;
          const scenario: Scenario = {
            id: newId,
            charId,
            jumpId,
            name: applyTags(template.name, tags),
            description: applyTags(template.description, tags),
            type: PurchaseType.Scenario,
            cost: { modifier: CostModifier.Full },
            value: initValue,
            rewards,
            template: { id: template.id as any, jumpdoc: "" },
          };
          c.purchases.O[newId] = scenario as never;
          c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
          if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
          jump.scenarios[charId]!.push(newId);
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    repricePurchase: useCallback((id, cost, doc) => {
      setTracked("Reprice purchase", c => {
        const p = c.purchases.O[id] as JumpPurchase | undefined;
        if (!p) return;
        const jump = c.jumps.O[p.jumpId];
        if (!jump) return;
        p.cost = convertModifiedCost(cost, doc, jump.currencies) as any;
        if (p.template) (p.template as any).originalCost = cost;
        c.budgetFlag += 1;
      });
    }, []),
    repriceOrigin: useCallback((templateId, jumpId, charId, build, doc) => {
      const template = doc.origins.O[templateId];
      if (!template) return;
      const hasSynergy = template.synergies?.some(sid =>
        build.origins.some(o => o.template?.id === sid),
      );
      let newTidCost: SimpleValue<TID.Currency> = template.cost;
      if (hasSynergy) {
        switch (template.synergyBenefit) {
          case "free":
            newTidCost = { amount: 0, currency: template.cost.currency };
            break;
          case "discounted": {
            const threshold =
              doc.currencies.O[template.cost.currency]?.discountFreeThreshold;
            newTidCost =
              threshold != null && template.cost.amount <= threshold
                ? { amount: 0, currency: template.cost.currency }
                : {
                    amount: Math.floor(template.cost.amount / 2),
                    currency: template.cost.currency,
                  };
            break;
          }
        }
      }
      setTracked("Reprice origin", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const charOrigins = jump.origins[charId] as
          | Record<Id<LID.OriginCategory>, import("../data/Jump").Origin[]>
          | undefined;
        if (!charOrigins) return;
        for (const lidStr in charOrigins) {
          const lid = createId<LID.OriginCategory>(+lidStr);
          const list = charOrigins[lid];
          if (!list) continue;
          const origin = list.find(o => o.template?.id === templateId);
          if (origin) {
            origin.value = {
              amount: newTidCost.amount,
              currency: convertCurrencyId(
                newTidCost.currency,
                doc,
                jump.currencies,
              ),
            };
            if (origin.template)
              (origin.template as any).originalCost = {
                cost: [newTidCost],
                modifier: CostModifier.Full,
              };
            c.budgetFlag += 1;
            break;
          }
        }
      });
    }, []),
    removePurchase: useCallback(
      (id: Id<GID.Purchase>, build: JumpDocBuildData) => {
        const isDrawback = Object.values(build.drawbacks).some(arr =>
          arr?.includes(id),
        );
        const isScenario = Object.values(build.scenarios).some(arr =>
          arr?.includes(id),
        );
        setTracked(
          isDrawback
            ? "Remove drawback"
            : isScenario
              ? "Remove scenario"
              : "Remove purchase",
          c => {
            const p = c.purchases.O[id] as JumpPurchase | undefined;
            if (!p) return;
            const pJumpId = p.jumpId;
            const pCharId = p.charId;
            const jump = c.jumps.O[pJumpId];
            if (!jump) return;
            delete c.purchases.O[id];
            if (isScenario) {
              const list = jump.scenarios[pCharId];
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            } else if (isDrawback) {
              const list = jump.drawbacks[pCharId];
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            } else {
              const bp = p as BasicPurchase;
              if (bp.subpurchases?.list)
                for (const sub of bp.subpurchases.list)
                  delete c.purchases.O[sub];
              if (bp.purchaseGroup != null) {
                const g = c.purchaseGroups[pCharId]?.O[bp.purchaseGroup];
                if (g) {
                  const gi = g.components.indexOf(id);
                  if (gi !== -1) g.components.splice(gi, 1);
                }
              }
              const list = jump.purchases[pCharId] as
                | Id<GID.Purchase>[]
                | undefined;
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            }
            c.budgetFlag += 1;
          },
        );
      },
      [],
    ),
    addCompanionImport: useCallback(
      ({ template, companionIds }, jumpId, charId, doc) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add companion import", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const allowances: Record<Id<LID.Currency>, number> = {} as any;
          for (const tidStr in template.allowances) {
            const tid = createId<TID.Currency>(+tidStr);
            const lid = convertCurrencyId(tid, doc, jump.currencies);
            allowances[lid] = (template.allowances as any)[tid] as number;
          }
          const stipend: Record<
            Id<LID.Currency>,
            Record<Id<LID.PurchaseSubtype>, number>
          > = {} as any;
          for (const tidCurrStr in template.stipend) {
            const tidCurr = createId<TID.Currency>(+tidCurrStr);
            const lidCurr = convertCurrencyId(tidCurr, doc, jump.currencies);
            const inner = (template.stipend as any)[tidCurr];
            const convertedInner: Record<
              Id<LID.PurchaseSubtype>,
              number
            > = {} as any;
            for (const tidSubStr in inner) {
              const tidSub = createId<TID.PurchaseSubtype>(+tidSubStr);
              const lidSub = convertSubtypeId(
                tidSub,
                doc,
                jump.purchaseSubtypes,
              );
              if (lidSub == null) continue;
              convertedInner[lidSub] = inner[tidSub];
            }
            stipend[lidCurr] = convertedInner;
          }
          newId = c.purchases.fId;
          const purchase: CompanionImport = {
            id: newId,
            charId,
            jumpId,
            name: template.name,
            description: template.description,
            type: PurchaseType.Companion,
            cost: { modifier: CostModifier.Full },
            value: convertValue(template.cost, doc, jump.currencies),
            template: { id: template.id, jumpdoc: "" },
            importData: {
              characters: companionIds,
              allowances: allowances as any,
              stipend: stipend as any,
            },
          };
          c.purchases.O[newId] = purchase as never;
          c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
          if (!jump.purchases[charId]) jump.purchases[charId] = [];
          jump.purchases[charId]!.push(newId);
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    createCompanion: useCallback(
      ({ template, name, gender, species }) => {
        return createCompanion({
          name: name,
          gender: gender,
          age: 0,
          backgroundSummary: template.name,
          backgroundDescription: template.description,
          personality: "",
          species: species,
        });
      },
      [createCompanion],
    ),
    addFollower: useCallback(({ template }, jumpId, charId, doc) => {
      let newId: Id<GID.Purchase> | undefined;
      setTracked("Add follower", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const subtypeEntry = Object.entries(jump.purchaseSubtypes.O).find(
          ([, st]) => st?.type === PurchaseType.Item,
        );
        if (!subtypeEntry) return;
        const subtype = createId<LID.PurchaseSubtype>(+subtypeEntry[0]);
        newId = c.purchases.fId;
        const purchase: BasicPurchase = {
          id: newId,
          charId,
          jumpId,
          name: template.name,
          description: template.description,
          type: PurchaseType.Item,
          cost: { modifier: CostModifier.Full },
          value: convertValue(template.cost, doc, jump.currencies),
          template: { id: template.id as any, jumpdoc: "" },
          subtype,
          categories: [],
          tags: [],
          follower: true,
        };
        c.purchases.O[newId] = purchase as never;
        c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
        if (!jump.purchases[charId]) jump.purchases[charId] = [];
        jump.purchases[charId]!.push(newId);
        c.budgetFlag += 1;
      });
    }, []),
    removeCharacters: useCallback(
      ids => {
        for (const id of ids) removeCharacterFn(id);
      },
      [removeCharacterFn],
    ),
    removeOrigin: useCallback((templateId, jumpId, charId) => {
      setTracked("Remove origin", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const charOrigins = jump.origins[charId] as
          | Record<Id<LID.OriginCategory>, import("../data/Jump").Origin[]>
          | undefined;
        if (!charOrigins) return;
        for (const lidStr in charOrigins) {
          const lid = createId<LID.OriginCategory>(+lidStr);
          const list = charOrigins[lid];
          if (!list) continue;
          const idx = list.findIndex(o => o.template?.id === templateId);
          if (idx !== -1) {
            list.splice(idx, 1);
            c.budgetFlag += 1;
            break;
          }
        }
      });
    }, []),
    addCurrencyExchangeFromDoc: useCallback(
      (
        { templateIndex, oCurrency, tCurrency, oamount, tamount },
        jumpId,
        charId,
        doc,
      ) => {
        setTracked("Add currency exchange", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const oLid = convertCurrencyId(oCurrency, doc, jump.currencies);
          const tLid = convertCurrencyId(tCurrency, doc, jump.currencies);
          const existing = jump.currencyExchanges[charId]?.find(
            ex => ex.templateIndex === templateIndex,
          );
          if (existing) {
            existing.oamount += oamount;
            existing.tamount += tamount;
          } else {
            if (!jump.currencyExchanges[charId])
              jump.currencyExchanges[charId] = [];
            jump.currencyExchanges[charId]!.push({
              oCurrency: oLid,
              tCurrency: tLid,
              oamount,
              tamount,
              templateIndex,
            });
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
    removeCurrencyExchangeFromDoc: useCallback(
      ({ templateIndex, oamount, tamount }, jumpId, charId) => {
        setTracked("Remove currency exchange", c => {
          const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
          if (!list) return;
          const idx = list.findIndex(e => e.templateIndex === templateIndex);
          if (idx !== -1) {
            list[idx].oamount -= oamount;
            list[idx].tamount -= tamount;
            if (list[idx].oamount <= 0) list.splice(idx, 1);
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
    setFreeFormOrigin: useCallback(
      ({ categoryId, value, cost }, jumpId, charId, doc) => {
        setTracked("Set origin", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          let categoryLid: Id<LID.OriginCategory> | undefined;
          for (const lidStr in jump.originCategories.O) {
            const cat =
              jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
            if (cat?.template?.id === categoryId) {
              categoryLid = +lidStr as Id<LID.OriginCategory>;
              break;
            }
          }
          if (categoryLid === undefined) return;
          const convertedCost = {
            amount: cost.amount,
            currency: convertCurrencyId(cost.currency, doc, jump.currencies),
          };
          if (!jump.origins[charId]) jump.origins[charId] = {};
          const charOrigins = jump.origins[charId];
          if (!charOrigins[categoryLid]) charOrigins[categoryLid] = [];
          const list = charOrigins[categoryLid]!;
          const existing = list.find(o => !o.template);
          if (existing) {
            existing.summary = value;
            existing.value = convertedCost;
          } else {
            list.push({ summary: value, value: convertedCost });
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
  };
}

export function AnnotationInteractionHandler({
  jumpId,
  charId,
  doc,
}: AnnotationInteractionHandlerProps) {
  const addListener = useViewerActionStore(s => s.addListener);
  const removeListener = useViewerActionStore(s => s.removeListener);
  const listeners = useViewerActionStore(s => s.listeners);
  const interactionQueue = useViewerActionStore(s => s.interactionQueue);
  const enqueueInteractions = useViewerActionStore(s => s.enqueueInteractions);
  const removeInteractions = useViewerActionStore(s => s.removeInteractions);

  const { startUpdate, finalizeUpdate } = useUpdateStack();
  const currentAction = useRef<undefined | string>(undefined);

  const allListeners = useMemo(
    () => [
      createPrereqRemovalListener(),
      createRepricePurchasesListener(),
      createBoosterTextListener(),
      createScenarioRewardListener(),
      createOriginSynergyListener(jumpId, charId),
      createOriginStipendListener(jumpId, charId),
      createDurationListener(jumpId, doc),
    ],
    [jumpId, charId, doc],
  );

  const [currentInteractions, setCurrentInteractions] = useState<
    AnnotationInteraction<object>[]
  >([]);

  const chain = useChain();
  const buildData = useViewerActionStore(s => s.buildData);
  const storeBuildData = useViewerActionStore(s => s.setBuildData);

  const rawNavigate = useNavigate();
  const { chainId } = useParams({ strict: false });
  const suppressNavigateRef = useRef(false);

  const navigate = useCallback<ChainMutators["navigate"]>(
    target => {
      if (suppressNavigateRef.current || !chainId) return;
      suppressNavigateRef.current = true;
      const p = {
        chainId,
        charId: String(charId as number),
        jumpId: String(jumpId as number),
      };
      const scrollSearch =
        target.sub !== "" && target.scrollTo !== undefined
          ? { scrollTo: String(target.scrollTo as number) }
          : {};
      if (target.sub === "") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/" as any,
          params: p as any,
          search: target.extraSearch ?? ({} as any),
        });
      } else if (target.sub === "purchases") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/purchases",
          params: p,
          search: scrollSearch as any,
        });
      } else if (target.sub === "companions") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/companions",
          params: p,
          search: scrollSearch as any,
        });
      } else {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks",
          params: p,
          search: {
            ...scrollSearch,
            ...(target.sub === "drawbacks" ? (target.extraSearch ?? {}) : {}),
          } as any,
        });
      }
    },
    [chainId, charId, jumpId, rawNavigate],
  );

  const baseChainMutators = useChainMutators();
  const mutators: ChainMutators = useMemo(
    () => ({ ...baseChainMutators, navigate }),
    [baseChainMutators, navigate],
  );

  useEffect(() => {
    allListeners.forEach(l => addListener(l));
    return () => allListeners.forEach(l => removeListener(l));
  }, [allListeners]);

  useEffect(() => {
    if (interactionQueue.length === 0) {
      suppressNavigateRef.current = false;
      finalizeUpdate(currentAction.current ?? "");
      currentAction.current = undefined;
    }
  }, [interactionQueue.length]);

  const budgetFlag = useChainStore(c => c.chain?.budgetFlag ?? 0);

  useEffect(() => {
    if (!chain) return;
    let newBuildData = computeBuildData(chain, jumpId, charId, doc);
    storeBuildData(newBuildData);
    listeners.forEach(l => {
      if (l.condition(newBuildData))
        l.action(newBuildData, chain, doc, mutators);
    });
  }, [!!chain, budgetFlag]);

  useEffect(() => {
    if (!chain || !doc) return;
    setTracked("Backfill originalCost", c => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      for (const gid of [
        ...(jump.purchases[charId] ?? []),
        ...(jump.drawbacks[charId] ?? []),
      ]) {
        const p = c.purchases.O[gid] as JumpPurchase | undefined;
        if (!p?.template?.id) continue;
        if (p?.template?.originalCost) continue;
        const isDrawback = p.type === PurchaseType.Drawback;
        const tid = p.template.id;
        const template = isDrawback
          ? doc.availableDrawbacks.O[tid as Id<TID.Drawback>]
          : doc.availablePurchases.O[tid as Id<TID.Purchase>];
        if (!template) continue;
        const floatingDiscountOption = !!(p as BasicPurchase)
          .usesFloatingDiscount;
        p.template.originalCost = {
          cost: p.value as any as Value<TID.Currency>,
          ...(!floatingDiscountOption
            ? (p.cost as ModifiedCost<TID.Currency>)
            : { modifier: CostModifier.Full }),
          floatingDiscountOption: floatingDiscountOption || undefined,
        };
      }
    });
  }, []);

  useEffect(() => {
    if (!chain || !buildData || currentInteractions.length) return;

    let j = 0;
    for (; j < interactionQueue.length; j++) {
      let { interactions, character } = interactionQueue[j] ?? {
        interactions: [],
      };
      let currentBuildData =
        character === undefined || character == charId
          ? buildData
          : computeBuildData(chain, jumpId, character, doc);
      let errors = Object.fromEntries(
        interactions.map((i, index) => [index, i.error(currentBuildData)]),
      );
      let isError = false;
      if (interactions.length > 1)
        interactions = interactions.filter((_, index) => !errors[index]);
      else isError = !!errors[0];

      let showPreview = false;
      if (interactions.length > 1) showPreview = true;
      else if (interactions[0].forcePreview(buildData) || isError)
        showPreview = true;
      else {
        let actions = (
          typeof interactions[0].actions == "function"
            ? interactions[0].actions(currentBuildData)
            : interactions[0].actions
        ).filter(a => a.condition(currentBuildData));
        if (actions.length == 0) continue;
        else if (actions.length == 1) {
          if (!currentAction.current) {
            currentAction.current =
              typeof actions[0].name == "function"
                ? actions[0].name(
                    currentBuildData,
                    interactions[0].initialize(currentBuildData),
                  )
                : actions[0].name;
            startUpdate(currentAction.current);
          }
          actions[0]
            .execute(
              currentBuildData,
              mutators,
              interactions[0].initialize(currentBuildData),
            )
            .forEach(a =>
              "interaction" in a
                ? enqueueInteractions(a.interaction, a.character)
                : enqueueInteractions([a]),
            );
        } else if (actions.length > 1) showPreview = true;
      }

      if (showPreview) {
        setCurrentInteractions(interactions);
      }
    }

    removeInteractions(j);
  }, [interactionQueue.length, currentInteractions.length]);

  useEffect(() => {
    if (!currentInteractions.length || !buildData) return;
    if (!currentAction.current) {
      currentAction.current = "JumpDoc interaction";
      startUpdate(currentAction.current);
    }

    MySwal.close();
    MySwal.fire({
      html: (
        <InteractionDialog
          interactions={currentInteractions}
          build={buildData}
          mutators={mutators}
          onClose={() => MySwal.close()}
        />
      ),
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      allowEscapeKey: true,
      padding: 0,
      background: "transparent",
      backdrop: true,
      didClose: () => setCurrentInteractions([]),
      customClass: {
        popup:
          "!bg-transparent !shadow-none !border-0 !p-0 !overflow-visible !w-auto !max-w-none",
        htmlContainer: "!m-0 !p-0 !overflow-visible",
        container: "!p-4",
      },
    });
  }, [currentInteractions, !!buildData]);

  return null;
}
