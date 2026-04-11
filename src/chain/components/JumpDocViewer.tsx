/**
 * JumpDocViewer — read-only PDF viewer for a linked JumpDoc, with annotation overlays.
 *
 * - Loads the JumpDoc from the API by its publicUid.
 * - All pages stacked vertically in an independently-scrolling container.
 * - SVG overlay per page shows annotation bounds colored by template type.
 * - Hold Shift to reveal the annotation overlay; hold Ctrl/⌘ to reveal the text layer.
 * - Scroll position persists across tab navigations because the component stays
 *   mounted in the JumpLayout (it is not inside the <Outlet>).
 */

import "pdfjs-dist/web/pdf_viewer.css";
import { type ReactNode, useEffect, useState } from "react";
import { useSwipe } from "@/ui/useSwipe";
import { ArrowLeft, Eye, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { usePdfRenderer, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, RENDER_SCALE } from "@/ui/usePdfRenderer";
import { loadJumpDoc } from "@/api/jumpdocs";
import { useCurrentUser } from "@/app/state/auth";
import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";
import {
  stripTemplating,
  type Annotation,
  type AnnotationType,
  type BasicPurchaseTemplate,
  type CompanionTemplate,
  type DrawbackTemplate,
  type DocOriginCategory,
  type FreeFormOrigin,
  type FullAnnotations,
  type JumpDoc,
  type OriginTemplate,
  type ScenarioTemplate,
} from "@/chain/data/JumpDoc";
import { useWindowDocument } from "@/ui/WindowDocumentContext";
import {
  useViewerActionStore,
  type ResolvedAltCost,
  type ResolvedAltCostPrereq,
  type ResolvedPrerequisite,
  type ViewerAnnotationAction,
} from "@/chain/state/ViewerActionStore";
import { useJumpDocSelectedAnnotations, useJumpDocHoverContext } from "@/chain/state/hooks";
import {
  createId,
  Id,
  TID,
  type GID,
  type LID,
  type PartialLookup,
  type Registry,
} from "../data/types";
import type { Currency, Origin, OriginCategory } from "../data/Jump";
import { Value } from "../data/Purchase";

// ─────────────────────────────────────────────────────────────────────────────
// Annotation extraction
// ─────────────────────────────────────────────────────────────────────────────

type AnyAnnotation = FullAnnotations[number][number];

/** Looks up a JumpDoc currency's abbrev by its TID. */
function getDocCurrencyAbbrev(id: Id<TID.Currency>, currencies: JumpDoc["currencies"]): string {
  return currencies.O[id]?.abbrev ?? "";
}

function formatCost(costs: Value<TID.Currency>, currencies: JumpDoc["currencies"]): string {
  if (!costs || costs.length === 0) return "Free";
  return costs.map((c) => `${c.amount} ${currencies.O[c.currency]?.abbrev ?? "?"}`).join(" + ");
}

type HoverCostContext = {
  origins: PartialLookup<LID.OriginCategory, Origin[]> | null;
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined;
  currencies: Registry<LID.Currency, Currency> | undefined;
};

/** Returns true if the character holds at least one of the given doc origin TIDs. */
function hasMatchingOrigin(
  originTids: Id<TID.Origin>[],
  doc: JumpDoc,
  ctx: HoverCostContext,
): boolean {
  return originTids.some((tid) => {
    const docOrigin = doc.origins.O[tid];
    if (!docOrigin) return false;
    const catName = doc.originCategories.O[docOrigin.type]?.name;
    if (!catName) return false;
    const catEntry = Object.entries(ctx.originCategories?.O ?? {}).find(
      ([, cat]) => cat?.name === catName,
    );
    if (!catEntry) return false;
    const catLid = createId<LID.OriginCategory>(+catEntry[0]);
    return (ctx.origins?.[catLid] ?? []).some(
      (o) => o.summary === docOrigin.name || o.templateName === docOrigin.name,
    );
  });
}

/**
 * Returns false when the annotation is for an access-restricted purchase and the
 * character does not hold a qualifying origin.  Always returns true for non-purchase
 * annotations or when ctx is unavailable.
 */
function isAnnotationQualified(
  ann: AnyAnnotation,
  doc: JumpDoc,
  ctx: HoverCostContext | null | undefined,
): boolean {
  if (!ctx || ann.type !== "purchase") return true;
  const t = doc.availablePurchases.O[ann.id];
  if (!t || t.originBenefit !== "access" || t.origins.length === 0) return true;
  return hasMatchingOrigin(t.origins, doc, ctx);
}

/** Computes the effective cost string for a purchase given current character origins. */
function computePurchaseHoverCost(
  t: BasicPurchaseTemplate,
  doc: JumpDoc,
  ctx: HoverCostContext,
): string {
  const baseCost = formatCost(t.cost, doc.currencies);

  // Check whether the character holds a qualifying origin for this purchase.
  const hasOriginMatch = t.originBenefit !== "access" && hasMatchingOrigin(t.origins, doc, ctx);

  if (hasOriginMatch) {
    // Compute the discounted cost string.
    const parts = t.cost.map(({ amount, currency }) => {
      const abbrev = doc.currencies.O[currency]?.abbrev ?? "?";
      if (amount <= 0) return `0 ${abbrev}`;
      if (t.originBenefit === "free") return "free";
      // Check per-currency discount-free threshold from chain currencies.
      const chainCurrency = Object.values(ctx.currencies?.O ?? {}).find(
        (c) => c?.abbrev === abbrev,
      );
      if (
        chainCurrency?.discountFreeThreshold !== undefined &&
        amount <= chainCurrency.discountFreeThreshold
      ) {
        return "free";
      }
      return `${Math.ceil(amount / 2)} ${abbrev}; discounted`;
    });
    // If every component resolved to "free", collapse to a single "free".
    return parts.every((p) => p === "free") ? "free" : parts.join(" + ");
  }

  // Mandatory alt cost with no prerequisites (safe to show without full chain context).
  const mandatoryAlt = t.alternativeCosts?.find(
    (ac) => ac.mandatory && ac.prerequisites.length === 0,
  );
  if (mandatoryAlt) {
    const altStr = mandatoryAlt.value
      .map(({ amount, currency }) => `${amount} ${doc.currencies.O[currency]?.abbrev ?? "?"}`)
      .join(" + ");
    return `${altStr}; altered`;
  }

  return baseCost;
}

/** Returns human-readable { typeName, costStr } for a tooltip. */
function getAnnotationDisplay(
  ann: AnyAnnotation,
  doc: JumpDoc,
  ctx?: HoverCostContext | null,
): { typeName: string; costStr: string } {
  switch (ann.type) {
    case "origin": {
      const t = doc.origins.O[ann.id];
      const typeName = t ? (doc.originCategories.O[t.type]?.name ?? "Origin") : "Origin";
      if (!t) return { typeName, costStr: "" };
      const abbrev = doc.currencies.O[t.cost.currency]?.abbrev ?? "?";
      const baseCostStr = `${t.cost.amount} ${abbrev}`;

      if (ctx && t.synergies?.length && t.synergyBenefit !== "access") {
        const hasSynergy = hasMatchingOrigin(t.synergies, doc, ctx);
        if (hasSynergy) {
          if (t.synergyBenefit === "free") return { typeName, costStr: "free" };
          if (t.synergyBenefit === "discounted") {
            const half = Math.floor(t.cost.amount / 2);
            return { typeName, costStr: `${half} ${abbrev}; discounted` };
          }
        }
      }

      return { typeName, costStr: baseCostStr };
    }
    case "purchase": {
      const t = doc.availablePurchases.O[ann.id];
      const typeName = doc.purchaseSubtypes.O[t?.subtype]?.name ?? "Purchase";
      const costStr = t
        ? ctx
          ? computePurchaseHoverCost(t, doc, ctx)
          : formatCost(t.cost, doc.currencies)
        : "";
      return { typeName, costStr };
    }
    case "drawback": {
      const t = doc.availableDrawbacks.O[ann.id];
      const costStr = t ? formatCost(t.cost, doc.currencies) : "";
      return { typeName: "Drawback", costStr };
    }
    case "origin-option": {
      const cat = doc.originCategories.O[ann.id] as DocOriginCategory | undefined;
      if (!cat?.singleLine) return { typeName: "Origin Option", costStr: "" };
      const opt = cat.options[ann.index];
      const costStr = opt
        ? `${opt.cost.amount} ${getDocCurrencyAbbrev(opt.cost.currency, doc.currencies)}`
        : "";
      return { typeName: cat.name, costStr };
    }
    case "origin-randomizer": {
      const cat = doc.originCategories.O[ann.id] as DocOriginCategory | undefined;
      if (!cat || cat.singleLine) return { typeName: "Randomizer", costStr: "" };
      const cost = cat.random?.cost;
      const costStr = cost
        ? `${cost.amount} ${getDocCurrencyAbbrev(cost.currency, doc.currencies)}`
        : "";
      return { typeName: "Randomizer", costStr };
    }
    case "scenarios":
      return { typeName: "Scenario", costStr: "" };
    case "companion": {
      const t = doc.availableCompanions.O[ann.id];
      const costStr = t ? formatCost(t.cost, doc.currencies) : "";
      return { typeName: "Companion", costStr };
    }
    case "currency-exchange":
      return { typeName: "Exchange", costStr: "" };
    default:
      return { typeName: ann.type, costStr: "" };
  }
}

/**
 * Stable key used for hover/selection matching.
 * - "origin" and "origin-option" both key by label (the origin name/option name),
 *   so they align with how origins land in selectedAnnotations (`origin:${summary}`).
 * - Everything else keys by type + numeric id.
 */
function annotationKey(ann: AnyAnnotation): string {
  if (ann.type === "origin" || ann.type === "origin-option") return `origin:${ann.label}`;
  if (ann.type === "currency-exchange") return `currency-exchange:${ann.docIndex}`;
  return `${ann.type}:${ann.id}`;
}

function extractAnnotations(doc: JumpDoc): FullAnnotations {
  const out: FullAnnotations = {};

  function push<T extends keyof AnnotationType>(page: number, ann: Annotation<T>) {
    (out[page] ??= []).push(ann as AnyAnnotation);
  }

  // Color lookup for purchase subtypes (Perk = sky, Item = amber).
  const subtypeColors: Record<number, string> = {};
  for (const [idStr, st] of Object.entries(doc.purchaseSubtypes.O)) {
    if (st) subtypeColors[+idStr] = st.type === 0 ? "#38bdf8" : "#f59e0b";
  }

  for (const [idStr, t] of Object.entries(doc.origins.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, { type: "origin", id: +idStr as never, rect, label: t.name, color: "#22c55e" });
  }

  for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
    if (!cat) continue;
    const catId = createId<TID.OriginCategory>(+idStr);
    if (cat.singleLine) {
      cat.options.forEach((opt, index) => {
        for (const { page, ...rect } of opt.bounds ?? [])
          push(page, {
            type: "origin-option",
            id: catId,
            index,
            rect,
            label: opt.name || "Free-form",
            color: "#22c55e",
          });
      });
    } else if (cat.random) {
      for (const { page, ...rect } of cat.random.bounds ?? [])
        push(page, {
          type: "origin-randomizer",
          id: catId,
          rect,
          label: cat.name,
          color: "#22c55e",
        });
    }
  }

  for (const [idStr, t] of Object.entries(doc.availablePurchases.O)) {
    if (!t) continue;
    const color = subtypeColors[t.subtype] ?? "#38bdf8";
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, { type: "purchase", id: +idStr as never, rect, label: t.name, color });
  }

  for (const [idStr, t] of Object.entries(doc.availableDrawbacks.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, { type: "drawback", id: +idStr as never, rect, label: t.name, color: "#ef4444" });
  }

  for (const [idStr, t] of Object.entries(doc.availableScenarios.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, { type: "scenarios", id: +idStr as never, rect, label: t.name, color: "#a855f7" });
  }

  for (const [idStr, t] of Object.entries(doc.availableCompanions.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, { type: "companion", id: +idStr as never, rect, label: t.name, color: "#06b6d4" });
  }

  for (const [idx, ex] of (doc.availableCurrencyExchanges ?? []).entries()) {
    const fromAbbrev = doc.currencies.O[ex.oCurrency]?.abbrev ?? "?";
    const toAbbrev = doc.currencies.O[ex.tCurrency]?.abbrev ?? "?";
    const label = `${ex.oamount} ${fromAbbrev} → ${ex.tamount} ${toAbbrev}`;
    for (const { page, ...rect } of ex.bounds ?? [])
      push(page, {
        type: "currency-exchange",
        docIndex: idx,
        oCurrency: ex.oCurrency,
        tCurrency: ex.tCurrency,
        oamount: ex.oamount,
        tamount: ex.tamount,
        rect,
        label,
        color: "#f97316",
      });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

/** Accent2 rect for hover state and selected state overlays. */
function SelectionRect({
  bx,
  by,
  bw,
  bh,
  isSelected,
}: {
  bx: number;
  by: number;
  bw: number;
  bh: number;
  isSelected: boolean;
}) {
  const sharedProps = {
    x: bx + 1,
    y: by + 1,
    width: bw - 2,
    height: bh - 2,
    rx: 4,
    ry: 4,
  };

  if (isSelected) {
    // Two-layer: multiply fill for highlight effect + opaque solid stroke for guaranteed visibility.
    return (
      <>
        <rect
          {...sharedProps}
          fill="var(--color-accent2)"
          fillOpacity={0.3}
          stroke="none"
          style={{ mixBlendMode: "hue" }}
        />
        <rect
          {...sharedProps}
          fill="var(--color-accent2)"
          fillOpacity={0.5}
          stroke="none"
          style={{ mixBlendMode: "multiply" }}
        />
        <rect
          {...sharedProps}
          fill="none"
          stroke="var(--color-accent2)"
          strokeOpacity={0.95}
          strokeWidth={3}
          strokeDasharray="10 5"
        />
      </>
    );
  }

  // Hover: single semi-transparent rect, no blend mode.
  return (
    <rect
      {...sharedProps}
      fill="var(--color-accent2)"
      fillOpacity={0.08}
      stroke="var(--color-accent2)"
      strokeOpacity={0.5}
      strokeWidth={2}
      strokeDasharray="5 3"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotation → action builder (shared between left-click and right-click)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolves a JumpDoc AlternativeCost array into ResolvedAltCost[] for the ViewerActionStore. */
function resolveAltCostsForAction(
  altCosts:
    | {
        value: { amount: number; currency: Id<TID.Currency> }[];
        prerequisites: { type: string; id: number }[];
        mandatory: boolean;
      }[]
    | undefined,
  doc: JumpDoc,
): ResolvedAltCost[] {
  if (!altCosts?.length) return [];
  return altCosts.map((ac) => ({
    value: ac.value.map((v) => ({
      amount: v.amount,
      currencyAbbrev: getDocCurrencyAbbrev(v.currency as Id<TID.Currency>, doc.currencies),
    })),
    prerequisites: ac.prerequisites.flatMap((prereq): ResolvedAltCostPrereq[] => {
      if (prereq.type === "origin") {
        const origin = doc.origins.O[prereq.id as any];
        if (!origin) return [];
        const categoryName = doc.originCategories.O[origin.type]?.name ?? "";
        return [{ type: "origin", categoryName, originName: origin.name }];
      }
      if (prereq.type === "drawback") {
        return [{ type: "drawback", templateId: createId<TID.Drawback>(prereq.id) }];
      }
      return [{ type: "purchase", templateId: createId<TID.Purchase>(prereq.id) }];
    }),
    mandatory: ac.mandatory,
  }));
}

/** Resolves a PurchaseTemplate's prerequisites array into ResolvedPrerequisite[] for the ViewerActionStore. */
function resolvePrerequisitesForAction(
  prereqs: { type: string; id: number; positive: boolean }[] | undefined,
  doc: JumpDoc,
): ResolvedPrerequisite[] {
  if (!prereqs?.length) return [];
  return prereqs.flatMap((prereq): ResolvedPrerequisite[] => {
    if (prereq.type === "purchase") {
      const t = doc.availablePurchases.O[prereq.id as unknown as Id<TID.Purchase>];
      if (!t) return [];
      return [
        {
          type: "purchase",
          templateId: createId<TID.Purchase>(prereq.id),
          positive: prereq.positive,
          name: t.name,
        },
      ];
    }
    if (prereq.type === "scenario") {
      const t = doc.availableScenarios.O[prereq.id as unknown as Id<TID.Scenario>];
      if (!t) return [];
      return [
        {
          type: "scenario",
          templateId: createId<TID.Scenario>(prereq.id),
          positive: prereq.positive,
          name: t.name,
        },
      ];
    }
    // drawback
    const t = doc.availableDrawbacks.O[prereq.id as unknown as Id<TID.Drawback>];
    if (!t) return [];
    return [
      {
        type: "drawback",
        templateId: createId<TID.Drawback>(prereq.id),
        positive: prereq.positive,
        name: t.name,
      },
    ];
  });
}

function buildAnnotationActions(
  ann: AnyAnnotation,
  docId: string,
  doc: JumpDoc,
): ViewerAnnotationAction[] {
  if (ann.type === "currency-exchange") {
    const { typeName, costStr } = getAnnotationDisplay(ann, doc);
    const fromAbbrev = doc.currencies.O[ann.oCurrency]?.abbrev ?? "?";
    const toAbbrev = doc.currencies.O[ann.tCurrency]?.abbrev ?? "?";
    return [
      {
        docId,
        itemId: ann.docIndex,
        name: ann.label,
        typeName,
        costStr,
        collection: "currency-exchange",
        docExchangeIndex: ann.docIndex,
        oCurrencyAbbrev: fromAbbrev,
        tCurrencyAbbrev: toAbbrev,
        oamount: ann.oamount,
        tamount: ann.tamount,
      },
    ];
  }

  const { typeName, costStr } = getAnnotationDisplay(ann, doc);
  const base = { docId, itemId: ann.id, name: ann.label, typeName, costStr };

  if (ann.type === "origin") {
    const t = doc.origins.O[ann.id];
    const categoryId = t?.type ?? createId<TID.OriginCategory>(0);
    const docCategory = doc.originCategories.O[categoryId];
    const { bounds: _bounds, ...template } = (t ?? {
      name: ann.label,
      type: categoryId,
      cost: { amount: 0, currency: 0 },
    }) as OriginTemplate;
    const discountedPurchaseTemplateIds = Object.entries(doc.availablePurchases.O).flatMap(
      ([keyStr, t]) => (t?.origins.includes(ann.id) ? [createId<TID.Purchase>(+keyStr)] : []),
    );
    const resolvedOriginStipend = (template.originStipend ?? []).flatMap((entry) => {
      const currencyAbbrev = doc.currencies.O[entry.currency as any]?.abbrev;
      const subtypeName = doc.purchaseSubtypes.O[entry.purchaseSubtype as any]?.name;
      return currencyAbbrev && subtypeName && entry.amount > 0
        ? [{ currencyAbbrev, subtypeName, amount: entry.amount }]
        : [];
    });
    const synergyOriginNames = (template.synergies ?? []).flatMap((tid) => {
      const synOrigin = doc.origins.O[tid];
      if (!synOrigin) return [];
      const categoryName = doc.originCategories.O[synOrigin.type]?.name ?? "";
      return [{ categoryName, originName: synOrigin.name }];
    });
    return [
      {
        ...base,
        collection: "origin",
        categoryId,
        docCategoryMax: docCategory?.max,
        template,
        docCurrencyAbbrev: getDocCurrencyAbbrev(template.cost.currency, doc.currencies),
        discountedPurchaseTemplateIds,
        resolvedOriginStipend,
        synergyOriginNames,
        synergyBenefit: template.synergyBenefit,
      },
    ];
  }
  if (ann.type === "origin-option") {
    const cat = doc.originCategories.O[ann.id] as DocOriginCategory | undefined;
    if (!cat?.singleLine) return [];
    const opt = cat.options[ann.index];
    if (!opt) return [];
    const { bounds: _bounds, ...option } = opt as FreeFormOrigin;
    return [
      {
        ...base,
        collection: "origin-option",
        categoryId: ann.id,
        optionIndex: ann.index,
        option,
        docCurrencyAbbrev: getDocCurrencyAbbrev(opt.cost.currency, doc.currencies),
      },
    ];
  }
  if (ann.type === "origin-randomizer") {
    const cat = doc.originCategories.O[ann.id] as DocOriginCategory | undefined;
    if (!cat || cat.singleLine || !cat.random) return [];
    const templates = Object.values(doc.origins.O)
      .filter((t): t is OriginTemplate => !!t && t.type === ann.id)
      .map(({ bounds: _bounds, ...t }) => ({
        ...t,
        resolvedOriginStipend: (t.originStipend ?? []).flatMap((entry) => {
          const currencyAbbrev = doc.currencies.O[entry.currency as any]?.abbrev;
          const subtypeName = doc.purchaseSubtypes.O[entry.purchaseSubtype as any]?.name;
          return currencyAbbrev && subtypeName && entry.amount > 0
            ? [{ currencyAbbrev, subtypeName, amount: entry.amount }]
            : [];
        }),
      }));
    return [
      {
        ...base,
        collection: "origin-randomizer",
        categoryId: ann.id,
        categoryName: cat.name,
        docCategoryMax: cat.max,
        cost: cat.random.cost,
        docCurrencyAbbrev: getDocCurrencyAbbrev(cat.random.cost.currency, doc.currencies),
        templates,
      },
    ];
  }
  if (ann.type === "purchase") {
    const t = doc.availablePurchases.O[ann.id] as BasicPurchaseTemplate | undefined;
    if (!t) return [];
    const { bounds: _bounds, ...template } = t;
    const subtype = doc.purchaseSubtypes.O[t.subtype];
    const cost = t.cost.map((c) => ({
      amount: c.amount,
      currencyAbbrev: getDocCurrencyAbbrev(c.currency, doc.currencies),
    }));
    const originNames = t.origins.flatMap((tid) => {
      const origin = doc.origins.O[tid];
      if (!origin) return [];
      const categoryName = doc.originCategories.O[origin.type]?.name ?? "";
      return [{ categoryName, originName: origin.name }];
    });
    const isBoosterFor = Object.entries(doc.availablePurchases.O).flatMap(([keyStr, ot]) => {
      if (!ot) return [];
      return ot.boosted
        .filter((b) => b.booster === ann.id)
        .map((b) => ({ templateId: createId<TID.Purchase>(+keyStr), description: b.description }));
    });
    const purchaseAltCosts = resolveAltCostsForAction(t.alternativeCosts, doc);
    const purchasePrereqs = resolvePrerequisitesForAction(
      t.prerequisites as { type: string; id: number; positive: boolean }[] | undefined,
      doc,
    );
    return [
      {
        ...base,
        collection: "purchase",
        docTemplateId: ann.id,
        docCategoryMax: undefined,
        template,
        cost,
        subtypeName: subtype?.name ?? "",
        originNames,
        originBenefit: t.originBenefit,
        isBoosterFor,
        alternativeCosts: purchaseAltCosts,
        prerequisites: purchasePrereqs,
      },
    ];
  }
  if (ann.type === "drawback") {
    const t = doc.availableDrawbacks.O[ann.id] as DrawbackTemplate | undefined;
    if (!t) return [];
    const { bounds: _bounds, ...template } = t;
    const cost = t.cost.map((c) => ({
      amount: c.amount,
      currencyAbbrev: getDocCurrencyAbbrev(c.currency, doc.currencies),
    }));
    const drawbackAltCosts = resolveAltCostsForAction(t.alternativeCosts, doc);
    const drawbackPrereqs = resolvePrerequisitesForAction(
      t.prerequisites as { type: string; id: number; positive: boolean }[] | undefined,
      doc,
    );
    const isBoosterFor = t.capstoneBooster
      ? Object.entries(doc.availablePurchases.O).flatMap(([keyStr, ot]) => {
          if (!ot) return [];
          return ot.boosted
            .filter((b) => b.boosterKind === "drawback" && b.booster === (ann.id as number))
            .map((b) => ({ templateId: createId<TID.Purchase>(+keyStr), description: b.description }));
        })
      : [];
    return [
      {
        ...base,
        collection: "drawback",
        docTemplateId: createId<TID.Drawback>(ann.id as number),
        template,
        cost,
        alternativeCosts: drawbackAltCosts,
        prerequisites: drawbackPrereqs,
        isBoosterFor,
      },
    ];
  }
  if (ann.type === "scenarios") {
    const t = doc.availableScenarios.O[ann.id] as ScenarioTemplate | undefined;
    if (!t) return [];
    const { bounds: _bounds, ...template } = t;
    const scenarioPrereqs = resolvePrerequisitesForAction(
      t.prerequisites as { type: string; id: number; positive: boolean }[] | undefined,
      doc,
    );
    return [
      {
        ...base,
        collection: "scenario",
        docTemplateId: createId<TID.Scenario>(ann.id as number),
        template,
        prerequisites: scenarioPrereqs,
      },
    ];
  }
  if (ann.type === "companion") {
    const t = doc.availableCompanions.O[ann.id] as CompanionTemplate | undefined;
    if (!t) return [];
    const { bounds: _bounds, ...template } = t;
    const cost = t.cost.map((c) => ({
      amount: c.amount,
      currencyAbbrev: getDocCurrencyAbbrev(c.currency, doc.currencies),
    }));
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
    const originNames = (t.origins ?? []).flatMap((tid) => {
      const origin = doc.origins.O[tid];
      if (!origin) return [];
      const categoryName = doc.originCategories.O[origin.type]?.name ?? "";
      return [{ categoryName, originName: origin.name }];
    });
    const companionAltCosts = resolveAltCostsForAction(t.alternativeCosts, doc);
    return [
      {
        ...base,
        collection: "companion" as const,
        docTemplateId: createId<TID.Companion>(ann.id as number),
        template,
        cost,
        allowances,
        stipend,
        originNames,
        originBenefit: t.originBenefit,
        alternativeCosts: companionAltCosts,
      },
    ];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export type JumpDocViewerProps = {
  docId: string;
  /** Jump and character context — used to draw selection outlines on the overlay. */
  jumpId?: Id<GID.Jump>;
  charId?: Id<GID.Character>;
  /** Called when the close/hide button is pressed. */
  onClose?: () => void;
  /** Whether the viewer is in full-width expanded mode. */
  expanded?: boolean;
  /** Called to toggle full-width expanded mode. Hidden on mobile (layout concern). */
  onToggleExpand?: () => void;
  /**
   * Called when the pop-out button is pressed.
   * If omitted, the pop-out button is not shown.
   * The parent is responsible for rendering the viewer in a NewWindowPortal.
   */
  onPopOut?: () => void;
  /** Called on a leftward swipe (mobile). */
  onSwipeLeft?: () => void;
  /** Called on a rightward swipe (mobile). */
  onSwipeRight?: () => void;
  /**
   * Optional budget display rendered below the toolbar.
   * Shown when expanded, and always on mobile (where main content is hidden).
   */
  budgetSlot?: ReactNode;
};

export function JumpDocViewer({
  docId,
  jumpId,
  charId,
  onClose,
  expanded = false,
  onToggleExpand,
  onPopOut,
  budgetSlot,
  onSwipeLeft,
  onSwipeRight,
}: JumpDocViewerProps) {
  const { firebaseUser, loading: authLoading } = useCurrentUser();
  // When rendered inside a NewWindowPortal, this is the popup's document.
  // pdfjs uses ownerDocument to inject fonts — it must match where the text
  // layer spans live, otherwise PDF text renders as boxes.
  const ownerDocument = useWindowDocument();

  // ── JumpDoc loading ───────────────────────────────────────────────────────

  const [jumpDoc, setJumpDoc] = useState<JumpDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    setJumpDoc(null);
    setLoadError(null);
    useJumpDocStore.setState({ doc: undefined });

    let cancelled = false;
    (async () => {
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
        const result = await loadJumpDoc({ data: { publicUid: docId, idToken } });
        if (cancelled) return;
        const doc = result.contents as JumpDoc;
        setJumpDoc(doc);
        useJumpDocStore.getState().setDoc(doc);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load JumpDoc.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, docId]);

  // ── PDF rendering (via shared hook) ──────────────────────────────────────

  const {
    scrollRef,
    canvasRefs,
    textLayerRefs,
    pageWrapperRefs,
    ioRef,
    pages,
    zoom,
    displayScale,
    error: pdfError,
    changeZoom,
  } = usePdfRenderer({ url: jumpDoc?.url ?? null, ownerDocument });

  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [isTouchOnly, setIsTouchOnly] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (hover: none)");
    setIsTouchOnly(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchOnly(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [hoverInfo, setHoverInfo] = useState<{
    clientX: number;
    clientY: number;
    pageIdx: number;
    items: AnyAnnotation[];
  } | null>(null);

  const setPendingAction = useViewerActionStore((s) => s.setPendingAction);
  const selectedAnnotations = useJumpDocSelectedAnnotations(jumpId, charId, docId);
  const hoverCostContext = useJumpDocHoverContext(jumpId, charId);

  const swipe = useSwipe(onSwipeLeft, onSwipeRight);

  // Detect pointer:fine (mouse/trackpad) to show the pop-out button.
  // This is a capability check, not a viewport-size check.
  const [canPopOut, setCanPopOut] = useState(false);
  useEffect(() => {
    setCanPopOut(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // ── Ctrl/⌘ (text layer) and Shift (annotation overlay) hotkeys ───────────
  // Listen on the window that actually has focus — ownerDocument.defaultView
  // is the popup's window when rendered in a NewWindowPortal, otherwise the
  // main window.

  useEffect(() => {
    const win = ownerDocument.defaultView ?? window;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
      if (e.key === "Shift") setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
      if (e.key === "Shift") setShiftHeld(false);
    };
    win.addEventListener("keydown", down);
    win.addEventListener("keyup", up);
    return () => {
      win.removeEventListener("keydown", down);
      win.removeEventListener("keyup", up);
    };
  }, [ownerDocument]);

  // ── Derived annotations ───────────────────────────────────────────────────

  const annotations: FullAnnotations = jumpDoc ? extractAnnotations(jumpDoc) : {};

  function getAnnotationsAt(pageIdx: number, e: React.MouseEvent): AnyAnnotation[] {
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use display-size bounds so normalized coords are correct regardless of zoom/RENDER_SCALE.
    const nx = (e.clientX - bounds.left) / bounds.width;
    const ny = (e.clientY - bounds.top) / bounds.height;
    return (annotations[pageIdx] ?? []).filter(
      (ann) =>
        nx >= ann.rect.x &&
        nx <= ann.rect.x + ann.rect.width &&
        ny >= ann.rect.y &&
        ny <= ann.rect.y + ann.rect.height,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Note: no early returns after hook calls — the scroll container must always
  // render so that usePdfRenderer can attach touch listeners on mount.
  const isLoading = !jumpDoc && !loadError;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-tint h-full" {...swipe}>
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1 bg-surface border-b border-edge">
        {onClose && (
          <button
            title="Hide JumpDoc panel"
            onClick={onClose}
            className="flex items-center gap-1 px-1 py-0.5 rounded text-muted hover:text-ink transition-colors shrink-0"
          >
            <ArrowLeft size={13} />
            <span className="text-xs">Hide</span>
          </button>
        )}
        <span className="text-xs font-semibold text-ink truncate flex-1 min-w-0">
          {jumpDoc?.name || "JumpDoc"}
        </span>

        {onToggleExpand && (
          <button
            title={expanded ? "Collapse viewer" : "Expand viewer"}
            onClick={onToggleExpand}
            className="hidden md:flex items-center gap-1 px-1 py-0.5 rounded text-muted hover:text-ink transition-colors shrink-0"
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span className="text-xs">{expanded ? "Collapse" : "Expand"}</span>
          </button>
        )}

        {canPopOut && onPopOut && (
          <button
            title="Open JumpDoc in a new window"
            onClick={onPopOut}
            className="flex items-center gap-1 px-1 py-0.5 rounded text-muted hover:text-ink transition-colors shrink-0"
          >
            <ExternalLink size={13} />
            <span className="text-xs"></span>
          </button>
        )}

        <div className="flex items-center shrink-0">
          <button
            onClick={() => changeZoom((z) => z - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            className="px-1.5 py-1 rounded text-xs text-muted hover:text-ink hover:bg-tint disabled:opacity-40"
          >
            −
          </button>
          <span className="text-xs text-muted w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => changeZoom((z) => z + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            className="px-1.5 py-1 rounded text-xs text-muted hover:text-ink hover:bg-tint disabled:opacity-40"
          >
            +
          </button>
        </div>

        <div className="w-px h-5 bg-edge shrink-0" />
        <span className="text-xs text-ghost shrink-0">
          Shift: annotations · Ctrl/⌘: select text
        </span>
      </div>

      {/* ── PDF pages ── */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Budget row — shown when expanded or on mobile (where main content is hidden) */}
        {budgetSlot && (
          <div
            className={`flex bg-accent-ring items-center w-max gap-2 p-2 rounded-br absolute top-0 left-0 z-10 ${expanded ? "" : "md:hidden"} text-surface`}
          >
            <span className="text-xs font-medium shrink-0">Budget:</span>
            {budgetSlot}
          </div>
        )}

        {/* Touch-only: hold to show annotations — bottom-left, matches budget bar style */}
        {isTouchOnly && (
          <button
            type="button"
            onPointerDown={() => setShiftHeld(true)}
            onPointerUp={() => setShiftHeld(false)}
            onPointerLeave={() => setShiftHeld(false)}
            onPointerCancel={() => setShiftHeld(false)}
            className={`absolute bottom-10 left-0 z-10 p-4 rounded-tr transition-colors text-surface ${
              shiftHeld ? "bg-accent" : "bg-accent-ring"
            }`}
            aria-label="Hold to show annotations"
          >
            <Eye size={28} />
          </button>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto relative">
          {loadError && <div className="p-8 text-center text-danger text-sm">{loadError}</div>}
          {isLoading && <div className="p-8 text-center text-muted text-sm">Loading JumpDoc…</div>}
          {pdfError && <div className="p-8 text-center text-danger text-sm">{pdfError}</div>}

          {!loadError && !isLoading && !pdfError && pages.length === 0 && (
            <div className="p-8 text-center text-muted text-sm">Loading PDF…</div>
          )}

          <div className="flex flex-col items-center py-4 gap-4 min-w-fit">
            {pages.map((pageInfo, pageIdx) => {
              const pageAnnotations = annotations[pageIdx] ?? [];

              return (
                // Outer wrapper sized at display dimensions (CSS-scaled).
                <div
                  key={pageIdx}
                  ref={(el) => {
                    pageWrapperRefs.current[pageIdx] = el;
                    if (el) ioRef.current?.observe(el);
                  }}
                  data-page-idx={pageIdx}
                  className="relative shadow-lg overflow-hidden"
                  style={{
                    width: pageInfo.width * displayScale,
                    height: pageInfo.height * displayScale,
                    cursor: ctrlHeld ? "text" : hoverInfo ? "pointer" : "default",
                  }}
                  onMouseMove={(e) => {
                    if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
                    const hits = getAnnotationsAt(pageIdx, e);
                    if (hits.length > 0) {
                      setHoverInfo({
                        clientX: e.clientX,
                        clientY: e.clientY,
                        pageIdx,
                        items: hits,
                      });
                    } else {
                      setHoverInfo(null);
                    }
                  }}
                  onMouseLeave={() => setHoverInfo(null)}
                  onContextMenu={(e) => {
                    if (ctrlHeld) return; // allow native context menu when Ctrl is held
                    e.preventDefault();
                    const hits = getAnnotationsAt(pageIdx, e);
                    if (hits.length === 0) return;
                    const doc = jumpDoc!;
                    const actions = hits.flatMap((ann) => buildAnnotationActions(ann, docId, doc));
                    if (actions.length === 0) return;
                    setPendingAction(actions, true);
                  }}
                  onClick={(e) => {
                    const hits = getAnnotationsAt(pageIdx, e);
                    if (hits.length === 0) return;
                    const doc = jumpDoc!;
                    const actions = hits.flatMap((ann) => buildAnnotationActions(ann, docId, doc));
                    if (actions.length === 0) return;
                    const isTouch = (e.nativeEvent as PointerEvent).pointerType === "touch";
                    if (isTouch) setHoverInfo(null);
                    setPendingAction(actions, false, isTouch);
                  }}
                >
                  {/* Inner content at render resolution, CSS-scaled to display size. */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: pageInfo.width,
                      height: pageInfo.height,
                      transform: `scale(${displayScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[pageIdx] = el;
                      }}
                      width={pageInfo.width}
                      height={pageInfo.height}
                      style={{ display: "block", pointerEvents: "none" }}
                    />

                    {/* Text layer — transparent text spans for selection/copy */}
                    <div
                      ref={(el) => {
                        textLayerRefs.current[pageIdx] = el;
                      }}
                      className={`textLayer absolute inset-0 overflow-hidden select-text ${
                        ctrlHeld ? "" : "pointer-events-none invisible"
                      }`}
                      style={{ "--total-scale-factor": RENDER_SCALE } as React.CSSProperties}
                    />
                    {/* Selection + hover overlay — dotted accent2 rects; hidden while Shift is held */}
                    {!shiftHeld &&
                      !ctrlHeld &&
                      (() => {
                        const firstHovered = hoverInfo?.items[0];
                        const hoveredKeys = firstHovered
                          ? new Set([annotationKey(firstHovered)])
                          : null;
                        const hasSelected = pageAnnotations.some(
                          (ann) =>
                            ann.type != "origin-option" &&
                            ann.type != "origin-randomizer" &&
                            selectedAnnotations.has(annotationKey(ann)),
                        );
                        const hasHover = !!hoveredKeys?.size;
                        if (!hasSelected && !hasHover) return null;
                        return (
                          <svg
                            className="absolute inset-0 pointer-events-none"
                            width={pageInfo.width}
                            height={pageInfo.height}
                          >
                            {pageAnnotations.map((ann, i) => {
                              const key = annotationKey(ann);
                              // origin-options are never highlighted as "selected" — only on hover,
                              // and only the exact rect under the cursor (not all rects sharing the key).
                              // Rect-coordinate matching is used because annotations are recreated on
                              // every render so object identity is not reliable.
                              const isSelected =
                                ann.type !== "origin-option" && selectedAnnotations.has(key);
                              const isHovered =
                                ann.type === "origin-option"
                                  ? hoverInfo?.pageIdx === pageIdx &&
                                    hoverInfo.items[0]?.type === "origin-option" &&
                                    hoverInfo.items[0].rect.x === ann.rect.x &&
                                    hoverInfo.items[0].rect.y === ann.rect.y &&
                                    hoverInfo.items[0].rect.width === ann.rect.width &&
                                    hoverInfo.items[0].rect.height === ann.rect.height
                                  : (hoveredKeys?.has(key) ?? false);
                              if (!isSelected && !isHovered) return null;
                              const bx = ann.rect.x * pageInfo.width;
                              const by = ann.rect.y * pageInfo.height;
                              const bw = ann.rect.width * pageInfo.width;
                              const bh = ann.rect.height * pageInfo.height;
                              return (
                                <SelectionRect
                                  key={i}
                                  bx={bx}
                                  by={by}
                                  bw={bw}
                                  bh={bh}
                                  isSelected={isSelected}
                                />
                              );
                            })}
                          </svg>
                        );
                      })()}

                    {/* Annotation overlay — visible only while Shift is held */}
                    {shiftHeld && pageAnnotations.length > 0 && (
                      <svg
                        className="absolute inset-0 pointer-events-none"
                        width={pageInfo.width}
                        height={pageInfo.height}
                      >
                        {pageAnnotations.map((ann, i) => {
                          const bx = ann.rect.x * pageInfo.width;
                          const by = ann.rect.y * pageInfo.height;
                          const bw = ann.rect.width * pageInfo.width;
                          const bh = ann.rect.height * pageInfo.height;
                          return (
                            <g key={i}>
                              <rect
                                x={bx}
                                y={by}
                                width={bw}
                                height={bh}
                                fill={ann.color}
                                fillOpacity={0.15}
                                stroke={ann.color}
                                strokeOpacity={0.7}
                                strokeWidth={1.5}
                              />
                              <text
                                x={bx + 3}
                                y={by + 11}
                                fontSize={10}
                                fill={ann.color}
                                fillOpacity={0.9}
                                style={{ userSelect: "none", fontFamily: "sans-serif" }}
                              >
                                {ann.label.length > 22 ? ann.label.slice(0, 20) + "…" : ann.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    )}
                  </div>
                  {/* end inner scale container */}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Annotation hover tooltip ── */}
      {hoverInfo && (
        <div
          className="fixed z-50 pointer-events-none flex flex-col gap-0.5 select-none"
          style={{ left: hoverInfo.clientX + 14, top: hoverInfo.clientY + 14 }}
        >
          {hoverInfo.items.map((ann, i) => {
            const { typeName, costStr } = getAnnotationDisplay(ann, jumpDoc!, hoverCostContext);
            const qualified = isAnnotationQualified(ann, jumpDoc!, hoverCostContext);
            return (
              <div
                key={i}
                className="px-2 py-1 rounded text-xs text-accent2 bg-accent2-tint border border-accent2 max-w-60"
                style={{
                  opacity: qualified ? 1 : 0.9,
                  filter: qualified ? undefined : "grayscale(1)",
                }}
              >
                <span className="font-semibold">
                  {qualified
                    ? `${stripTemplating(typeName)} ${costStr ? ` [${costStr}]` : ""}:`
                    : "Restricted:"}
                </span>{" "}
                {ann.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
