import { Check, ChevronDown, ChevronRight, ExternalLink, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";

import {
  CostModifier,
  type Drawback,
  type DrawbackOverride,
  OverrideType,
  PurchaseType,
  type Value,
} from "@/chain/data/Purchase";
import { DEFAULT_CURRENCY_ID } from "@/chain/data/Jump";
import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import { useCurrencies, useJumpName, usePurchase } from "@/chain/state/hooks";
import { useDraft } from "@/chain/state/useDraft";
import { SelectField } from "@/ui/SelectField";
import { Link } from "@tanstack/react-router";
import { convertWhitespace } from "@/utilities/miscUtilities";

// ─────────────────────────────────────────────────────────────────────────────

type DrawbackOverrideCardProps = {
  /** The drawback purchase id (chain drawback or regular drawback). */
  id: Id<GID.Purchase>;
  /** The jump where the override is being viewed/set. */
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  chainId: string;
};

type OverrideDraft = {
  overrideType: OverrideType;
  modifier: CostModifier;
  /** Only used when modifier === CostModifier.Custom. */
  customAmount: number;
};

// ─── formatting helpers ───────────────────────────────────────────────────────

function formatRawValue(value: Value | number, currency: string): string {
  if (typeof value === "number") return `${value} ${currency}`;
  let sum = value.reduce((v, c) => (typeof c == "number" ? c : c.amount) + v, 0);
  return `${sum} ${currency}`;
}

function formatStatus(
  override: DrawbackOverride | undefined,
  value: Value | number,
  currency: string,
): string {
  const type = override?.type ?? OverrideType.Enabled;
  const mod = override?.modifier ?? { modifier: CostModifier.Full };

  if (type === OverrideType.Excluded) return "excluded";

  let prefix = "";
  switch (type) {
    case OverrideType.Enabled:
      prefix = "Retained";
      break;
    case OverrideType.BoughtOffTemp:
      prefix = "Temporarily bought off";
      break;
    case OverrideType.BoughtOffPermanent:
      prefix = "Permanently bought off";
  }
  let suffix = "";
  switch (mod.modifier) {
    case CostModifier.Full:
      suffix = formatRawValue(value, currency);
      break;
    case CostModifier.Reduced:
      suffix = formatRawValue(
        typeof value == "number"
          ? Math.floor(value / 2)
          : value.map((a) => ({
              currency: DEFAULT_CURRENCY_ID,
              amount: Math.floor(a.amount / 2),
            })),
        currency,
      );
      break;
    case CostModifier.Free:
      suffix = type == OverrideType.Enabled ? "no points" : "free";
      break;
    case CostModifier.Custom:
      suffix = formatRawValue(mod?.modifiedTo!, currency) + " (modified)";
  }
  return `${prefix} for ${suffix}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export function DrawbackOverrideCard({ id, jumpId, charId, chainId }: DrawbackOverrideCardProps) {
  const { purchase: drawback, actions } = usePurchase<Drawback>(id);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const draft = useDraft<OverrideDraft>({
    overrideType: OverrideType.Enabled,
    modifier: CostModifier.Full,
    customAmount: 0,
  });

  // Source jump — for currency formatting and pill link.
  const sourceJumpId =
    drawback?.type === PurchaseType.Drawback
      ? ((drawback as any).jumpId as Id<GID.Jump>)
      : undefined;
  const currency = useCurrencies(jumpId)?.O?.[DEFAULT_CURRENCY_ID]?.abbrev ?? "CP";
  const sourceJumpName = useJumpName(sourceJumpId);

  if (!drawback) return null;

  const override: DrawbackOverride | undefined = (drawback.overrides as any)?.[jumpId as number]?.[
    charId as number
  ];
  const isExcluded = override?.type === OverrideType.Excluded;
  const statusText = formatStatus(override, drawback.value as Value | number, currency);

  // ── Pill ──────────────────────────────────────────────────────────────────
  const pillClass =
    "truncate min-w-10 text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring hover:bg-accent2 hover:text-surface transition-colors font-medium";

  const pill =
    drawback.type === PurchaseType.ChainDrawback ? (
      <Link to="/chain/$chainId/config/drawbacks" params={{ chainId }} className={pillClass}>
        Chain
      </Link>
    ) : sourceJumpId != null ? (
      <Link
        to="/chain/$chainId/char/$charId/jump/$jumpId/drawbacks"
        params={{
          chainId,
          charId: String(charId as number),
          jumpId: String(sourceJumpId as number),
        }}
        search={{ scrollTo: undefined }}
        className={pillClass}
      >
        {sourceJumpName || "[unnamed jump]"}
      </Link>
    ) : null;

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const enterEdit = () => {
    const existingCustom =
      override?.modifier?.modifier === CostModifier.Custom
        ? typeof (override.modifier as any).modifiedTo === "number"
          ? (override.modifier as any).modifiedTo
          : (((override.modifier as any).modifiedTo as Value)?.[0]?.amount ?? 0)
        : 0;

    draft.restart(
      {
        overrideType: override?.type ?? OverrideType.Enabled,
        modifier: override?.modifier?.modifier ?? CostModifier.Full,
        customAmount: existingCustom,
      },
      "Edit drawback override",
      () => setIsEditing(false),
      () => {
        setIsEditing(true);
        setIsExpanded(true);
      },
    );
    setIsEditing(true);
    setIsExpanded(true);
  };

  const handleSave = () => {
    const s = draft.state;
    draft.close();

    // Enabled + Full is the default — just clear the override.
    if (s.overrideType === OverrideType.Enabled && s.modifier === CostModifier.Full) {
      actions.modify("Clear drawback override", (d) => {
        const jumpSlot = (d.overrides as any)[jumpId as number];
        if (jumpSlot) delete jumpSlot[charId as number];
      });
    } else {
      const modifiedCost =
        s.modifier === CostModifier.Custom
          ? {
              modifier: CostModifier.Custom as const,
              modifiedTo:
                drawback.type === PurchaseType.ChainDrawback
                  ? s.customAmount
                  : ([{ amount: s.customAmount, currency: createId<LID.Currency>(0) }] as Value),
            }
          : { modifier: s.modifier };

      actions.modify("Set drawback override", (d) => {
        if (!(d.overrides as any)[jumpId as number]) (d.overrides as any)[jumpId as number] = {};
        (d.overrides as any)[jumpId as number][charId as number] = {
          type: s.overrideType,
          modifier: modifiedCost,
        };
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    draft.cancel();
    setIsEditing(false);
  };

  const showModifier = draft.state.overrideType !== OverrideType.Excluded;

  // ── Edit mode ─────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        className="border border-accent-ring rounded-lg bg-surface shadow-md flex flex-col divide-y divide-line"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
          }
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
          <span className="font-semibold text-sm flex-1 min-w-0 truncate">
            {drawback.name || <span className="font-normal text-ghost italic">Unnamed</span>}
          </span>

          <SelectField
            value={draft.state.overrideType}
            onChange={(e) =>
              draft.set("Override type", (d) => {
                d.overrideType = Number(e.target.value) as OverrideType;
              })
            }
          >
            <option value={OverrideType.Enabled}>Enabled</option>
            <option value={OverrideType.Excluded}>Excluded</option>
            <option value={OverrideType.BoughtOffTemp}>Temporarily bought off</option>
            <option value={OverrideType.BoughtOffPermanent}>Permanently bought off</option>
          </SelectField>

          {showModifier && (
            <SelectField
              value={draft.state.modifier}
              onChange={(e) =>
                draft.set("Cost modifier", (d) => {
                  d.modifier = Number(e.target.value) as CostModifier;
                })
              }
            >
              <option value={CostModifier.Full}>Full</option>
              <option value={CostModifier.Reduced}>Reduced</option>
              <option value={CostModifier.Free}>Free</option>
              <option value={CostModifier.Custom}>Custom</option>
            </SelectField>
          )}

          {showModifier && draft.state.modifier === CostModifier.Custom && (
            <input
              type="number"
              className="w-20 border border-edge rounded px-2 py-0.5 text-sm bg-surface focus:outline-none focus:border-accent-ring"
              value={draft.state.customAmount}
              step={50}
              onChange={(e) =>
                draft.sync((d) => {
                  d.customAmount = Number(e.target.value);
                })
              }
            />
          )}

          {pill}

          <button
            onClick={handleSave}
            className="text-muted hover:text-accent transition-colors p-0.5 shrink-0"
            title="Save"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleCancel}
            className="text-ghost hover:text-muted transition-colors p-0.5 shrink-0"
            title="Cancel"
          >
            <Undo2 size={14} />
          </button>
        </div>

        {drawback.description && (
          <div className="px-3 py-2 text-sm text-muted flex flex-col gap-2 leading-snug">
            {convertWhitespace(drawback.description)}
          </div>
        )}
      </div>
    );
  }

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (!isExpanded || isExcluded) {
    return (
      <div
        className={`group rounded-lg bg-surface flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-colors border border-line hover:border-edge ${
          isExcluded ? "opacity-50" : ""
        }`}
        onClick={() => setIsExpanded(true)}
      >
        <ChevronRight
          size={13}
          className="text-ghost shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        />
        <span className="font-semibold text-sm shrink-0 truncate min-w-30 w-1/5">
          {drawback.name || <span className="font-normal text-ghost italic">Unnamed</span>}
        </span>
        <span className="text-sm font-semibold text-muted grow max-w-max truncate">[{statusText}]</span>
        {!isExcluded && drawback.description ? (
          <span className="flex-1 min-w-0 text-sm text-muted truncate">{drawback.description}</span>
        ) : (
          <span className="flex-1" />
        )}
        {pill}
        <button
          onClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5 shrink-0"
          title="Edit override"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  return (
    <div
      className={`border border-trim rounded-lg bg-surface shadow-sm mb-0.5 ${
        isExcluded ? "opacity-50" : ""
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(false)}
      >
        <ChevronDown size={14} className="text-ghost shrink-0" />
        <span className="flex-1 font-semibold text-base text-ink min-w-0 truncate">
          {drawback.name || <span className="font-normal text-ghost italic">Unnamed</span>}
        </span>
        <span className="text-sm font-semibold text-ink shrink-0">{statusText}</span>
        {pill}
        <button
          onClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
          title="Edit override"
        >
          <Pencil size={14} />
        </button>
      </div>

      {!isExcluded && drawback.description && (
        <div className="px-3 pt-1 pb-2.5 text-sm text-muted flex flex-col gap-2 leading-snug border-t border-line">
          {convertWhitespace(drawback.description)}
        </div>
      )}
    </div>
  );
}
