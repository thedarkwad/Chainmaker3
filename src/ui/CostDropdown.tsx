import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { Currency } from "@/chain/data/Jump";
import {
  AbstractPurchase,
  CostModifier,
  ModifiedCost,
  Subpurchase,
  Value,
} from "@/chain/data/Purchase";
import { createId, Id, LID, Registry, TID } from "@/chain/data/types";

// ── Shared constants ──────────────────────────────────────────────────────────

const MODIFIERS = [
  CostModifier.Full,
  CostModifier.Reduced,
  CostModifier.Custom,
  CostModifier.Free,
] as const;

const MODIFIER_LABELS: Record<CostModifier, string> = {
  [CostModifier.Full]: "Full Value",
  [CostModifier.Reduced]: "Discounted",
  [CostModifier.Custom]: "Custom Value",
  [CostModifier.Free]: "Free",
};

// ── Formatting utilities ──────────────────────────────────────────────────────

export function formatValueStr<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T>,
  currencies: Registry<T, Currency>,
): string {
  const nonZero = value.filter((sv) => sv.amount !== 0);
  if (nonZero.length === 0) return "Free";
  return nonZero
    .map((sv) => `${sv.amount} ${currencies.O[sv.currency]?.abbrev ?? "?"}`)
    .join(" & ");
}

/** Produces a human-readable cost string, e.g. "100 CP (reduced from 200 CP)". */
export function formatCostDisplay<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T> | number,
  cost: ModifiedCost<T>,
  currencies?: Registry<T, Currency>,
): string {
  if (typeof value === "number") {
    if (cost.modifier === CostModifier.Free || value == 0)
      return value !== 0 ? `Free (value of ${value})` : "Free";
    if (cost.modifier === CostModifier.Full) return `${value}`;
    if (cost.modifier === CostModifier.Reduced) return `${Math.floor(value / 2)} (discounted)`;
    if (cost.modifier === CostModifier.Custom) {
      const actual = typeof cost.modifiedTo === "number" ? cost.modifiedTo : 0;
      return `${actual} (modified from: ${value})`;
    }
    return `${value}`;
  }

  if (!currencies) return "";
  const listStr = formatValueStr(value, currencies);

  if (cost.modifier === CostModifier.Free) {
    const hasValue = value.some((sv) => sv.amount !== 0);
    return hasValue ? `Free (value of ${listStr})` : "Free";
  }
  if (cost.modifier === CostModifier.Full) return listStr;
  if (cost.modifier === CostModifier.Reduced) {
    const halfValue = value.map((sv) => ({ ...sv, amount: Math.floor(sv.amount / 2) }));
    const halfStr = formatValueStr(halfValue, currencies);
    return `${halfStr} (discounted)`;
  }
  if (cost.modifier === CostModifier.Custom) {
    if (Array.isArray(cost.modifiedTo)) {
      const actualStr = formatValueStr(cost.modifiedTo, currencies);
      return `${actualStr} (modified from: ${listStr})`;
    }
    return `${cost.modifiedTo} (modified from: ${listStr})`;
  }
  return listStr;
}

/** Produces a short cost string without modifier annotations, e.g. "100 CP". */
export function formatCostShort<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T> | number,
  cost: ModifiedCost<T>,
  currencies?: Registry<T, Currency>,
): string {
  if (typeof value === "number") {
    if (cost.modifier === CostModifier.Free || value == 0) return "Free";
    if (cost.modifier === CostModifier.Reduced) return `${Math.floor(value / 2)}`;
    if (cost.modifier === CostModifier.Custom)
      return `${typeof cost.modifiedTo === "number" ? cost.modifiedTo : 0}`;
    return `${value}`;
  }
  if (!currencies) return "";
  if (cost.modifier === CostModifier.Free) return "Free";
  if (cost.modifier === CostModifier.Reduced)
    return formatValueStr(
      value.map((sv) => ({ ...sv, amount: Math.floor(sv.amount / 2) })),
      currencies,
    );
  if (cost.modifier === CostModifier.Custom && Array.isArray(cost.modifiedTo))
    return formatValueStr(cost.modifiedTo, currencies);
  return formatValueStr(value, currencies);
}

// ── Subpurchase cost helpers ──────────────────────────────────────────────────

/** Effective cost per currency for one value+cost pair (as a plain number map). */
function effectiveCostMap<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T>,
  cost: ModifiedCost<T>,
): Record<Id<T>, number> {
  const map: Record<number, number> = {};
  if (cost.modifier === CostModifier.Free) {
    for (const sv of value) map[sv.currency as number] = 0;
    return map;
  }
  if (cost.modifier === CostModifier.Reduced) {
    for (const sv of value) map[sv.currency as number] = Math.floor(sv.amount / 2);
    return map;
  }
  if (cost.modifier === CostModifier.Custom && Array.isArray(cost.modifiedTo)) {
    for (const sv of cost.modifiedTo as Value) map[sv.currency as number] = sv.amount;
    return map;
  }
  for (const sv of value) map[sv.currency as number] = sv.amount;
  return map;
}

/**
 * Total cost including subpurchases, minus stipend.
 * The result CAN be negative — unused stipend surplus reduces the parent's cost.
 */
function buildTotalCostMap(
  value: Value,
  cost: AbstractPurchase["cost"],
  subpurchases: Subpurchase[],
  stipend: Value,
): Record<Id<LID.Currency>, number> {
  const base = effectiveCostMap(value, cost);

  // Accumulate subpurchase effective costs per currency
  const subNet: Record<Id<LID.Currency>, number> = {};
  for (const sub of subpurchases) {
    for (const [c, a] of Object.entries(effectiveCostMap(sub.value, sub.cost)))
      subNet[c as any] = (subNet[c as any] ?? 0) + a;
  }

  // Subtract stipend — surplus flows through (can make subNet negative)
  for (const sv of stipend) subNet[sv.currency] = (subNet[sv.currency] ?? 0) - sv.amount;

  // Merge into base (negative subNet reduces base cost)
  const total = { ...base };
  for (const [c, a] of Object.entries(subNet)) total[c as any] = (total[c as any] ?? 0) + a;

  return total;
}

function mapToValue<T extends TID.Currency | LID.Currency = LID.Currency>(
  map: Record<Id<T>, number>,
): Value<T> {
  return Object.entries(map)
    .filter(([, a]) => a !== 0)
    .map(([c, a]) => ({ currency: +c as Id<T>, amount: a }));
}

/** Short cost string including subpurchase totals minus stipend (can be negative). */
export function formatCostShortWithSubpurchases(
  value: Value,
  cost: AbstractPurchase["cost"],
  subpurchases: Subpurchase[],
  stipend: Value,
  currencies: Registry<LID.Currency, Currency>,
): string {
  const total = mapToValue(buildTotalCostMap(value, cost, subpurchases, stipend));
  if (total.length === 0) return "Free";
  return formatValueStr(total, currencies);
}

/** Long cost string including subpurchase totals, formatted as "base (modifier; total: X)". */
export function formatCostDisplayWithSubpurchases(
  value: Value,
  cost: AbstractPurchase["cost"],
  subpurchases: Subpurchase[],
  stipend: Value,
  currencies: Registry<LID.Currency, Currency>,
): string {
  const total = mapToValue(buildTotalCostMap(value, cost, subpurchases, stipend));
  const totalStr = total.length === 0 ? "Free" : formatValueStr(total, currencies);
  const baseDisplay = formatCostDisplay(value, cost, currencies);
  // If total matches base, skip the annotation
  if (totalStr === formatCostShort(value, cost, currencies)) return baseDisplay;
  // Insert "; total: X" before the trailing ")" if present, else append "(total: X)"
  return baseDisplay.endsWith(")")
    ? `${baseDisplay.slice(0, -1)}; total: ${totalStr})`
    : `${baseDisplay} (total: ${totalStr})`;
}

// ── ModifierSelect ────────────────────────────────────────────────────────────

export function ModifierSelect({
  value: costModifier,
  onChange,
}: {
  value: CostModifier;
  onChange: (mod: CostModifier) => void;
}) {
  return (
    <div className="relative">
      <select
        className="appearance-none w-full border border-edge rounded px-2 py-1 pr-6 text-xs focus:outline-none focus:border-accent-ring bg-surface"
        value={costModifier}
        onChange={(e) => onChange(Number(e.target.value) as CostModifier)}
      >
        {MODIFIERS.map((mod) => (
          <option key={mod} value={mod}>
            {MODIFIER_LABELS[mod]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      />
    </div>
  );
}

// ── CostDropdown ──────────────────────────────────────────────────────────────
// Maintains local editing state; only calls onChange when the popup closes or
// unmounts AND the value/cost actually changed.

export function CostDropdown<T extends TID.Currency | LID.Currency = LID.Currency>({
  value,
  cost,
  currencies,
  onChange,
  className,
  hideModifier = false,
  defaultCurrency,
  floatingDiscount,
  freeLabel,
  hideCurrencies,
}: {
  value: Value<T>;
  className?: string;
  cost: ModifiedCost<T>;
  currencies: Registry<T, Currency>;
  onChange: (value: Value<T>, cost: ModifiedCost<T>) => void;
  /** When true, hides the modifier select so this acts as a pure value editor. */
  hideModifier?: boolean;
  /** When set, focuses this currency's input on open instead of the first non-zero one. */
  defaultCurrency?: Id<T>;
  /** When provided, shows a "floating discount" checkbox for non-Full modifiers. */
  floatingDiscount?: { checked: boolean; onChange: (checked: boolean) => void };
  freeLabel?: string;
  hideCurrencies?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropRight, setDropRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dummyRef = useRef<HTMLSpanElement>(null);

  // Local editing state — buffered until the popup closes.
  const [localValue, setLocalValue] = useState<Value<T>>(value);
  const [localCost, setLocalCost] = useState<ModifiedCost<T>>(cost);
  // Refs shadow state for synchronous access in handlers/cleanup.
  const localValueRef = useRef(localValue);
  const localCostRef = useRef(localCost);
  const dirtyRef = useRef(false);
  // Incremented each time the popup opens so inputs remount with fresh defaultValues.
  const [inputVersion, setInputVersion] = useState(0);
  // Always-fresh onChange so the unmount cleanup never captures a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  let activeCurrencies = useRef(
    Object.keys(currencies.O).filter(
      (c) =>
        !hideCurrencies ||
        !currencies.O[+c as any].hidden ||
        localValue.some((v) => v.currency == +c && v.amount != 0),
    ),
  );

  const openDropdown = () => {
    // Re-sync from current props each time the popup opens.
    setLocalValue(value);
    setLocalCost(cost);
    localValueRef.current = value;
    localCostRef.current = cost;
    dirtyRef.current = false;
    setInputVersion((v) => v + 1);
    // Open toward whichever side of the viewport has more room.
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropRight(rect.left < 200);
    }
    setIsOpen(true);
  };

  const closeDropdown = () => {
    if (!isOpen) return;
    setIsOpen(false);
    if (dirtyRef.current) {
      onChangeRef.current(localValueRef.current, localCostRef.current);
      dirtyRef.current = false;
    }
  };

  // Click-outside closes (and flushes).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus the defaultCurrency input on open, or first non-zero, or first.
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const inputs = ref.current.querySelectorAll<HTMLInputElement>('input[type="number"]');
    if (!inputs.length) return;
    const currencyEntries = Object.keys(currencies.O).map(Number);
    const defaultIdx =
      defaultCurrency != null ? currencyEntries.indexOf(defaultCurrency as number) : -1;
    const target =
      (defaultIdx >= 0 ? inputs[defaultIdx] : undefined) ??
      Array.from(inputs).find((el) => Number(el.value) !== 0) ??
      inputs[0];
    target.focus();
    target.select();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on unmount if the popup was left open (e.g. parent unmounts mid-edit).
  useEffect(() => {
    return () => {
      if (dirtyRef.current) onChangeRef.current(localValueRef.current, localCostRef.current);
    };
  }, []);

  const currencyEntries = Object.entries(currencies.O) as [string, Currency][];
  const costModifier = localCost.modifier;
  const customArr: Value<T> =
    costModifier === CostModifier.Custom && Array.isArray(localCost.modifiedTo)
      ? localCost.modifiedTo
      : [];

  const setAmount = (currId: Id<T>, amount: number) => {
    const next = localValue
      .filter((sv) => sv.currency !== currId)
      .concat([{ currency: currId, amount }])
      .filter((sv) => sv.amount);
    setLocalValue(next);
    localValueRef.current = next;
    dirtyRef.current = true;
  };

  const setModifier = (mod: CostModifier) => {
    const next: ModifiedCost<T> =
      mod === CostModifier.Custom
        ? { modifier: CostModifier.Custom, modifiedTo: localValue.map((sv) => ({ ...sv })) }
        : { modifier: mod as CostModifier.Full | CostModifier.Reduced | CostModifier.Free };
    setLocalCost(next);
    localCostRef.current = next;
    dirtyRef.current = true;
    if (mod === CostModifier.Full) floatingDiscount?.onChange(false);
  };

  const setCustomAmount = (currId: Id<T>, amount: number) => {
    if (costModifier !== CostModifier.Custom) return;
    const next: ModifiedCost<T> = {
      modifier: CostModifier.Custom,
      modifiedTo: customArr.map((sv) => (sv.currency === currId ? { ...sv, amount } : sv)),
    };
    setLocalCost(next);
    localCostRef.current = next;
    dirtyRef.current = true;
  };

  // Show local state while open (live feedback); committed props when closed.
  let display = formatCostDisplay(
    isOpen ? localValue : value,
    isOpen ? localCost : cost,
    currencies,
  );

  if (display == "Free" && freeLabel) display = freeLabel;

  return (
    <div ref={ref} className="relative shrink-0">
      <span ref={dummyRef} tabIndex={-1} className="sr-only" aria-hidden />
      <button
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        className={`flex items-center gap-1 text-sm font-semibold text-ink border border-edge rounded px-2 py-0.5 hover:border-trim bg-surface transition-colors ${className ?? ""}`}
      >
        {display}
        <ChevronDown size={11} className="text-muted shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1 z-20 bg-surface border border-edge rounded-lg shadow-lg p-3 min-w-44 flex flex-col gap-2 ${dropRight ? "left-0" : "right-0"}`}
          onKeyDown={(e) => {
            if (e.key == "Enter") {
              closeDropdown();
              dummyRef.current?.focus();
              e.stopPropagation();
            }
          }}
        >
          {!hideModifier && <ModifierSelect value={costModifier} onChange={setModifier} />}

          {!hideModifier && floatingDiscount && costModifier !== CostModifier.Full && (
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={floatingDiscount.checked}
                onChange={(e) => floatingDiscount.onChange(e.target.checked)}
                className="accent-accent"
              />
              Use Floating Discount
            </label>
          )}

          {!hideModifier && costModifier === CostModifier.Custom && (
            <span className="text-xs text-muted">Original Value:</span>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            {currencyEntries.map(([id, cur]) => {
              if (!activeCurrencies.current.includes(id)) return null;
              const currId = createId<T>(+id);
              return (
                <Fragment key={id}>
                  <span className="text-xs text-muted text-right">{cur.abbrev}</span>
                  <input
                    key={`${currId as number}v${inputVersion}`}
                    type="number"
                    step={50}
                    className="min-w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                    defaultValue={localValue.find((sv) => sv.currency === currId)?.amount ?? 0}
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      if (!isNaN(n)) setAmount(currId, n);
                    }}
                  />
                </Fragment>
              );
            })}
          </div>

          {!hideModifier && costModifier === CostModifier.Custom && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-line">
              <span className="text-xs text-muted">Modified To:</span>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
                {currencyEntries.map(([id, cur]) => {
                  const currId = createId<T>(+id);
                  return (
                    <Fragment key={id}>
                      <span className="text-xs text-muted text-right w-min">{cur.abbrev}</span>
                      <input
                        type="number"
                        step={50}
                        className="min-w-0 border border-accent-ring rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                        defaultValue={customArr.find((sv) => sv.currency === currId)?.amount ?? 0}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (!isNaN(n)) setCustomAmount(currId, n);
                        }}
                      />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
