import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FileText, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BlurInput, Pill, AddPill, DeleteButton } from "@/ui/FormPrimitives";

import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import type {
  Currency,
  OriginCategory,
  PurchaseSubtype,
  SubtypePlacement,
} from "@/chain/data/Jump";
import { JumpSourceType } from "@/chain/data/Jump";
import {
  PurchaseType,
  type BasicPurchase,
  type SimpleValue,
  type Value,
} from "@/chain/data/Purchase";
import { useChainStore } from "@/chain/state/Store";
import Swal from "sweetalert2";
import {
  useAllJumps,
  useChainSettingsConfig,
  useJumpChildren,
  useJumpConfig,
  useJumpCurrencyConfig,
  useJumpDocId,
  useJumpOriginCategoryConfig,
  useJumpSubtypeConfig,
  useSetJumpParent,
  useCurrencies,
  useJumpCurrencies,
  useJumpCompanionStipend,
  useJumpOriginStipend,
  useJumpDefaultCurrencyAbbrev,
} from "@/chain/state/hooks";
import { Checkbox } from "@/ui/Checkbox";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { SelectField } from "@/ui/SelectField";
import { JumpDocGallery } from "@/app/components/JumpDocGallery";
import { type JumpDocSummary } from "@/api/jumpdocs";
import { useJumpDocName, useJumpDocPdfUrl } from "@/jumpdoc/state/hooks";
import { useViewerActionStore } from "@/chain/state/ViewerActionStore";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId/config")({
  component: ConfigTab,
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold text-muted mb-0.5 ${className ?? ""}`}>{children}</p>;
}

/** One editable segment inside DurationInput (year, month, or day). */
function DurationSegment({
  value,
  unit,
  onCommit,
}: {
  value: number;
  unit: string;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);

  return (
    <div className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 min-w-0">
      <input
        type="number"
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
        className="w-7 min-w-0 bg-transparent outline-none text-sm text-ink font-medium text-center [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
      />
      <span className="text-xs text-ghost shrink-0">{unit}</span>
    </div>
  );
}

/** Compact segmented duration field — three equal segments for years, months, days. */
function DurationInput({
  years,
  months,
  days,
  onChange,
}: {
  years: number;
  months: number;
  days: number;
  onChange: (field: "years" | "months" | "days", value: number) => void;
}) {
  return (
    <div className="flex border border-edge rounded-lg overflow-hidden divide-x divide-edge focus-within:border-accent-ring transition-colors">
      <DurationSegment value={years} unit="Years" onCommit={(v) => onChange("years", v)} />
      <DurationSegment value={months} unit="Months" onCommit={(v) => onChange("months", v)} />
      <DurationSegment value={days} unit="Days" onCommit={(v) => onChange("days", v)} />
    </div>
  );
}

/** Number input + currency abbreviation badge, styled like DurationInput. */
function StipendInput({
  value,
  abbrev,
  onCommit,
}: {
  value: number;
  abbrev: string;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);

  return (
    <div className="flex rounded-lg border border-edge overflow-hidden focus-within:border-accent-ring transition-colors">
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
        className="w-12 px-2 py-1.5 text-sm text-right bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
      />
      <span className="px-2 flex items-center text-xs font-medium text-muted bg-tint border-l border-edge shrink-0">
        {abbrev}
      </span>
    </div>
  );
}

/** Segmented pill toggle. Supports two or more options. */
function SegmentedControl({
  value,
  onChange,
  options,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <div className="inline-flex rounded-full p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full transition-colors ${
            compact ? "px-2 py-px text-xs" : "px-3 py-0.5 text-sm"
          } ${
            value === opt.value
              ? "bg-accent2-tint text-accent2 border border-accent2"
              : "text-ghost hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BasicsSection
// ─────────────────────────────────────────────────────────────────────────────

function BasicsSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const { chainId, charId } = Route.useParams();
  const { data, modifyJump } = useJumpConfig(jumpId);
  const { setParent, unsetParent } = useSetJumpParent(jumpId);
  const allJumps = useAllJumps();
  const childIds = useJumpChildren(jumpId);

  if (!data) return null;

  const isSupp = data.parentJump !== undefined;

  // Non-supplement jumps other than this one — eligible parents.
  const parentOptions = allJumps.filter(
    (j) => (j.id as number) !== (jumpId as number) && j.parentJump === undefined,
  );

  // Default parent = the last base jump that appears before this jump in chain order.
  const selfIdx = allJumps.findIndex((j) => (j.id as number) === (jumpId as number));
  const defaultParent =
    allJumps
      .slice(0, selfIdx)
      .filter((j) => j.parentJump === undefined)
      .at(-1) ?? parentOptions[0];

  const childJumps = childIds.map((cid) => ({
    id: cid,
    name: allJumps.find((j) => (j.id as number) === (cid as number))?.name ?? "Unnamed",
  }));

  // Current parent index within parentOptions (for the prev/next arrows).
  const parentIdx = parentOptions.findIndex(
    (j) => (j.id as number) === (data.parentJump as number),
  );
  const currentParentName =
    parentIdx !== -1 ? parentOptions[parentIdx]!.name || "[unnamed jump]" : "—";

  const navigateParent = (delta: -1 | 1) => {
    if (parentOptions.length === 0) return;
    const base = parentIdx === -1 ? 0 : parentIdx;
    const next = parentOptions[(base + delta + parentOptions.length) % parentOptions.length]!;
    setParent(next.id);
  };

  return (
    <CollapsibleSection title="Jump Basics" styled>
      <div className="flex flex-col gap-4 p-1">
        {/* Name — prominent, centered */}
        <BlurInput
          value={data.name}
          onCommit={(v) =>
            modifyJump("Rename jump", (j) => {
              j.name = v.trim() || v;
            })
          }
          placeholder="Jump name…"
          className="w-full text-base font-semibold text-center"
        />

        {/* Duration */}
        <div>
          <Label className="text-center">Duration</Label>
          <DurationInput
            years={data.duration.years}
            months={data.duration.months}
            days={data.duration.days}
            onChange={(field, value) =>
              modifyJump("Set duration", (j) => {
                j.duration[field] = value;
              })
            }
          />
        </div>

        {/* Supplement section — separated by a rule */}
        <div className="flex flex-col items-center gap-3 pt-2 border-t border-line">
          <SegmentedControl
            value={isSupp ? "supplement" : "base"}
            onChange={(v) => {
              if (v === "supplement") {
                if (!defaultParent) return;
                setParent(defaultParent.id);
              } else {
                unsetParent();
              }
            }}
            options={[
              { value: "base", label: "Base Jump" },
              { value: "supplement", label: "Supplement" },
            ]}
          />

          {isSupp && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs font-semibold text-muted text-center">Parent Jump:</p>
              {parentOptions.length === 0 ? (
                <p className="text-xs text-ghost italic">No eligible parent jumps.</p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => navigateParent(-1)}
                    className="p-0.5 rounded text-muted hover:text-ink transition-colors"
                    title="Previous jump"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="w-40 shrink-0 px-3 py-0.5 rounded-full text-xs border border-accent2 bg-accent2-tint text-accent2 text-center truncate">
                    {currentParentName}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateParent(1)}
                    className="p-0.5 rounded text-muted hover:text-ink transition-colors"
                    title="Next jump"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {childJumps.length > 0 && (
            <div className="flex flex-col items-center gap-1 w-full">
              <p className="text-xs font-semibold text-muted text-center">Supplements</p>
              <div className="flex flex-wrap items-center justify-center gap-1">
                {childJumps.map(({ id: cid, name }) => (
                  <Link
                    key={cid as number}
                    to={"/chain/$chainId/char/$charId/jump/$jumpId/" as never}
                    params={{ chainId, charId, jumpId: String(cid as number) } as never}
                    className="px-2.5 py-0.5 rounded-full text-xs border border-accent2 bg-accent2-tint text-accent2 hover:bg-accent2 hover:text-surface transition-colors"
                  >
                    {name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FeaturesSection
// ─────────────────────────────────────────────────────────────────────────────

function FeaturesSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const { data, modifyJump } = useJumpConfig(jumpId);
  const { settings: chainSettings } = useChainSettingsConfig();
  const currencyAbbrev = useJumpDefaultCurrencyAbbrev(jumpId);
  const currencies = useJumpCurrencies(jumpId);
  const { stipend: companionStipend, actions: companionStipendActions } =
    useJumpCompanionStipend(jumpId);
  if (!data) return null;

  const currencyList = Object.entries(currencies?.O ?? {});

  return (
    <CollapsibleSection title="Optional Features" styled defaultOpen={false}>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 p-1">
        {chainSettings?.narratives !== "disabled" && (
          <Checkbox
            checked={data.useNarrative}
            onChange={(on) =>
              modifyJump("Toggle narrative", (j) => {
                j.useNarrative = on;
              })
            }
          >
            Narrative Blurbs
          </Checkbox>
        )}
        {chainSettings?.altForms && (
          <Checkbox
            checked={data.useAltForms}
            onChange={(on) =>
              modifyJump("Toggle alt-forms", (j) => {
                j.useAltForms = on;
              })
            }
          >
            Alt-Forms
          </Checkbox>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 px-1 py-1 border-t border-line">
        <span className="text-sm text-muted">Drawback Limit:</span>
        <BlurInput
          type="number"
          min={0}
          step={50}
          value={data.drawbackLimit != null ? String(data.drawbackLimit) : ""}
          placeholder="None"
          className="w-24"
          onCommit={(v) =>
            modifyJump(
              "Set drawback limit",
              (j) => {
                const n = parseFloat(v);
                j.drawbackLimit = v === "" || isNaN(n) ? null : n;
              },
              true,
            )
          }
        />
        <span className="text-sm text-muted">{currencyAbbrev}</span>
        {data.drawbackLimit != null && (
          <button
            type="button"
            className="p-0.5 rounded text-muted hover:text-ink transition-colors"
            title="Remove drawback limit"
            onClick={() =>
              modifyJump(
                "Remove drawback limit",
                (j) => {
                  j.drawbackLimit = null;
                },
                true,
              )
            }
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 px-1 pt-1 border-t border-line">
        <span className="text-sm text-muted">Companion Import Stipend:</span>
        <input
          type="number"
          step={50}
          min={0}
          defaultValue={companionStipend.amount}
          onBlur={(e) => {
            if (+e.target.value !== companionStipend.amount)
              companionStipendActions.updateAmount(+e.target.value);
          }}
          className="w-16 text-sm text-ink bg-transparent border border-edge rounded px-2 py-0.5 focus:outline-none focus:border-accent-ring shrink-0"
        />
        {currencyList.length === 1 ? (
          <span className="text-xs text-muted shrink-0">{currencyList[0]![1].abbrev}</span>
        ) : (
          <SelectField
            value={companionStipend.currency as number}
            onChange={(e) => {
              if (+e.currentTarget.value !== (companionStipend.currency as number))
                companionStipendActions.updateCurrency(createId(+e.currentTarget.value));
            }}
          >
            {currencyList.map(([cid, cur]) => (
              <option key={cid} value={cid}>
                {cur.abbrev}
              </option>
            ))}
          </SelectField>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Currencies section
// ─────────────────────────────────────────────────────────────────────────────

function CurrencyEditor({
  id,
  cur,
  jumpId,
  onDelete,
}: {
  id: Id<LID.Currency>;
  cur: Currency;
  jumpId: Id<GID.Jump>;
  onDelete: () => void;
}) {
  const { actions } = useJumpCurrencyConfig(jumpId);
  const commit = (actionName: string, updater: (c: Currency) => void) =>
    actions.modifyCurrency(id, actionName, updater);

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-line">
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div>
          <Label>Name</Label>
          <BlurInput
            value={cur.name}
            onCommit={(v) =>
              commit("Rename currency", (c) => {
                c.name = v;
              })
            }
            placeholder="e.g. Choice Points"
            className="w-full"
          />
        </div>
        <div>
          <Label>Abbrev.</Label>
          <BlurInput
            value={cur.abbrev}
            onCommit={(v) =>
              commit("Set abbreviation", (c) => {
                c.abbrev = v;
              })
            }
            placeholder="CP"
            className="w-16"
          />
        </div>
        <div>
          <Label>Budget</Label>
          <BlurInput
            type="number"
            step="50"
            value={String(cur.budget)}
            onCommit={(v) =>
              commit("Set budget", (c) => {
                c.budget = +v || 0;
              })
            }
            className="w-20 text-right"
          />
        </div>
      </div>

      {!cur.essential && (
        <div className="flex justify-end gap-3">
          <Checkbox
            checked={!!cur.hidden}
            onChange={(on) =>
              commit("Toggle currency hidden", (o) => {
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

function CurrenciesSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const { currencies, actions } = useJumpCurrencyConfig(jumpId);
  const [activeId, setActiveId] = useState<Id<LID.Currency> | null>(null);

  if (!currencies) return null;
  const entries = Object.entries(currencies.O) as [string, Currency][];

  const handleAdd = () => {
    const newId = currencies.fId;
    actions.addCurrency();
    setActiveId(newId);
  };

  return (
    <CollapsibleSection title="Currencies" styled>
      <div className="flex flex-col gap-2 p-1">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {entries.map(([idStr, cur]) => {
            const id = createId<LID.Currency>(+idStr);
            const isActive = (activeId as number) === +idStr;
            return (
              <Pill key={idStr} active={isActive} onClick={() => setActiveId(isActive ? null : id)}>
                {cur.name || <em className="opacity-60">Unnamed</em>}
              </Pill>
            );
          })}
          <AddPill onClick={handleAdd} label="Add currency" />
        </div>

        {activeId !== null &&
          (() => {
            const cur = currencies.O[activeId];
            if (!cur) return null;
            return (
              <CurrencyEditor
                id={activeId}
                cur={cur}
                jumpId={jumpId}
                onDelete={() => {
                  actions.removeCurrency(activeId);
                  setActiveId(null);
                }}
              />
            );
          })()}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase subtypes section
// ─────────────────────────────────────────────────────────────────────────────

function ThresholdRow({
  sv,
  currencyEntries,
  abbrevOf,
  onAmountCommit,
  onCurrencyChange,
  onRemove,
}: {
  sv: SimpleValue;
  currencyEntries: [string, Currency][];
  abbrevOf: (cid: Id<LID.Currency>) => string;
  onAmountCommit: (amount: number) => void;
  onCurrencyChange: ((cid: Id<LID.Currency>) => void) | undefined;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(String(sv.amount));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(sv.amount));
  }, [sv.amount]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex rounded-lg border border-edge overflow-hidden focus-within:border-accent-ring transition-colors">
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
            onAmountCommit(n);
          }}
          className="w-16 px-2 py-1.5 text-sm text-right bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
        />
        {onCurrencyChange ? (
          <SelectField
            value={String(sv.currency)}
            onChange={(e) => onCurrencyChange(createId<LID.Currency>(+e.target.value))}
            className="text-xs bg-tint border-l border-edge rounded-none focus:outline-none"
          >
            {currencyEntries.map(([cidStr, cur]) => (
              <option key={cidStr} value={cidStr} className="bg-surface">
                {cur.abbrev}
              </option>
            ))}
          </SelectField>
        ) : (
          <span className="px-2 flex items-center text-xs font-medium text-muted bg-tint border-l border-edge shrink-0">
            {abbrevOf(sv.currency)}
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-ghost hover:text-muted transition-colors p-0.5"
        title="Remove threshold"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function SubtypeEditor({
  id,
  st,
  jumpId,
  onDelete,
}: {
  id: Id<LID.PurchaseSubtype>;
  st: PurchaseSubtype;
  jumpId: Id<GID.Jump>;
  onDelete: () => void;
}) {
  const { actions } = useJumpSubtypeConfig(jumpId);
  const currencies = useCurrencies(jumpId);
  const commit = (actionName: string, updater: (s: PurchaseSubtype) => void) =>
    actions.modifySubtype(id, actionName, updater);

  const currencyEntries = Object.entries(currencies?.O ?? {}) as [string, Currency][];

  const getStipend = (cid: Id<LID.Currency>): number =>
    (st.stipend as Value).find((sv) => (sv.currency as number) === (cid as number))?.amount ?? 0;

  const setStipend = (cid: Id<LID.Currency>, amount: number) =>
    commit("Set stipend", (s) => {
      const arr = s.stipend as Value;
      const idx = arr.findIndex((sv) => (sv.currency as number) === (cid as number));
      if (amount === 0) {
        if (idx !== -1) arr.splice(idx, 1);
      } else if (idx !== -1) {
        arr[idx]!.amount = amount;
      } else {
        arr.push({ currency: cid, amount });
      }
    });

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-line">
      <div
        className={`grid gap-2 items-end ${st.essential ? "grid-cols-1" : "grid-cols-[1fr_auto]"}`}
      >
        <div>
          <Label>Name</Label>
          <BlurInput
            value={st.name}
            onCommit={(v) =>
              commit("Rename subtype", (s) => {
                s.name = v;
              })
            }
            placeholder="Subtype name…"
            className="w-full"
          />
        </div>
        {!st.essential && (
          <div>
            <Label>Type</Label>
            <SelectField
              value={st.type}
              onChange={(e) =>
                commit("Set subtype type", (s) => {
                  s.type = +e.target.value as PurchaseType.Perk | PurchaseType.Item;
                })
              }
            >
              <option value={PurchaseType.Perk}>Perk</option>
              <option value={PurchaseType.Item}>Item</option>
            </SelectField>
          </div>
        )}
      </div>

      <div className="flex flex-row flex-wrap gap-3">
        {currencyEntries.length > 0 && (
          <div>
            <Label>Stipend</Label>
            <div className="flex flex-wrap justify-left gap-1">
              {currencyEntries.map(([cidStr, cur]) => {
                const cid = createId<LID.Currency>(+cidStr);
                return (
                  <StipendInput
                    key={cidStr}
                    value={getStipend(cid)}
                    abbrev={cur.abbrev}
                    onCommit={(v) => setStipend(cid, v)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!st.essential && (
          <div className="">
            <Label className="mb-1">Placement</Label>
            <SegmentedControl
              value={st.placement}
              onChange={(v) =>
                commit("Set subtype placement", (s) => {
                  s.placement = v as SubtypePlacement;
                })
              }
              options={[
                {
                  value: "normal",
                  label: st.type === PurchaseType.Perk ? "With perks" : "With items",
                },
                { value: "section", label: "Own section" },
                { value: "route", label: "Own tab" },
              ]}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">Compound Purchases:</span>
          <SegmentedControl
            compact
            value={st.allowSubpurchases ? "compound" : "simple"}
            onChange={(v) => {
              const on = v === "compound";
              if (!on) {
                const chain = useChainStore.getState().chain;
                const jump = chain?.jumps.O[jumpId];
                const hasSubpurchases = jump
                  ? Object.values(jump.purchases).some((list) =>
                      (list as Id<GID.Purchase>[]).some((pId) => {
                        const p = chain!.purchases.O[pId] as BasicPurchase | undefined;
                        return (
                          p &&
                          (p.type === PurchaseType.Perk || p.type === PurchaseType.Item) &&
                          (p.subtype as number) === (id as number) &&
                          !!p.subpurchases?.list?.length
                        );
                      }),
                    )
                  : false;

                if (hasSubpurchases) {
                  Swal.fire({
                    title: "Delete subpurchases?",
                    text: "Disabling compound purchases will delete all existing subpurchases for this subtype. This can be undone with Ctrl+Z.",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Delete subpurchases",
                    cancelButtonText: "Cancel",
                    buttonsStyling: false,
                    customClass: {
                      confirmButton: "swal-btn-danger",
                      cancelButton: "swal-btn-cancel",
                    },
                  }).then(({ isConfirmed }) => {
                    if (isConfirmed) actions.disableSubpurchases(id);
                  });
                  return;
                }
              }
              commit("Toggle subpurchases", (s) => {
                s.allowSubpurchases = on;
              });
            }}
            options={[
              { value: "simple", label: "Disallowed" },
              { value: "compound", label: "Allowed" },
            ]}
          />
        </div>
        {!st.floatingDiscountThresholds?.length && (
          <button
            onClick={() =>
              commit("Enable floating discounts", (s) => {
                s.floatingDiscountThresholds = [
                  {
                    amount: 0,
                    currency: createId<LID.Currency>(+(currencyEntries[0]?.[0] ?? "0")),
                  },
                ];
              })
            }
            className="text-xs text-accent hover:underline self-center"
          >
            + Use floating discounts
          </button>
        )}
      </div>
      {st.floatingDiscountThresholds?.length && (
        <div className="flex flex-col items-center gap-1.5">
          <Label>Floating discount thresholds</Label>
          <div className="flex flex-row justify-center flex-wrap gap-1">
            {st.floatingDiscountThresholds.map((sv, i) => (
              <ThresholdRow
                key={i}
                sv={sv}
                currencyEntries={currencyEntries}
                abbrevOf={(cid) => currencies?.O[cid]?.abbrev ?? "?"}
                onAmountCommit={(amount) =>
                  commit("Set threshold amount", (s) => {
                    s.floatingDiscountThresholds![i]!.amount = amount;
                  })
                }
                onCurrencyChange={
                  currencyEntries.length > 1
                    ? (cid) =>
                        commit("Set threshold currency", (s) => {
                          s.floatingDiscountThresholds![i]!.currency = cid;
                        })
                    : undefined
                }
                onRemove={() =>
                  commit("Remove threshold", (s) => {
                    s.floatingDiscountThresholds!.splice(i, 1);
                    if (!s.floatingDiscountThresholds!.length) delete s.floatingDiscountThresholds;
                  })
                }
              />
            ))}
          </div>
          <button
            onClick={() =>
              commit("Add threshold", (s) => {
                if (!s.floatingDiscountThresholds) s.floatingDiscountThresholds = [];
                s.floatingDiscountThresholds.push({
                  amount: 0,
                  currency: createId<LID.Currency>(+(currencyEntries[0]?.[0] ?? "0")),
                });
              })
            }
            className="text-xs text-accent hover:underline self-start"
          >
            + Add threshold
          </button>
        </div>
      )}
      <div className="flex flex-row-reverse justify-between">
        {!st.essential && <DeleteButton onClick={onDelete} label="Delete subtype" />}
      </div>
    </div>
  );
}

function SubtypesSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const { subtypes, actions } = useJumpSubtypeConfig(jumpId);
  const [activeId, setActiveId] = useState<Id<LID.PurchaseSubtype> | null>(null);

  if (!subtypes) return null;
  const entries = Object.entries(subtypes.O) as [string, PurchaseSubtype][];

  const handleAdd = () => {
    const newId = subtypes.fId;
    actions.addSubtype();
    setActiveId(newId);
  };

  return (
    <CollapsibleSection title="Purchase Subtypes" styled>
      <div className="flex flex-col gap-2 p-1">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {entries.map(([idStr, st]) => {
            const id = createId<LID.PurchaseSubtype>(+idStr);
            const isActive = (activeId as number) === +idStr;
            return (
              <Pill key={idStr} active={isActive} onClick={() => setActiveId(isActive ? null : id)}>
                {st.name || <em className="opacity-60">Unnamed</em>}
              </Pill>
            );
          })}
          <AddPill onClick={handleAdd} label="Add subtype" />
        </div>

        {activeId !== null &&
          (() => {
            const st = subtypes.O[activeId];
            if (!st) return null;
            return (
              <SubtypeEditor
                id={activeId}
                st={st}
                jumpId={jumpId}
                onDelete={() => {
                  actions.removeSubtype(activeId);
                  setActiveId(null);
                }}
              />
            );
          })()}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin categories section
// ─────────────────────────────────────────────────────────────────────────────

function OriginCategoryEditor({
  id,
  oc,
  jumpId,
  onDelete,
}: {
  id: Id<LID.OriginCategory>;
  oc: OriginCategory;
  jumpId: Id<GID.Jump>;
  onDelete: () => void;
}) {
  const { actions } = useJumpOriginCategoryConfig(jumpId);
  const commit = (actionName: string, updater: (o: OriginCategory) => void) =>
    actions.modifyOriginCategory(id, actionName, updater);

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-line">
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div>
          <Label>Name</Label>
          <BlurInput
            value={oc.name}
            onCommit={(v) =>
              commit("Rename origin category", (o) => {
                o.name = v;
              })
            }
            placeholder="e.g. Origin, Background…"
            className="w-full"
          />
        </div>
        <div>
          <Label>Default value</Label>
          <BlurInput
            value={oc.default ?? ""}
            onCommit={(v) =>
              commit("Set default", (o) => {
                if (v.trim()) o.default = v;
                else delete o.default;
              })
            }
            placeholder="Optional…"
            className="w-full"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox
          checked={oc.singleLine}
          onChange={(on) =>
            commit("Toggle single-line", (o) => {
              o.singleLine = on;
            })
          }
        >
          Single-line (no description field)
        </Checkbox>
        <Checkbox
          checked={oc.multiple}
          onChange={(on) =>
            commit("Toggle multiple", (o) => {
              o.multiple = on;
            })
          }
        >
          Allow multiple entries
        </Checkbox>
      </div>

      <div className="flex justify-end">
        <DeleteButton onClick={onDelete} label="Delete origin category" />
      </div>
    </div>
  );
}

function OriginCategoriesSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const currencies = useJumpCurrencies(jumpId);
  const { stipend: originStipend, actions: originStipendActions } = useJumpOriginStipend(jumpId);
  const { originCategories, actions } = useJumpOriginCategoryConfig(jumpId);
  const [activeId, setActiveId] = useState<Id<LID.OriginCategory> | null>(null);

  const currencyList = Object.entries(currencies?.O ?? {});

  if (!originCategories) return null;
  const entries = Object.entries(originCategories.O) as [string, OriginCategory][];

  const handleAdd = () => {
    const newId = originCategories.fId;
    actions.addOriginCategory();
    setActiveId(newId);
  };

  return (
    <CollapsibleSection title="Background & Origin Aspects" styled>
      <div className="flex flex-col gap-2 p-1">
        {entries.length === 0 ? (
          <p className="text-xs text-ghost italic text-center py-1">
            No origin categories yet. Add one to enable the Insertion section on the Overview tab.
          </p>
        ) : (
          <div className="text-xs text-muted font-semibold py-1 flex flex-wrap gap-1 items-center justify-center">
            Stipend for Origin Costs:
            <input
              type="number"
              step={50}
              min={0}
              defaultValue={originStipend.amount}
              onBlur={(e) => {
                if (+e.target.value != originStipend.amount)
                  originStipendActions.updateAmount(+e.target.value);
              }}
              className="w-16 text-sm text-ink bg-transparent border border-edge rounded px-2 py-0.5 focus:outline-none focus:border-accent-ring shrink-0"
            />
            {currencyList.length === 1 ? (
              <span className="text-xs text-muted shrink-0">{currencyList[0]![1].abbrev}</span>
            ) : (
              <SelectField
                value={originStipend.currency as number}
                onChange={(e) => {
                  if (+e.currentTarget.value != originStipend.currency)
                    originStipendActions.updateCurrency(createId(+e.currentTarget.value));
                }}
              >
                {currencyList.map(([cid, cur]) => (
                  <option key={cid} value={cid}>
                    {cur.abbrev}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {entries.map(([idStr, oc]) => {
            const id = createId<LID.OriginCategory>(+idStr);
            const isActive = (activeId as number) === +idStr;
            return (
              <Pill key={idStr} active={isActive} onClick={() => setActiveId(isActive ? null : id)}>
                {oc.name || <em className="opacity-60">Unnamed</em>}
              </Pill>
            );
          })}
          <AddPill onClick={handleAdd} label="Add origin category" />
        </div>

        {activeId !== null &&
          (() => {
            const oc = originCategories.O[activeId];
            if (!oc) return null;
            return (
              <OriginCategoryEditor
                id={activeId}
                oc={oc}
                jumpId={jumpId}
                onDelete={() => {
                  actions.removeOriginCategory(activeId);
                  setActiveId(null);
                }}
              />
            );
          })()}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Source section
// ─────────────────────────────────────────────────────────────────────────────

function UnlinkConfirmModal({
  docName,
  onConfirm,
  onCancel,
}: {
  docName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onPointerDown={onCancel}
    >
      <div
        className="bg-canvas rounded-lg shadow-xl flex flex-col w-full max-w-sm m-4 p-5 gap-4"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-danger" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink">Unlink from {docName}?</p>
            <p className="text-xs text-muted">
              Any purchases that were added using the interactive doc will lose their connection to
              it. <br />
              <br />
              Many features, like origin discounts and purchase requirements may no longer function
              as expected if the jumpdoc is readded. This can be undone with Ctrl+Z.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border border-edge text-muted hover:text-ink hover:border-ink/30 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            Unlink
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceGalleryModal({
  onSelect,
  onClose,
}: {
  onSelect: (doc: JumpDocSummary) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-canvas rounded-lg shadow-xl flex flex-col w-full max-w-3xl max-h-[80vh] m-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <h2 className="text-sm font-semibold text-ink">Select a JumpDoc</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 text-ghost hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mx-4 mt-3 shrink-0 flex items-start gap-2 px-3 py-2 rounded border border-edge bg-tint text-xs text-muted">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ghost" />
          <p>
            <strong className="text-ink">Recommendation:</strong> Linking a JumpDoc to an existing
            jump may cause inconsistent behavior if the jump and doc have different currencies,
            origins, or purchase subtypes configured. It is recommended to{" "}
            <strong className="text-ink">create a new jump</strong> when using an interactive
            JumpDoc.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <JumpDocGallery onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

function SourceSection({ jumpId }: { jumpId: Id<GID.Jump> }) {
  const { data, modifyJump, unlinkJumpDoc } = useJumpConfig(jumpId);
  const currentDocId = useJumpDocId(jumpId);
  const [showGallery, setShowGallery] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const linkedDocName = useJumpDocName();
  const linkedDocPdfUrl = useJumpDocPdfUrl();

  if (!data) return null;

  const isJumpdoc = data.source.type === JumpSourceType.Jumpdoc;
  const sourceUrl = data.source.type === JumpSourceType.URL ? data.source.URL : "";
  const segValue = isJumpdoc ? "jumpdoc" : "static";

  return (
    <>
      <CollapsibleSection title="JumpDoc" styled defaultOpen={false}>
        <div className="flex flex-col gap-3 p-1">
          <div className="flex justify-center">
            <SegmentedControl
              value={segValue}
              onChange={(v) => {
                if (v === "static") {
                  setShowUnlinkConfirm(true);
                } else {
                  setShowGallery(true);
                }
              }}
              options={[
                { value: "static", label: "Static" },
                { value: "jumpdoc", label: "Interactive" },
              ]}
            />
          </div>

          {segValue === "static" && (
            <div>
              <Label>Source URL</Label>
              <BlurInput
                type="url"
                value={sourceUrl}
                onCommit={(v) =>
                  modifyJump("Set source URL", (j) => {
                    j.source = v.trim()
                      ? { type: JumpSourceType.URL, URL: v.trim() }
                      : { type: JumpSourceType.Unknown };
                  })
                }
                placeholder="https://…"
                className="w-full"
              />
            </div>
          )}

          {segValue === "jumpdoc" && (
            <div className="flex items-center justify-center gap-2">
              {linkedDocName ? (
                <button
                  type="button"
                  onClick={() => useViewerActionStore.getState().popOutViewer?.()}
                  className="flex-1 min-w-0 max-w-fit px-3 py-1 rounded-full border border-accent2 bg-accent2-tint text-accent2 text-xs truncate hover:bg-accent2 hover:text-surface transition-colors flex flex-row gap-1 items-center"
                  title={`Open ${linkedDocName} in a new window`}
                >
                  <span className="font-medium">Jump:</span>{" "}
                  <span className="truncate">{linkedDocName}</span> <ExternalLink size={14} />
                </button>
              ) : (
                <span className="flex-1 min-w-0 px-3 py-1 rounded-full border border-edge text-xs text-ghost italic">
                  Loading…
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(true)}
                className="shrink-0 px-3 py-1 text-xs border border-danger/40 text-danger rounded hover:bg-danger/10 transition-colors"
              >
                Unlink
              </button>
            </div>
          )}

          {segValue === "jumpdoc" && !currentDocId && (
            <button
              type="button"
              onClick={() => setShowGallery(true)}
              className="w-full px-3 py-2 text-sm border border-dashed border-edge text-muted rounded hover:border-accent2 hover:text-accent2 transition-colors"
            >
              Select a JumpDoc from gallery…
            </button>
          )}
        </div>
      </CollapsibleSection>

      {showGallery && (
        <SourceGalleryModal
          onSelect={(doc) => {
            modifyJump("Link JumpDoc", (j) => {
              j.source = { type: JumpSourceType.Jumpdoc, docId: doc.publicUid };
            });
            setShowGallery(false);
          }}
          onClose={() => setShowGallery(false)}
        />
      )}

      {showUnlinkConfirm && (
        <UnlinkConfirmModal
          docName={linkedDocName ?? "this JumpDoc"}
          onConfirm={() => {
            setShowUnlinkConfirm(false);
            unlinkJumpDoc(linkedDocPdfUrl);
          }}
          onCancel={() => setShowUnlinkConfirm(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

function ConfigTab() {
  const { jumpId } = Route.useParams();
  const jumpGid = createId<GID.Jump>(+jumpId);

  return (
    <div key={jumpId}>
      <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
        {/* Left — jump identity + origin aspects */}
        <div className="flex flex-col gap-1">
          <BasicsSection jumpId={jumpGid} />
          <SourceSection jumpId={jumpGid} />
          <OriginCategoriesSection jumpId={jumpGid} />
        </div>
        {/* Right — features and purchase registries */}
        <div className="flex flex-col gap-1">
          <FeaturesSection jumpId={jumpGid} />
          <CurrenciesSection jumpId={jumpGid} />
          <SubtypesSection jumpId={jumpGid} />
        </div>
      </div>
    </div>
  );
}
