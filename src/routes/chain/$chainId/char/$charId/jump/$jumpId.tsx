import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookOpen, ChevronRight, ExternalLink, GripVertical, Plus, Trash2, X } from "lucide-react";
import React, { memo, useEffect, useRef, useState } from "react";

import type { Budget } from "@/chain/data/CalculatedData";
import type { Currency, Jump, PurchaseSubtype } from "@/chain/data/Jump";
import { CompanionAccess, type ChainSupplement } from "@/chain/data/ChainSupplement";
import { createId, type GID, type Id, type LID, type Lookup } from "@/chain/data/types";
import {
  useAddJump,
  useAddJumpFromDoc,
  useBudget,
  useChain,
  useCharacter,
  useCharacterList,
  useDeduplicateJumpPurchases,
  useDeleteJump,
  useJumpList,
  useJumpAccess,
  useJumpDocId,
  useJumpNumbers,
  useJumpTree,
  useChainName,
  useReorderJumps,
  useChainSettingsConfig,
  useSupplementAccess,
} from "@/chain/state/hooks";
import { useChainStore } from "@/chain/state/Store";
import type { JumpDoc } from "@/chain/data/JumpDoc";
import { loadJumpDoc, type JumpDocSummary } from "@/api/jumpdocs";
import { JumpDocGallery } from "@/app/components/JumpDocGallery";
import { JumpDocViewer } from "@/chain/components/JumpDocViewer";
import { AnnotationInteractionHandler } from "@/chain/components/AnnotationInteractionHandler";
import { ElectronChainNav } from "@/chain/components/ElectronChainNav";
import { useViewerActionStore } from "@/chain/state/ViewerActionStore";
import { NewWindowPortal } from "@/ui/NewWindowPortal";
import Swal from "sweetalert2";
import { Scrollbar } from "react-scrollbars-custom";
import { JumpSourceType } from "@/chain/data/Jump";
import { TabList, type TabDef } from "@/ui/TabList";
import {
  synchronizeBudget,
  synchronizeRetainedDrawbacks,
  synchronizeChainDrawbacks,
  synchronizeSupplementInvestments,
  synchronizeGrossSupplementStipend,
  synchronizeBank,
} from "@/chain/state/calculations";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId")({
  component: JumpLayout,
  validateSearch: (search: Record<string, unknown>) => {
    const hv =
      search.hideViewer === true || search.hideViewer === "true" || search.hideViewer === "1";
    return hv ? { hideViewer: true as const } : ({} as { hideViewer?: true });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTabs(
  jump: Jump | undefined,
  supplements: Record<string, ChainSupplement | undefined>,
  routeParams: { chainId: string; charId: string; jumpId: string },
  isPrimary: boolean,
  jumpGid: Id<GID.Jump>,
  supplementAccess: Lookup<GID.Supplement, Set<number>> | undefined,
  displayJumpNumber: number,
  hasJumpAccess: boolean,
): TabDef[] {
  const base = routeParams;

  // Non-supplement tabs are dimmed whenever the character lacks jump access.
  const dimBaseTabs = !hasJumpAccess;

  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Overview",
      to: "/chain/$chainId/char/$charId/jump/$jumpId/",
      params: base,
      dimmed: dimBaseTabs || undefined,
    },
    {
      key: "purchases",
      label: "Perks & Items",
      to: "/chain/$chainId/char/$charId/jump/$jumpId/purchases",
      params: base,
      dimmed: dimBaseTabs || undefined,
    },
    {
      key: "drawbacks",
      label: "Drawbacks & Scenarios",
      to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks",
      params: base,
      dimmed: dimBaseTabs || undefined,
    },
  ];

  // One tab per route-placement purchase subtype on this jump.
  if (jump) {
    for (const [id, subtype] of Object.entries(jump.purchaseSubtypes.O) as [
      string,
      PurchaseSubtype | undefined,
    ][]) {
      if (subtype?.placement === "route") {
        tabs.push({
          key: `subsystem/${id}`,
          label: subtype.name,
          to: "/chain/$chainId/char/$charId/jump/$jumpId/subsystem/$subtypeId",
          params: { ...base, subtypeId: id },
          dimmed: dimBaseTabs || undefined,
        });
      }
    }
  }

  // One tab per supplement, with access-based visibility/dimming.
  for (const [id, sup] of Object.entries(supplements)) {
    if (!sup) continue;
    const suppGid = createId<GID.Supplement>(+id);
    const hasActualAccess = supplementAccess?.[suppGid]?.has(jumpGid as number) ?? false;

    // Potential access: Imports companion in range, or Available companion (always shown dimmed).
    const jumpInRange = sup.singleJump
      ? displayJumpNumber === sup.initialJump
      : displayJumpNumber >= sup.initialJump;
    const hasPotentialAccess =
      !hasActualAccess &&
      jumpInRange &&
      (sup.companionAccess === CompanionAccess.Imports ||
        sup.companionAccess === CompanionAccess.Available);

    if (hasActualAccess) {
      tabs.push({
        key: `supp/${id}`,
        label: sup.name,
        to: "/chain/$chainId/char/$charId/jump/$jumpId/supp/$supplementId",
        params: { ...base, supplementId: id },
      });
    } else if (hasPotentialAccess) {
      tabs.push({
        key: `supp/${id}`,
        label: sup.name,
        to: "/chain/$chainId/char/$charId/jump/$jumpId/supp/$supplementId",
        params: { ...base, supplementId: id },
        dimmed: true,
      });
    }
    // else: hidden (Unavailable access, or out of range)
  }

  tabs.push({
    key: "companions",
    label: "Companion Imports",
    to: "/chain/$chainId/char/$charId/jump/$jumpId/companions",
    params: base,
    dimmed: dimBaseTabs || undefined,
  });

  tabs.push({
    key: "config",
    label: "Config",
    to: "/chain/$chainId/char/$charId/jump/$jumpId/config",
    params: base,
    dimmed: dimBaseTabs || undefined,
  });

  return tabs;
}

/** Extract the tab key from the current pathname, relative to jump/$jumpId/.
 *  e.g. ".../jump/5/purchases"   → "purchases"
 *       ".../jump/5/"             → "overview"
 *       ".../jump/5/subsystem/2"  → "subsystem/2" */
function getActiveTabKey(pathname: string, jumpId: string): string {
  const marker = `/jump/${jumpId}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "overview";
  const suffix = pathname.slice(idx + marker.length).replace(/\/$/, "");
  return suffix === "" ? "overview" : suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the `to` + `params` for navigating to `newJumpId` while preserving
 * the currently active tab. Falls back to overview for jump-specific tabs
 * (subsystem/*) that may not exist on the target jump.
 */
function getJumpNavTarget(
  chainId: string,
  charId: string,
  newJumpId: string,
  activeTabKey: string,
): { to: string; params: Record<string, string> } {
  const base = { chainId, charId, jumpId: newJumpId };
  if (activeTabKey === "purchases")
    return { to: "/chain/$chainId/char/$charId/jump/$jumpId/purchases", params: base };
  if (activeTabKey === "drawbacks")
    return { to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks", params: base };
  if (activeTabKey === "companions")
    return { to: "/chain/$chainId/char/$charId/jump/$jumpId/companions", params: base };
  if (activeTabKey === "config")
    return { to: "/chain/$chainId/char/$charId/jump/$jumpId/config", params: base };
  if (activeTabKey.startsWith("supp/")) {
    const supplementId = activeTabKey.slice(5);
    return {
      to: "/chain/$chainId/char/$charId/jump/$jumpId/supp/$supplementId",
      params: { ...base, supplementId },
    };
  }
  // "overview" or "subsystem/*" (subsystem is jump-specific — fall back to overview)
  return { to: "/chain/$chainId/char/$charId/jump/$jumpId/", params: base };
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget display
// ─────────────────────────────────────────────────────────────────────────────

function BudgetDisplay({
  budget,
  currencies,
  subtypes,
  compact = false,
}: {
  budget: Budget;
  currencies: Lookup<LID.Currency, Currency>;
  subtypes: Lookup<LID.PurchaseSubtype, PurchaseSubtype>;
  compact?: boolean;
}) {
  const pillClass = "text-xs tabular-nums bg-surface/20 text-surface rounded px-3 py-1.5";
  const stipendPillClass = "text-xs tabular-nums bg-surface/15 text-surface/90 rounded px-3 py-1.5";
  return (
    <div className={`flex flex-wrap gap-1 ${compact && "max-w-100 md:max-w-150"}`}>
      {(Object.entries(budget.currency) as [string, number][]).map(([cIdStr, amount]) => {
        const curr = currencies[cIdStr as any] as Currency | undefined;
        if (!curr) return null;
        if (amount == 0 && curr.hidden) return null;
        return (
          <span key={cIdStr} className={pillClass}>
            {amount} {curr.abbrev}
          </span>
        );
      })}
      {budget.companionStipend.amount > 0 && (
        <span key={`companion`} className={stipendPillClass}>
          {`Companion Import Stipend: `}
          {budget.companionStipend.amount} {currencies[budget.companionStipend.currency].abbrev}
        </span>
      )}
      {budget.originStipend.amount > 0 && (
        <span key={`companion`} className={stipendPillClass}>
          {`Stipend for Origins: `}
          {budget.originStipend.amount} {currencies[budget.originStipend.currency].abbrev}
        </span>
      )}
      {(Object.entries(budget.stipends) as [string, Record<string, number>][]).flatMap(
        ([stIdStr, currAmounts]) => {
          const subtype = (subtypes as any)[stIdStr] as PurchaseSubtype | undefined;
          if (!subtype || !currAmounts) return [];
          return (Object.entries(currAmounts) as [string, number][]).map(([cIdStr, amount]) => {
            const curr = (currencies as any)[cIdStr] as Currency | undefined;
            if (!curr) return null;
            return (
              <span key={`${stIdStr}-${cIdStr}`} className={stipendPillClass}>
                {compact ? `${subtype.name}: ` : `${subtype.name} Stipend: `}
                {amount} {curr.abbrev}
              </span>
            );
          });
        },
      )}
      {(
        Object.entries(budget.remainingDiscounts) as [
          string,
          { value: { amount: number; currency: number }; n: number }[],
        ][]
      ).flatMap(([stIdStr, entries]) => {
        const subtype = (subtypes as any)[stIdStr] as PurchaseSubtype | undefined;
        if (!subtype || !entries?.length) return [];
        const total = entries.reduce((sum, e) => sum + e.n, 0);
        const results: React.ReactNode[] = [];
        for (const entry of entries) {
          if (entry.n < 0) {
            const curr = (currencies as any)[entry.value.currency] as Currency | undefined;
            if (!curr) continue;
            results.push(
              <span
                key={`${stIdStr}-err-${entry.value.currency}-${entry.value.amount}`}
                className="text-xs tabular-nums bg-surface/20 text-surface rounded px-3 py-1.5"
              >
                Too many {entry.value.amount} {curr.abbrev} {subtype.name} Discounts
              </span>,
            );
          }
        }
        if (total > 0) {
          results.push(
            <span key={`${stIdStr}-disc`} className={stipendPillClass}>
              {total} {subtype.name} Discount{total !== 1 ? "s" : ""}
            </span>,
          );
        }
        return results;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump layout component
// ─────────────────────────────────────────────────────────────────────────────

function JumpLayout() {
  const { chainId, charId, jumpId } = Route.useParams();
  const { hideViewer } = Route.useSearch();
  return (
    <JumpLayoutInner chainId={chainId} charId={charId} jumpId={jumpId} hideViewer={!!hideViewer} />
  );
}

function JumpLayoutInner({
  chainId,
  charId,
  jumpId,
  hideViewer,
}: {
  chainId: string;
  charId: string;
  jumpId: string;
  hideViewer: boolean;
}) {
  const jumpNumbers = useJumpNumbers();
  const chain = useChain();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const charGid = createId<GID.Character>(+charId);
  const jumpGid = createId<GID.Jump>(+jumpId);

  const suppMatch = pathname.match(/\/supp\/(\d+)/);
  const suppGid = suppMatch ? createId<GID.Supplement>(+suppMatch[1]) : null;

  useEffect(() => {
    if (!jumpNumbers) return;
    const cleanups = [
      synchronizeRetainedDrawbacks(charGid, jumpGid),
      synchronizeChainDrawbacks(charGid, jumpGid),
      synchronizeBank(charGid, jumpGid),
      ...(suppGid != null
        ? [
            synchronizeSupplementInvestments(charGid, jumpGid, suppGid),
            synchronizeGrossSupplementStipend(charGid, jumpGid, suppGid),
          ]
        : []),
      synchronizeBudget(charGid, jumpGid),
    ];
    return () => cleanups.forEach((f) => f());
  }, [charGid, jumpGid, suppGid, !jumpNumbers]);

  const deduplicateJumpPurchases = useDeduplicateJumpPurchases();
  useEffect(() => {
    deduplicateJumpPurchases(jumpGid);
  }, [jumpGid]);

  const { char } = useCharacter(charGid);
  const accessibleJumps = useJumpAccess(charGid);
  const hasJumpAccess = accessibleJumps == null || accessibleJumps.has(jumpGid as number);
  const supplementAccess = useSupplementAccess(charGid);
  const { settings: chainSettings } = useChainSettingsConfig();
  const budget = useBudget(charGid, jumpGid);

  const jump = chain?.jumps.O[jumpGid];
  const supplements = chain?.supplements.O ?? {};
  const jumpdocId = useJumpDocId(jumpGid);

  const jumpOffset = chainSettings?.startWithJumpZero ? 0 : 1;
  const displayJumpNumber = (jumpNumbers?.[jumpGid] ?? 0) + jumpOffset;
  const [viewerOpen, setViewerOpen] = useState(() => !hideViewer);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [viewerPopped, setViewerPopped] = useState(false);

  // Reset viewer state when the active jump changes (not on initial mount).
  useEffect(() => {
    setViewerOpen(!hideViewer);
    setViewerExpanded(false);
    setViewerPopped(false);
  }, [jumpId]);

  // Strip hideViewer from the URL after it's been consumed. We use replaceState
  // directly rather than navigate() so the current child route path is preserved.
  useEffect(() => {
    if (!hideViewer) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("hideViewer");
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open viewer when a doc is newly linked while already on this jump.
  const prevJumpdocIdRef = useRef(jumpdocId);
  useEffect(() => {
    const prev = prevJumpdocIdRef.current;
    prevJumpdocIdRef.current = jumpdocId;
    if (!prev && jumpdocId) {
      setViewerOpen(true);
      setViewerExpanded(false);
      setViewerPopped(false);
    }
  }, [jumpdocId]);

  // Register the pop-out callback so child routes (e.g. config tab) can trigger it.
  useEffect(() => {
    useViewerActionStore.getState().setPopOutViewer(() => {
      setViewerPopped(true);
      setViewerOpen(false);
    });
    return () => useViewerActionStore.getState().setPopOutViewer(null);
  }, []);

  const tabs = buildTabs(
    jump,
    supplements,
    { chainId, charId, jumpId },
    char?.primary ?? true,
    jumpGid,
    supplementAccess,
    displayJumpNumber,
    hasJumpAccess,
  );
  const activeTabKey = getActiveTabKey(pathname, jumpId);

  const sidebar = (
    <ChainSidebar
      chainId={chainId}
      charId={charId}
      jumpId={jumpId}
      forceCollapsed={!!jumpdocId && viewerOpen && !viewerPopped}
    />
  );

  if (chain && !char)
    return (
      <div className="flex h-full overflow-hidden">
        {sidebar}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full border border-edge rounded-lg bg-surface px-6 py-5 flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Character not found</p>
            <p className="text-sm text-muted">
              No character with ID {charId} exists in this chain.
            </p>
          </div>
        </div>
      </div>
    );

  if (chain && char && !jump)
    return (
      <div className="flex h-full overflow-hidden">
        {sidebar}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full border border-edge rounded-lg bg-surface px-6 py-5 flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Jump not found</p>
            <p className="text-sm text-muted">No jump with ID {jumpId} exists in this chain.</p>
          </div>
        </div>
      </div>
    );

  // Determine whether the current tab is restricted and what warning to show.
  const activeTab = tabs.find((t) => t.key === activeTabKey);
  const isActiveTabDimmed = activeTab?.dimmed ?? false;
  let accessWarning: { title: string; body: string; detail?: string } | null = null;
  if (isActiveTabDimmed) {
    if (activeTabKey.startsWith("supp/")) {
      const suppId = activeTabKey.slice(5);
      const suppName =
        (supplements as Record<string, ChainSupplement | undefined>)[suppId]?.name ??
        "this supplement";
      accessWarning = {
        title: `No access to ${suppName}`,
        body: `${char?.name ?? "This character"} hasn't been imported into ${suppName} for this jump.`,
        detail: "A primary jumper needs to purchase a supplement import that includes them.",
      };
    } else {
      accessWarning = {
        title: "No access to this jump",
        body: `${char?.name ?? "This character"} hasn't been imported into this jump.`,
        detail: "To bring them here, another jumper needs to purchase an import for them.",
      };
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {sidebar}
      <div
        className={`flex flex-col min-w-0 ${
          jumpdocId && viewerOpen && !viewerPopped
            ? viewerExpanded
              ? "hidden"
              : "hidden md:flex md:w-1/2 md:min-w-150 md:shrink-0"
            : "flex-1"
        }`}
      >
        {import.meta.env.VITE_PLATFORM === "electron" && (
          <ElectronChainNav chainId={chainId} charId={charId} jumpId={jumpId} />
        )}
        {/* Tab content — layout owns scroll and max-width */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="sm:sticky sm:top-0 z-20 bg-canvas">
            <TabList tabs={tabs} activeTabKey={activeTabKey} />
          </div>
          <div className="max-w-5xl px-4">
            {/* Jump name header */}
            <div className="bg-accent-ring rounded-md px-4 py-1 mb-1 flex flex-col gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-semibold text-surface leading-tight flex-1 min-w-0 truncate">
                  {jump?.name || (
                    <span className="font-normal opacity-60 italic">Unnamed Jump</span>
                  )}
                </h1>
                {budget && jump && (
                  <BudgetDisplay
                    budget={budget}
                    key={`${charId}_${jumpId}`}
                    currencies={jump.currencies.O}
                    subtypes={jump.purchaseSubtypes.O}
                  />
                )}
                {jump?.source.type === JumpSourceType.URL && (
                  <a
                    href={jump.source.URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-surface/50 hover:text-surface shrink-0 transition-colors"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                {jumpdocId && (!viewerOpen || viewerPopped) && (
                  <button
                    title={viewerPopped ? "Bring JumpDoc back to panel" : "Show JumpDoc panel"}
                    onClick={() => {
                      setViewerOpen(true);
                      setViewerPopped(false);
                    }}
                    className="shrink-0 text-surface/60 hover:text-surface transition-colors flex items-center gap-1"
                  >
                    <BookOpen size={14} />
                    <span className="text-xs font-medium">JumpDoc</span>
                  </button>
                )}
              </div>
            </div>

            {accessWarning ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-sm w-full border border-danger/40 rounded-lg bg-danger/10 px-6 py-5 flex flex-col gap-2">
                  <p className="text-sm font-semibold text-danger">{accessWarning.title}</p>
                  <p className="text-sm text-ink">{accessWarning.body}</p>
                  {accessWarning.detail && (
                    <p className="text-sm text-muted">{accessWarning.detail}</p>
                  )}
                </div>
              </div>
            ) : (
              <Outlet />
            )}
            <div className="h-20 w-1" />
          </div>
        </div>
      </div>

      {/* Handles annotation clicks from the JumpDoc viewer (inline or popped-out). */}
      <AnnotationInteractionHandler
        jumpId={jumpGid}
        charId={charGid}
        routeParams={{ chainId, charId, jumpId }}
      />

      {/* JumpDoc panel — mounted once, persists across tab navigation */}
      {jumpdocId && (
        <>
          {/* Pop-out portal — renders the viewer in a separate browser window */}
          {viewerPopped && (
            <NewWindowPortal title="JumpDoc" onClose={() => setViewerPopped(false)}>
              <JumpDocViewer
                docId={jumpdocId}
                jumpId={jumpGid}
                charId={charGid}
                expanded={true}
                onClose={() => setViewerPopped(false)}
                budgetSlot={
                  budget && jump ? (
                    <BudgetDisplay
                      budget={budget}
                      compact
                      currencies={jump.currencies.O}
                      subtypes={jump.purchaseSubtypes.O}
                    />
                  ) : undefined
                }
              />
            </NewWindowPortal>
          )}

          {/* Inline panel — shown when viewer is open and not popped out */}
          <div
            className={`min-w-0 border-l border-edge flex overflow-hidden ${
              viewerOpen && !viewerPopped ? "flex-1" : "hidden"
            }`}
          >
            <JumpDocViewer
              docId={jumpdocId}
              jumpId={jumpGid}
              charId={charGid}
              onClose={() => setViewerOpen(false)}
              expanded={viewerExpanded}
              onToggleExpand={() => setViewerExpanded((v) => !v)}
              onPopOut={() => {
                setViewerPopped(true);
                setViewerOpen(false);
              }}
              budgetSlot={
                budget && jump ? (
                  <BudgetDisplay
                    budget={budget}
                    compact
                    currencies={jump.currencies.O}
                    subtypes={jump.purchaseSubtypes.O}
                  />
                ) : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain sidebar (jump list + character selector)
// ─────────────────────────────────────────────────────────────────────────────

type JumpBlock = { jump: Jump; supplements: Jump[] };

/** Floating overlay shown while dragging — a visual copy of the dragged block. */
function JumpBlockOverlay({ block, jumpNum }: { block: JumpBlock; jumpNum: number | undefined }) {
  return (
    <div className="rounded-md shadow-xl ring-2 ring-accent bg-surface opacity-95 cursor-grabbing">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <GripVertical size={12} className="text-ghost shrink-0" />
        {jumpNum !== undefined && (
          <span className="shrink-0 tabular-nums text-xs opacity-50 w-5 text-right">
            {jumpNum + 1}.
          </span>
        )}
        <span className="text-sm truncate">{block.jump.name}</span>
      </div>
      {block.supplements.length > 0 && (
        <div className="ml-4 border-l border-edge">
          {block.supplements.map((sup) => (
            <div key={sup.id as number} className="px-3 py-1 text-xs text-muted truncate">
              {sup.name || "[unnamed supplement]"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One sortable jump block (top-level jump + its supplement children). */
// Memoized content component — never re-renders during drag since none of these
// props change while the pointer is moving. DnD listeners/attributes live on
// the outer SortableJumpBlock div so they never touch this component's props.
function formatDuration(d: { days: number; months: number; years: number }): string {
  const { days, months, years } = d;
  if (years >= 100) {
    const c = Math.round(years / 100);
    return `${c} ${c === 1 ? "Century" : "Centuries"}`;
  }
  if (years > 0) return `${years} ${years === 1 ? "Year" : "Years"}`;
  if (months > 0) return `${months} ${months === 1 ? "Month" : "Months"}`;
  return `${days} ${days === 1 ? "Day" : "Days"}`;
}

const JumpBlockContent = memo(function JumpBlockContent({
  block,
  chainId,
  charIdForNav,
  currentJumpId,
  jumpNum,
  activeTabKey,
  accessibleJumps,
  onNavigate,
}: {
  block: JumpBlock;
  chainId: string;
  charIdForNav: string;
  currentJumpId: number | null;
  jumpNum: number | undefined;
  activeTabKey: string;
  accessibleJumps: Set<number> | undefined;
  onNavigate: () => void;
}) {
  const { jump, supplements } = block;
  const id = jump.id as number;
  const isActive = currentJumpId === id;
  const isAccessible = accessibleJumps == null || accessibleJumps.has(id);
  const { to: jumpTo, params: jumpParams } = getJumpNavTarget(
    chainId,
    charIdForNav,
    String(id),
    activeTabKey,
  );

  return (
    <>
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-sm transition-colors ${
          isActive && isAccessible
            ? "bg-accent2-tint text-accent2 outline outline-accent2"
            : isActive
              ? "bg-accent2-tint/50 text-ghost outline outline-accent2/40"
              : isAccessible
                ? "text-ink hover:text-accent2"
                : "text-ghost opacity-60 hover:opacity-80"
        }`}
      >
        <Link
          to={jumpTo}
          params={jumpParams}
          onClick={onNavigate}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          {jumpNum !== undefined && (
            <span className="shrink-0 tabular-nums text-xs opacity-50 w-5 text-right">
              {jumpNum + 1}.
            </span>
          )}
          <span className="truncate" title={formatDuration(jump.duration)}>
            {jump.name}
          </span>
        </Link>
      </div>

      {supplements.length > 0 && (
        <div className="ml-5 border-l border-edge">
          {supplements.map((sup) => {
            const supId = sup.id as number;
            const { to: supTo, params: supParams } = getJumpNavTarget(
              chainId,
              charIdForNav,
              String(supId),
              activeTabKey,
            );
            const supActive = currentJumpId === supId;
            const supAccessible = accessibleJumps == null || accessibleJumps.has(supId);
            return (
              <Link
                key={supId}
                to={supTo}
                params={supParams}
                onClick={onNavigate}
                data-jump-id={supId}
                title={formatDuration(sup.duration)}
                className={`w-full block px-3 py-0.5 text-xs transition-colors truncate border-l ${
                  supActive && supAccessible
                    ? "text-accent2 bg-accent2-tint border-l-accent2"
                    : supActive
                      ? "text-ghost bg-accent2-tint/50 border-l-accent2/40"
                      : supAccessible
                        ? "text-muted hover:text-accent2 border-l-transparent"
                        : "text-ghost opacity-60 hover:opacity-80 border-l-transparent"
                }`}
              >
                {sup.name || "[unnamed supplement]"}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
});

function SortableJumpBlock({
  block,
  chainId,
  charIdForNav,
  currentJumpId,
  jumpNum,
  activeTabKey,
  accessibleJumps,
  onNavigate,
}: {
  block: JumpBlock;
  chainId: string;
  charIdForNav: string;
  currentJumpId: number | null;
  jumpNum: number | undefined;
  activeTabKey: string;
  accessibleJumps: Set<number> | undefined;
  onNavigate: () => void;
}) {
  const { jump, supplements } = block;
  const id = jump.id as number;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} data-jump-id={id}>
        <div className="rounded-md border-2 border-dashed border-accent-ring bg-accent-tint px-2 py-1.5">
          <span className="invisible text-sm select-none">{jump.name || "Jump"}</span>
        </div>
        {supplements.length > 0 && (
          <div className="ml-4">
            {supplements.map((sup) => (
              <div key={sup.id as number} className="px-3 py-1">
                <span className="invisible text-xs select-none">
                  {sup.name || "[unnamed supplement]"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-jump-id={id}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <JumpBlockContent
        block={block}
        chainId={chainId}
        charIdForNav={charIdForNav}
        currentJumpId={currentJumpId}
        jumpNum={jumpNum}
        activeTabKey={activeTabKey}
        accessibleJumps={accessibleJumps}
        onNavigate={onNavigate}
      />
    </div>
  );
}

const ChainSidebar = memo(function ChainSidebar({
  chainId,
  charId,
  jumpId,
  forceCollapsed = false,
}: {
  chainId: string;
  charId: string;
  jumpId: string;
  /** When true, the sidebar collapses to mobile-toggle mode even on desktop (used when a JumpDoc panel is open). */
  forceCollapsed?: boolean;
}) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar overlay when the JumpDoc panel opens.
  useEffect(() => {
    if (forceCollapsed) setMobileOpen(false);
  }, [forceCollapsed]);
  const { name: chainName, rename: renameChain } = useChainName();
  const [localChainName, setLocalChainName] = useState(chainName);
  useEffect(() => {
    setLocalChainName(chainName);
  }, [chainName]);
  const jumpNumbers = useJumpNumbers();
  const startAtZero = useChainSettingsConfig().settings?.startWithJumpZero;
  const reorderJumps = useReorderJumps();
  const addJump = useAddJump();
  const addJumpFromDoc = useAddJumpFromDoc();
  const deleteJump = useDeleteJump();
  const jumpList = useJumpList();
  const accessibleJumps = useJumpAccess(createId<GID.Character>(+charId));
  const [activeId, setActiveId] = useState<number | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showInteractiveModal, setShowInteractiveModal] = useState(false);
  const scrollContainerRef = useRef<Scrollbar>(null);
  const skipScrollRef = useRef(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const currentCharId = charId ? +charId : null;
  const currentJumpId = jumpId ? +jumpId : null;

  // Derive active tab key so sidebar links preserve the current tab.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeTabKey = getActiveTabKey(pathname, jumpId);

  // Scroll the active jump into view when navigating here from outside the sidebar.
  // When the user clicks a sidebar link, skipScrollRef is set to true and no scroll occurs.
  useEffect(() => {
    if (currentJumpId == null) return;
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    const scroller = scrollContainerRef.current?.scrollerElement;
    const content = scrollContainerRef.current?.contentElement;
    const el = content?.querySelector(`[data-jump-id="${currentJumpId}"]`);
    if (!scroller || !el) return;
    const target =
      scroller.scrollTop +
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      scroller.clientHeight / 2 +
      (el as HTMLElement).offsetHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [currentJumpId]);

  const characters = useCharacterList();
  const jumpTree = useJumpTree();
  const topLevelIds = jumpTree.map(({ jump }) => jump.id as number);

  // The last jump ID in the block containing the current jump — new jumps insert after it.
  let currentBlockEnd: Id<GID.Jump> | undefined;
  if (currentJumpId !== null) {
    for (const block of jumpTree) {
      if (
        (block.jump.id as number) === currentJumpId ||
        block.supplements.some((s) => (s.id as number) === currentJumpId)
      ) {
        currentBlockEnd =
          block.supplements.length > 0
            ? block.supplements[block.supplements.length - 1].id
            : block.jump.id;
        break;
      }
    }
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as number);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = jumpTree.findIndex(({ jump }) => (jump.id as number) === active.id);
    const newIdx = jumpTree.findIndex(({ jump }) => (jump.id as number) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(jumpTree, oldIdx, newIdx);
    reorderJumps(
      reordered.map(({ jump, supplements }) => [
        jump.id as Id<GID.Jump>,
        ...supplements.map((s) => s.id as Id<GID.Jump>),
      ]),
    );
  };

  const activeBlock =
    activeId !== null
      ? (jumpTree.find(({ jump }) => (jump.id as number) === activeId) ?? null)
      : null;

  const goWithChar = (newCharId: number) => {
    const { to, params } = getJumpNavTarget(chainId, String(newCharId), jumpId, activeTabKey);
    navigate({ to, params } as never);
  };

  return (
    <>
      {/* Mobile/collapsed toggle tab */}
      <button
        type="button"
        className={`${forceCollapsed ? "" : "md:hidden"} fixed left-0 top-1/3 z-20 flex items-center bg-accent2-tint border border-l-0 border-accent2/80 rounded-r-md px-1 py-3 text-ghost hover:text-accent2 shadow-sm`}
        style={{ opacity: mobileOpen ? 0 : 1, pointerEvents: mobileOpen ? "none" : "auto" }}
        onClick={() => setMobileOpen(true)}
      >
        <ChevronRight size={13} />
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className={`${forceCollapsed ? "" : "md:hidden"} fixed inset-0 z-30 bg-black/40`}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`
        fixed inset-y-0 left-0 z-40 w-72 flex flex-col border-r border-edge bg-linear-to-b from-tint to-accent2-tint
        transition-transform duration-200 ease-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        ${!forceCollapsed ? "md:relative md:inset-auto md:w-70 md:z-auto md:shrink-0 md:translate-x-0" : ""}
      `}
      >
        {/* Chain name — large editable title, commits on blur */}
        <div className="relative shrink-0">
          <button
            type="button"
            className="md:hidden absolute top-2 left-2 z-10 p-1 rounded bg-surface/30 text-muted hover:text-ink"
            onClick={() => setMobileOpen(false)}
          >
            <X size={14} />
          </button>
        </div>
        <div className="text-xs font-semibold text-muted uppercase tracking-widest text-center pt-3">
          Jump Navigation:
        </div>
        {/* Character select — does not scroll with the jump list */}
        <div className="mx-3 my-1 p-2 shrink-0 bg-surface rounded border border-accent-ring flex justify-center items-center text-ink text-sm">
          <span className="font-bold">Character:</span>
          <select
            className="rounded pl-2 pr-6 focus:outline-none disabled:opacity-50"
            value={currentCharId ?? ""}
            onChange={(e) => goWithChar(+e.target.value)}
            disabled={characters.length === 0}
          >
            {characters.length === 0 && <option value="">Loading…</option>}
            {characters.map((char) => (
              <option key={char!.id} value={char!.id as number}>
                {char!.name}
              </option>
            ))}
          </select>
        </div>

        {/* Jump list — scrolls independently */}
        {/* react-scrollbars-custom intersects Scrollbar & HTMLDivElement in its ref type — library bug */}
        <Scrollbar
          ref={scrollContainerRef as any}
          noScrollX
          className="flex-1 min-h-0"
          contentProps={{ className: "py-1 px-3" }}
          trackYProps={{ style: { background: "transparent", width: 5, right: 2 } }}
          thumbYProps={{ style: { background: "var(--color-trim)", borderRadius: 4 } }}
        >
          <div className="py-1 pl-3 pr-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
                {jumpTree.map((block) => (
                  <SortableJumpBlock
                    key={block.jump.id as number}
                    block={block}
                    chainId={chainId}
                    charIdForNav={charId}
                    currentJumpId={currentJumpId}
                    jumpNum={(jumpNumbers?.[block.jump.id] ?? 0) + (startAtZero ? -1 : 0)}
                    activeTabKey={activeTabKey}
                    accessibleJumps={accessibleJumps}
                    onNavigate={() => {
                      skipScrollRef.current = true;
                    }}
                  />
                ))}
              </SortableContext>

              <DragOverlay dropAnimation={null}>
                {activeBlock && (
                  <JumpBlockOverlay
                    block={activeBlock}
                    jumpNum={jumpNumbers?.[activeBlock.jump.id]}
                  />
                )}
              </DragOverlay>
            </DndContext>

            {characters.length === 0 && (
              <p className="text-xs text-ghost text-center mt-6 px-3">Loading…</p>
            )}
            {characters.length > 0 && jumpTree.length === 0 && (
              <p className="text-xs text-ghost text-center mt-6 px-3 italic">No jumps yet.</p>
            )}
          </div>
        </Scrollbar>

        {/* Add / Delete jump buttons */}
        <div className="px-3 py-2 border-t border-edge shrink-0 flex gap-2">
          {/* Drop-up add menu */}
          <div ref={addMenuRef} className="relative flex-1">
            {addMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-edge rounded shadow-lg overflow-hidden z-10">
                <button
                  type="button"
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-ink hover:bg-tint transition-colors"
                  onClick={async () => {
                    setAddMenuOpen(false);
                    const result = await Swal.fire({
                      title: "New Jump",
                      html: `<div style="text-align:left;display:flex;flex-direction:column;gap:10px;margin-top:4px">
                      <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px">Name</label>
                        <input id="swal-jump-name" class="swal2-input" placeholder="Jump name" style="margin:0;width:100%;box-sizing:border-box">
                      </div>
                      <div>
                        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px">URL <span style="font-weight:400;opacity:0.6">(optional)</span></label>
                        <input id="swal-jump-url" class="swal2-input" placeholder="https://…" style="margin:0;width:100%;box-sizing:border-box">
                      </div>
                    </div>`,
                      showCancelButton: true,
                      confirmButtonText: "Create",
                      cancelButtonText: "Cancel",
                      buttonsStyling: false,
                      customClass: {
                        confirmButton: "swal-btn-confirm",
                        cancelButton: "swal-btn-cancel",
                      },
                      didOpen: () => {
                        document.getElementById("swal-jump-name")?.focus();
                      },
                      preConfirm: () => ({
                        name: (
                          document.getElementById("swal-jump-name") as HTMLInputElement
                        ).value.trim(),
                        url: (
                          document.getElementById("swal-jump-url") as HTMLInputElement
                        ).value.trim(),
                      }),
                    });
                    if (!result.isConfirmed) return;
                    const { name, url } = result.value as { name: string; url: string };
                    const newId = addJump(name, url, currentBlockEnd);
                    const { to, params } = getJumpNavTarget(
                      chainId,
                      charId,
                      String(newId),
                      "overview",
                    );
                    navigate({ to, params } as never);
                  }}
                >
                  <Plus size={11} />
                  Static Jump
                </button>
                <button
                  type="button"
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-ink hover:bg-tint transition-colors border-t border-edge"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowInteractiveModal(true);
                  }}
                >
                  <BookOpen size={11} />
                  Interactive Jump
                </button>
              </div>
            )}
            <button
              title="Add jump"
              className="w-full flex items-center justify-center gap-1 text-xs text-muted hover:text-ink border border-edge rounded px-2 py-1 transition-colors"
              onClick={() => setAddMenuOpen((o) => !o)}
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          <button
            title="Delete current jump"
            disabled={characters.length === 0 || jumpList.length <= 1}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-danger border border-edge rounded px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={async () => {
              const jumpList = useChainStore.getState().chain?.jumpList;
              if (!jumpList) return;
              const result = await Swal.fire({
                title: "Delete jump?",
                text: "This will delete all purchases, drawbacks, and alt-forms for this jump. This can be undone with Ctrl+Z.",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Delete jump",
                cancelButtonText: "Cancel",
                buttonsStyling: false,
                customClass: { confirmButton: "swal-btn-danger", cancelButton: "swal-btn" },
              });
              if (!result.isConfirmed) return;

              const jumpGid = createId<GID.Jump>(+jumpId);

              // Find the nearest remaining jump for navigation (excluding the deleted one)
              let navTargetId: Id<GID.Jump> | null = null;
              const currentIdx = jumpList.findIndex((id) => id === jumpGid);
              for (let i = currentIdx + 1; i < jumpList.length; i++) {
                if (jumpList[i] !== +jumpGid) {
                  navTargetId = jumpList[i];
                  break;
                }
              }
              if (navTargetId === null) {
                for (let i = currentIdx - 1; i >= 0; i--) {
                  if (jumpList[i] !== jumpGid) {
                    navTargetId = jumpList[i];
                    break;
                  }
                }
              }

              deleteJump(jumpGid);

              if (navTargetId !== null) {
                const { to, params } = getJumpNavTarget(
                  chainId,
                  charId,
                  String(navTargetId),
                  "overview",
                );
                navigate({ to, params } as never);
              } else {
                navigate({ to: "/chain/$chainId", params: { chainId }, search: {} });
              }
            }}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>

      {showInteractiveModal && (
        <InteractiveJumpModal
          onClose={() => setShowInteractiveModal(false)}
          onAdd={(doc, publicUid) => {
            setShowInteractiveModal(false);
            const newId = addJumpFromDoc(doc, publicUid, currentBlockEnd);
            const { to, params } = getJumpNavTarget(chainId, charId, String(newId), "overview");
            navigate({ to, params } as never);
          }}
        />
      )}
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
// InteractiveJumpModal
// ─────────────────────────────────────────────────────────────────────────────

function InteractiveJumpModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (doc: JumpDoc, publicUid: string) => void;
}) {
  async function handleSelect(doc: JumpDocSummary) {
    const result = await loadJumpDoc({ data: { publicUid: doc.publicUid } });
    onAdd(result.contents as JumpDoc, doc.publicUid);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-canvas w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <h2 className="text-sm font-semibold text-ink">Choose a Jumpdoc</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ghost hover:text-ink transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <JumpDocGallery onSelect={handleSelect} pageSize={15} minCardWidth={100} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
