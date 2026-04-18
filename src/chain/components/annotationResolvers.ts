/**
 * Pure utility functions shared by AnnotationInteractionHandler.
 * No React, no JSX, no hooks — only data transformation and domain logic.
 */

import { createId, registryAdd } from "@/chain/data/types";
import type { GID, LID, TID, Id, Registry, PartialLookup } from "@/chain/data/types";
import type { Currency, Origin, OriginCategory, PurchaseSubtype } from "@/chain/data/Jump";
import type { Chain } from "@/chain/data/Chain";
import { PurchaseType, CostModifier, RewardType } from "@/chain/data/Purchase";
import type {
  Drawback,
  ModifiedCost,
  Value,
  StoredAlternativeCost,
  StoredAltCostPrerequisite,
  StoredPurchasePrerequisite,
} from "@/chain/data/Purchase";
import type {
  ResolvedAltCost,
  ResolvedAltCostPrereq,
  ResolvedPrerequisite,
  QueuedAnnotationBatch,
  ViewerAnnotationAction,
} from "@/chain/state/ViewerActionStore.old";
import type {
  JumpDoc,
  OriginTemplate,
  BasicPurchaseTemplate,
  DrawbackTemplate,
  CompanionTemplate,
  ScenarioRewardTemplate,
} from "@/chain/data/JumpDoc";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** A user-fillable placeholder extracted from a template string. */
export type TagField = { name: string; multiline: boolean };

export type RouteParams = { chainId: string; charId: string; jumpId: string };

type ResolvedStipendEntry = { currencyAbbrev: string; subtypeName: string; amount: number };

type TemplatePlaceholder =
  | { kind: "range"; lo: number; hi: number }
  | { kind: "choice"; options: string[] };

/** Callback shape of useJumpOrigins().setOrigins — inlined to avoid importing hooks. */
type SetOriginsCallback = (
  updater: (draft: NonNullable<PartialLookup<LID.OriginCategory, Origin[]>>) => void,
  extraMutation?: (c: Chain) => void,
) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Domain resolvers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds an LID.OriginCategory in the jump that matches the JumpDoc category by name.
 * Returns undefined if no match — the category has been deleted or renamed in the jump.
 */
export function resolveJumpOriginCategory(
  categoryName: string,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
): Id<LID.OriginCategory> | undefined {
  for (const [idStr, cat] of Object.entries(originCategories?.O ?? {})) {
    if (cat?.name === categoryName) return createId<LID.OriginCategory>(+idStr);
  }
  return undefined;
}

/** Matches a JumpDoc currency (by abbrev) to a jump LID.Currency. Falls back to key 0. */
export function resolveJumpCurrency(
  abbrev: string,
  currencies: Registry<LID.Currency, Currency> | undefined,
): Id<LID.Currency> {
  for (const [idStr, c] of Object.entries(currencies?.O ?? {})) {
    if (c?.abbrev === abbrev) return createId<LID.Currency>(+idStr);
  }
  return createId<LID.Currency>(0);
}

/**
 * Resolves a PurchaseSubtype by name, returning its LID and type.
 * Returns undefined if the subtype no longer exists in the jump.
 */
export function resolveJumpPurchaseSubtype(
  subtypeName: string,
  subtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
): { lid: Id<LID.PurchaseSubtype>; type: PurchaseType.Perk | PurchaseType.Item } | undefined {
  for (const [idStr, sub] of Object.entries(subtypes?.O ?? {})) {
    if (sub?.name === subtypeName) {
      return { lid: createId<LID.PurchaseSubtype>(+idStr), type: sub.type };
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase tag utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds all unique `$${TAG}` (autosize textarea) and `${TAG}` (single-line input) placeholders.
 * `$${…}` is scanned first so it is never partially matched by the `${…}` pass.
 */
export function extractTags(texts: string[]): TagField[] {
  const seen = new Set<string>();
  const fields: TagField[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(/\$\$\{([^}]+)\}/g)) {
      const name = match[1]!;
      if (!seen.has(name)) {
        seen.add(name);
        fields.push({ name, multiline: true });
      }
    }
    // Replace `$${…}` occurrences before scanning single-dollar so we don't double-count.
    const singleOnly = text.replace(/\$\$\{[^}]+\}/g, "");
    for (const match of singleOnly.matchAll(/\$\{([^}]+)\}/g)) {
      const name = match[1]!;
      if (!seen.has(name)) {
        seen.add(name);
        fields.push({ name, multiline: false });
      }
    }
  }
  return fields;
}

/** Substitutes tag values into a template string. */
export function applyTags(text: string, values: Record<string, string>): string {
  // Replace `$${…}` first so single-dollar pass doesn't match inside them.
  let result = text.replace(/\$\$\{([^}]+)\}/g, (_, name: string) => values[name] || `[${name}]`);
  result = result.replace(/\$\{([^}]+)\}/g, (_, name: string) => values[name] || `[${name}]`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Computes eviction state for adding an origin to a category. */
export function resolveEviction(
  currentList: Origin[],
  alreadyPresent: boolean,
  chainCategory: OriginCategory | undefined,
  docCategoryMax: number | undefined,
): { evictedIdx: number; evictedName: string | null } {
  const effectiveMax = chainCategory ? (chainCategory.multiple ? docCategoryMax : 1) : undefined;
  const evictedIdx =
    !alreadyPresent &&
    chainCategory &&
    effectiveMax !== undefined &&
    currentList.length >= effectiveMax
      ? 0
      : -1;
  return {
    evictedIdx,
    evictedName: evictedIdx !== -1 ? (currentList[evictedIdx]?.summary ?? null) : null,
  };
}

/** Resolves `${n-m}` and `${A|B|C}` placeholders in a template origin name. */
export function resolveOriginTemplate(name: string): string {
  return name.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(expr);
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1]!, 10);
      const hi = parseInt(rangeMatch[2]!, 10);
      return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
    }
    const choices = expr.split("|");
    return choices[Math.floor(Math.random() * choices.length)]!;
  });
}

/** Returns a Chain mutation that creates stipend drawbacks for a newly-added origin. */
export function createOriginStipendDrawbacks(
  originName: string,
  resolvedStipend: ResolvedStipendEntry[],
  currencies: Registry<LID.Currency, Currency> | undefined,
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): (c: Chain) => void {
  return (c) => {
    if (!resolvedStipend.length) return;
    const jump = c.jumps.O[jumpId];
    if (!jump) return;

    // Group amounts by subtypeName → { currencyAbbrev → total }
    const bySubtype = new Map<string, Map<string, number>>();
    for (const { currencyAbbrev, subtypeName, amount } of resolvedStipend) {
      if (amount <= 0) continue;
      if (!bySubtype.has(subtypeName)) bySubtype.set(subtypeName, new Map());
      bySubtype
        .get(subtypeName)!
        .set(currencyAbbrev, (bySubtype.get(subtypeName)!.get(currencyAbbrev) ?? 0) + amount);
    }

    for (const [subtypeName, amountsMap] of bySubtype) {
      const value: Value = [];
      for (const [abbrev, total] of amountsMap) {
        if (total > 0)
          value.push({ currency: resolveJumpCurrency(abbrev, currencies), amount: total });
      }
      if (value.length === 0) continue;

      let subtypeLid: Id<LID.PurchaseSubtype> | null = null;
      for (const [idStr, sub] of Object.entries(purchaseSubtypes?.O ?? {})) {
        if (sub?.name === subtypeName) {
          subtypeLid = createId<LID.PurchaseSubtype>(+idStr);
          break;
        }
      }

      let newId = registryAdd(c.purchases, {
        charId,
        jumpId,
        name: `${originName} Stipend: ${subtypeName}`,
        description: `Stipend from the ${originName} origin for ${subtypeName} purchases.`,
        type: PurchaseType.Drawback,
        cost: { modifier: CostModifier.Full },
        value,
        duration: 1,
        subtype: subtypeLid,
        overrides: {},
      } as Drawback);
      if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
      jump.drawbacks[charId]!.unshift(newId);
      c.budgetFlag += 1;
    }
  };
}

/** Returns a Chain mutation that removes all stipend drawbacks for a given origin name. */
export function removeOriginStipendDrawbacks(
  originName: string,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): (c: Chain) => void {
  return (c) => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const list = jump.drawbacks[charId];
    if (!list) return;
    const prefix = `${originName} Stipend:`;
    const toRemove = new Set<Id<GID.Purchase>>(
      list.filter((id) => c.purchases.O[id]?.name?.startsWith(prefix)),
    );
    if (toRemove.size === 0) return;
    for (const id of toRemove) delete c.purchases.O[id];
    jump.drawbacks[charId] = list.filter((id) => !toRemove.has(id));
    c.budgetFlag += 1;
  };
}

/** Commits an add-origin mutation to the store. */
export function commitAddOrigin(
  categoryLid: Id<LID.OriginCategory>,
  evictedIdx: number,
  template: {
    name: string;
    /** Raw template name when it differs from name (i.e. placeholders were resolved). */
    templateName?: string;
    description?: string;
    synergyOrigins?: { categoryName: string; originName: string }[];
    synergyBenefit?: "discounted" | "free" | "access";
  },
  costAmount: number,
  currencyAbbrev: string,
  currencies: Registry<LID.Currency, Currency> | undefined,
  setOrigins: SetOriginsCallback,
  extraMutation?: (c: Chain) => void,
) {
  setOrigins((d) => {
    const rec = d as Record<number, Origin[]>;
    if (!rec[categoryLid]) rec[categoryLid] = [];
    if (evictedIdx !== -1) rec[categoryLid]!.splice(evictedIdx, 1);
    const resolvedCurrency = resolveJumpCurrency(currencyAbbrev, currencies);
    const newOrigin: Origin = {
      summary: template.name,
      ...(template.templateName ? { templateName: template.templateName } : {}),
      description: template.description,
      value: { amount: costAmount, currency: resolvedCurrency },
      ...(template.synergyOrigins?.length
        ? {
            baseCost: { amount: costAmount, currency: resolvedCurrency },
            synergyOrigins: template.synergyOrigins,
            synergyBenefit: template.synergyBenefit,
          }
        : {}),
    };
    rec[categoryLid]!.push(newOrigin);
  }, extraMutation);
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternative cost helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Converts a ResolvedAltCost[] (currency abbrevs) to StoredAlternativeCost[] (LID currencies). */
export function resolveAltCostsToStorage(
  altCosts: ResolvedAltCost[],
  docId: string,
  currencies: Registry<LID.Currency, Currency> | undefined,
): StoredAlternativeCost[] {
  return altCosts.map((ac) => ({
    value: ac.value.map(({ amount, currencyAbbrev }) => ({
      amount,
      currency: resolveJumpCurrency(currencyAbbrev, currencies),
    })),
    prerequisites: ac.prerequisites.map((prereq): StoredAltCostPrerequisite => {
      if (prereq.type === "origin") return prereq;
      if (prereq.type === "drawback")
        return { type: "drawback", docId, templateId: prereq.templateId };
      return { type: "purchase", docId, templateId: prereq.templateId };
    }),
    mandatory: ac.mandatory,
    ...(ac.beforeDiscounts ? { beforeDiscounts: true as const } : {}),
  }));
}

/** Converts a ResolvedPrerequisite[] to StoredPurchasePrerequisite[] (with docId bound in). */
export function resolvePrereqsToStorage(
  prereqs: ResolvedPrerequisite[],
  docId: string,
): StoredPurchasePrerequisite[] {
  return prereqs.map((prereq) => ({ ...prereq, docId }));
}

/**
 * Returns an array of unmet prerequisites.
 * Positive prereqs must be held; negative prereqs must NOT be held.
 */
export function getUnmetPrereqs(
  prereqs: ResolvedPrerequisite[],
  docId: string,
  findPurchase: (docId: string, id: Id<TID.Purchase>) => Id<GID.Purchase> | undefined,
  findDrawback: (docId: string, id: Id<TID.Drawback>) => Id<GID.Purchase> | undefined,
  findScenario: (docId: string, id: Id<TID.Scenario>) => Id<GID.Purchase> | undefined,
  findOrigin: (docId: string, id: Id<TID.Origin>) => boolean,
): ResolvedPrerequisite[] {
  return prereqs.filter((prereq) => {
    const held =
      prereq.type === "purchase"
        ? findPurchase(docId, prereq.templateId) !== undefined
        : prereq.type === "drawback"
          ? findDrawback(docId, prereq.templateId) !== undefined
          : prereq.type === "scenario"
            ? findScenario?.(docId, prereq.templateId) !== undefined
            : findOrigin?.(docId, prereq.templateId);
    return prereq.positive ? !held : held;
  });
}

/** Formats a ResolvedAltCost value as a human-readable cost string. */
export function altCostValueStr(value: { amount: number; currencyAbbrev: string }[]): string {
  if (!value.length) return "Free";
  return value.map(({ amount, currencyAbbrev }) => `${amount} ${currencyAbbrev}`).join(" + ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin discount helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the ModifiedCost for an origin-discounted purchase. "free" → always Free on first copy; "discounted" or undefined → Free if below threshold, else Reduced. */
export function originDiscountModifier(
  costs: { amount: number; currencyAbbrev: string }[],
  currencies: Registry<LID.Currency, Currency> | undefined,
  originBenefit: "discounted" | "free" | "access" | undefined,
  isFirstCopy: boolean,
): ModifiedCost {
  if (isFirstCopy) {
    if (originBenefit === "free") return { modifier: CostModifier.Free };
    const allFree = costs.every(({ amount, currencyAbbrev }) => {
      if (amount <= 0) return true;
      const currency = Object.values(currencies?.O ?? {}).find((c) => c?.abbrev === currencyAbbrev);
      return (
        currency?.discountFreeThreshold !== undefined && amount <= currency.discountFreeThreshold
      );
    });
    if (allFree) return { modifier: CostModifier.Free };
  }
  return { modifier: CostModifier.Reduced };
}

export function originDiscountCostStr(
  costs: { amount: number; currencyAbbrev: string }[],
  currencies: Registry<LID.Currency, Currency> | undefined,
  originBenefit: "discounted" | "free" | "access" | undefined,
  isFirstCopy: boolean,
): string {
  const parts = costs.map(({ amount, currencyAbbrev }) => {
    if (amount <= 0) return `0 ${currencyAbbrev}`;
    if (isFirstCopy) {
      if (originBenefit === "free") return "free";
      const currency = Object.values(currencies?.O ?? {}).find((c) => c?.abbrev === currencyAbbrev);
      if (
        currency?.discountFreeThreshold !== undefined &&
        amount <= currency.discountFreeThreshold
      ) {
        return "free";
      }
    }
    return `${Math.ceil(amount / 2)} ${currencyAbbrev}; discounted`;
  });
  return parts.every((p) => p === "free") ? "free" : parts.join(" + ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Template-placeholder utilities (origin-option randomness explainer)
// ─────────────────────────────────────────────────────────────────────────────

export function parseTemplatePlaceholders(name: string): {
  placeholders: TemplatePlaceholder[];
  annotated: string; // name with each ${…} replaced by its variable letter
} {
  const placeholders: TemplatePlaceholder[] = [];
  const varNames = "xyzabcde";
  const annotated = name.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(expr);
    if (rangeMatch) placeholders.push({ kind: "range", lo: +rangeMatch[1]!, hi: +rangeMatch[2]! });
    else placeholders.push({ kind: "choice", options: expr.split("|") });
    return varNames[placeholders.length - 1] ?? "?";
  });
  return { placeholders, annotated };
}

export function describeChoiceOptions(options: string[]): string {
  if (options.length === 2) return `"${options[0]}" or "${options[1]}"`;
  return (
    options
      .slice(0, -1)
      .map((o) => `"${o}"`)
      .join(", ") + `, or "${options[options.length - 1]}"`
  );
}

/** Renders a human-readable explanation of `${n-m}` / `${A|B|C}` placeholders. */
export function originTemplateInfo(name: string) {
  const { placeholders, annotated } = parseTemplatePlaceholders(name);
  if (placeholders.length === 0)
    return {
      main: name,
    };

  const isOnlyPlaceholder =
    placeholders.length === 1 && name.replace(/\$\{[^}]+\}/g, "").trim() === "";

  if (isOnlyPlaceholder) {
    const p = placeholders[0]!;
    const desc =
      p.kind === "range"
        ? `Randomized between ${p.lo} and ${p.hi}`
        : `Equal chance of ${describeChoiceOptions(p.options)}`;
    return { main: desc };
  }

  const varNames = "xyzabcde";
  return {
    main: annotated,
    aux: placeholders.map((p, idx) => {
      const v = varNames[idx] ?? "?";
      return p.kind === "range"
        ? `${v} is randomized between ${p.lo} and ${p.hi}`
        : `${v} has an equal chance of being ${describeChoiceOptions(p.options)}`;
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Freebie queue builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a list of queued annotation batches for the freebies on a companion template.
 * Each resolvable freebie produces one batch (single action) per companion character,
 * targeting that companion character so the interaction handler routes correctly.
 *
 * Call this after a companion import is added; pass the result to `enqueueActions`.
 */
export function buildFreebieActions(
  freebies: NonNullable<CompanionTemplate["freebies"]>,
  doc: JumpDoc,
  docId: string,
  companionCharIds: Id<GID.Character>[],
): QueuedAnnotationBatch[] {
  const batches: QueuedAnnotationBatch[] = [];

  for (const companionCharId of companionCharIds) {
    for (const freebie of freebies) {
      let action: ViewerAnnotationAction | null = null;

      if (freebie.type === "origin") {
        const t = doc.origins.O[freebie.id] as OriginTemplate | undefined;
        if (!t) continue;
        const { bounds: _bounds, ...template } = t as OriginTemplate;
        const category = doc.originCategories.O[t.type];
        const docCurrencyAbbrev = doc.currencies.O[t.cost.currency]?.abbrev ?? "";
        action = {
          docId,
          itemId: freebie.id as number,
          name: t.name,
          typeName: category?.name ?? "",
          costStr: "0 (freebie)",
          collection: "origin",
          categoryId: t.type,
          docCategoryMax: category?.max,
          template: { ...template, cost: { ...t.cost, amount: 0 } },
          docCurrencyAbbrev,
          discountedPurchaseTemplateIds: [],
          resolvedOriginStipend: [],
          synergyOriginNames: [],
          synergyBenefit: undefined,
        };
      } else if (freebie.type === "purchase") {
        const t = doc.availablePurchases.O[freebie.id] as BasicPurchaseTemplate | undefined;
        if (!t) continue;
        const { bounds: _bounds, ...template } = t as BasicPurchaseTemplate & { bounds?: unknown };
        const primaryCurrencyAbbrev = doc.currencies.O[t.cost[0]?.currency as any]?.abbrev ?? "";
        const subtypeName = doc.purchaseSubtypes.O[t.subtype as any]?.name ?? "";
        action = {
          docId,
          itemId: freebie.id as number,
          name: t.name,
          typeName: subtypeName,
          costStr: "0 (freebie)",
          collection: "purchase",
          docTemplateId: freebie.id,
          docCategoryMax: undefined,
          template,
          cost: [{ amount: 0, currencyAbbrev: primaryCurrencyAbbrev }],
          subtypeName,
          originNames: [],
          originBenefit: undefined,
          isBoosterFor: [],
          alternativeCosts: [],
          prerequisites: [],
        };
      } else if (freebie.type === "drawback") {
        const t = doc.availableDrawbacks.O[freebie.id] as DrawbackTemplate | undefined;
        if (!t) continue;
        const { bounds: _bounds, ...template } = t as DrawbackTemplate & { bounds?: unknown };
        const primaryCurrencyAbbrev = doc.currencies.O[t.cost[0]?.currency as any]?.abbrev ?? "";
        action = {
          docId,
          itemId: freebie.id as number,
          name: t.name,
          typeName: "",
          costStr: "0 (automatic)",
          collection: "drawback",
          docTemplateId: freebie.id,
          template,
          cost: [{ amount: 0, currencyAbbrev: primaryCurrencyAbbrev }],
          alternativeCosts: [],
          prerequisites: [],
          isBoosterFor: [],
        };
      }

      if (action) {
        batches.push({ actions: [action], targetCharId: companionCharId });
      }
    }
  }

  return batches;
}

export function buildScenarioCompanionRewardActions(
  rewards: Extract<ScenarioRewardTemplate, { type: RewardType.Companion }>[],
  doc: JumpDoc,
  docId: string,
): QueuedAnnotationBatch[] {
  const batches: QueuedAnnotationBatch[] = [];
  for (const reward of rewards) {
    const t = doc.availableCompanions.O[reward.id] as CompanionTemplate | undefined;
    if (!t) continue;
    const { bounds: _bounds, ...template } = t;
    const allowances = Object.entries(t.allowances ?? {}).flatMap(([tidStr, amount]) => {
      const abbrev = doc.currencies.O[+tidStr as any]?.abbrev;
      return abbrev && amount ? [{ currencyAbbrev: abbrev, amount }] : [];
    });
    const stipend = Object.entries(t.stipend ?? {}).flatMap(([currTidStr, subtypeMap]) => {
      const currAbbrev = doc.currencies.O[+currTidStr as any]?.abbrev;
      if (!currAbbrev) return [];
      return Object.entries(subtypeMap ?? {}).flatMap(([stTidStr, amount]) => {
        const subtypeName = doc.purchaseSubtypes.O[+stTidStr as any]?.name;
        return currAbbrev && subtypeName && amount
          ? [{ currencyAbbrev: currAbbrev, subtypeName, amount }]
          : [];
      });
    });
    const action: ViewerAnnotationAction = {
      docId,
      itemId: reward.id as number,
      name: t.name,
      typeName: "Companion Import",
      costStr: "0 (reward)",
      collection: "companion",
      docTemplateId: reward.id,
      template,
      cost: [{ amount: 0, currencyAbbrev: "" }],
      allowances,
      stipend,
      originNames: [],
      originBenefit: undefined,
      alternativeCosts: [],
    };
    batches.push({ actions: [action] });
  }
  return batches;
}

export function buildScenarioRewardActions(
  rewards: Extract<ScenarioRewardTemplate, { type: RewardType.Item | RewardType.Perk }>[],
  doc: JumpDoc,
  docId: string,
): QueuedAnnotationBatch[] {
  const batches: QueuedAnnotationBatch[] = [];
  for (const reward of rewards) {
    const t = doc.availablePurchases.O[reward.id] as BasicPurchaseTemplate | undefined;
    if (!t) continue;
    const { bounds: _bounds, ...template } = t as BasicPurchaseTemplate & { bounds?: unknown };
    const primaryCurrencyAbbrev = doc.currencies.O[t.cost[0]?.currency as any]?.abbrev ?? "";
    const subtypeName = doc.purchaseSubtypes.O[t.subtype as any]?.name ?? "";
    const action: ViewerAnnotationAction = {
      docId,
      itemId: reward.id as number,
      name: t.name,
      typeName: subtypeName,
      costStr: "0 (reward)",
      collection: "purchase",
      docTemplateId: reward.id,
      docCategoryMax: undefined,
      template,
      cost: [{ amount: 0, currencyAbbrev: primaryCurrencyAbbrev }],
      subtypeName,
      originNames: [],
      originBenefit: undefined,
      isBoosterFor: [],
      alternativeCosts: [],
      prerequisites: [],
    };
    batches.push({ actions: [action] });
  }
  return batches;
}
