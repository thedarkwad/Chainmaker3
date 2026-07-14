import { useMemo } from "react";
import {
  createId,
  GID,
  Id,
  LID,
  PartialIndex,
  PartialLookup,
  Registry,
  TID,
} from "../data/types";
import { JumpDocBuildData } from "../state/ViewerActionStore";
import {
  AlternativeCost,
  AlternativeCostPrerequisite,
  BasicPurchaseTemplate,
  JumpDoc,
  JumpDocPrerequisite,
  PurchaseTemplate,
  stripTemplating,
  VariableCost,
} from "@/jumpdoc/data/JumpDoc";
import {
  CostModifier,
  ModifiedCost,
  purchaseValue,
  Value,
} from "../data/Purchase";
import { Currency, DEFAULT_CURRENCY_ID } from "../data/Jump";
import { extractTags } from "../../utilities/tags";
import {
  convertWhitespace,
  objFilter,
  objMap,
} from "@/utilities/miscUtilities";
import { InternalTagsMap, PossibleCost } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Template-placeholder utilities (origin-option randomness explainer)
// ─────────────────────────────────────────────────────────────────────────────

type TemplatePlaceholder =
  | { kind: "range"; lo: number; hi: number }
  | { kind: "choice"; options: string[] };

export function parseTemplatePlaceholders(name: string): {
  placeholders: TemplatePlaceholder[];
  annotated: string; // name with each ${…} replaced by its variable letter
} {
  const placeholders: TemplatePlaceholder[] = [];
  const varNames = "xyzabcde";
  const annotated = name.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(expr);
    if (rangeMatch)
      placeholders.push({
        kind: "range",
        lo: +rangeMatch[1]!,
        hi: +rangeMatch[2]!,
      });
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
      .map(o => `"${o}"`)
      .join(", ") + `, or "${options[options.length - 1]}"`
  );
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Cost and tag helpers
// ─────────────────────────────────────────────────────────────────────────────

export const purchaseValueWithThreshold = <
  T extends TID.Currency | LID.Currency = LID.Currency,
>(
  value: Value<T>,
  mod: ModifiedCost<T>,
  freebieAllowed: boolean,
  currencies: Registry<T, Currency>,
): Value<T> => {
  switch (mod.modifier) {
    case CostModifier.Full:
      return value;
    case CostModifier.Free:
      if (freebieAllowed)
        return value.map(val => ({
          amount: Math.min(val.amount, 0),
          currency: val.currency,
        }));
      // falls through
      else;
    case CostModifier.Reduced:
      return value.map(val => ({
        amount:
          freebieAllowed &&
            val.amount <= (currencies.O[val.currency]?.discountFreeThreshold ?? 0)
            ? Math.min(0, val.amount)
            : Math.min(val.amount, Math.floor(val.amount / 2)),
        currency: val.currency,
      }));
    case CostModifier.Custom:
      return mod.modifiedTo as Value<T>;
  }
};

export const extractTagsWithExclusions = (s: string, exclusions: string[]) =>
  objFilter(extractTags(s), (_, s) => !exclusions.includes(s));

export function getPrereqError(
  prereq: JumpDocPrerequisite,
  build: JumpDocBuildData,
  doc: JumpDoc,
): string | undefined {
  let has: boolean;
  let name: string;
  switch (prereq.type) {
    case "drawback":
      if (doc.availableDrawbacks.O[prereq.id] === undefined) return;
      has = (build.drawbacks[prereq.id] ?? []).length > 0;
      name = (doc.availableDrawbacks.O[prereq.id] ?? []).name;
      break;
    case "purchase":
      if (doc.availablePurchases.O[prereq.id] === undefined) return;
      has = (build.purchases[prereq.id] ?? []).length > 0;
      name = (doc.availablePurchases.O[prereq.id] ?? []).name;
      break;
    case "scenario":
      if (doc.availableScenarios.O[prereq.id] === undefined) return;
      has = (build.scenarios[prereq.id] ?? []).length > 0;
      name = (doc.availableScenarios.O[prereq.id] ?? []).name;
      break;
    case "companion":
      if (doc.availableCompanions.O[prereq.id] === undefined) return;
      has = (build.companionImports[prereq.id] ?? []).length > 0;
      name = (doc.availableCompanions.O[prereq.id] ?? []).name;
      break;
    case "origin":
      if (doc.origins.O[prereq.id] === undefined) return;
      has = build.origins.some(o => o.template?.id == prereq.id);
      name = doc.origins.O[prereq.id]?.name;
  }
  if (!has && prereq.positive) return `Restricted to holders of "${name}".`;
  if (has && !prereq.positive) return `Incompatible with "${name}".`;
}

export function altCostPrereqsMet(
  altCost: AlternativeCost,
  build: JumpDocBuildData,
  templateId: number,
  isFirstCopy: boolean,
): boolean {
  if (altCost.prerequisites.length === 0) return true;
  const notMet = (prereq: AlternativeCostPrerequisite): boolean => {
    if (
      isFirstCopy &&
      prereq.type === "purchase" &&
      (prereq.id as number) === templateId
    )
      return true;
    switch (prereq.type) {
      case "purchase":
        return (build.purchases[prereq.id] ?? []).length === 0;
      case "drawback":
        return (build.drawbacks[prereq.id] ?? []).length === 0;
      case "scenario":
        return (build.scenarios[prereq.id] ?? []).length === 0;
      case "companion":
        return (build.companionImports[prereq.id] ?? []).length === 0;
      case "origin":
        return !build.origins.some(o => o.template?.id === prereq.id);
    }
  };
  return altCost.AND
    ? !altCost.prerequisites.some(notMet)
    : !altCost.prerequisites.every(notMet);
}

export function computePossibleCosts(
  template: PurchaseTemplate<TID> & { cost: Value<TID.Currency> },
  build: JumpDocBuildData,
  doc: JumpDoc,
  isFirstCopy: boolean,
) {
  if (!doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype])
    doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype] =
      doc.purchaseSubtypes.O[0 as any];
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
    purchaseValue(c.cost, c).every(
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
        if (isFirstCopy)
          return {
            ...c,
            modifier: CostModifier.Free,
          };
        // falls through
        else;
      case "discounted":
        if (
          isFirstCopy &&
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
              modifiedTo: purchaseValueWithThreshold<TID.Currency>(
                purchaseValue<TID.Currency>(c.cost, {
                  modifier: CostModifier.Reduced,
                }),
                { modifier: CostModifier.Reduced },
                isFirstCopy,
                doc.currencies,
              ) as Value<TID.Currency>,
            };
          case CostModifier.Custom:
            return {
              ...c,
              modifier: CostModifier.Custom,
              modifiedTo: purchaseValueWithThreshold<TID.Currency>(
                c.modifiedTo as Value<TID.Currency>,
                {
                  modifier: CostModifier.Reduced,
                },
                isFirstCopy,
                doc.currencies,
              ),
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
    if (!altCostPrereqsMet(altCost, build, template.id as number, isFirstCopy))
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

export function evalVariableCostExpr(
  expr: string,
  tags: Record<string, string>,
): number {
  if (!expr.trim()) return 0;
  // Note: we require applyTags here but to avoid circular import, we can do inline string replacement 
  // or use regex. In the original, it called: applyTags(`\${${expr}}`, tags)
  // Let's implement a simple tags evaluation for variable cost expression here.
  // The expression is usually a variable name like ${perk_cost} or just references.
  // Actually, we can use a basic regex substitution:
  const resolved = expr.replace(/\$\{([^}]+)\}/g, (_, key) => tags[key] ?? "");
  const cleanExpr = resolved.replace(/\b([a-zA-Z_]\w*)\b/g, (name) => tags[name] ?? name);
  const n = Number(cleanExpr);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency & Subtype ID conversions (TID -> LID)
// ─────────────────────────────────────────────────────────────────────────────

export function convertCurrencyId(
  id: Id<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
): Id<LID.Currency> {
  if (!doc.currencies.O[id]) return 0 as Id<LID.Currency>;
  for (let currIdStr in currencies.O) {
    if (currencies.O[+currIdStr as any].name == doc.currencies.O[id].name)
      return +currIdStr as Id<LID.Currency>;
  }
  return DEFAULT_CURRENCY_ID;
}

export function convertValue(
  v: Value<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
): Value<LID.Currency> {
  return v.map(({ amount, currency }) => ({
    amount,
    currency: convertCurrencyId(currency, doc, currencies),
  }));
}

export function convertSubtypeId(
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

export function convertModifiedCost(
  v: Value<TID.Currency>,
  m: ModifiedCost<TID.Currency>,
  doc: JumpDoc,
  currencies: Registry<LID.Currency, Currency>,
  floatingDiscount: boolean,
): ModifiedCost {
  switch (m.modifier) {
    case CostModifier.Full:
      if (
        floatingDiscount &&
        v.every(
          ({ amount, currency }) =>
            amount <=
            (doc.currencies.O?.[currency]?.discountFreeThreshold ?? 0),
        )
      )
        return { modifier: CostModifier.Free };
      else if (floatingDiscount) return { modifier: CostModifier.Reduced };
      else return m;
    case CostModifier.Reduced:
      if (floatingDiscount)
        return {
          modifier: CostModifier.Custom,
          modifiedTo: convertValue(
            purchaseValueWithThreshold(
              purchaseValue(v, {
                modifier: CostModifier.Reduced,
              }),
              { modifier: CostModifier.Reduced },
              true,
              doc.currencies,
            ),
            doc,
            currencies,
          ),
        };
      return m;
    case CostModifier.Free:
      return m;
    case CostModifier.Custom:
      if (floatingDiscount)
        return {
          modifier: CostModifier.Custom,
          modifiedTo: convertValue(
            (m.modifiedTo as Value<TID.Currency>).map(
              ({ amount, currency }) => ({
                currency,
                amount: amount > 0 ? Math.floor(amount / 4) : amount,
              }),
            ) as Value<TID.Currency>,
            doc,
            currencies,
          ),
        };
      return {
        modifier: CostModifier.Custom,
        modifiedTo: convertValue(
          m.modifiedTo as Value<TID.Currency>,
          doc,
          currencies,
        ),
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useJumpDocInternalTags hook
// ─────────────────────────────────────────────────────────────────────────────

export function useJumpDocInternalTags(doc: JumpDoc | null): InternalTagsMap {
  return useMemo(() => {
    if (!doc) return {};
    const tags = [
      ...Object.values(doc.availableCompanions.O),
      ...Object.values(doc.availableDrawbacks.O),
      ...Object.values(doc.availablePurchases.O),
      ...Object.values(doc.availableScenarios.O),
      ...Object.values(doc.origins.O),
    ].flatMap(p => p?.internalTags ?? []);

    const incrementer = <A extends TID, B extends GID>(
      r: Registry<A, { internalTags?: string[] }>,
      lookup: (build: JumpDocBuildData) => PartialIndex<A, B>,
    ) => {
      const relevantEntries = Object.fromEntries(
        tags.map(t => [
          t,
          Object.keys(r.O)
            .filter(id => (r.O[id as any]?.internalTags ?? []).includes(t))
            .map(Number) as Id<A>[],
        ]),
      );
      return (build: JumpDocBuildData, t: string) => {
        const lookupResolved = lookup(build);
        let count = 0;
        for (const id of relevantEntries[t] ?? []) {
          count += lookupResolved[id]?.length ?? 0;
        }
        return count;
      };
    };
    const incrementers = [
      incrementer(doc.availablePurchases, build => build.purchases),
      incrementer(doc.availableDrawbacks, build => build.drawbacks),
      incrementer(doc.availableCompanions, build => build.companionImports),
      incrementer(doc.availableScenarios, build => build.scenarios),
    ];

    const originTagIds = Object.fromEntries(
      tags.map(t => [
        t,
        new Set(
          Object.keys(doc.origins.O)
            .filter(id =>
              (doc.origins.O[id as any]?.internalTags ?? []).includes(t),
            )
            .map(Number) as Id<TID.Origin>[],
        ),
      ]),
    );
    const originIncrementer = (build: JumpDocBuildData, t: string) =>
      build.origins.filter(
        o =>
          o.template?.id !== undefined && originTagIds[t]?.has(o.template.id),
      ).length;

    return Object.fromEntries(
      tags.map(t => [
        t,
        (build: JumpDocBuildData) =>
          String(
            incrementers.reduce((n, inc) => n + inc(build, t), 0) +
            originIncrementer(build, t),
          ),
      ]),
    );
  }, [doc]);
}
