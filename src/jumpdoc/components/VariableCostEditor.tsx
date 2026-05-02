import { useRef, useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import type { VariableCost } from "@/chain/data/JumpDoc";
import { TID } from "@/chain/data/types";
import { createId, Id } from "@/chain/data/types";
import { useJumpDocCurrency, useJumpDocCurrencyIds } from "../state/hooks";

function ExpressionInput({
  currencyId,
  value,
  onCommit,
  onRemove,
  showRemove,
}: {
  currencyId: Id<TID.Currency>;
  value: string;
  onCommit: (expr: string) => void;
  onRemove?: () => void;
  showRemove: boolean;
}) {
  const currency = useJumpDocCurrency(currencyId);
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <div className="flex items-center gap-1 min-w-max w-50 text-xl text-muted bg-canvas border border-edge rounded px-2 py-1 focus-within:border-accent-ring transition-colors">
      {"${"}
      <input
        type="text"
        value={local}
        placeholder={`${currency?.abbrev ?? "?"} expression`}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (local !== value) onCommit(local);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="flex-1 min-w-30 text-xs px-2 py-1 text-center text-ink focus:outline-none"
      />
      {"}"}
      <span className="text-lg text-muted shrink-0">
        {currency?.abbrev ?? "?"}
      </span>
      {showRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-ghost hover:text-red-400 transition-colors p-0.5 shrink-0"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

export function VariableCostEditor({
  value,
  onCommit,
  onRemove,
}: {
  value: VariableCost;
  onCommit: (actionName: string, updated: VariableCost) => void;
  onRemove?: () => void;
}) {
  const currencyIds = useJumpDocCurrencyIds();
  const activeIds = Object.keys(value).map(k => createId<TID.Currency>(+k));
  const inactiveIds = currencyIds.filter(id => !(id in value));
  const isSingle = currencyIds.length === 1;

  const setExpr = (id: Id<TID.Currency>, expr: string) =>
    onCommit("Set Variable Cost Expression", { ...value, [id]: expr });

  const removeEntry = (id: Id<TID.Currency>) => {
    const updated = { ...value };
    delete updated[id];
    onCommit("Remove Variable Cost Currency", updated);
  };

  const addEntry = (id: Id<TID.Currency>) =>
    onCommit("Add Variable Cost Currency", { ...value, [id]: "" });

  if (isSingle) {
    const id = currencyIds[0]!;
    return (
      <div className="flex flex-col gap-2 max-w-60">
        {onRemove && (
          <div className="grid grid-cols-[1fr_auto] items-center">
            <div className="text-xs text-ghost uppercase">Variable Value</div>
          </div>
        )}
      <div className="flex flex-col gap-1.5 bg-tint border items-stretch border-edge rounded-xs py-2 px-3 mx-1">
        <ExpressionInput
          currencyId={id}
          value={value[id] ?? ""}
          onCommit={expr => setExpr(id, expr)}
          onRemove={onRemove}
          showRemove={true}
        />
      </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-max">
      {onRemove && (
        <div className="grid grid-cols-[1fr_auto] items-center">
          <div className="text-xs text-ghost uppercase">Variable Value</div>
        </div>
      )}
      <div className="flex flex-col gap-1.5 bg-tint border items-stretch border-edge rounded-xs py-2 px-3 mx-1">
        {activeIds.map(id => (
          <ExpressionInput
            key={id}
            currencyId={id}
            value={value[id] ?? ""}
            onCommit={expr => setExpr(id, expr)}
            onRemove={() => {
              if (activeIds.length <= 1)
                onRemove?.();
              else removeEntry(id);
            }}
            showRemove={true}
          />
        ))}
        {inactiveIds.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center self-end">
            <span className="text-xs text-ghost">Add:</span>
            {inactiveIds.map(id => (
              <CurrencyPill
                key={id}
                currencyId={id}
                onClick={() => addEntry(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CurrencyPill({
  currencyId,
  onClick,
}: {
  currencyId: Id<TID.Currency>;
  onClick: () => void;
}) {
  const currency = useJumpDocCurrency(currencyId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-canvas border border-edge rounded-full text-ghost hover:text-accent hover:border-accent transition-colors"
    >
      <Plus size={8} />
      {currency?.abbrev ?? "?"}
    </button>
  );
}
