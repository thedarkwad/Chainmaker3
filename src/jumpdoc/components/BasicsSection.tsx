/**
 * BasicsSection — metadata, currencies, origin categories, and purchase subtypes
 * for the JumpDoc editor. Uses the pill/expand pattern (no nested collapsible sections).
 */

import { useState, useRef, useEffect } from "react";
import { Crosshair, Plus, Shuffle, Trash2, X } from "lucide-react";
import { Pill, AddPill, DeleteButton } from "@/ui/FormPrimitives";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { BlurInput, BlurNumberInput } from "./JumpDocFields";
import { CostDropdown } from "@/ui/CostDropdown";
import { Tip } from "@/ui/Tip";
import {
  useJumpDoc,
  useModifyJumpDoc,
  useJumpDocCurrencyIds,
  useJumpDocCurrency,
  useModifyJumpDocCurrency,
  useAddJumpDocCurrency,
  useRemoveJumpDocCurrency,
  useJumpDocOriginCategoryIds,
  useJumpDocOriginCategory,
  useModifyJumpDocOriginCategory,
  useAddJumpDocOriginCategory,
  useRemoveJumpDocOriginCategory,
  useRemoveJumpDocOriginsByCategory,
  useJumpDocPurchaseSubtypeIds,
  useJumpDocPurchaseSubtype,
  useModifyJumpDocPurchaseSubtype,
  useAddJumpDocPurchaseSubtype,
  useRemoveJumpDocPurchaseSubtype,
  useJumpDocCurrenciesRegistry,
  useJumpDocFreeFormOptions,
  useJumpDocOriginRandom,
  useModifyJumpDocFreeFormOptions,
  useJumpDocExchanges,
  useAddJumpDocExchange,
  useModifyJumpDocExchange,
  useRemoveJumpDocExchange,
  useAddBoundToExchange,
  useRemoveBoundFromExchange,
  useJumpDocPurchaseIdsBySubtype,
  useAddAltCostToSubtypePurchases,
} from "@/jumpdoc/state/hooks";
import { createId, type Id, type Registry } from "@/chain/data/types";
import { TID, LID } from "@/chain/data/types";
import { CostModifier, PurchaseType, SimpleValue, type Value } from "@/chain/data/Purchase";
import type { ReactNode } from "react";
import type {
  DocOriginCategory,
  DocCurrencyExchange,
  FreeFormOrigin,
  PageRect,
  AlternativeCost,
} from "@/chain/data/JumpDoc";
import { AlternativeCostEditor } from "./AlternativeCostEditor";
import type { Currency } from "@/chain/data/Jump";
import type { AddBoundsTarget } from "./sectionTypes";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Checkbox } from "@/ui/Checkbox";

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-muted mb-0.5">{children}</p>;
}

/** Compact inline text input — same blur-commit pattern as BlurInput but text-xs styled. */
function InlineTextInput({
  value,
  onCommit,
  placeholder,
  disabled = false,
  className = "",
  type = "text",
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  type?: "text" | "number";
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  return (
    <input
      type={type}
      value={local}
      step={50}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onCommit(local.trim());
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`text-xs bg-canvas border border-edge rounded px-1.5 py-0.5 text-ink focus:outline-none focus:border-accent-ring transition-colors placeholder:text-ghost disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    />
  );
}

const RANDOM_SYNTAX_TOOLTIP =
  'Random placeholders: ${n-m} for a number range (e.g. ${18-36}), ${A|B|C} for a random pick (e.g. ${Man|Woman}). Example: "${18-36} Year-Old ${Man|Woman}"';

/** One row in a singleLine category's FreeFormOrigin option list. */
function FreeFormOptionRow({
  opt,
  idx,
  catId,
  currencies,
  addBoundsTarget,
  onAddBoundsRequest,
  onModify,
  onDelete,
}: {
  opt: FreeFormOrigin;
  idx: number;
  catId: Id<TID.OriginCategory>;
  currencies: Registry<TID.Currency, Currency> | undefined;
  addBoundsTarget?: AddBoundsTarget | null;
  onAddBoundsRequest?: (type: string, id: number) => void;
  onModify: (actionName: string, updater: (opts: FreeFormOrigin[]) => void) => void;
  onDelete: () => void;
}) {
  const isPrewritten = opt.type === "template";
  const boundKey = `freeform-${catId as number}`;
  const isAddTarget = addBoundsTarget?.type === boundKey && addBoundsTarget.id === idx;
  const costAsValue: Value<TID.Currency> = opt.cost.amount !== 0 ? [opt.cost] : [];
  const fullCost = { modifier: CostModifier.Full } as const;

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-tint border border-edge/60">
      {/* Type toggle */}
      <div className="inline-flex rounded border border-edge overflow-hidden text-[10px] shrink-0">
        <button
          type="button"
          onClick={() =>
            onModify("Set Free Form Type", (opts) => {
              opts[idx]!.type = "freeform";
            })
          }
          className={`px-1.5 py-0.5 transition-colors ${!isPrewritten ? "bg-accent2-tint text-accent2" : "text-ghost hover:text-ink"}`}
        >
          User Entry
        </button>
        <button
          type="button"
          onClick={() =>
            onModify("Set Prewritten Type", (opts) => {
              opts[idx]!.type = "template";
            })
          }
          className={`px-1.5 py-0.5 border-l border-edge transition-colors ${isPrewritten ? "bg-accent2-tint text-accent2" : "text-ghost hover:text-ink"}`}
        >
          Pre-Written
        </button>
      </div>

      {/* Text / placeholder */}
      <div className="flex-1 flex items-center gap-0.5 min-w-0">
        <InlineTextInput
          value={opt.name}
          onCommit={(v) =>
            onModify("Set Option Text", (opts) => {
              opts[idx]!.name = v;
            })
          }
          placeholder={isPrewritten ? "Text with ${vars}…" : "Reader types their own value…"}
          disabled={!isPrewritten}
          className="flex-1 min-w-0"
        />
        {isPrewritten && <Tip>{RANDOM_SYNTAX_TOOLTIP}</Tip>}
      </div>

      {/* Cost */}
      {currencies && (
        <div className="shrink-0">
          <CostDropdown
            value={costAsValue as any}
            cost={fullCost}
            currencies={currencies as any}
            hideModifier
            onChange={(v) =>
              onModify("Set Option Cost", (opts) => {
                const sv = v.find((x) => x.amount !== 0);
                opts[idx]!.cost = sv ?? ({ amount: 0, currency: opts[idx]!.cost.currency } as any);
              })
            }
          />
        </div>
      )}

      {/* Bound count badge */}
      {(opt.bounds?.length ?? 0) > 0 && (
        <span className="shrink-0 text-[10px] px-1 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 tabular-nums">
          {opt.bounds!.length}
        </span>
      )}

      {/* Draw-bound button */}
      <button
        type="button"
        title={isAddTarget ? "Drawing mode — drag a rect on the PDF" : "Link to PDF region"}
        onClick={() => onAddBoundsRequest?.(boundKey, idx)}
        className={`shrink-0 p-0.5 rounded transition-colors ${
          isAddTarget
            ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40"
            : "text-ghost hover:text-ink hover:bg-surface"
        }`}
      >
        <Crosshair size={11} />
      </button>

      {/* Delete */}
      <button
        type="button"
        title="Remove option"
        onClick={onDelete}
        className="shrink-0 p-0.5 rounded text-ghost hover:text-red-400 hover:bg-red-400/10 transition-colors"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

/** "Randomize for Reader" toggle + cost + bound for non-singleLine categories. */
function RandomToggle({
  catId,
  random,
  firstCurrId,
  currencies,
  addBoundsTarget,
  onAddBoundsRequest,
  onModify,
}: {
  catId: Id<TID.OriginCategory>;
  random: { cost: SimpleValue<TID.Currency>; bounds?: PageRect[] } | undefined;
  firstCurrId: Id<TID.Currency> | undefined;
  currencies: Registry<TID.Currency, Currency> | undefined;
  addBoundsTarget?: AddBoundsTarget | null;
  onAddBoundsRequest?: (type: string, id: number) => void;
  onModify: (actionName: string, updater: (c: DocOriginCategory) => void) => void;
}) {
  const isEnabled = !!random;
  const fullCost = { modifier: CostModifier.Full } as const;
  const isAddTarget =
    addBoundsTarget?.type === "origin-random" && addBoundsTarget.id === (catId as number);
  const costAsValue: Value<TID.Currency> = random && random.cost.amount !== 0 ? [random.cost] : [];

  const handleToggle = () => {
    if (isEnabled) {
      onModify("Disable Randomize for Reader", (c) => {
        delete (c as any).random;
      });
    } else {
      const currId = firstCurrId ?? 0;
      onModify("Enable Randomize for Reader", (c) => {
        (c as any).random = { cost: { amount: 0, currency: currId }, bounds: [] };
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
          isEnabled
            ? "bg-accent2-tint text-accent2 border-accent2 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
            : "bg-surface text-ghost border-edge hover:border-ink hover:text-ink"
        }`}
      >
        <Shuffle size={12} />
        Player Can Randomize
      </button>

      {isEnabled && random && (
        <>
          <span className="text-xs text-muted shrink-0">Cost:</span>
          {currencies && (
            <CostDropdown
              value={costAsValue as any}
              cost={fullCost}
              currencies={currencies as any}
              hideModifier
              onChange={(v) =>
                onModify("Set Random Cost", (c) => {
                  const sv = v.find((x) => x.amount !== 0);
                  const ca = c as any;
                  if (ca.random)
                    ca.random.cost = sv ?? { amount: 0, currency: ca.random.cost.currency };
                })
              }
            />
          )}

          {(random.bounds?.length ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-violet-500/10 text-violet-400 tabular-nums">
              {random.bounds!.length}
            </span>
          )}

          <button
            type="button"
            title={
              isAddTarget
                ? "Drawing mode — drag a rect on the PDF"
                : "Link random choice to PDF region"
            }
            onClick={() => onAddBoundsRequest?.("origin-random", catId as number)}
            className={`p-1 rounded transition-colors ${
              isAddTarget
                ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40"
                : "text-ghost hover:text-violet-400 hover:bg-violet-400/10"
            }`}
          >
            <Crosshair size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function SubsectionHeader({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">{children}</p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency exchange row
// ─────────────────────────────────────────────────────────────────────────────

function CurrencyExchangeRow({
  exchange,
  idx,
  currencies,
  addBoundsTarget,
  onAddBoundsRequest,
  onModify,
  onDelete,
}: {
  exchange: DocCurrencyExchange;
  idx: number;
  currencies: Registry<TID.Currency, Currency> | undefined;
  addBoundsTarget?: AddBoundsTarget | null;
  onAddBoundsRequest?: (type: string, id: number) => void;
  onModify: (actionName: string, updater: (exs: DocCurrencyExchange[]) => void) => void;
  onDelete: () => void;
}) {
  const boundKey = "currency-exchange";
  const isAddTarget = addBoundsTarget?.type === boundKey && addBoundsTarget.id === idx;
  const currencyEntries = Object.entries(currencies?.O ?? {}).map(([id, c]) => ({
    id: +id as Id<TID.Currency>,
    abbrev: c?.abbrev ?? "?",
  }));
  const selectClass =
    "text-xs bg-canvas border border-edge rounded px-1 py-0.5 text-ink focus:outline-none focus:border-accent-ring transition-colors";
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-tint border border-edge/60">
      <span className="text-xs text-muted shrink-0">Trade</span>
      <InlineTextInput
        type="number"
        value={String(exchange.oamount)}
        onCommit={(v) =>
          onModify("Set Exchange Amount", (exs) => {
            exs[idx]!.oamount = +v || 0;
          })
        }
        className="w-14 text-right"
      />
      <select
        value={exchange.oCurrency}
        onChange={(e) =>
          onModify("Set Exchange From Currency", (exs) => {
            exs[idx]!.oCurrency = +e.target.value as Id<TID.Currency>;
          })
        }
        className={selectClass}
      >
        {currencyEntries.map(({ id, abbrev }) => (
          <option key={id} value={id}>
            {abbrev}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted shrink-0">for</span>
      <InlineTextInput
        type="number"
        value={String(exchange.tamount)}
        onCommit={(v) =>
          onModify("Set Exchange Amount", (exs) => {
            exs[idx]!.tamount = +v || 0;
          })
        }
        className="w-14 text-right"
      />
      <select
        value={exchange.tCurrency}
        onChange={(e) =>
          onModify("Set Exchange To Currency", (exs) => {
            exs[idx]!.tCurrency = +e.target.value as Id<TID.Currency>;
          })
        }
        className={selectClass}
      >
        {currencyEntries.map(({ id, abbrev }) => (
          <option key={id} value={id}>
            {abbrev}
          </option>
        ))}
      </select>

      {/* Bound count badge */}
      {(exchange.bounds?.length ?? 0) > 0 && (
        <span className="shrink-0 text-[10px] px-1 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 tabular-nums">
          {exchange.bounds!.length}
        </span>
      )}

      {/* Draw-bound button */}
      <button
        type="button"
        title={isAddTarget ? "Drawing mode — drag a rect on the PDF" : "Link to PDF region"}
        onClick={() => onAddBoundsRequest?.(boundKey, idx)}
        className={`shrink-0 p-0.5 rounded transition-colors ${
          isAddTarget
            ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40"
            : "text-ghost hover:text-ink hover:bg-surface"
        }`}
      >
        <Crosshair size={11} />
      </button>

      {/* Delete */}
      <button
        type="button"
        title="Remove exchange"
        onClick={onDelete}
        className="shrink-0 p-0.5 rounded text-ghost hover:text-red-400 hover:bg-red-400/10 transition-colors"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency editor
// ─────────────────────────────────────────────────────────────────────────────

function CurrencyEditor({ id, onDelete }: { id: Id<TID.Currency>; onDelete: () => void }) {
  const currency = useJumpDocCurrency(id);
  const modify = useModifyJumpDocCurrency(id);
  if (!currency) return null;

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <Label>Name</Label>
          <BlurInput
            value={currency.name}
            onCommit={(v) =>
              modify("Rename Currency", (c) => {
                c.name = v;
              })
            }
            placeholder="e.g. Choice Points"
            className="w-full text-sm"
          />
        </div>
        <div>
          <Label>Abbrev.</Label>
          <BlurInput
            value={currency.abbrev}
            onCommit={(v) =>
              modify("Set Abbreviation", (c) => {
                c.abbrev = v;
              })
            }
            placeholder="CP"
            className="w-14 text-sm text-center font-mono"
          />
        </div>
        <div>
          <Label>Budget</Label>
          <BlurInput
            type="number"
            value={String(currency.budget)}
            onCommit={(v) =>
              modify("Set Budget", (c) => {
                c.budget = +v || 0;
              })
            }
            className="w-20 text-sm text-right"
          />
        </div>
      </div>
      <div>
        <Label>Discounted purchases become free at</Label>
        <div className="flex items-center gap-2">
          <BlurInput
            type="number"
            value={String(currency.discountFreeThreshold ?? "")}
            onCommit={(v) =>
              modify("Set Discount Free Threshold", (c) => {
                c.discountFreeThreshold = v === "" ? undefined : +v || 0;
              })
            }
            placeholder="e.g. 50"
            className="w-24 text-sm text-right"
          />
          <span className="text-xs text-muted">{currency.abbrev || "CP"} or less</span>
        </div>
      </div>
      {!currency.essential && (
        <div className="flex justify-end gap-3">
          <Checkbox
            checked={!!currency.hidden}
            onChange={(on) =>
              modify("Toggle currency hidden", (o) => {
                o.hidden = on;
              })
            }
          >
            Hide Currency
          </Checkbox>
          <DeleteButton onClick={onDelete} label="Delete currency" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin category editor
// ─────────────────────────────────────────────────────────────────────────────

function OriginCategoryEditor({
  id,
  onDelete,
  onAddBoundsRequest,
  addBoundsTarget,
}: {
  id: Id<TID.OriginCategory>;
  onDelete: () => void;
  onAddBoundsRequest?: (type: string, id: number) => void;
  addBoundsTarget?: AddBoundsTarget | null;
}) {
  const cat = useJumpDocOriginCategory(id);
  const modify = useModifyJumpDocOriginCategory(id);
  const modifyOptions = useModifyJumpDocFreeFormOptions(id);
  const options = useJumpDocFreeFormOptions(id);
  const random = useJumpDocOriginRandom(id);
  const removeOriginsByCategory = useRemoveJumpDocOriginsByCategory();
  const currencies = useJumpDocCurrenciesRegistry();
  const currencyIds = useJumpDocCurrencyIds();
  if (!cat) return null;

  const firstCurrId = currencyIds[0];

  const handleMode = (singleLine: boolean) => {
    if (singleLine && !cat.singleLine) removeOriginsByCategory(id);
    modify("Set Category Mode", (c) => {
      c.singleLine = singleLine;
      const ca = c as any;
      if (singleLine) {
        ca.options = ca.options ?? [];
        delete ca.random;
      } else {
        delete ca.options;
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* ── Name / Mode / Discounts ── */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <Label>Name</Label>
          <BlurInput
            value={cat.name}
            onCommit={(v) =>
              modify("Rename Origin Category", (c) => {
                c.name = v;
              })
            }
            placeholder="Category name…"
            className="w-full text-sm"
          />
        </div>
        <div>
          <Label>Mode</Label>
          <div className="inline-flex rounded-full border border-edge overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => handleMode(true)}
              className={`px-2.5 py-1 transition-colors ${cat.singleLine ? "bg-accent2-tint text-accent2" : "text-ghost hover:text-ink"}`}
            >
              Free Form
            </button>
            <button
              type="button"
              onClick={() => handleMode(false)}
              className={`px-2.5 py-1 transition-colors border-l border-edge ${!cat.singleLine ? "bg-accent2-tint text-accent2" : "text-ghost hover:text-ink"}`}
            >
              Multiple Choice
            </button>
          </div>
        </div>
        <div className={cat.singleLine ? "opacity-40 pointer-events-none" : ""}>
          <Label>Discounts</Label>
          <div className="inline-flex rounded-full border border-edge overflow-hidden text-xs">
            <button
              type="button"
              onClick={() =>
                modify("Enable Discounts", (c) => {
                  c.providesDiscounts = true;
                })
              }
              className={`px-2.5 py-1 transition-colors ${cat.providesDiscounts ? "bg-emerald-500/20 text-emerald-400" : "text-ghost hover:text-ink"}`}
            >
              Provides
            </button>
            <button
              type="button"
              onClick={() =>
                modify("Disable Discounts", (c) => {
                  c.providesDiscounts = false;
                })
              }
              className={`px-2.5 py-1 transition-colors border-l border-edge ${!cat.providesDiscounts ? "bg-accent2-tint text-accent2" : "text-ghost hover:text-ink"}`}
            >
              None
            </button>
          </div>
        </div>
      </div>

      {/* ── singleLine: FreeFormOrigin option list ── */}
      {cat.singleLine && (
        <div className="flex flex-col gap-1.5">
          <Label>Options</Label>
          {options.map((opt, idx) => (
            <FreeFormOptionRow
              key={idx}
              opt={opt}
              idx={idx}
              catId={id}
              currencies={currencies}
              addBoundsTarget={addBoundsTarget}
              onAddBoundsRequest={onAddBoundsRequest}
              onModify={modifyOptions}
              onDelete={() => modifyOptions("Remove Option", (opts) => opts.splice(idx, 1))}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              const newIdx = options.length;
              modifyOptions("Add Option", (opts) =>
                opts.push({
                  name: "",
                  type: "freeform",
                  cost: { amount: 0, currency: firstCurrId },
                }),
              );
              onAddBoundsRequest?.(`freeform-${id as number}`, newIdx);
            }}
            className="flex items-center gap-1 px-2 py-0.5 self-start rounded-full text-xs border border-dashed border-edge text-muted hover:border-accent2 hover:text-accent2 transition-colors"
          >
            <Plus size={11} />
            Add Option
          </button>
        </div>
      )}

      {/* ── non-singleLine: Selections + Randomize ── */}
      {!cat.singleLine && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-muted shrink-0">Selections</span>
            <SegmentedControl
              value={!cat.multiple || cat.max === 1 ? "single" : "multi"}
              onChange={(v) =>
                modify("Set Selection Mode", (c) => {
                  c.multiple = v !== "single";
                  c.max = v === "single" ? 1 : undefined;
                })
              }
              options={[
                { value: "single", label: "Single" },
                { value: "multi", label: "Multi" },
              ]}
            />
            {cat.multiple && cat.max !== 1 && (
              <>
                <span className="text-xs text-muted shrink-0">Number of Selections</span>
                <InlineTextInput
                  type="number"
                  value={cat.max !== undefined ? String(cat.max) : ""}
                  onCommit={(v) => {
                    const n = parseInt(v, 10);
                    modify("Set Max Selections", (c) => {
                      c.max = !v || n < 2 ? undefined : n;
                    });
                  }}
                  placeholder="∞"
                  className="w-14 text-right"
                />
              </>
            )}
          </div>
          <RandomToggle
            catId={id}
            random={random}
            firstCurrId={firstCurrId}
            currencies={currencies}
            addBoundsTarget={addBoundsTarget}
            onAddBoundsRequest={onAddBoundsRequest}
            onModify={modify}
          />
        </div>
      )}

      <div className="flex justify-end">
        <DeleteButton onClick={onDelete} label="Delete category" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase subtype editor
// ─────────────────────────────────────────────────────────────────────────────

function ThresholdAmountInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);
  return (
    <input
      type="number"
      step="50"
      min={0}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const n = Math.max(0, +local || 0);
        setLocal(String(n));
        onCommit(n);
      }}
      className="w-16 border border-edge rounded px-2 py-1 text-sm text-right bg-surface focus:outline-none focus:border-accent-ring tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
    />
  );
}

function SubtypeEditor({ id, onDelete }: { id: Id<TID.PurchaseSubtype>; onDelete: () => void }) {
  const sub = useJumpDocPurchaseSubtype(id);
  const modify = useModifyJumpDocPurchaseSubtype(id);
  const currencies = useJumpDocCurrenciesRegistry();
  const currencyIds = useJumpDocCurrencyIds();
  if (!sub) return null;

  const defaultCurrTID = sub.defaultCurrency;
  const hasMultipleCurrencies = currencyIds.length > 1;

  // grid columns: Name · [Type] · [Stipend]
  const gridCols = sub.essential
    ? currencies
      ? "grid-cols-[1fr_auto]"
      : "grid-cols-1"
    : currencies
      ? "grid-cols-[1fr_auto_auto]"
      : "grid-cols-[1fr_auto]";

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className={`grid gap-2 items-end ${gridCols}`}>
        <div>
          <Label>Name</Label>
          <BlurInput
            value={sub.name}
            onCommit={(v) =>
              modify("Rename Subtype", (s) => {
                s.name = v;
              })
            }
            placeholder="Subtype name…"
            className="w-full text-sm"
          />
        </div>
        {!sub.essential && (
          <div>
            <Label>Type</Label>
            <select
              value={sub.type}
              onChange={(e) =>
                modify("Set Subtype Type", (s) => {
                  s.type = +e.target.value as PurchaseType.Perk | PurchaseType.Item;
                })
              }
              className="border border-edge rounded px-2 py-1 text-sm bg-surface text-ink focus:outline-none focus:border-accent-ring"
            >
              <option value={PurchaseType.Perk}>Perk</option>
              <option value={PurchaseType.Item}>Item</option>
            </select>
          </div>
        )}
        {currencies && (
          <div>
            <Label>Stipend</Label>
            <CostDropdown<TID.Currency>
              value={sub.stipend}
              cost={{ modifier: CostModifier.Full }}
              currencies={currencies}
              hideModifier
              defaultCurrency={defaultCurrTID}
              onChange={(v) =>
                modify("Set Stipend", (s) => {
                  s.stipend = v;
                })
              }
              freeLabel="None"
            />
          </div>
        )}
      </div>

      {hasMultipleCurrencies && currencies && (
        <div>
          <Label>Default Currency</Label>
          <div className="flex flex-wrap gap-1.5">
            {currencyIds.map((cid) => {
              const cur = currencies.O[cid];
              if (!cur) return null;
              const isActive = defaultCurrTID === cid;
              return (
                <button
                  key={cid as number}
                  type="button"
                  onClick={() =>
                    modify("Set Default Currency", (s) => {
                      s.defaultCurrency = isActive ? undefined : cid;
                    })
                  }
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                    isActive
                      ? "bg-accent2-tint text-accent2 border-accent2"
                      : "bg-surface text-ink border-edge hover:border-accent2 hover:text-accent2"
                  }`}
                >
                  {cur.name}
                  <span className="ml-1 font-mono text-[10px] opacity-60">{cur.abbrev}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!sub.floatingDiscountThresholds?.length ? (
        <button
          type="button"
          onClick={() =>
            modify("Enable floating discounts", (s) => {
              s.floatingDiscountThresholds = [
                { amount: 0, currency: currencyIds[0] ?? createId<TID.Currency>(0) },
              ];
            })
          }
          className="text-xs text-accent hover:underline self-start"
        >
          Use floating discounts
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Floating discount thresholds</Label>
          <div className="flex flex-row flex-wrap gap-1">
            {sub.floatingDiscountThresholds.map((sv, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <ThresholdAmountInput
                  value={sv.amount}
                  onCommit={(amount) =>
                    modify("Set threshold amount", (s) => {
                      s.floatingDiscountThresholds![i]!.amount = amount;
                    })
                  }
                />
                {hasMultipleCurrencies && currencies ? (
                  <select
                    value={sv.currency as number}
                    onChange={(e) =>
                      modify("Set threshold currency", (s) => {
                        s.floatingDiscountThresholds![i]!.currency = createId<TID.Currency>(
                          +e.target.value,
                        );
                      })
                    }
                    className="border border-edge rounded px-2 py-1 text-xs bg-surface text-ink focus:outline-none focus:border-accent-ring"
                  >
                    {currencyIds.map((cid) => (
                      <option key={cid as number} value={cid as number}>
                        {currencies.O[cid]?.abbrev ?? "?"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-muted">
                    {currencies?.O[sv.currency]?.abbrev ?? "?"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    modify("Remove threshold", (s) => {
                      s.floatingDiscountThresholds!.splice(i, 1);
                      if (!s.floatingDiscountThresholds!.length)
                        delete s.floatingDiscountThresholds;
                    })
                  }
                  className="text-ghost hover:text-muted transition-colors p-0.5"
                  title="Remove threshold"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              modify("Add threshold", (s) => {
                s.floatingDiscountThresholds!.push({
                  amount: 0,
                  currency: currencyIds[0] ?? createId<TID.Currency>(0),
                });
              })
            }
            className="text-xs text-accent hover:underline self-start"
          >
            + Add threshold
          </button>
        </div>
      )}

      {!!sub.floatingDiscountThresholds?.length && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Label>Floating discount access</Label>
            <Tip>
              <strong>Free use</strong> — any purchase in this subtype can use a floating discount
              (chosen by the jumper).
              <br />
              <strong>Origin-based</strong> — the jumper must have a qualifying origin to use a
              floating discount on a purchase, but the number of such discounts is still limited by
              the thresholds above.
            </Tip>
          </div>
          <SegmentedControl
            value={sub.floatingDiscountMode ?? "free"}
            onChange={(v) =>
              modify("Set floating discount mode", (s) => {
                s.floatingDiscountMode = v as "free" | "origin";
              })
            }
            options={[
              { value: "free", label: "Free use" },
              { value: "origin", label: "Origin-based" },
            ]}
          />
        </div>
      )}

      {!sub.essential && (
        <div className="flex justify-end">
          <DeleteButton onClick={onDelete} label="Delete subtype" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function BasicsSection({
  open,
  onAddBoundsRequest,
  addBoundsTarget,
  forceOpenNonce,
  originCat,
}: {
  open?: boolean;
  onAddBoundsRequest?: (type: string, id: Id<TID>) => void;
  addBoundsTarget?: AddBoundsTarget | null;
  forceOpenNonce?: number;
  originCat?: Id<TID.OriginCategory>;
}) {
  const doc = useJumpDoc();
  const modifyDoc = useModifyJumpDoc();

  const currencyIds = useJumpDocCurrencyIds();
  const addCurrency = useAddJumpDocCurrency();
  const removeCurrency = useRemoveJumpDocCurrency();
  const [activeCurrencyId, setActiveCurrencyId] = useState<Id<TID.Currency> | null>(null);

  const originCatIds = useJumpDocOriginCategoryIds();
  const addOriginCat = useAddJumpDocOriginCategory();
  const removeOriginCat = useRemoveJumpDocOriginCategory();
  const [activeOriginCatId, setActiveOriginCatId] = useState<Id<TID.OriginCategory> | null>(null);

  const subtypeIds = useJumpDocPurchaseSubtypeIds();
  const addSubtype = useAddJumpDocPurchaseSubtype();
  const removeSubtype = useRemoveJumpDocPurchaseSubtype();
  const [activeSubtypeId, setActiveSubtypeId] = useState<Id<TID.PurchaseSubtype> | null>(null);

  const exchanges = useJumpDocExchanges();
  const addExchange = useAddJumpDocExchange();
  const modifyExchange = useModifyJumpDocExchange();
  const removeExchange = useRemoveJumpDocExchange();
  const addBoundToExchange = useAddBoundToExchange();
  const removeBoundFromExchange = useRemoveBoundFromExchange();
  const currencies = useJumpDocCurrenciesRegistry();

  useEffect(() => {
    if (originCat === undefined) return;
    setActiveOriginCatId(originCat);
  }, [originCat]);

  if (!doc) return null;

  return (
    <>
      <CollapsibleSection
        title="Basics"
        defaultOpen
        open={open}
        styled
        forceOpenNonce={forceOpenNonce}
      >
        <div className="flex flex-col gap-0 p-1">
          {/* ── Metadata ── */}
          <div className="flex flex-col gap-2 pb-4">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <div>
                <Label>Jump Name</Label>
                <BlurInput
                  value={doc.name}
                  onCommit={(v) =>
                    modifyDoc("Rename JumpDoc", (d) => {
                      d.name = v;
                    })
                  }
                  placeholder="Jump name…"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <Label>
                  Author{" "}
                  <Tip>
                    If there are multiple authors, separate their names with commas. Do not include
                    yourself, unless you contributed to the original jumpdoc.{" "}
                  </Tip>
                </Label>
                <BlurInput
                  value={doc.author}
                  onCommit={(v) =>
                    modifyDoc("Set Author", (d) => {
                      d.author = v;
                    })
                  }
                  placeholder="Author…"
                  className="w-full text-sm"
                />
              </div>
              <div className="w-20">
                <Label>Version</Label>
                <BlurInput
                  value={doc.version ?? ""}
                  onCommit={(v) => {
                    const stripped = v.trim().replace(/^v(?:ersion)?\s*\.?\s*/i, "");
                    modifyDoc("Set Version", (d) => {
                      d.version = stripped || undefined;
                    });
                  }}
                  placeholder="1.0…"
                  className="w-full text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-semibold text-muted shrink-0">
                Duration{" "}
                <Tip>
                  If the jump has a variable duration, make your best guess based on the source
                  material canon. If it's ambiguous or in doubt, it's never wrong to leave it at 10
                  years.
                </Tip>
              </span>
              <BlurNumberInput
                value={doc.duration.years}
                onCommit={(n) =>
                  modifyDoc("Set Duration Years", (d) => {
                    d.duration.years = n;
                  })
                }
                className="w-16 text-right"
              />
              <span className="text-xs text-muted">yr</span>
              <BlurNumberInput
                value={doc.duration.months}
                onCommit={(n) =>
                  modifyDoc("Set Duration Months", (d) => {
                    d.duration.months = n;
                  })
                }
                className="w-16 text-right"
              />
              <span className="text-xs text-muted">mo</span>
              <BlurNumberInput
                value={doc.duration.days}
                onCommit={(n) =>
                  modifyDoc("Set Duration Days", (d) => {
                    d.duration.days = n;
                  })
                }
                className="w-16 text-right"
              />
              <span className="text-xs text-muted">day</span>
            </div>
          </div>

          {/* ── Currencies ── */}
          <div className="border-t border-line pt-3 pb-4">
            <SubsectionHeader>Currencies</SubsectionHeader>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {currencyIds.map((id) => (
                <CurrencyPill
                  key={id as number}
                  id={id}
                  active={(activeCurrencyId as number) === (id as number)}
                  onClick={() =>
                    setActiveCurrencyId((prev) => ((prev as number) === (id as number) ? null : id))
                  }
                />
              ))}
              <AddPill
                label="Add currency"
                onClick={() => {
                  const newId = addCurrency();
                  setActiveCurrencyId(newId);
                }}
              />
            </div>
            {activeCurrencyId !== null && (
              <CurrencyEditor
                id={activeCurrencyId}
                onDelete={() => {
                  removeCurrency(activeCurrencyId);
                  setActiveCurrencyId(null);
                }}
              />
            )}
          </div>

          {/* ── Currency Exchanges ── */}
          {currencyIds.length >= 2 && (
            <div className="border-t border-line pt-3 pb-4">
              <SubsectionHeader>Currency Exchanges</SubsectionHeader>
              <div className="flex flex-col gap-1.5 mt-2">
                {exchanges.map((ex, idx) => (
                  <CurrencyExchangeRow
                    key={idx}
                    exchange={ex}
                    idx={idx}
                    currencies={currencies}
                    addBoundsTarget={addBoundsTarget}
                    onAddBoundsRequest={onAddBoundsRequest as any}
                    onModify={modifyExchange}
                    onDelete={() => removeExchange(idx)}
                  />
                ))}
                <div>
                  <AddPill
                    label="Add exchange"
                    onClick={() => addExchange(currencyIds[0]!, currencyIds[1]!)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Origin Categories ── */}
          <div className="border-t border-line pt-3 pb-4">
            <SubsectionHeader>Origin Categories</SubsectionHeader>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {originCatIds.map((id) => (
                <OriginCatPill
                  key={id}
                  id={id}
                  active={activeOriginCatId === id}
                  onClick={() => setActiveOriginCatId((prev) => (prev === id ? null : id))}
                />
              ))}
              <AddPill
                label="Add origin category"
                onClick={() => {
                  const newId = addOriginCat();
                  setActiveOriginCatId(newId);
                }}
              />
            </div>
            {activeOriginCatId !== null && (
              <OriginCategoryEditor
                id={activeOriginCatId}
                onAddBoundsRequest={onAddBoundsRequest as any}
                addBoundsTarget={addBoundsTarget}
                onDelete={() => {
                  removeOriginCat(activeOriginCatId);
                  setActiveOriginCatId(null);
                }}
              />
            )}
          </div>

          {/* ── Purchase Subtypes ── */}
          <div className="border-t border-line pt-3">
            <SubsectionHeader>Purchase Subtypes</SubsectionHeader>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {subtypeIds.map((id) => (
                <SubtypePill
                  key={id}
                  id={id}
                  active={activeSubtypeId === id}
                  onClick={() => setActiveSubtypeId((prev) => (prev === id ? null : id))}
                />
              ))}
              <AddPill
                label="Add purchase subtype"
                onClick={() => {
                  const newId = addSubtype(PurchaseType.Perk);
                  setActiveSubtypeId(newId);
                }}
              />
            </div>
            {activeSubtypeId !== null && (
              <SubtypeEditor
                id={activeSubtypeId}
                onDelete={() => {
                  removeSubtype(activeSubtypeId);
                  setActiveSubtypeId(null);
                }}
              />
            )}
          </div>
        </div>
      </CollapsibleSection>
      <RarelyUsedSection />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rarely Used — bulk alt cost applicator
// ─────────────────────────────────────────────────────────────────────────────

function RarelyUsedSection() {
  const doc = useJumpDoc();
  const modifyDoc = useModifyJumpDoc();
  const currencies = useJumpDocCurrenciesRegistry();
  const subtypeIds = useJumpDocPurchaseSubtypeIds();
  const [selectedSubtypeId, setSelectedSubtypeId] = useState<Id<TID.PurchaseSubtype> | null>(null);
  const applyAltCosts = useAddAltCostToSubtypePurchases();

  const currencyEntries = Object.entries(currencies?.O ?? {}).map(([id, c]) => ({
    id: +id as Id<TID.Currency>,
    abbrev: c?.abbrev ?? "?",
  }));
  const firstCurrId = currencyEntries[0]?.id ?? (0 as Id<TID.Currency>);
  const selectClass =
    "text-xs bg-canvas border border-edge rounded px-1 py-0.5 text-ink focus:outline-none focus:border-accent-ring transition-colors";

  const originStipend = doc?.originStipend ?? { amount: 0, currency: firstCurrId };
  const companionStipend = doc?.companionStipend ?? { amount: 0, currency: firstCurrId };

  // JumpDoc.originStipend/companionStipend are typed as SimpleValue (defaults to LID.Currency)
  // but in a JumpDoc context the IDs are TID. Pre-existing type inconsistency in JumpDoc.ts.
  const mkStipend = (amount: number, currency: Id<TID.Currency>): SimpleValue =>
    ({ amount, currency }) as unknown as SimpleValue;

  if (!doc) return null;

  return (
    <CollapsibleSection title="Rarely Used Features" styled secondary defaultOpen={false}>
      <div className="flex flex-col gap-5 pt-2">
        {/* ── Global Stipends ── */}
        <div className="flex flex-col items-center gap-2">
          <SubsectionHeader>Additional Stipends</SubsectionHeader>
          <div className="flex flex-col gap-1.5">
            {[
              {
                label: "Origin Stipend",
                tooltip:
                  "This is the stipend granted for purchasing costly origins/species/etc. It is not a stipend granted by an origin (like an item or power stipend). That option can be found beneath the origin itself.",
                value: originStipend,
                onCommitAmount: (v: string) =>
                  modifyDoc("Set Origin Stipend Amount", (d) => {
                    d.originStipend = mkStipend(
                      +v || 0,
                      (d.originStipend?.currency ?? firstCurrId) as Id<TID.Currency>,
                    );
                  }),
                onChangeCurrency: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  modifyDoc("Set Origin Stipend Currency", (d) => {
                    d.originStipend = mkStipend(
                      d.originStipend?.amount ?? 0,
                      +e.target.value as Id<TID.Currency>,
                    );
                  }),
              },
              {
                label: "Companion Import Stipend",
                value: companionStipend,
                onCommitAmount: (v: string) =>
                  modifyDoc("Set Companion Stipend Amount", (d) => {
                    d.companionStipend = mkStipend(
                      +v || 0,
                      (d.companionStipend?.currency ?? firstCurrId) as Id<TID.Currency>,
                    );
                  }),
                onChangeCurrency: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  modifyDoc("Set Companion Stipend Currency", (d) => {
                    d.companionStipend = mkStipend(
                      d.companionStipend?.amount ?? 0,
                      +e.target.value as Id<TID.Currency>,
                    );
                  }),
              },
            ].map(({ label, value, onCommitAmount, onChangeCurrency, tooltip }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted w-32 shrink-0 text-right">{label}:</span>
                <InlineTextInput
                  type="number"
                  value={String(value.amount)}
                  onCommit={onCommitAmount}
                  className="w-20 text-right"
                />
                <select
                  value={value.currency as number}
                  onChange={onChangeCurrency}
                  className={selectClass}
                >
                  {currencyEntries.map(({ id, abbrev }) => (
                    <option key={id as number} value={id as number}>
                      {abbrev}
                    </option>
                  ))}
                </select>
                {tooltip && <Tip>{tooltip}</Tip>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Drawback Limit ── */}
        <div className="flex flex-col gap-2 items-center">
          <SubsectionHeader>Drawback Limit</SubsectionHeader>
          <div className="flex items-center justify-center gap-2">
            <BlurNumberInput
              value={doc.drawbackLimit ?? 0}
              onCommit={(n) =>
                modifyDoc("Set Drawback Limit", (d) => {
                  d.drawbackLimit = n || null;
                })
              }
              placeholder="none"
              className="w-20"
            />
            <span className="text-xs text-muted">(0 = no limit)</span>
          </div>
        </div>

        {/* ── Bulk Alt Costs ── */}
        <div className="flex flex-col items-center gap-2">
          <SubsectionHeader>Bulk Alt Costs</SubsectionHeader>
          <p className="text-xs text-muted">
            Add alternative costs to all purchases with a specific subtype.
          </p>
          <div className="flex flex-col items-center">
            <Label>Select Subtype:</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {subtypeIds.map((id) => (
                <SubtypePill
                  key={id}
                  id={id}
                  active={selectedSubtypeId === id}
                  onClick={() => setSelectedSubtypeId((prev) => (prev === id ? null : id))}
                />
              ))}
            </div>
          </div>
          {selectedSubtypeId !== null && (
            <BulkAltCostApplicator
              key={selectedSubtypeId as number}
              subtypeId={selectedSubtypeId}
              onApply={(costs) => applyAltCosts(selectedSubtypeId, costs)}
            />
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

function BulkAltCostApplicator({
  subtypeId,
  onApply,
}: {
  subtypeId: Id<TID.PurchaseSubtype>;
  onApply: (costs: AlternativeCost[]) => void;
}) {
  const subtype = useJumpDocPurchaseSubtype(subtypeId);
  const purchaseCount = useJumpDocPurchaseIdsBySubtype(subtypeId).length;
  const [pendingCosts, setPendingCosts] = useState<AlternativeCost[]>([]);

  return (
    <div className="flex flex-col gap-2">
      <AlternativeCostEditor
        alternativeCosts={pendingCosts}
        showDiscountToggle
        onAdd={(cost) => setPendingCosts((prev) => [...prev, cost])}
        onRemove={(i) => setPendingCosts((prev) => prev.filter((_, idx) => idx !== i))}
        onModify={(i, updated) =>
          setPendingCosts((prev) => {
            const copy = [...prev];
            copy[i] = updated;
            return copy;
          })
        }
      />
      {pendingCosts.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onApply(pendingCosts);
            setPendingCosts([]);
          }}
          className="self-start text-xs px-3 py-1.5 rounded border font-medium transition-colors bg-accent-tint border-accent-ring text-accent hover:bg-accent/20"
        >
          Add to all {purchaseCount} {subtype?.name ?? "subtype"}s
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill display components (read from store, render as Pill)
// ─────────────────────────────────────────────────────────────────────────────

function CurrencyPill({
  id,
  active,
  onClick,
}: {
  id: Id<TID.Currency>;
  active: boolean;
  onClick: () => void;
}) {
  const currency = useJumpDocCurrency(id);
  if (!currency) return null;
  return (
    <Pill size="xs" active={active} onClick={onClick}>
      {currency.name || <em className="opacity-60">Unnamed</em>}
      {currency.abbrev && (
        <span className="ml-1 opacity-60 font-mono text-[10px]">{currency.abbrev}</span>
      )}
    </Pill>
  );
}

function OriginCatPill({
  id,
  active,
  onClick,
}: {
  id: Id<TID.OriginCategory>;
  active: boolean;
  onClick: () => void;
}) {
  const cat = useJumpDocOriginCategory(id);
  if (!cat) return null;
  return (
    <Pill size="xs" active={active} onClick={onClick}>
      {cat.name || <em className="opacity-60">Unnamed</em>}
    </Pill>
  );
}

function SubtypePill({
  id,
  active,
  onClick,
}: {
  id: Id<TID.PurchaseSubtype>;
  active: boolean;
  onClick: () => void;
}) {
  const sub = useJumpDocPurchaseSubtype(id);
  if (!sub) return null;
  const isPerk = sub.type === PurchaseType.Perk;
  return (
    <Pill size="xs" active={active} onClick={onClick}>
      <span
        className="mr-1 text-[9px] font-bold uppercase"
        style={{ color: isPerk ? "#38bdf8" : "#f59e0b" }}
      >
        {isPerk ? "P" : "I"}
      </span>
      {sub.name || <em className="opacity-60">Unnamed</em>}
    </Pill>
  );
}
