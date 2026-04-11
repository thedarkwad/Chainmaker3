import { Link, useParams, useSearch } from "@tanstack/react-router";
import Swal from "sweetalert2";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, { type ReactNode, useEffect, useRef, useState } from "react";

import { type PurchaseSubtype } from "@/chain/data/Jump";
import {
  type AbstractPurchase,
  type BasicPurchase,
  CostModifier,
  type JumpPurchase,
  PurchaseType,
  RewardType,
  type Scenario,
  type ScenarioReward,
  type Subpurchase,
  type SupplementPurchase,
  type SupplementScenario,
  type SupplementScenarioReward,
  type Value,
} from "@/chain/data/Purchase";
import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import {
  useCurrencies,
  usePurchase,
  usePurchaseCategories,
  useSupplementPurchaseCategories,
  usePurchaseGroupActions,
  usePurchaseGroupName,
  usePurchaseGroupsEnabled,
  usePurchaseName,
  usePurchaseSubtypes,
  useSubpurchaseCostStrings,
} from "@/chain/state/hooks";
import { useChainStore } from "@/chain/state/Store";
import { useClipboard } from "@/chain/state/clipboard";
import { buildPurchaseSnapshot } from "@/chain/state/hooks";
import { toast } from "react-toastify";
import { useDraft } from "@/chain/state/useDraft";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";
import { TagField } from "@/ui/TagField";
import { DraggablePurchaseList } from "./DraggablePurchaseList";
import { PurchaseGroupModal } from "./PurchaseGroupModal";
import {
  CostDropdown,
  formatCostDisplay,
  formatCostShort,
  formatValueStr,
  ModifierSelect,
} from "@/ui/CostDropdown";
import { SelectField } from "@/ui/SelectField";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { convertWhitespace } from "@/utilities/miscUtilities";

// ─────────────────────────────────────────────────────────────────────────────
// Widget type
// ─────────────────────────────────────────────────────────────────────────────

export type WidgetDef = {
  view: ReactNode;
  edit: ReactNode;
  position?: "header" | "body" | "footer";
  fullWidth?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Base PurchaseEditor
// ─────────────────────────────────────────────────────────────────────────────

// Placeholder used for useDraft before the purchase first resolves from the store.
const EMPTY_DRAFT: AbstractPurchase = {
  id: 0 as Id<GID.Purchase>,
  charId: 0 as Id<GID.Character>,
  name: "",
  description: "",
  type: PurchaseType.Perk,
  cost: { modifier: CostModifier.Full },
  value: 0,
};

export type PurchaseEditorProps<T extends AbstractPurchase> = {
  id: Id<GID.Purchase>;
  widgets?: WidgetDef[];
  /** Called at submit time — return extra fields to merge into the store patch. */
  buildExtraPatch?: () => Partial<T>;
  /** Called after the purchase is committed to the store. */
  onSubmit?: () => void;
  onRemove?: () => void;
  /** Called when edit mode opens so wrappers can initialise their local state. */
  onEnterEdit?: () => void;
  /** Called when edit is cancelled so wrappers can revert their local state. */
  onCancel?: () => void;
  /** When true, the cost/value field is hidden in both view and edit modes. */
  hideCost?: boolean;
  /** When true, the cost-modifier dropdown (Reduced, Custom, Free, etc.) is hidden. */
  hideCostModifier?: boolean;
  /** Label shown next to the numeric value input (for non-Value purchases). Defaults to "CP". */
  currencyLabel?: string;
  /** Optional suffix appended to the cost string in both view modes (e.g. "for Item"). */
  costSuffix?: string;
  /**
   * When true (used for subpurchases), the border and chevron are invisible in
   * the collapsed state and only appear on hover or when the item is open.
   */
  subdued?: boolean;
  /** When true, the editor auto-opens in edit mode (used for newly created purchases). */
  isNew?: boolean;
  /** Clipboard key for the copy button. When provided, a copy icon appears next to pencil. */
  clipboardKey?: string;
  /** Called whenever the cost modifier changes in edit mode. */
  onCostModifierChange?: (mod: CostModifier) => void;
  /** When provided, shows a floating discount checkbox inside the cost dropdown. */
  floatingDiscount?: { checked: boolean; onChange: (checked: boolean) => void } | null;
};

export function PurchaseEditor<T extends AbstractPurchase>({
  id,
  widgets = [],
  buildExtraPatch,
  onSubmit,
  onRemove,
  onEnterEdit,
  onCancel: onCancelProp,
  hideCost = false,
  hideCostModifier = false,
  currencyLabel = "CP",
  costSuffix,
  subdued = false,
  isNew = false,
  clipboardKey,
  onCostModifierChange,
  floatingDiscount,
}: PurchaseEditorProps<T>) {
  const { purchase, actions } = usePurchase<AbstractPurchase>(id);
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const draft = useDraft<AbstractPurchase>(purchase ?? EMPTY_DRAFT);
  const didInitEdit = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Derive jump context (not all AbstractPurchases carry jumpId)
  const jumpId = purchase && "jumpId" in purchase ? (purchase as JumpPurchase).jumpId : undefined;
  const currencies = useCurrencies(jumpId);
  const subCost = useSubpurchaseCostStrings(id);

  // Read scrollTo from URL search params (set by jump pill links in PurchasePreview).
  const { scrollTo } = useSearch({ strict: false }) as { scrollTo?: string };

  // Auto-expand and scroll into view when this purchase is the scroll target.
  // When scrollTo changes while already on the page, also collapse non-target
  // editors that are not currently being edited.
  useEffect(() => {
    if (scrollTo === String(id)) {
      setIsCollapsed(false);
      // Double rAF: first gives React time to commit the expanded DOM,
      // second ensures the browser has completed layout before scrolling.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          containerRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            container: "nearest",
          } as ScrollIntoViewOptions);
        });
      });
    } else if (scrollTo !== undefined && !isEditingRef.current) {
      setIsCollapsed(true);
    }
  }, [scrollTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-enter edit for newly created purchases
  useEffect(() => {
    if (purchase && isNew && !didInitEdit.current) {
      didInitEdit.current = true;
      draft.restart(
        { ...purchase },
        "Enter edit",
        () => {
          setIsEditing(false);
          setIsCollapsed(false);
        },
        () => {
          setIsEditing(true);
          setIsCollapsed(false);
        },
      );
      setIsEditing(true);
      onEnterEdit?.();

      // Scroll the new purchase to the top of its scroll container.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          containerRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            container: "nearest",
          } as ScrollIntoViewOptions);
        });
      });
    }
  }, [purchase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!purchase) return null;

  // ── Derived widget lists ─────────────────────────────────────────────────
  const headerWidgets = widgets.filter((w) => w.position === "header");
  const bodyWidgets = widgets.filter((w) => !w.position || w.position === "body");
  const footerWidgets = widgets.filter((w) => w.position === "footer");

  // ── Actions ──────────────────────────────────────────────────────────────
  const enterEdit = () => {
    draft.restart(
      { ...purchase },
      "Enter edit",
      () => {
        setIsEditing(false);
        setIsCollapsed(false);
      },
      () => {
        setIsEditing(true);
        setIsCollapsed(false);
      },
    );
    setIsEditing(true);
    onEnterEdit?.();
  };

  const handleSubmit = () => {
    const s = draft.state;
    const extra = buildExtraPatch?.();
    draft.close();
    actions.modify("Edit purchase", (d) => {
      d.name = s.name;
      d.description = s.description;
      d.value = s.value;
      d.cost = s.cost;
      if (extra) Object.assign(d, extra);
    });
    setIsEditing(false);
    setIsCollapsed(false);
    onSubmit?.();
  };

  const handleCancel = () => {
    draft.cancel();
    onCancelProp?.();
    setIsEditing(false);
    setIsCollapsed(false);
  };

  const handleCopy = (e: React.MouseEvent) => {
    if (!clipboardKey) return;
    const name = purchase?.name || "Unnamed";
    const chain = useChainStore.getState().chain;
    const snapshot = chain ? buildPurchaseSnapshot(chain, id) : {};
    const entry = { id, key: clipboardKey, snapshot };
    if (e.ctrlKey || e.shiftKey) {
      const current = useClipboard.getState().entries;
      if (current.some((en) => en.id === id)) {
        toast.info(`"${name}" is already in the clipboard.`);
        return;
      }
      useClipboard.getState().append(entry);
      const newCount = useClipboard.getState().entries.length;
      toast.info(
        `"${name}" added to clipboard. The clipboard now holds ${newCount} item${newCount === 1 ? "" : "s"}.`,
      );
    } else {
      const hadItems = useClipboard.getState().entries.length > 0;
      useClipboard.getState().set([entry]);
      if (hadItems) {
        toast.info(`Clipboard replaced with "${name}". Hold Ctrl to add to the clipboard instead.`);
      } else {
        toast.info(`"${name}" copied to clipboard.`);
      }
    }
  };

  // ── Cost helpers ─────────────────────────────────────────────────────────
  const isValueArr = Array.isArray(draft.state.value);
  const costModifier = draft.state.cost.modifier;
  const customModifiedTo =
    costModifier === CostModifier.Custom ? draft.state.cost.modifiedTo : undefined;

  const setCostModifier = (mod: CostModifier) => {
    onCostModifierChange?.(mod);
    draft.set("Set cost modifier", (d) => {
      if (mod === CostModifier.Custom) {
        const init = Array.isArray(d.value)
          ? (d.value as Value).map((sv) => ({ ...sv }))
          : (d.value as number);
        d.cost = { modifier: CostModifier.Custom, modifiedTo: init };
      } else {
        d.cost = { modifier: mod as CostModifier.Full | CostModifier.Reduced | CostModifier.Free };
      }
    });
  };

  // ── View mode ─────────────────────────────────────────────────────────────
  if (!isEditing) {
    const costDisplay =
      subCost?.display ?? formatCostDisplay(purchase.value, purchase.cost, currencies);
    const costShort = subCost?.short ?? formatCostShort(purchase.value, purchase.cost, currencies);

    if (isCollapsed) {
      return (
        <div
          ref={containerRef}
          className={`group rounded-lg flex items-center gap-1.5 px-2.5 cursor-pointer transition-colors border ${
            subdued
              ? "hover:bg-surface border-transparent hover:border-edge"
              : "bg-surface border-line hover:border-edge"
          }`}
          onClick={() => setIsCollapsed(false)}
        >
          <ChevronRight
            size={13}
            className={`text-ghost shrink-0 transition-opacity ${subdued ? "sm:opacity-0 sm:group-hover:opacity-100" : ""}`}
          />
          <span className="font-semibold text-sm shrink-0 truncate min-w-30 w-1/5 max-w-fit">
            {purchase.name || <span className="font-normal text-ghost italic">Unnamed</span>}
          </span>
          {!hideCost && costShort && (
            <span className="text-xs font-semibold text-muted/70 shrink-0">
              [{costShort}
              {costSuffix ? ` ${costSuffix}` : ""}]
            </span>
          )}
          {purchase.description ? (
            <span className="flex-1 min-w-0 text-sm text-muted truncate">
              {purchase.description}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <span className="shrink-0 flex items-center gap-1">
            {headerWidgets.map((w, i) => w.view && <span key={i}>{w.view}</span>)}
            <button
              onClick={(e) => {
                e.stopPropagation();
                enterEdit();
              }}
              className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5"
            >
              <Pencil size={13} />
            </button>
            {clipboardKey && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(e);
                }}
                className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5"
                title="Copy purchase"
              >
                <Copy size={13} />
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-danger transition-all p-0.5"
              >
                <Trash2 size={14} />
              </button>
            )}
          </span>
        </div>
      );
    }

    // Expanded view
    return (
      <div
        ref={containerRef}
        className="border border-trim rounded-lg bg-linear-to-b from-tint to-accent2-tint shadow-sm my-1 py-1"
      >
        <div
          className="flex flex-wrap items-center gap-2 px-3 cursor-pointer"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronDown size={14} className="text-ghost shrink-0" />
          <span className="flex-1 min-w-min font-semibold text-base text-ink truncate">
            {purchase.name || <span className="font-normal text-ghost italic">Unnamed</span>}
          </span>
          {!hideCost && costDisplay && (
            <span className="text-sm font-semibold text-ink shrink-0">
              {costDisplay}
              {costSuffix ? ` ${costSuffix}` : ""}
            </span>
          )}
          {headerWidgets.map(
            (w, i) =>
              w.view && (
                <span key={i} className="shrink-0">
                  {w.view}
                </span>
              ),
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              enterEdit();
            }}
            className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
          >
            <Pencil size={14} />
          </button>
          {clipboardKey && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(e);
              }}
              className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
              title="Copy purchase"
            >
              <Copy size={14} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-ghost hover:text-danger transition-colors p-0.5 shrink-0"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {purchase.description && (
          <div className="px-3 pt-1 pb-0.5 text-sm text-muted flex flex-col gap-2 leading-tight">
            {convertWhitespace(purchase.description)}
          </div>
        )}

        {footerWidgets.some((w) => w.view && w.fullWidth) && (
          footerWidgets.map((w, i) => w.view && w.fullWidth && <div key={`fw${i}`}>{w.view}</div>)
        )}
        {(footerWidgets.some((w) => w.view && !w.fullWidth) || bodyWidgets.some((w) => w.view)) && (
          <div className="flex flex-wrap items-center">
            {footerWidgets.map((w, i) => w.view && !w.fullWidth && <div key={`f${i}`}>{w.view}</div>)}
            {bodyWidgets.map((w, i) => w.view && <div key={`b${i}`}>{w.view}</div>)}
          </div>
        )}
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="border-2 border-accent-ring rounded-lg bg-linear-to-b from-accent-tint to-tint shadow-md flex flex-col divide-y divide-line my-1 relative"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          handleCancel();
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      }}
    >
      {/* <div className="absolute inset-0 bg-accent2/5 z-0 pointer-events-none" /> */}
      {/* Header: name + cost + header widgets + ✓ done + ✕ cancel */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-accent/10 border-b border-accent/30">
        <input
          autoFocus
          className="flex-1 min-w-32 font-semibold text-base bg-transparent border-b border-transparent hover:border-trim focus:border-accent-ring outline-none px-0.5 py-0.5"
          placeholder="Name"
          defaultValue={draft.state.name}
          onChange={(e) =>
            draft.sync((d) => {
              d.name = e.target.value;
            })
          }
        />

        {!hideCost && isValueArr && currencies && (
          <CostDropdown
            value={draft.state.value as Value}
            className="bg-surface/50 border-accent text-ink"
            cost={draft.state.cost}
            currencies={currencies}
            onChange={(newValue, newCost) =>
              draft.set("Set cost", (d) => {
                d.value = newValue;
                d.cost = newCost;
              })
            }
            floatingDiscount={floatingDiscount ?? undefined}
          />
        )}

        {!hideCost && !isValueArr && (
          <div className="flex items-center gap-1.5">
            {costModifier !== CostModifier.Free && (
              <input
                type="number"
                step={50}
                className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring bg-surface"
                defaultValue={draft.state.value as number}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (!isNaN(n))
                    draft.sync((d) => {
                      d.value = n;
                    });
                }}
              />
            )}
            <span className="text-lg font-semibold uppercase">{currencyLabel}</span>
            {!hideCostModifier && costModifier === CostModifier.Custom && (
              <input
                type="number"
                step={50}
                className="w-20 border border-accent-ring bg-accent-tint rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                defaultValue={typeof customModifiedTo === "number" ? customModifiedTo : 0}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (!isNaN(n))
                    draft.sync((d) => {
                      if (d.cost.modifier === CostModifier.Custom) d.cost.modifiedTo = n;
                    });
                }}
              />
            )}
            {!hideCostModifier && (
              <ModifierSelect value={costModifier} onChange={setCostModifier} />
            )}
          </div>
        )}

        {headerWidgets.map(
          (w, i) =>
            w.edit && (
              <span key={i} className="shrink-0">
                {w.edit}
              </span>
            ),
        )}

        <button
          onClick={handleSubmit}
          className="text-muted hover:text-accent transition-colors p-0.5 shrink-0"
          title="Done"
        >
          <Check size={16} />
        </button>
        <button
          onClick={handleCancel}
          className="text-ghost hover:text-muted transition-colors p-0.5 shrink-0"
          title="Cancel"
        >
          <Undo2 size={15} />
        </button>
      </div>

      {/* Body widgets — above description in edit mode.
          2 widgets → side-by-side grid; any other count → stacked. */}
      {bodyWidgets.length === 2 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
          {bodyWidgets.map((w, i) => (
            <div key={i}>{w.edit}</div>
          ))}
        </div>
      ) : (
        bodyWidgets.map((w, i) => <div key={i}>{w.edit}</div>)
      )}

      {/* Description */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-muted mb-1">Description:</p>
        <AutoResizeTextarea
          className="w-full text-sm min-h-16 focus:outline-none placeholder-ghost"
          placeholder="Description"
          defaultValue={draft.state.description}
          onChange={(e) =>
            draft.sync((d) => {
              d.description = e.target.value;
            })
          }
        />
      </div>

      {/* Footer widgets — below description in edit mode */}
      {footerWidgets.map((w, i) => w.edit && <div key={i}>{w.edit}</div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubpurchasesSection — self-contained collapsible list of child purchases.
// Editing is entirely independent from the parent's edit session: add/remove
// write directly to the store as tracked (undo-able) actions.
// ─────────────────────────────────────────────────────────────────────────────

function SubpurchasesSection({
  parentId,
  defaultOpen = false,
  editMode = false,
}: {
  parentId: Id<GID.Purchase>;
  defaultOpen?: boolean;
  editMode?: boolean;
}) {
  const { purchase, actions } = usePurchase<BasicPurchase>(parentId);
  const currencies = useCurrencies(purchase?.jumpId);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [newSubIds, setNewSubIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const stipend = purchase?.subpurchases?.stipend ?? [];
  const list = purchase?.subpurchases?.list ?? [];

  // ── Stipend local buffer ─────────────────────────────────────────────────
  // Shadows store so inputs are responsive; flushed to store on blur.
  const [localStipend, setLocalStipend] = useState<Record<number, number>>({});

  useEffect(() => {
    const map: Record<number, number> = {};
    for (const sv of purchase?.subpurchases?.stipend ?? []) map[sv.currency as number] = sv.amount;
    setLocalStipend(map);
  }, [purchase?.subpurchases?.stipend]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushStipendAmount = (currId: Id<LID.Currency>, amount: number) => {
    actions.setSubpurchaseStipend(currId, amount);
  };

  // Header summary: "100 CP + 50 DP" — shown when there are non-zero stipend values
  const stipendSummary =
    currencies && stipend.some((sv) => sv.amount !== 0)
      ? formatValueStr(
          stipend.filter((sv) => sv.amount !== 0),
          currencies,
        )
      : null;

  const handleAdd = () => {
    const id = actions.addSubpurchase();
    setNewSubIds((prev) => new Set(prev).add(id));
    setIsOpen(true);
  };

  const currencyEntries = currencies
    ? (Object.entries(currencies.O) as [string, { abbrev: string }][])
    : [];

  // Compact mode: no subpurchases and no stipend set yet — show a minimal link.
  const isEmpty = list.length === 0 && !stipend.some((sv) => sv.amount !== 0);
  if (editMode && isEmpty) {
    return (
      <div className="flex justify-end px-3 py-1.5">
        <button
          onClick={handleAdd}
          className="text-xs text-ghost hover:text-accent transition-colors flex items-center gap-1"
        >
          <Plus size={11} />
          Add subpurchases
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-tint transition-colors"
        onClick={() => setIsOpen((o) => !o)}
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-ghost shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-ghost shrink-0" />
        )}
        <span className="flex-1 text-center text-xs font-medium text-muted select-none">
          Component Subpurchases
        </span>
        {stipendSummary && <span className="text-xs text-muted shrink-0">{stipendSummary}</span>}
        {list.length > 0 && (
          <span className="text-xs text-ghost tabular-nums shrink-0">({list.length})</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
          className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
          title="Add subpurchase"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Expanded body */}
      {isOpen && (
        <>
          {/* Stipend inputs — one row per currency */}
          {currencyEntries.length > 0 && (
            <div className="px-3 py-1 flex items-center justify-center flex-wrap gap-3">
              {currencyEntries.map(([cid, cur]) => {
                const currId = createId<LID.Currency>(+cid);
                return (
                  <div key={cid} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">{cur.abbrev} Stipend:</span>
                    <input
                      type="number"
                      step={50}
                      className="w-20 border border-edge rounded px-2 py-0.5 text-xs font-semibold text-right focus:outline-none focus:border-accent-ring"
                      value={localStipend[+cid] ?? 0}
                      onChange={(e) =>
                        setLocalStipend((prev) => ({ ...prev, [+cid]: +e.target.value }))
                      }
                      onBlur={(e) => flushStipendAmount(currId, +e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Subpurchase list */}
          <div className="px-3">
            {list.length === 0 && (
              <p className="text-xs text-ghost text-center py-2 italic">No subpurchases yet.</p>
            )}
            {list.length > 0 && (
              <DraggablePurchaseList
                ids={list}
                onReorder={actions.reorderSubpurchases}
                renderItem={(subId) => (
                  <PurchaseEditor<Subpurchase>
                    id={subId}
                    isNew={newSubIds.has(subId)}
                    onSubmit={() =>
                      setNewSubIds((prev) => {
                        const s = new Set(prev);
                        s.delete(subId);
                        return s;
                      })
                    }
                    onRemove={() => actions.removeSubpurchase(subId)}
                    subdued
                  />
                )}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration widget helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Shared pill button for duration options. */
function DurPill({
  label,
  active,
  onClick,
  children,
}: {
  label?: string;
  active: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? "bg-accent text-surface border-accent"
          : "border-edge text-muted hover:border-trim hover:text-ink"
      }`}
    >
      {children ?? label}
    </button>
  );
}

/** Compact badge shown in view mode when duration is non-default. */
function DurBadge({ children }: { children: ReactNode }) {
  return (
    <div className="pl-3 py-1">
      <span className="text-xs px-2 py-0.5 rounded-full bg-tint text-muted border border-edge">
        {children}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkedTagPills — shared tag view widget used by BasicPurchaseEditor and
// SupplementPurchaseEditor. Renders hyperlinked tags when route context is
// available, otherwise renders plain spans.
// ─────────────────────────────────────────────────────────────────────────────

function LinkedTagPills({
  tags,
  purchaseType,
}: {
  tags: string[];
  purchaseType: PurchaseType | undefined;
}) {
  const routeParams = useParams({ strict: false }) as { chainId?: string; charId?: string };
  const { chainId, charId } = routeParams;
  if (tags.length === 0) return null;
  return (
    <div className="pl-1.5 pr-3 py-2 flex flex-wrap gap-1.5">
      {tags.map((tag) =>
        chainId && charId ? (
          <Link
            key={tag}
            to={
              purchaseType === PurchaseType.Item
                ? "/chain/$chainId/char/$charId/items"
                : "/chain/$chainId/char/$charId/summary/perks"
            }
            params={{ chainId, charId }}
            search={{ tag }}
            className="flex items-center gap-0.5 text-xs bg-tint/30 border border-edge text-muted rounded px-1.5 py-0.5 hover:bg-accent-tint hover:text-accent hover:border-accent transition-colors"
          >
            <Tag size={9} />
            {tag}
          </Link>
        ) : (
          <span
            key={tag}
            className="flex items-center gap-0.5 text-xs bg-tint/30 text-muted rounded px-1.5 py-0.5"
          >
            <Tag size={9} />
            {tag}
          </span>
        ),
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BasicPurchaseEditor — Perk / Item, encapsulates PurchaseEditor with
// category, tag, and subtype widgets.
// ─────────────────────────────────────────────────────────────────────────────

export type BasicPurchaseEditorProps = {
  id: Id<GID.Purchase>;
  /** Called after the purchase is committed to the store. */
  onSubmit?: () => void;
  onRemove?: () => void;
  /** When true, the editor auto-opens in edit mode (used for newly created purchases). */
  isNew?: boolean;
  clipboardKey?: string;
};

export function BasicPurchaseEditor({
  id,
  onSubmit,
  onRemove,
  isNew,
  clipboardKey,
}: BasicPurchaseEditorProps) {
  const { purchase, actions } = usePurchase<BasicPurchase>(id);
  const subtypes = usePurchaseSubtypes(purchase?.jumpId);
  const routeParams = useParams({ strict: false }) as { chainId?: string; charId?: string };
  const categories = usePurchaseCategories(purchase?.type ?? PurchaseType.Perk);

  // Purchase group state
  const groupsEnabled = usePurchaseGroupsEnabled(purchase?.type ?? PurchaseType.Perk);
  const groupActions = usePurchaseGroupActions(purchase?.charId ?? createId<GID.Character>(0));
  const currentGroupId = purchase?.purchaseGroup;
  const groupName = usePurchaseGroupName(purchase?.charId, currentGroupId);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  // Separate tracked drafts — one UIBinding key each for independent undo entries.
  const categoriesDraft = useDraft<Id<GID.PurchaseCategory>[]>([]);
  const tagsDraft = useDraft<string[]>([]);
  const subtypeDraft = useDraft<{ subtype: Id<LID.PurchaseSubtype> }>({ subtype: createId(0) });
  const durationDraft = useDraft<{ duration: number | undefined }>({ duration: undefined });
  const floatingDiscountDraft = useDraft<{ usesFloatingDiscount: boolean }>({
    usesFloatingDiscount: false,
  });

  // ── Callbacks for PurchaseEditor lifecycle ───────────────────────────────

  const handleEnterEdit = () => {
    if (!purchase) return;
    categoriesDraft.restart([...purchase.categories]);
    tagsDraft.restart([...purchase.tags]);
    subtypeDraft.restart({ subtype: purchase.subtype });
    durationDraft.restart({ duration: purchase.duration });
    floatingDiscountDraft.restart({ usesFloatingDiscount: purchase.usesFloatingDiscount ?? false });
  };

  const handleCancel = () => {
    categoriesDraft.cancel();
    tagsDraft.cancel();
    subtypeDraft.cancel();
    durationDraft.cancel();
    floatingDiscountDraft.cancel();
  };

  const handleSubmit = () => {
    categoriesDraft.close();
    tagsDraft.close();
    subtypeDraft.close();
    durationDraft.close();
    floatingDiscountDraft.close();
    onSubmit?.();
  };

  const buildExtraPatch = (): object => {
    const currentSubtype = filteredSubtypeEntries.find(
      ([sid]) => +sid === subtypeDraft.state.subtype,
    )?.[1];
    const subtypeHasThresholds = !!currentSubtype?.floatingDiscountThresholds?.length;
    return {
      categories: categoriesDraft.state,
      tags: tagsDraft.state,
      subtype: subtypeDraft.state.subtype,
      duration: durationDraft.state.duration,
      usesFloatingDiscount:
        subtypeHasThresholds && floatingDiscountDraft.state.usesFloatingDiscount ? true : undefined,
    };
  };

  // ── Subtype helpers ──────────────────────────────────────────────────────
  const currentType = purchase?.type ?? PurchaseType.Perk;
  const filteredSubtypeEntries = subtypes
    ? (Object.entries(subtypes.O) as [string, PurchaseSubtype][]).filter(
        ([, st]) => st.type === currentType,
      )
    : [];

  // View: committed purchase data
  const committedSubtypeName = purchase
    ? (filteredSubtypeEntries.find(([sid]) => +sid === purchase.subtype)?.[1].name ??
      filteredSubtypeEntries[0]?.[1].name)
    : undefined;

  const subtypeViewLabel = committedSubtypeName ? (
    <span className="text-xs text-muted px-2 py-0.5 bg-tint rounded border border-edge shrink-0 select-none">
      {committedSubtypeName}
    </span>
  ) : null;

  // Edit: subtype draft
  const subtypeEditNode =
    filteredSubtypeEntries.length === 0 ? null : filteredSubtypeEntries.length === 1 ? (
      <span className="text-xs text-muted px-2 py-0.5 bg-tint rounded border border-edge shrink-0 select-none">
        {filteredSubtypeEntries[0][1].name}
      </span>
    ) : (
      <SelectField
        value={subtypeDraft.state.subtype}
        className="bg-surface/50 border-accent focus-within:border-surface text-ink/70"
        onChange={async (e) => {
          const newValue = e.target.value;
          const newSubtype = filteredSubtypeEntries.find(([sid]) => sid === newValue)?.[1];
          const hasSubpurchases = !!purchase?.subpurchases?.list?.length;

          if (!newSubtype?.allowSubpurchases && hasSubpurchases) {
            const result = await Swal.fire({
              title: "Delete subpurchases?",
              text: "This subtype doesn't allow compound purchases. Switching will delete all existing subpurchases. This can be undone with Ctrl+Z.",
              icon: "warning",
              showCancelButton: true,
              confirmButtonText: "Switch and delete",
              cancelButtonText: "Cancel",
              buttonsStyling: false,
              customClass: { confirmButton: "swal-btn-danger", cancelButton: "swal-btn" },
            });
            if (!result.isConfirmed) return;
            actions.clearSubpurchases();
          }

          subtypeDraft.set("Change subtype", (d) => {
            d.subtype = createId<LID.PurchaseSubtype>(+newValue);
          });
          if (!newSubtype?.floatingDiscountThresholds?.length) {
            floatingDiscountDraft.set("Clear floating discount", (d) => {
              d.usesFloatingDiscount = false;
            });
          }
        }}
      >
        {filteredSubtypeEntries.map(([sid, st]) => (
          <option key={sid} value={sid} className="bg-surface text-ink">
            {st.name}
          </option>
        ))}
      </SelectField>
    );

  // ── Category helpers ─────────────────────────────────────────────────────
  const categoryEntries = categories ? (Object.entries(categories.O) as [string, string][]) : [];

  const toggleCategory = (catId: Id<GID.PurchaseCategory>) =>
    categoriesDraft.set("Toggle category", (d) => {
      const idx = d.indexOf(catId);
      if (idx === -1) d.push(catId);
      else d.splice(idx, 1);
    });

  // ── Tag helpers ──────────────────────────────────────────────────────────

  // ── Categories widget ────────────────────────────────────────────────────
  const categoriesWidgetEdit = (
    <div className="px-3 py-2 flex items-start gap-2">
      <span className="text-xs text-muted shrink-0 pt-0.5">Category:</span>
      <div className="flex flex-wrap gap-1.5">
        {categoryEntries.map(([cid, name]) => {
          const catId = createId<GID.PurchaseCategory>(+cid);
          const active = categoriesDraft.state.includes(catId);
          return (
            <button
              key={cid}
              onClick={() => toggleCategory(catId)}
              className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                active
                  ? "bg-accent text-surface border-accent"
                  : "border-edge text-muted hover:border-trim"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );

  const committedCategories = purchase?.categories ?? [];
  const categoriesWidgetView = (
    <div className="pl-3 py-2 flex flex-wrap gap-1.5">
      {committedCategories.length == 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-tint text-muted border border-edge">
          Uncategorized
        </span>
      )}
      {committedCategories.map((catId) => {
        const name = categories?.O[catId];
        return name ? (
          <span
            key={catId}
            className="text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring"
          >
            {name}
          </span>
        ) : null;
      })}
    </div>
  );

  // ── Tags widget ──────────────────────────────────────────────────────────
  const tagsWidgetEdit = (
    <div className="px-3 py-2">
      <TagField
        label="Tags:"
        values={tagsDraft.state}
        onAdd={(val) => tagsDraft.set("Add tag", (d) => void d.push(val))}
        onRemove={(val) =>
          tagsDraft.set("Remove tag", (d) => {
            d.splice(d.indexOf(val), 1);
          })
        }
        placeholder="Add tag…"
      />
    </div>
  );

  const committedTags = purchase?.tags ?? [];
  const tagsWidgetView = <LinkedTagPills tags={committedTags} purchaseType={purchase?.type} />;

  // ── Subpurchases ─────────────────────────────────────────────────────────
  // Read from the committed subtype (draft subtype changes don't affect this
  // until the parent is submitted — subpurchase editing is independent).
  // ── Subpurchases ─────────────────────────────────────────────────────────
  // Read from the committed subtype (draft subtype changes don't affect this
  // until the parent is submitted — subpurchase editing is independent).
  const allowSubpurchases =
    purchase != null && subtypes != null
      ? subtypes.O[purchase.subtype]?.allowSubpurchases === true
      : false;

  // In view mode: hide the widget entirely when there's nothing to show.
  const hasSubpurchaseContent =
    (purchase?.subpurchases?.list?.length ?? 0) > 0 ||
    (purchase?.subpurchases?.stipend?.some((sv) => sv.amount !== 0) ?? false);

  const subpurchasesViewWidget =
    allowSubpurchases && hasSubpurchaseContent ? (
      <SubpurchasesSection parentId={id} defaultOpen />
    ) : null;

  // In edit mode: always show if allowed, and default to open.
  const subpurchasesEditWidget = allowSubpurchases ? (
    <SubpurchasesSection parentId={id} defaultOpen editMode />
  ) : null;

  // ── Duration widget (Perk / Item) ────────────────────────────────────────
  const durPerkEdit = (
    <div className="px-3 py-1.5 flex items-center gap-2">
      <span className="text-xs text-muted shrink-0">Duration:</span>
      <div className="flex gap-1">
        <DurPill
          label="Permanent"
          active={!durationDraft.state.duration}
          onClick={() =>
            durationDraft.set("Set duration", (d) => {
              delete d.duration;
            })
          }
        />
        <DurPill
          label="Temporary"
          active={durationDraft.state.duration === 1}
          onClick={() =>
            durationDraft.set("Set duration", (d) => {
              d.duration = 1;
            })
          }
        />
      </div>
    </div>
  );
  const durPerkView = purchase?.duration === 1 ? <DurBadge>Expires at end of jump</DurBadge> : null;

  // ── Group widget ─────────────────────────────────────────────────────────
  const showGroupWidget =
    groupsEnabled && (purchase?.type === PurchaseType.Perk || purchase?.type === PurchaseType.Item);

  // Pill shown in collapsed + expanded view rows (header position so it's always visible).
  const groupPill =
    showGroupWidget && currentGroupId != null ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setGroupModalOpen(true);
        }}
        className="text-xs px-2 py-0.5 rounded-full bg-accent-tint text-accent border border-accent/30 hover:bg-accent hover:text-surface transition-colors font-medium"
      >
        {groupName || "Unnamed"}
      </button>
    ) : null;

  // Edit-mode footer: "Add to group" link or pill to manage current group.
  const groupWidgetEdit = showGroupWidget ? (
    <div className="px-3 py-2">
      {currentGroupId != null ? (
        <button
          onClick={() => setGroupModalOpen(true)}
          className="text-xs px-2 py-0.5 rounded-full bg-accent-tint text-accent border border-accent/30 hover:bg-accent hover:text-surface transition-colors font-medium"
        >
          {groupName || "Unnamed"}
        </button>
      ) : (
        <button
          onClick={() => setGroupModalOpen(true)}
          className="text-xs text-accent hover:underline"
        >
          Add to {purchase?.type === PurchaseType.Item ? "Item" : "Perk"} group
        </button>
      )}
    </div>
  ) : null;

  // ── Floating discount ─────────────────────────────────────────────────────
  const draftSubtype = filteredSubtypeEntries.find(
    ([sid]) => +sid === subtypeDraft.state.subtype,
  )?.[1];
  const subtypeHasThresholds = !!draftSubtype?.floatingDiscountThresholds?.length;

  const floatingDiscountProp = subtypeHasThresholds
    ? {
        checked: floatingDiscountDraft.state.usesFloatingDiscount,
        onChange: (checked: boolean) =>
          floatingDiscountDraft.set("Toggle floating discount", (d) => {
            d.usesFloatingDiscount = checked;
          }),
      }
    : null;

  // ── Widget definitions ───────────────────────────────────────────────────
  // Two body widgets → PurchaseEditor lays them out as a 2-column grid.
  const widgets: WidgetDef[] = [
    { view: groupPill, edit: null, position: "header" },
    { view: subtypeViewLabel, edit: subtypeEditNode, position: "header" },
    { view: categoriesWidgetView, edit: categoriesWidgetEdit, position: "body" },
    { view: tagsWidgetView, edit: tagsWidgetEdit, position: "body" },
    { view: subpurchasesViewWidget, edit: subpurchasesEditWidget, position: "footer", fullWidth: true },
    { view: durPerkView, edit: durPerkEdit, position: "footer" },
    { view: null, edit: groupWidgetEdit, position: "footer" },
  ];

  return (
    <>
      <PurchaseEditor<BasicPurchase>
        id={id}
        widgets={widgets}
        buildExtraPatch={buildExtraPatch}
        onSubmit={handleSubmit}
        onRemove={onRemove}
        onEnterEdit={handleEnterEdit}
        onCancel={handleCancel}
        isNew={isNew}
        clipboardKey={clipboardKey}
        floatingDiscount={floatingDiscountProp}
      />
      {groupModalOpen && purchase && showGroupWidget && (
        <PurchaseGroupModal
          charId={purchase.charId}
          charIdStr={routeParams.charId ?? String(purchase.charId)}
          chainId={routeParams.chainId ?? ""}
          purchaseId={id}
          type={purchase.type as PurchaseType.Perk | PurchaseType.Item}
          currentGroupId={currentGroupId}
          onAddToGroup={(gId) => groupActions.addToGroup(id, gId)}
          onRemoveFromGroup={() => {
            if (currentGroupId != null) groupActions.removeFromGroup(id, currentGroupId);
          }}
          onCreateGroup={(name, desc) =>
            groupActions.createGroup(
              purchase.type as PurchaseType.Perk | PurchaseType.Item,
              name,
              desc,
            )
          }
          onClose={() => setGroupModalOpen(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PerkItemRewardChip — reads purchase name via hook for the view widget.
// ─────────────────────────────────────────────────────────────────────────────

function PerkItemRewardChip({
  reward,
}: {
  reward: Extract<ScenarioReward, { type: RewardType.Perk | RewardType.Item }>;
}) {
  const name = usePurchaseName(reward.id);
  const typeLabel = reward.type === RewardType.Perk ? "Perk" : "Item";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-accent-tint2 text-accent2 border border-accent2-ring">
      {typeLabel}: {name ?? "?"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScenarioEditor — wraps PurchaseEditor with a footer widget for rewards.
// ─────────────────────────────────────────────────────────────────────────────

export type ScenarioEditorProps = {
  id: Id<GID.Purchase>;
  onSubmit?: () => void;
  onRemove?: () => void;
  /** When true, the editor auto-opens in edit mode (used for newly created scenarios). */
  isNew?: boolean;
  clipboardKey?: string;
};

export function ScenarioEditor({
  id,
  onSubmit,
  onRemove,
  isNew,
  clipboardKey,
}: ScenarioEditorProps) {
  const { purchase } = usePurchase<Scenario>(id);
  const currencies = useCurrencies(purchase?.jumpId);
  const subtypes = usePurchaseSubtypes(purchase?.jumpId);

  const rewardsDraft = useDraft<ScenarioReward[]>([]);

  const handleEnterEdit = () => rewardsDraft.restart([...(purchase?.rewards ?? [])]);
  const handleCancel = () => rewardsDraft.cancel();
  const handleSubmit = () => {
    rewardsDraft.close();
    onSubmit?.();
  };

  const buildExtraPatch = (): object => ({ rewards: rewardsDraft.state });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const currencyEntries = currencies
    ? (Object.entries(currencies.O) as [string, { name: string; abbrev: string }][])
    : [];
  const subtypeEntries = subtypes
    ? (Object.entries(subtypes.O) as [string, PurchaseSubtype][])
    : [];

  const firstCurrId = () => createId<LID.Currency>(+(currencyEntries[0]?.[0] ?? 0));
  const firstStId = () => createId<LID.PurchaseSubtype>(+(subtypeEntries[0]?.[0] ?? 0));

  const formatReward = (r: ScenarioReward): string => {
    switch (r.type) {
      case RewardType.Currency: {
        const abbrev = currencies?.O[r.currency]?.abbrev ?? "?";
        return `${r.value} ${abbrev}`;
      }
      case RewardType.Stipend: {
        const abbrev = currencies?.O[r.currency]?.abbrev ?? "?";
        const stName = subtypes?.O[r.subtype]?.name ?? "?";
        return `${stName} Stipend: ${r.value} ${abbrev}`;
      }
      case RewardType.Note:
        return r.note;
      default:
        return "";
    }
  };

  // sync: for value/text inputs (native browser undo covers per-keystroke changes)
  const syncReward = (idx: number, updated: ScenarioReward) =>
    rewardsDraft.sync((d) => {
      d[idx] = updated;
    });
  // set: for select/dropdown changes (creates undoable entry within the draft session)
  const setReward = (idx: number, updated: ScenarioReward) =>
    rewardsDraft.set("Update reward", (d) => {
      d[idx] = updated;
    });

  const removeReward = (idx: number) =>
    rewardsDraft.set("Remove reward", (d) => {
      d.splice(idx, 1);
    });

  const addReward = (type: RewardType.Currency | RewardType.Stipend | RewardType.Note) => {
    const r: ScenarioReward =
      type === RewardType.Currency
        ? { type, value: 0, currency: firstCurrId() }
        : type === RewardType.Stipend
          ? { type, value: 0, currency: firstCurrId(), subtype: firstStId() }
          : { type: RewardType.Note, note: "" };
    rewardsDraft.set("Add reward", (d) => {
      d.push(r);
    });
  };

  // ── View widget ──────────────────────────────────────────────────────────
  const committedRewards = purchase?.rewards ?? [];
  const rewardsViewWidget =
    committedRewards.length > 0 ? (
      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted shrink-0">Rewards:</span>
        {committedRewards.map((r, i) =>
          r.type === RewardType.Perk || r.type === RewardType.Item ? (
            <PerkItemRewardChip key={i} reward={r} />
          ) : (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-accent-tint2 text-accent2 border border-accent2-ring"
            >
              {formatReward(r)}
            </span>
          ),
        )}
      </div>
    ) : null;

  // ── Edit widget ───────────────────────────────────────────────────────────
  const rewardsEditWidget = (
    <div className="px-3 py-2.5 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted text-center">Rewards:</p>

      {rewardsDraft.state.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2 flex-wrap">
          {r.type === RewardType.Currency && (
            <>
              <span className="text-xs text-muted shrink-0">Currency:</span>
              <input
                type="number"
                step={50}
                className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                value={r.value}
                onChange={(e) => syncReward(idx, { ...r, value: +e.target.value })}
              />
              {currencyEntries.length > 1 ? (
                <SelectField
                  value={r.currency}
                  onChange={(e) =>
                    setReward(idx, { ...r, currency: createId<LID.Currency>(+e.target.value) })
                  }
                >
                  {currencyEntries.map(([cid, cur]) => (
                    <option key={cid} value={cid}>
                      {cur.abbrev}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <span className="text-xs text-muted">{currencyEntries[0]?.[1].abbrev}</span>
              )}
            </>
          )}

          {r.type === RewardType.Stipend && (
            <>
              <span className="text-xs text-muted shrink-0">Stipend:</span>
              <input
                type="number"
                step={50}
                className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                value={r.value}
                onChange={(e) => syncReward(idx, { ...r, value: +e.target.value })}
              />
              {currencyEntries.length > 1 ? (
                <SelectField
                  value={r.currency}
                  onChange={(e) =>
                    setReward(idx, { ...r, currency: createId<LID.Currency>(+e.target.value) })
                  }
                >
                  {currencyEntries.map(([cid, cur]) => (
                    <option key={cid} value={cid}>
                      {cur.abbrev}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <span className="text-xs text-muted">{currencyEntries[0]?.[1].abbrev}</span>
              )}
              for
              {subtypeEntries.length > 0 && (
                <SelectField
                  value={r.subtype}
                  onChange={(e) =>
                    setReward(idx, {
                      ...r,
                      subtype: createId<LID.PurchaseSubtype>(+e.target.value),
                    })
                  }
                >
                  {subtypeEntries.map(([sid, st]) => (
                    <option key={sid} value={sid}>
                      {st.name}
                      {st.name.at(-1) == "s" ? "" : "s"}
                    </option>
                  ))}
                </SelectField>
              )}
            </>
          )}

          {r.type === RewardType.Note && (
            <>
              <span className="text-xs text-muted shrink-0">Note:</span>
              <input
                className="flex-1 min-w-32 border border-edge rounded px-2 py-0.5 text-sm focus:outline-none focus:border-accent-ring"
                value={r.note}
                onChange={(e) => syncReward(idx, { ...r, note: e.target.value })}
              />
            </>
          )}

          {(r.type === RewardType.Item || r.type === RewardType.Perk) && (
            <span className="text-xs text-muted italic flex-1">
              Purchase reward (not editable here)
            </span>
          )}

          <button
            type="button"
            onClick={() => removeReward(idx)}
            className="ml-auto text-ghost hover:text-danger transition-colors p-0.5 shrink-0"
            title="Remove reward"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-xs text-ghost">Add:</span>
        <button
          type="button"
          onClick={() => addReward(RewardType.Currency)}
          className="text-xs px-2 py-0.5 rounded border border-edge text-muted hover:border-trim hover:text-ink transition-colors"
        >
          + Currency
        </button>
        {subtypeEntries.length > 0 && (
          <button
            type="button"
            onClick={() => addReward(RewardType.Stipend)}
            className="text-xs px-2 py-0.5 rounded border border-edge text-muted hover:border-trim hover:text-ink transition-colors"
          >
            + Stipend
          </button>
        )}
        <button
          type="button"
          onClick={() => addReward(RewardType.Note)}
          className="text-xs px-2 py-0.5 rounded border border-edge text-muted hover:border-trim hover:text-ink transition-colors"
        >
          + Note
        </button>
      </div>
    </div>
  );

  const widgets: WidgetDef[] = [
    { view: rewardsViewWidget, edit: rewardsEditWidget, position: "footer" },
    {
      view: <div className="w-0 h-6" />,
      edit: <></>,
      position: "header",
    },
  ];

  return (
    <PurchaseEditor<Scenario>
      id={id}
      widgets={widgets}
      buildExtraPatch={buildExtraPatch}
      onSubmit={handleSubmit}
      onRemove={onRemove}
      onEnterEdit={handleEnterEdit}
      onCancel={handleCancel}
      hideCost
      isNew={isNew}
      clipboardKey={clipboardKey}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplementScenarioEditor — like ScenarioEditor but for supplement milestones.
// Currency reward has no currency ID (uses the supplement's own currency label).
// No Stipend reward type.
// ─────────────────────────────────────────────────────────────────────────────

export type SupplementScenarioEditorProps = {
  id: Id<GID.Purchase>;
  /** The supplement's currency label (e.g. "SP"). */
  currency: string;
  onSubmit?: () => void;
  onRemove?: () => void;
  isNew?: boolean;
  clipboardKey?: string;
};

export function SupplementScenarioEditor({
  id,
  currency,
  onSubmit,
  onRemove,
  isNew,
  clipboardKey,
}: SupplementScenarioEditorProps) {
  const { purchase } = usePurchase<SupplementScenario>(id);

  const rewardsDraft = useDraft<SupplementScenarioReward[]>([]);

  const handleEnterEdit = () => rewardsDraft.restart([...(purchase?.rewards ?? [])]);
  const handleCancel = () => rewardsDraft.cancel();
  const handleSubmit = () => {
    rewardsDraft.close();
    onSubmit?.();
  };

  const buildExtraPatch = (): object => ({ rewards: rewardsDraft.state });

  const formatReward = (r: SupplementScenarioReward): string => {
    switch (r.type) {
      case RewardType.Currency:
        return `${r.value} ${currency}`;
      case RewardType.Note:
        return r.note;
      default:
        return "";
    }
  };

  const syncReward = (idx: number, updated: SupplementScenarioReward) =>
    rewardsDraft.sync((d) => {
      d[idx] = updated;
    });

  const removeReward = (idx: number) =>
    rewardsDraft.set("Remove reward", (d) => {
      d.splice(idx, 1);
    });

  const addReward = (type: RewardType.Currency | RewardType.Note) => {
    const r: SupplementScenarioReward =
      type === RewardType.Currency ? { type, value: 0 } : { type: RewardType.Note, note: "" };
    rewardsDraft.set("Add reward", (d) => {
      d.push(r);
    });
  };

  // ── View widget ──────────────────────────────────────────────────────────
  const committedRewards = purchase?.rewards ?? [];
  const rewardsViewWidget =
    committedRewards.length > 0 ? (
      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted shrink-0">Rewards:</span>
        {committedRewards.map((r, i) =>
          r.type === RewardType.Perk || r.type === RewardType.Item ? (
            <PerkItemRewardChip key={i} reward={r} />
          ) : (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-accent-tint2 text-accent2 border border-accent2-ring"
            >
              {formatReward(r)}
            </span>
          ),
        )}
      </div>
    ) : null;

  // ── Edit widget ───────────────────────────────────────────────────────────
  const rewardsEditWidget = (
    <div className="px-3 py-2.5 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted text-center">Rewards:</p>

      {rewardsDraft.state.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2 flex-wrap">
          {r.type === RewardType.Currency && (
            <>
              <span className="text-xs text-muted shrink-0">Currency:</span>
              <input
                type="number"
                step={50}
                className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                value={r.value}
                onChange={(e) => syncReward(idx, { ...r, value: +e.target.value })}
              />
              <span className="text-xs text-muted">{currency}</span>
            </>
          )}

          {r.type === RewardType.Note && (
            <>
              <span className="text-xs text-muted shrink-0">Note:</span>
              <input
                className="flex-1 min-w-32 border border-edge rounded px-2 py-0.5 text-sm focus:outline-none focus:border-accent-ring"
                value={r.note}
                onChange={(e) => syncReward(idx, { ...r, note: e.target.value })}
              />
            </>
          )}

          {(r.type === RewardType.Item || r.type === RewardType.Perk) && (
            <span className="text-xs text-muted italic flex-1">
              Purchase reward (not editable here)
            </span>
          )}

          <button
            type="button"
            onClick={() => removeReward(idx)}
            className="ml-auto text-ghost hover:text-danger transition-colors p-0.5 shrink-0"
            title="Remove reward"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-xs text-ghost">Add:</span>
        <button
          type="button"
          onClick={() => addReward(RewardType.Currency)}
          className="text-xs px-2 py-0.5 rounded border border-edge text-muted hover:border-trim hover:text-ink transition-colors"
        >
          + Currency
        </button>
        <button
          type="button"
          onClick={() => addReward(RewardType.Note)}
          className="text-xs px-2 py-0.5 rounded border border-edge text-muted hover:border-trim hover:text-ink transition-colors"
        >
          + Note
        </button>
      </div>
    </div>
  );

  const widgets: WidgetDef[] = [
    { view: rewardsViewWidget, edit: rewardsEditWidget, position: "footer" },
    {
      view: <div className="w-0 h-6" />,
      edit: <></>,
      position: "header",
    },
  ];

  return (
    <PurchaseEditor<SupplementScenario>
      id={id}
      widgets={widgets}
      buildExtraPatch={buildExtraPatch}
      onSubmit={handleSubmit}
      onRemove={onRemove}
      onEnterEdit={handleEnterEdit}
      onCancel={handleCancel}
      hideCost
      isNew={isNew}
      clipboardKey={clipboardKey}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DrawbackEditor — wraps PurchaseEditor with a duration footer widget.
// ─────────────────────────────────────────────────────────────────────────────

export type DrawbackEditorProps = {
  id: Id<GID.Purchase>;
  onSubmit?: () => void;
  onRemove?: () => void;
  isNew?: boolean;
  /** Extra header widgets (e.g. DrawbackOverrideCard spacer) */
  headerWidgets?: WidgetDef[];
  /** When true, hides the cost-modifier dropdown (Reduced, Custom, etc.). */
  hideCostModifier?: boolean;
  clipboardKey?: string;
};

export function DrawbackEditor({
  id,
  onSubmit,
  onRemove,
  isNew,
  headerWidgets = [],
  hideCostModifier = false,
  clipboardKey,
}: DrawbackEditorProps) {
  const { purchase } = usePurchase<AbstractPurchase>(id);
  const jumpId = (purchase as JumpPurchase | undefined)?.jumpId;
  const subtypes = usePurchaseSubtypes(jumpId);
  const durationDraft = useDraft<{
    duration: number | undefined;
    subtype: Id<LID.PurchaseSubtype> | null | undefined;
    itemStipend: number | undefined;
    companionStipend: number | undefined;
  }>({ duration: undefined, subtype: null, itemStipend: undefined, companionStipend: undefined });
  // Local state for the "N jumps" number — kept in sync with the draft.
  const [nJumps, setNJumps] = useState<number>(2);

  const handleEnterEdit = () => {
    const dur = purchase?.duration;
    const p = purchase as
      | {
          subtype?: Id<LID.PurchaseSubtype> | null;
          itemStipend?: number;
          companionStipend?: number;
        }
      | undefined;
    durationDraft.restart({
      duration: dur,
      subtype: p?.subtype ?? null,
      itemStipend: p?.itemStipend,
      companionStipend: p?.companionStipend,
    });
    if (dur != null && dur > 1) setNJumps(dur);
  };
  const handleCancel = () => durationDraft.cancel();
  const handleSubmit = () => {
    durationDraft.close();
    onSubmit?.();
  };
  const buildExtraPatch = (): object =>
    purchase?.type === PurchaseType.ChainDrawback
      ? {
          duration: durationDraft.state.duration,
          itemStipend: durationDraft.state.itemStipend || undefined,
          companionStipend: durationDraft.state.companionStipend || undefined,
        }
      : {
          duration: durationDraft.state.duration,
          subtype: durationDraft.state.subtype ?? null,
        };

  // Derived state
  const dur = durationDraft.state.duration;
  const mode: "perm" | "temp" | "n" = !dur ? "perm" : dur === 1 ? "temp" : "n";

  const durDrawbackEdit = (
    <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted shrink-0">Duration:</span>
      <div className="flex items-center gap-1 flex-wrap">
        <DurPill
          label="Permanent until revoked"
          active={mode === "perm"}
          onClick={() =>
            durationDraft.set("Set duration", (d) => {
              delete d.duration;
            })
          }
        />
        <DurPill
          label="Temporary"
          active={mode === "temp"}
          onClick={() =>
            durationDraft.set("Set duration", (d) => {
              d.duration = 1;
            })
          }
        />
        {/* "N jumps" pill — clicking it activates; inline number input when active */}
        <div
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
            mode === "n"
              ? "bg-accent border-accent"
              : "border-edge text-muted hover:border-trim hover:text-ink"
          }`}
          onClick={() => {
            if (mode !== "n") {
              durationDraft.set("Set duration", (d) => {
                d.duration = nJumps;
              });
            }
          }}
        >
          <input
            type="number"
            min={2}
            className={`w-8 text-xs bg-transparent text-center outline-none ${mode === "n" ? "text-surface" : "text-muted"}`}
            value={nJumps}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = Math.max(2, +e.target.value || 2);
              setNJumps(v);
              durationDraft.set("Set duration", (d) => {
                d.duration = v;
              });
            }}
          />
          <span className={mode === "n" ? "text-surface" : ""}>jumps</span>
        </div>
      </div>
    </div>
  );

  // View: only show for multi-jump durations (≥2). Permanent (undefined) and
  // temporary (1) are both common defaults; neither needs a badge.
  const committedDur = purchase?.duration;
  const durDrawbackView =
    committedDur != null && committedDur > 1 ? <DurBadge>{committedDur} jumps</DurBadge> : null;

  // Subtype widget (PurchaseType.Drawback only)
  const isJumpDrawback = purchase?.type === PurchaseType.Drawback;
  const isChainDrawback = purchase?.type === PurchaseType.ChainDrawback;
  const committedSubtype = isJumpDrawback
    ? ((purchase as { subtype?: Id<LID.PurchaseSubtype> | null }).subtype ?? null)
    : null;
  const subtypeEntries = Object.entries(subtypes?.O ?? {}).filter(
    (entry): entry is [string, PurchaseSubtype] => entry[1] != null,
  );

  // Only show pill in view mode when a subtype is actually set (Allowance = no pill)
  const subtypeView =
    isJumpDrawback && committedSubtype != null ? (
      <div className="pl-3 py-2 flex flex-wrap gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring">
          {subtypes?.O[committedSubtype]?.name ?? "?"} Stipend
        </span>
      </div>
    ) : null;

  const draftIsAllowance = durationDraft.state.subtype == null;
  const subtypeEdit = isJumpDrawback ? (
    <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted shrink-0">Type:</span>
      <SegmentedControl
        value={draftIsAllowance ? "allowance" : "stipend"}
        options={[
          { value: "allowance", label: "Allowance" },
          { value: "stipend", label: "Stipend" },
        ]}
        onChange={(v) => {
          if (v === "allowance") {
            durationDraft.set("Set drawback type", (d) => {
              d.subtype = null;
            });
          } else {
            const firstId = subtypeEntries[0]?.[0];
            if (firstId != null)
              durationDraft.set("Set drawback type", (d) => {
                d.subtype = createId<LID.PurchaseSubtype>(+firstId);
              });
          }
        }}
      />
      {/* Per-subtype pills — visible when Stipend is active */}
      {!draftIsAllowance &&
        subtypeEntries.map(([idStr, sub]) => {
          const sid = createId<LID.PurchaseSubtype>(+idStr);
          const active = (durationDraft.state.subtype as number) === +idStr;
          return (
            <button
              key={idStr}
              onClick={() =>
                durationDraft.set("Set drawback subtype", (d) => {
                  d.subtype = sid;
                })
              }
              className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                active
                  ? "bg-accent text-surface border-accent"
                  : "border-edge text-muted hover:border-trim hover:text-ink"
              }`}
            >
              {sub.name} Stipend
            </button>
          );
        })}
    </div>
  ) : null;

  // Stipend widget (PurchaseType.ChainDrawback only)
  const pChain = purchase as { itemStipend?: number; companionStipend?: number } | undefined;
  const committedItemStipend = isChainDrawback ? (pChain?.itemStipend ?? 0) : 0;
  const committedCompanionStipend = isChainDrawback ? (pChain?.companionStipend ?? 0) : 0;

  const stipendView =
    isChainDrawback && (committedItemStipend > 0 || committedCompanionStipend > 0) ? (
      <div className="px-3 py-1.5 flex items-center gap-4 flex-wrap text-xs text-muted">
        {committedItemStipend > 0 && (
          <span>
            Item Stipend: <span className="font-semibold text-ink">{committedItemStipend}</span>
          </span>
        )}
        {committedCompanionStipend > 0 && (
          <span>
            Companion Stipend:{" "}
            <span className="font-semibold text-ink">{committedCompanionStipend}</span>
          </span>
        )}
      </div>
    ) : null;

  const stipendEdit = isChainDrawback ? (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted shrink-0">Item Stipend:</span>
        <input
          type="number"
          min={0}
          step={50}
          className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
          defaultValue={durationDraft.state.itemStipend ?? 0}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (!isNaN(n))
              durationDraft.sync((d) => {
                d.itemStipend = n || undefined;
              });
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted shrink-0">Companion Stipend:</span>
        <input
          type="number"
          min={0}
          step={50}
          className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
          defaultValue={durationDraft.state.companionStipend ?? 0}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (!isNaN(n))
              durationDraft.sync((d) => {
                d.companionStipend = n || undefined;
              });
          }}
        />
      </div>
    </div>
  ) : null;

  const placeholderWidget = <div className="w-0 h-6" />;

  const costSuffix =
    isJumpDrawback && committedSubtype != null
      ? `for ${subtypes?.O[committedSubtype]?.name ?? "?"}`
      : undefined;

  const widgets: WidgetDef[] = [
    ...headerWidgets,
    {
      view: isChainDrawback ? stipendView : subtypeView,
      edit: isChainDrawback ? stipendEdit : subtypeEdit,
      position: "body",
    },
    { view: placeholderWidget, edit: null, position: "header" },
    { view: durDrawbackView, edit: durDrawbackEdit, position: "footer" },
  ];

  return (
    <PurchaseEditor<AbstractPurchase>
      id={id}
      widgets={widgets}
      buildExtraPatch={buildExtraPatch}
      onSubmit={handleSubmit}
      onRemove={onRemove}
      onEnterEdit={handleEnterEdit}
      onCancel={handleCancel}
      isNew={isNew}
      hideCostModifier={hideCostModifier}
      costSuffix={costSuffix}
      clipboardKey={clipboardKey}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplementPurchaseEditor — wraps PurchaseEditor with a duration footer widget.
// Supports Permanent / Temporary (1 jump) / N jumps, matching DrawbackEditor.
// ─────────────────────────────────────────────────────────────────────────────

export type SupplementPurchaseEditorProps = {
  id: Id<GID.Purchase>;
  onSubmit?: () => void;
  onRemove?: () => void;
  isNew?: boolean;
  currencyLabel?: string;
  clipboardKey?: string;
};

export function SupplementPurchaseEditor({
  id,
  onSubmit,
  onRemove,
  isNew,
  currencyLabel,
  clipboardKey,
}: SupplementPurchaseEditorProps) {
  const { purchase } = usePurchase<SupplementPurchase>(id);
  const suppId = purchase?.supplement;
  const categories = useSupplementPurchaseCategories(suppId);
  const durationDraft = useDraft<{ duration: number | undefined }>({ duration: undefined });
  const categoriesDraft = useDraft<Id<GID.PurchaseCategory>[]>([]);
  const tagsDraft = useDraft<string[]>([]);
  const [nJumps, setNJumps] = useState<number>(2);

  const handleEnterEdit = () => {
    const dur = purchase?.duration;
    durationDraft.restart({ duration: dur });
    categoriesDraft.restart([...(purchase?.categories ?? [])]);
    tagsDraft.restart([...(purchase?.tags ?? [])]);
    if (dur != null && dur > 1) setNJumps(dur);
  };
  const handleCancel = () => {
    durationDraft.cancel();
    categoriesDraft.cancel();
    tagsDraft.cancel();
  };
  const handleSubmit = () => {
    durationDraft.close();
    categoriesDraft.close();
    tagsDraft.close();
    onSubmit?.();
  };
  const buildExtraPatch = (): object => ({
    duration: durationDraft.state.duration,
    categories: categoriesDraft.state,
    tags: tagsDraft.state,
  });

  const dur = durationDraft.state.duration;
  const mode: "perm" | "temp" | "n" = !dur ? "perm" : dur === 1 ? "temp" : "n";

  const durEdit = (
    <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted shrink-0">Duration:</span>
      <div className="flex items-center gap-1 flex-wrap">
        <DurPill
          label="Permanent"
          active={mode === "perm"}
          onClick={() =>
            durationDraft.set("Set duration", (d) => {
              delete d.duration;
            })
          }
        />
        <div
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
            mode !== "perm"
              ? "bg-accent-tint border-accent text-accent"
              : "border-edge text-muted hover:border-trim hover:text-ink"
          }`}
          onClick={() => {
            if (mode === "perm")
              durationDraft.set("Set duration", (d) => {
                d.duration = nJumps;
              });
          }}
        >
          <input
            type="number"
            min={1}
            className={`w-8 text-xs bg-transparent text-center outline-none ${mode !== "perm" ? "text-accent" : "text-muted"}`}
            value={mode !== "perm" ? (durationDraft.state.duration ?? nJumps) : nJumps}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = Math.max(1, +e.target.value || 1);
              setNJumps(v);
              durationDraft.set("Set duration", (d) => {
                d.duration = v;
              });
            }}
          />
          <span>jumps</span>
        </div>
      </div>
    </div>
  );

  const committedDur = purchase?.duration;
  const durView =
    committedDur == null ? null : committedDur === 1 ? (
      <DurBadge>Expires at end of jump</DurBadge>
    ) : (
      <DurBadge>{committedDur} jumps</DurBadge>
    );

  // ── Categories widget ─────────────────────────────────────────────────────
  const categoryEntries = categories ? (Object.entries(categories.O) as [string, string][]) : [];
  const toggleCategory = (catId: Id<GID.PurchaseCategory>) =>
    categoriesDraft.set("Toggle category", (d) => {
      const idx = d.indexOf(catId);
      if (idx === -1) d.push(catId);
      else d.splice(idx, 1);
    });
  const categoriesWidgetEdit =
    categoryEntries.length > 0 ? (
      <div className="px-3 py-2 flex items-start gap-2">
        <span className="text-xs text-muted shrink-0 pt-0.5">Category:</span>
        <div className="flex flex-wrap gap-1.5">
          {categoryEntries.map(([cid, name]) => {
            const catId = createId<GID.PurchaseCategory>(+cid);
            const active = categoriesDraft.state.includes(catId);
            return (
              <button
                key={cid}
                onClick={() => toggleCategory(catId)}
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  active
                    ? "bg-accent text-surface border-accent"
                    : "border-edge text-muted hover:border-trim"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;
  const committedCategories = purchase?.categories ?? [];
  const categoriesWidgetView =
    committedCategories.length > 0 ? (
      <div className="pl-3 py-2 flex flex-wrap gap-1.5">
        {committedCategories.map((catId) => {
          const name = categories?.O[catId];
          return name ? (
            <span
              key={catId}
              className="text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring"
            >
              {name}
            </span>
          ) : null;
        })}
      </div>
    ) : null;

  // ── Tags widget ───────────────────────────────────────────────────────────
  const tagsWidgetEdit = (
    <div className="px-3 py-2">
      <TagField
        label="Tags:"
        values={tagsDraft.state}
        onAdd={(val) => tagsDraft.set("Add tag", (d) => void d.push(val))}
        onRemove={(val) =>
          tagsDraft.set("Remove tag", (d) => {
            d.splice(d.indexOf(val), 1);
          })
        }
        placeholder="Add tag…"
      />
    </div>
  );
  const committedTags = purchase?.tags ?? [];
  const tagsWidgetView = <LinkedTagPills tags={committedTags} purchaseType={purchase?.type} />;

  const widgets: WidgetDef[] = [
    { view: categoriesWidgetView, edit: categoriesWidgetEdit, position: "body" },
    { view: tagsWidgetView, edit: tagsWidgetEdit, position: "body" },
    { view: durView, edit: durEdit, position: "footer" },
  ];

  return (
    <PurchaseEditor<AbstractPurchase>
      id={id}
      widgets={widgets}
      buildExtraPatch={buildExtraPatch}
      onSubmit={handleSubmit}
      onRemove={onRemove}
      onEnterEdit={handleEnterEdit}
      onCancel={handleCancel}
      isNew={isNew}
      currencyLabel={currencyLabel}
      clipboardKey={clipboardKey}
    />
  );
}
