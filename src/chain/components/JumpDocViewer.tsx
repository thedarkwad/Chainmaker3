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
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { useSwipe } from "@/ui/useSwipe";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
} from "lucide-react";
import {
  usePdfRenderer,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  RENDER_SCALE,
} from "@/ui/usePdfRenderer";
import { loadJumpDoc } from "@/api/jumpdocs";
import { useCurrentUser } from "@/app/state/auth";
import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";
import {
  stripTemplating,
  type Annotation,
  type AnnotationType,
  type BasicPurchaseTemplate,
  type DocOriginCategory,
  type FullAnnotations,
  type JumpDoc,
} from "@/chain/data/JumpDoc";
import { useWindowDocument } from "@/ui/WindowDocumentContext";
import {
  type AnnotationInteraction,
  useViewerActionStore,
} from "@/chain/state/ViewerActionStore";
import {
  AnnotationInteractionHandler,
  companionImportInteraction,
  currencyExchangeInteraction,
  originInteraction,
  purchaseInteraction,
  randomizerInteraction,
  scenarioInteraction,
  useJumpDocInternalTags,
  type InternalTagsMap,
} from "./AnnotationInteractionHandler";
import {
  useAddCurrencyExchangeFromDoc,
  useRemoveCurrencyExchangeFromDoc,
  useCurrencies,
  useJumpOriginCategories,
  useJumpOrigins,
  usePurchaseSubtypes,
  setTracked,
} from "@/chain/state/hooks";
import {
  createId,
  Id,
  TID,
  type GID,
  type LID,
  type PartialLookup,
  type Registry,
} from "../data/types";
import type {
  Currency,
  CurrencyExchange,
  Origin,
  OriginCategory,
} from "../data/Jump";
import { preprocessJumpDoc } from "../data/JumpDoc";

export function resolveJumpCurrency(
  abbrev: string,
  currencies: Registry<LID.Currency, Currency> | undefined,
): Id<LID.Currency> {
  for (const [idStr, c] of Object.entries(currencies?.O ?? {})) {
    if (c?.abbrev === abbrev) return createId<LID.Currency>(+idStr);
  }
  return createId<LID.Currency>(0);
}


// ─────────────────────────────────────────────────────────────────────────────
// Origin TID backfill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a JumpDoc origin template name into a regex that will match a stored
 * origin summary where user-fillable `${}` / `$${}` placeholders have been
 * replaced with the user's actual text.
 */
function templateNameToRegex(name: string): RegExp {
  const pattern = name
    .split(/\$\$?\{[^}]+\}/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".+");
  return new RegExp(`^${pattern}$`, "i");
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotation extraction
// ─────────────────────────────────────────────────────────────────────────────

type AnyAnnotation = FullAnnotations[number][number];

/**
 * Stable key used for hover/selection matching.
 * - "origin" keys by TID (`origin:${ann.id}`), matching `origin.template?.id` in buildData.
 * - "origin-option" keys by label since it has no direct origin TID.
 * - Everything else keys by type + numeric id.
 */
function annotationKey(ann: AnyAnnotation): string {
  if (ann.type === "origin") return `origin:${ann.id}`;
  if (ann.type === "origin-option") return `origin-option:${ann.label}`;
  if (ann.type === "currency-exchange")
    return `currency-exchange:${ann.docIndex}`;
  return `${ann.type}:${ann.id}`;
}

function extractAnnotations(doc: JumpDoc): FullAnnotations {
  const out: FullAnnotations = {};

  function push<T extends keyof AnnotationType>(
    page: number,
    ann: Annotation<T>,
  ) {
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
      push(page, {
        type: "origin",
        id: +idStr as never,
        rect,
        label: t.name,
        color: "#22c55e",
      });
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
      push(page, {
        type: "purchase",
        id: +idStr as never,
        rect,
        label: t.name,
        color,
      });
  }

  for (const [idStr, t] of Object.entries(doc.availableDrawbacks.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, {
        type: "drawback",
        id: +idStr as never,
        rect,
        label: t.name,
        color: "#ef4444",
      });
  }

  for (const [idStr, t] of Object.entries(doc.availableScenarios.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, {
        type: "scenarios",
        id: +idStr as never,
        rect,
        label: t.name,
        color: "#a855f7",
      });
  }

  for (const [idStr, t] of Object.entries(doc.availableCompanions.O)) {
    if (!t) continue;
    for (const { page, ...rect } of t.bounds ?? [])
      push(page, {
        type: "companion",
        id: +idStr as never,
        rect,
        label: t.name,
        color: "#06b6d4",
      });
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
// Annotation → interaction builder (shared between left-click and right-click)
// ─────────────────────────────────────────────────────────────────────────────

function buildAnnotationInteractions(
  ann: AnyAnnotation,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: InternalTagsMap,
): AnnotationInteraction<object>[] {
  if (ann.type === "purchase") {
    const t = doc.availablePurchases.O[ann.id] as
      | BasicPurchaseTemplate
      | undefined;
    if (!t) return [];
    return [
      purchaseInteraction("purchase", t, doc, jumpId, charId, internalTags) as any,
    ];
  }
  if (ann.type === "drawback") {
    const t = doc.availableDrawbacks.O[ann.id];
    if (!t) return [];
    return [
      purchaseInteraction("drawback", t, doc, jumpId, charId, internalTags) as any,
    ];
  }
  if (ann.type === "scenarios") {
    const t = doc.availableScenarios.O[ann.id];
    if (!t) return [];
    return [scenarioInteraction(t, doc, jumpId, charId, internalTags) as any];
  }
  if (ann.type === "companion") {
    const t = doc.availableCompanions.O[ann.id];
    if (!t) return [];
    return [
      companionImportInteraction(t, doc, jumpId, charId, internalTags) as any,
    ];
  }
  if (ann.type === "origin") {
    const t = doc.origins.O[ann.id];
    return [originInteraction(t, {}, doc, jumpId, charId) as any];
  }
  if (ann.type === "origin-option") {
    const optionIndices: PartialLookup<TID.OriginCategory, number[]> = {
      [ann.id]: [ann.index],
    } as any;
    return [
      originInteraction(
        undefined,
        optionIndices,
        doc,
        jumpId,
        charId,
      ) as any,
    ];
  }
  if (ann.type === "origin-randomizer") {
    const cat = doc.originCategories.O[ann.id] as DocOriginCategory | undefined;
    if (!cat || cat.singleLine) return [];
    return [
      randomizerInteraction(ann.id, doc, jumpId, charId) as any,
    ];
  }
  if (ann.type === "currency-exchange") {
    return [currencyExchangeInteraction(ann, doc, jumpId, charId) as any];
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
  currencyExchanges?: CurrencyExchange[];
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
  currencyExchanges,
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
  // In Electron, loadJumpDoc returns a pdfUrl (file:// temp path) that overrides doc.url.
  const [pdfUrlOverride, setPdfUrlOverride] = useState<string | null>(null);

  const [currencySidebarOpen, setCurrencySidebarOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    setJumpDoc(null);
    setLoadError(null);
    setPdfUrlOverride(null);
    useJumpDocStore.setState({ doc: undefined });
//TODO: multiple work tag
    let cancelled = false;
    (async () => {
      try {
        const idToken = firebaseUser
          ? await firebaseUser.getIdToken()
          : undefined;
        const result = await loadJumpDoc({
          data: { publicUid: docId, idToken },
        });
        if (cancelled) return;
        const doc = preprocessJumpDoc(result.contents as JumpDoc);
        setPdfUrlOverride((result as { pdfUrl?: string }).pdfUrl ?? null);
        setJumpDoc(doc);
        useJumpDocStore.getState().setDoc(doc);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load JumpDoc.",
        );
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
  } = usePdfRenderer({
    url: pdfUrlOverride ?? jumpDoc?.url ?? null,
    ownerDocument,
  });

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

  const enqueueInteractions = useViewerActionStore(s => s.enqueueInteractions);
  const buildData = useViewerActionStore(s => s.buildData);
  const { origins, setOrigins } = useJumpOrigins(jumpId!, charId!);
  const originCategoriesReg = useJumpOriginCategories(jumpId!);
  const purchaseSubtypesReg = usePurchaseSubtypes(jumpId);

  const selectedAnnotations = useMemo(() => {
    const set = new Set<string>();
    if (buildData) {
      for (const id in buildData.purchases) set.add(`purchase:${id}`);
      for (const id in buildData.drawbacks) set.add(`drawback:${id}`);
      for (const id in buildData.scenarios) set.add(`scenarios:${id}`);
      for (const id in buildData.companionImports) set.add(`companion:${id}`);
    }
    for (const originArr of Object.values(origins ?? {})) {
      for (const origin of originArr as Origin[]) {
        if (origin.template?.id != null)
          set.add(`origin:${origin.template.id}`);
      }
    }
    return set;
  }, [buildData, origins]);

  const swipe = useSwipe(onSwipeLeft, onSwipeRight);

  // Detect pointer:fine (mouse/trackpad) to show the pop-out button.
  // This is a capability check, not a viewport-size check.
  const [canPopOut, setCanPopOut] = useState(false);
  useEffect(() => {
    setCanPopOut(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // ── Ctrl (text layer) and Shift (annotation overlay) hotkeys ───────────
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

  const addFromDoc = useAddCurrencyExchangeFromDoc(jumpId!, charId!);
  const removeDocExchange = useRemoveCurrencyExchangeFromDoc(jumpId!, charId!);
  let currencies = useCurrencies(jumpId);
  const internalTags = useJumpDocInternalTags(jumpDoc);

  // ── Origin TID & PurchaseSubtype backfill ───────────────────────────────────────────────────

  useEffect(() => {
    if (!jumpDoc || jumpId === undefined || charId === undefined) return;

    // Build map from regex → TID for doc origin categories (for category backfill).
    const docCatByRegex = new Map<RegExp, Id<TID.OriginCategory>>();
    for (const [tidStr, cat] of Object.entries(jumpDoc.originCategories.O)) {
      if (!cat) continue;
      docCatByRegex.set(
        templateNameToRegex(cat.name),
        createId<TID.OriginCategory>(+tidStr),
      );
    }

    // Build map from TID.OriginCategory → candidate { tid, regex } pairs for origins.
    const categoryCandidates = new Map<
      Id<TID.OriginCategory>,
      { tid: Id<TID.Origin>; regex: RegExp }[]
    >();
    for (const [tidStr, template] of Object.entries(jumpDoc.origins.O)) {
      if (!template) continue;
      const tid = createId<TID.Origin>(+tidStr);
      const catTid = template.type;
      const list = categoryCandidates.get(catTid) ?? [];
      list.push({ tid, regex: templateNameToRegex(template.name) });
      categoryCandidates.set(catTid, list);
    }

    // Collect category TID assignments for categories without template.id.
    const catAssignments: {
      lid: Id<LID.OriginCategory>;
      tid: Id<TID.OriginCategory>;
    }[] = [];
    for (const lidStr in originCategoriesReg?.O ?? {}) {
      const lid = createId<LID.OriginCategory>(+lidStr);
      const cat = originCategoriesReg?.O[lid];
      if (!cat) continue;
      if (cat.template?.id !== undefined) continue;
      for (const [regex, tid] of docCatByRegex) {
        if (regex.test(cat.name)) {
          catAssignments.push({ lid, tid });
          break;
        }
      }
    }

    // Collect origin TID assignments for origins without template.id.
    const assignments: {
      lid: Id<LID.OriginCategory>;
      index: number;
      tid: Id<TID.Origin>;
    }[] = [];
    for (const lidStr in origins) {
      const lid = createId<LID.OriginCategory>(+lidStr);
      const catTid =
        originCategoriesReg?.O[lid]?.template?.id ??
        catAssignments.find(a => a.lid === lid)?.tid;
      if (catTid === undefined) continue;
      const candidates = categoryCandidates.get(catTid);
      if (!candidates) continue;
      const originArr = origins[lid];
      if (!originArr) continue;
      for (let index = 0; index < originArr.length; index++) {
        const origin = originArr[index]!;
        if (origin.template?.id !== undefined) continue;
        const matched = candidates.find(c => c.regex.test(origin.summary));
        if (matched) assignments.push({ lid, index, tid: matched.tid });
      }
    }

    // Collect purchase subtype assignments
    const subtypeAssignments: {
      lid: Id<LID.PurchaseSubtype>;
      tid: Id<TID.PurchaseSubtype>;
    }[] = [];
    for (const lidStr in purchaseSubtypesReg?.O ?? {}) {
      const lid = createId<LID.PurchaseSubtype>(+lidStr);
      const subtype = purchaseSubtypesReg?.O[lid];
      if (!subtype || subtype.templateId !== undefined) continue;
      for (const [tidStr, docSubtype] of Object.entries(
        jumpDoc.purchaseSubtypes.O,
      )) {
        if (!docSubtype) continue;
        if (docSubtype.name.trim() == subtype.name.trim()) {
          subtypeAssignments.push({
            lid,
            tid: createId<TID.PurchaseSubtype>(+tidStr),
          });
          break;
        }
      }
    }

    if (
      assignments.length === 0 &&
      catAssignments.length === 0 &&
      subtypeAssignments.length === 0
    )
      return;

    setOrigins(
      draft => {
        for (const { lid, index, tid } of assignments) {
          const origin = draft[lid]?.[index];
          if (origin) origin.template = { jumpdoc: docId, id: tid };
        }
      },
      c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        for (const { lid, tid } of catAssignments) {
          const cat = jump.originCategories.O[lid];
          if (cat) cat.template = { jumpdoc: "", id: tid };
        }
        for (const { lid, tid } of subtypeAssignments) {
          const st = jump.purchaseSubtypes.O[lid];
          if (st) st.templateId = tid;
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpDoc]);

  // ── Derived annotations ───────────────────────────────────────────────────

  const annotations = useMemo<FullAnnotations>(
    () => (jumpDoc ? extractAnnotations(jumpDoc) : {}),
    [jumpDoc],
  );

  type TooltipInfo = { typeName: string; costStr?: string; qualified: boolean };
  const tooltipMap = useMemo<Map<string, TooltipInfo>>(() => {
    const map = new Map<string, TooltipInfo>();
    if (
      !jumpDoc ||
      !buildData ||
      jumpId === undefined ||
      charId === undefined
    )
      return map;
    for (const anns of Object.values(annotations)) {
      for (const ann of anns ?? []) {
        const key = annotationKey(ann);
        if (map.has(key)) continue;
        const interactions = buildAnnotationInteractions(
          ann,
          jumpDoc,
          jumpId,
          charId,
          internalTags,
        );
        if (interactions.length === 0) continue;
        const ix = interactions[0]!;
        const state = ix.initialize(buildData);
        const qualified = ix.error(buildData) === undefined;
        const raw = ix.shortCostStr ?? ix.costStr;
        const costStr = typeof raw === "function" ? raw(buildData, state) : raw;
        map.set(key, { typeName: ix.typeName, costStr, qualified });
      }
    }
    return map;
  }, [buildData, annotations]);

  function getAnnotationsAt(
    pageIdx: number,
    e: React.MouseEvent,
  ): AnyAnnotation[] {
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use display-size bounds so normalized coords are correct regardless of zoom/RENDER_SCALE.
    const nx = (e.clientX - bounds.left) / bounds.width;
    const ny = (e.clientY - bounds.top) / bounds.height;
    return (annotations[pageIdx] ?? []).filter(
      ann =>
        nx >= ann.rect.x &&
        nx <= ann.rect.x + ann.rect.width &&
        ny >= ann.rect.y &&
        ny <= ann.rect.y + ann.rect.height,
    );
  }

  // ── CurrencyExchanges
  let currencyExchangeUsage =
    jumpDoc?.availableCurrencyExchanges?.map((ex, i) =>
      (currencyExchanges ?? [])
        .filter(lex => lex.templateIndex == i)
        .reduce((n, lex) => n + Math.floor(lex.oamount / ex.oamount), 0),
    ) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  // Note: no early returns after hook calls — the scroll container must always
  // render so that usePdfRenderer can attach touch listeners on mount.
  const isLoading = !jumpDoc && !loadError;

  return (
    <>
      {/* Handles annotation clicks from the JumpDoc viewer (inline or popped-out). */}
      {jumpId != undefined && charId != undefined && jumpDoc != undefined && (
        <AnnotationInteractionHandler
          jumpId={jumpId}
          charId={charId}
          doc={jumpDoc}
          internalTags={internalTags}
        />
      )}
      <div
        className="flex-1 flex flex-col overflow-hidden bg-tint h-full"
        {...swipe}
      >
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
              <span className="text-xs">
                {expanded ? "Collapse" : "Expand"}
              </span>
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
              onClick={() => changeZoom(z => z - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="px-1.5 py-1 rounded text-xs text-muted hover:text-ink hover:bg-tint disabled:opacity-40"
            >
              −
            </button>
            <span className="text-xs text-muted w-9 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => changeZoom(z => z + ZOOM_STEP)}
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

          {jumpDoc?.availableCurrencyExchanges?.some(ex => ex.sidebar) && (
            <div
              className={`flex flex-col bg-accent-ring w-max text-xs gap-2 p-2 rounded-b absolute top-0 right-5 z-10 text-surface ${!currencySidebarOpen && "opacity-70"}`}
            >
              <button
                className="flex items-center justify-end font-medium shrink-0"
                onClick={() => setCurrencySidebarOpen(s => !s)}
              >
                Exchange Currencies
                {currencySidebarOpen ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              {currencySidebarOpen &&
                jumpDoc?.availableCurrencyExchanges?.map?.(
                  (ex, i) =>
                    ex.sidebar && (
                      <div
                        key={i}
                        className="flex flex-col justify-center items-center gap-0.5"
                      >
                        <span className="flex flex-row gap-1.5 items-center">
                          <span className="opacity-80">Exchanging </span>
                          <span className="font-semibold">
                            {currencyExchangeUsage[i] * ex.oamount}{" "}
                            {jumpDoc.currencies.O[ex.oCurrency].abbrev}
                          </span>{" "}
                          <span className="opacity-80">for </span>
                          <span className="font-semibold">
                            {currencyExchangeUsage[i] * ex.tamount}{" "}
                            {jumpDoc.currencies.O[ex.tCurrency].abbrev}
                          </span>
                        </span>
                        <div className="flex gap-3 text-[10px]">
                          <button
                            className="flex gap-0.5 items-center opacity-50 hover:opacity-100"
                            onClick={() =>
                              addFromDoc({
                                oamount: ex.oamount,
                                tamount: ex.tamount,
                                oCurrency: resolveJumpCurrency(
                                  jumpDoc.currencies.O[ex.oCurrency].abbrev,
                                  currencies,
                                ),
                                tCurrency: resolveJumpCurrency(
                                  jumpDoc.currencies.O[ex.tCurrency].abbrev,
                                  currencies,
                                ),
                                templateIndex: i,
                              })
                            }
                          >
                            <Plus size={14} /> {ex.oamount}{" "}
                            {jumpDoc.currencies.O[ex.oCurrency].abbrev}
                          </button>
                          <button
                            className="flex gap-0.5 items-center opacity-50 hover:opacity-100"
                            onClick={() =>
                              removeDocExchange({
                                oamount: ex.oamount,
                                tamount: ex.tamount,
                                templateIndex: i,
                              })
                            }
                          >
                            <Minus size={14} />
                            {ex.oamount}{" "}
                            {jumpDoc.currencies.O[ex.oCurrency].abbrev}
                          </button>
                        </div>
                      </div>
                    ),
                )}
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
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto relative"
          >
            {loadError && (
              <div className="p-8 text-center text-danger text-sm">
                {loadError}
              </div>
            )}
            {isLoading && (
              <div className="p-8 text-center text-muted text-sm">
                Loading JumpDoc…
              </div>
            )}
            {pdfError && (
              <div className="p-8 text-center text-danger text-sm">
                {pdfError}
              </div>
            )}

            {!loadError && !isLoading && !pdfError && pages.length === 0 && (
              <div className="p-8 text-center text-muted text-sm">
                Loading PDF…
              </div>
            )}

            <div className="flex flex-col items-center py-4 gap-4 min-w-fit">
              {pages.map((pageInfo, pageIdx) => {
                const pageAnnotations = annotations[pageIdx] ?? [];

                return (
                  // Outer wrapper sized at display dimensions (CSS-scaled).
                  <div
                    key={pageIdx}
                    ref={el => {
                      pageWrapperRefs.current[pageIdx] = el;
                      if (el) ioRef.current?.observe(el);
                    }}
                    data-page-idx={pageIdx}
                    className="relative shadow-lg overflow-hidden"
                    style={{
                      width: pageInfo.width * displayScale,
                      height: pageInfo.height * displayScale,
                      cursor: ctrlHeld
                        ? "text"
                        : hoverInfo
                          ? "pointer"
                          : "default",
                    }}
                    onMouseMove={e => {
                      if (
                        (e.nativeEvent as PointerEvent).pointerType === "touch"
                      )
                        return;
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
                    onClick={e => {
                      if (
                        jumpId === undefined ||
                        charId === undefined
                      )
                        return;
                      const hits = getAnnotationsAt(pageIdx, e);
                      if (hits.length === 0) return;
                      const doc = jumpDoc!;
                      const originHits = hits.filter(
                        a => a.type === "origin" || a.type === "origin-option",
                      );
                      const otherHits = hits.filter(
                        a => a.type !== "origin" && a.type !== "origin-option",
                      );
                      const interactions = otherHits.flatMap(ann =>
                        buildAnnotationInteractions(
                          ann,
                          doc,
                          jumpId,
                          charId,
                          internalTags,
                        ),
                      );
                      if (originHits.length > 0) {
                        const optionIndices: PartialLookup<
                          TID.OriginCategory,
                          number[]
                        > = {};
                        for (const a of originHits) {
                          if (a.type !== "origin-option") continue;
                          const cat = a as {
                            type: "origin-option";
                            id: Id<TID.OriginCategory>;
                            index: number;
                          };
                          if (!optionIndices[cat.id])
                            (optionIndices as any)[cat.id as number] = [];
                          (optionIndices[cat.id] as number[]).push(cat.index);
                        }
                        const originTemplates = originHits
                          .filter(a => a.type === "origin")
                          .map(a => doc.origins.O[a.id as Id<TID.Origin>]);
                        if (originTemplates.length > 0) {
                          for (const t of originTemplates)
                            interactions.push(
                              originInteraction(
                                t,
                                optionIndices,
                                doc,
                                jumpId,
                                charId
                              ) as any,
                            );
                        } else {
                          interactions.push(
                            originInteraction(
                              undefined,
                              optionIndices,
                              doc,
                              jumpId,
                              charId
                            ) as any,
                          );
                        }
                      }
                      if (interactions.length === 0) return;
                      const isTouch =
                        (e.nativeEvent as PointerEvent).pointerType === "touch";
                      if (isTouch) setHoverInfo(null);
                      enqueueInteractions(interactions);
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
                        ref={el => {
                          canvasRefs.current[pageIdx] = el;
                        }}
                        width={pageInfo.width}
                        height={pageInfo.height}
                        style={{ display: "block", pointerEvents: "none" }}
                      />

                      {/* Text layer — transparent text spans for selection/copy */}
                      <div
                        ref={el => {
                          textLayerRefs.current[pageIdx] = el;
                        }}
                        className={`textLayer absolute inset-0 overflow-hidden select-text ${
                          ctrlHeld ? "" : "pointer-events-none invisible"
                        }`}
                        style={
                          {
                            "--total-scale-factor": RENDER_SCALE,
                          } as React.CSSProperties
                        }
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
                            ann =>
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
                                  ann.type !== "origin-option" &&
                                  selectedAnnotations.has(key);
                                const isHovered =
                                  ann.type === "origin-option"
                                    ? hoverInfo?.pageIdx === pageIdx &&
                                      hoverInfo.items[0]?.type ===
                                        "origin-option" &&
                                      hoverInfo.items[0].rect.x ===
                                        ann.rect.x &&
                                      hoverInfo.items[0].rect.y ===
                                        ann.rect.y &&
                                      hoverInfo.items[0].rect.width ===
                                        ann.rect.width &&
                                      hoverInfo.items[0].rect.height ===
                                        ann.rect.height
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
                                  style={{
                                    userSelect: "none",
                                    fontFamily: "sans-serif",
                                  }}
                                >
                                  {ann.label.length > 22
                                    ? ann.label.slice(0, 20) + "…"
                                    : ann.label}
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
            style={{
              left: hoverInfo.clientX + 14,
              top: hoverInfo.clientY + 14,
            }}
          >
            {hoverInfo.items.map((ann, i) => {
              const info = tooltipMap.get(annotationKey(ann));
              const typeName = info?.typeName;
              const costStr = info?.costStr;
              const qualified = info?.qualified ?? true;
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
                      ? `${typeName}${costStr ? ` [${costStr}]` : ""}:`
                      : "Restricted:"}
                  </span>{" "}
                  {ann.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
