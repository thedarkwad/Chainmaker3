import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Plus } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CompanionMultiSelect } from "@/chain/components/CompanionMultiSelect";

import type { Currency, PurchaseSubtype } from "@/chain/data/Jump";
import { createId, type GID, type Id, type LID, type Registry } from "@/chain/data/types";
import {
  useAllCharacters,
  useCompanionImport,
  useCompanionImports,
  useCurrencies,
  usePurchaseSubtypes,
} from "@/chain/state/hooks";
import { NewCompanionModal } from "@/chain/components/NewCompanionModal";
import { DraggablePurchaseList } from "@/chain/components/DraggablePurchaseList";
import { PurchaseEditor, type WidgetDef } from "@/chain/components/PurchaseEditor";
import { CollapsibleSection } from "@/ui/CollapsibleSection";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId/companions")({
  component: CompanionsTab,
});

// ─────────────────────────────────────────────────────────────────────────────
// useBufferedNumericMap — shared buffered-input logic for NumericCurrencyDropdown
// ─────────────────────────────────────────────────────────────────────────────

function useBufferedNumericMap(
  externalValues: Record<number, number>,
  onChange: (next: Record<number, number>) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [localValues, setLocalValues] = useState<Record<number, number>>(externalValues);
  const localRef = useRef(localValues);
  const dirtyRef = useRef(false);
  const [inputVersion, setInputVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const open = () => {
    setLocalValues(externalValues);
    localRef.current = externalValues;
    dirtyRef.current = false;
    setInputVersion((v) => v + 1);
    setIsOpen(true);
  };

  const close = () => {
    if (!isOpen) return;
    setIsOpen(false);
    if (dirtyRef.current) {
      onChangeRef.current(localRef.current);
      dirtyRef.current = false;
    }
  };

  const flush = () => {
    if (dirtyRef.current) {
      onChangeRef.current(localRef.current);
      dirtyRef.current = false;
    }
  };

  const setAmount = (currId: Id<LID.Currency>, amount: number) => {
    const next = { ...localRef.current, [currId as number]: amount };
    setLocalValues(next);
    localRef.current = next;
    dirtyRef.current = true;
  };

  // Click-outside closes and flushes.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus the first non-zero input on open.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const inputs = containerRef.current.querySelectorAll<HTMLInputElement>('input[type="number"]');
    if (!inputs.length) return;
    const target = Array.from(inputs).find((el) => Number(el.value) !== 0) ?? inputs[0];
    target.focus();
    target.select();
  }, [isOpen]);

  // Flush on unmount if left open.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) onChangeRef.current(localRef.current);
    };
  }, []);

  return { isOpen, localValues, inputVersion, containerRef, open, close, flush, setAmount };
}

// ─────────────────────────────────────────────────────────────────────────────
// NumericCurrencyDropdown — buffered multi-currency numeric inputs
// ─────────────────────────────────────────────────────────────────────────────

function NumericCurrencyDropdown({
  values,
  currencies,
  onChange,
  label,
  headerText,
}: {
  values: Record<number, number>;
  currencies: Registry<LID.Currency, Currency>;
  onChange: (next: Record<number, number>) => void;
  label: string;
  headerText: string;
}) {
  const { isOpen, localValues, inputVersion, containerRef, open, close, flush, setAmount } =
    useBufferedNumericMap(values, onChange);

  const currencyEntries = Object.entries(currencies.O) as [string, Currency | undefined][];

  // ── Single-currency: inline labeled input, no dropdown ───────────────────
  if (currencyEntries.length === 1) {
    const [[cidStr, curr]] = currencyEntries;
    const currId = createId<LID.Currency>(+cidStr);
    return (
      <div className="flex items-center gap-1 text-sm border border-edge rounded px-2 py-0.5 bg-surface/50 focus-within:border-accent-ring transition-colors shrink-0">
        <span className="font-semibold text-ink">{label}</span>
        <input
          key={`${cidStr}v${inputVersion}`}
          type="number"
          step={50}
          className="w-15 bg-transparent text-right font-semibold focus:outline-none"
          value={localValues[+cidStr!] ?? 0}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (!isNaN(n)) setAmount(currId, n);
          }}
          onBlur={flush}
        />
        <span className="text-muted text-xs">{curr?.abbrev ?? "?"}</span>
      </div>
    );
  }

  // ── Multi-currency: dropdown ──────────────────────────────────────────────
  const displayValues = isOpen ? localValues : values;
  const summary = currencyEntries
    .map(([cid, curr]) => {
      const amt = displayValues[+cid] ?? 0;
      return amt ? `${amt} ${curr?.abbrev ?? "?"}` : null;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (isOpen ? close() : open())}
        className="flex items-center gap-1 text-sm text-ink border border-edge rounded px-2 py-0.5 hover:border-trim bg-surface/50 transition-colors"
      >
        <span className="font-semibold">{label}</span> {summary || "None"}
        <ChevronDown size={11} className="text-muted shrink-0" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-20 bg-surface border border-edge rounded-lg shadow-lg p-3 min-w-44 flex flex-col gap-2"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              close();
              e.stopPropagation();
            }
          }}
        >
          <span className="text-xs text-muted">{headerText}</span>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            {currencyEntries.map(([cidStr, curr]) => {
              const currId = createId<LID.Currency>(+cidStr);
              return (
                <Fragment key={cidStr}>
                  <span className="text-xs text-muted text-right">{curr?.abbrev ?? "?"}</span>
                  <input
                    key={`${cidStr}v${inputVersion}`}
                    type="number"
                    step={50}
                    className="min-w-0 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring"
                    defaultValue={localValues[+cidStr] ?? 0}
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      if (!isNaN(n)) setAmount(currId, n);
                    }}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BudgetSummary — read-only allowances display for view mode
// ─────────────────────────────────────────────────────────────────────────────

function BudgetSummary({
  importId,
  currencies,
  subtypes,
}: {
  importId: Id<GID.Purchase>;
  currencies: Registry<LID.Currency, Currency>;
  subtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype>;
}) {
  const { companionImport } = useCompanionImport(importId);
  if (!companionImport) return null;

  const allowances = companionImport.importData.allowances as Record<number, number>;
  const stipend = companionImport.importData.stipend as Record<number, Record<number, number>>;

  const allowanceParts = Object.entries(currencies.O)
    .map(([cid, curr]) => {
      const amt = allowances[+cid] ?? 0;
      return amt ? `${amt} ${(curr as Currency | undefined)?.abbrev ?? "?"}` : null;
    })
    .filter(Boolean);

  const stipendLines = Object.entries(subtypes.O)
    .map(([stid, st]) => {
      const parts = Object.entries(currencies.O)
        .map(([cid, curr]) => {
          const amt = (stipend[+cid] ?? {})[+stid] ?? 0;
          return amt ? `${amt} ${(curr as Currency | undefined)?.abbrev ?? "?"}` : null;
        })
        .filter(Boolean);
      return parts.length > 0 ? (
        <span key={stid}>
          <span className="font-semibold text-ink">
            {(st as PurchaseSubtype | undefined)?.name ?? "?"} Stipend:
          </span>{" "}
          {parts.join(", ")}
        </span>
      ) : null;
    })
    .filter(Boolean);

  const allParts = [
    ...(allowanceParts.length > 0
      ? [
          <span>
            <span className="font-semibold text-ink">Allowance: </span> {allowanceParts.join(", ")}
          </span>,
        ]
      : []),
    ...stipendLines,
  ];

  if (allParts.length === 0) return null;

  return <div className="px-3 text-xs text-muted truncate flex gap-3 mt-3">{allParts}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CompanionImportEditor — wraps PurchaseEditor with companion-specific widgets
// ─────────────────────────────────────────────────────────────────────────────

function CompanionImportEditor({
  id,
  jumpId,
  selfCharId,
  isNew,
  onSubmit,
  onRemove,
}: {
  id: Id<GID.Purchase>;
  jumpId: Id<GID.Jump>;
  selfCharId: Id<GID.Character>;
  isNew: boolean;
  onSubmit: () => void;
  onRemove: () => void;
}) {
  const { chainId, jumpId: jumpIdStr } = Route.useParams();
  const { companionImport, modify } = useCompanionImport(id);
  const allChars = useAllCharacters();
  const currencies = useCurrencies(jumpId);
  const subtypes = usePurchaseSubtypes(jumpId);
  const [showingNewCompanion, setShowingNewCompanion] = useState(false);

  if (!companionImport || !currencies || !subtypes) return null;

  // Exclude the jumper themselves from the selectable list.
  const selectableChars = allChars.filter((c) => (c.id as number) !== (selfCharId as number));
  const selectedIds = companionImport.importData.characters;
  const selectedChars = selectedIds
    .map((cid) => selectableChars.find((c) => (c.id as number) === (cid as number)))
    .filter((c): c is { id: Id<GID.Character>; name: string } => c !== undefined);
  const availableChars = selectableChars.filter(
    (c) => !selectedIds.some((sel) => (sel as number) === (c.id as number)),
  );

  const handleAddChar = (charId: Id<GID.Character>) => {
    modify("Add companion", (p) => {
      if (!p.importData.characters.some((c) => (c as number) === (charId as number)))
        p.importData.characters.push(charId);
    });
  };

  const handleRemoveChar = (charId: Id<GID.Character>) => {
    modify("Remove companion", (p) => {
      p.importData.characters = p.importData.characters.filter(
        (c) => (c as number) !== (charId as number),
      );
    });
  };

  const handleNewCompanion = () => {
    setShowingNewCompanion(true);
  };

  const allowances = companionImport.importData.allowances as Record<number, number>;
  const stipend = companionImport.importData.stipend as Record<number, Record<number, number>>;
  const currencyEntries = Object.entries(currencies.O) as [string, Currency | undefined][];

  // View mode: accent2 linked pills (null when empty — PurchaseEditor hides empty body widgets).
  const charViewNode =
    selectedChars.length > 0 ? (
      <div className="pl-3 py-2 flex flex-wrap gap-1.5">
        {selectedChars.map((c) => (
          <Link
            key={c.id as number}
            to="/chain/$chainId/char/$charId/jump/$jumpId"
            params={{ chainId, charId: String(c.id as number), jumpId: jumpIdStr }}
          >
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2/30 hover:bg-accent2 hover:text-surface transition-colors cursor-pointer inline-block">
              {c.name || "(Unnamed)"}
            </span>
          </Link>
        ))}
      </div>
    ) :       <div className="py-1.5" />;

  // Edit mode: labeled multi-select (matches BasicPurchaseEditor category/tag label style).
  const charEditNode = (
    <div className="px-3 py-2 flex items-start gap-2">
      {/* <span className="text-xs text-muted shrink-0 pt-0.5">Companions:</span> */}
      <CompanionMultiSelect
        selected={selectedChars}
        available={availableChars}
        onAdd={handleAddChar}
        onRemove={handleRemoveChar}
        onNew={handleNewCompanion}
      />
    </div>
  );

  // Budget view: static allowances summary (read-only).
  const budgetViewNode = (
    <BudgetSummary importId={id} currencies={currencies} subtypes={subtypes} />
  );

  const subtypeEntries = Object.entries(subtypes.O) as [string, PurchaseSubtype | undefined][];

  // Budget edit: interactive dropdowns, one per subtype for stipends.
  const budgetEditNode = (
    <div className="flex flex-wrap gap-1.5 px-3 py-2">
      <NumericCurrencyDropdown
        values={allowances}
        currencies={currencies}
        label="Allowance:"
        headerText="Allowances"
        onChange={(next) =>
          modify("Set allowances", (p) => {
            p.importData.allowances = next as never;
          })
        }
      />
      {subtypeEntries.map(([stidStr, st]) => {
        // Build { currencyId -> amount } for this subtype across all currencies.
        const stipendForSubtype: Record<number, number> = {};
        for (const [cidStr] of currencyEntries) {
          const amt = (stipend[+cidStr] ?? {})[+stidStr] ?? 0;
          if (amt) stipendForSubtype[+cidStr] = amt;
        }
        const stName = st?.name ?? stidStr;
        return (
          <NumericCurrencyDropdown
            key={stidStr}
            values={stipendForSubtype}
            currencies={currencies}
            label={`${stName} Stipend:`}
            headerText={`${stName} Stipend`}
            onChange={(next) =>
              modify("Set stipend", (p) => {
                const s = p.importData.stipend as Record<number, Record<number, number>>;
                for (const [cidStr] of currencyEntries) {
                  if (!s[+cidStr]) s[+cidStr] = {};
                  s[+cidStr]![+stidStr] = next[+cidStr] ?? 0;
                }
              })
            }
          />
        );
      })}
    </div>
  );

  const widgets: WidgetDef[] = [
    { position: "body", view: charViewNode, edit: charEditNode },
    { position: "footer", view: budgetViewNode, edit: budgetEditNode },
  ];

  return (
    <>
      <PurchaseEditor
        id={id}
        widgets={widgets}
        isNew={isNew}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
      {showingNewCompanion && (
        <NewCompanionModal
          onDone={(newCharId) => {
            handleAddChar(newCharId);
            setShowingNewCompanion(false);
          }}
          onCancel={() => setShowingNewCompanion(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompanionsTab
// ─────────────────────────────────────────────────────────────────────────────

function CompanionsTab() {
  const { charId, jumpId } = Route.useParams();
  const jumpGid = createId<GID.Jump>(+jumpId);
  const charGid = createId<GID.Character>(+charId);

  const { importIds, actions } = useCompanionImports(jumpGid, charGid);
  const [newImportIds, setNewImportIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const addNew = () => {
    const id = actions.addImport();
    setNewImportIds((prev) => new Set(prev).add(id));
  };

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewImportIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <div className="flex flex-col gap-1">
      <CollapsibleSection
        title="Companion Imports"
        action={
          <button
            type="button"
            title="Add companion import"
            onClick={addNew}
            className="p-0.5 rounded transition-colors hover:bg-accent/20"
          >
            <Plus size={14} />
          </button>
        }
      >
        {importIds.length === 0 ? (
          <p className="text-xs text-ghost text-center py-3 italic">No companion imports yet.</p>
        ) : (
          <DraggablePurchaseList
            ids={importIds}
            onReorder={actions.reorderImports}
            renderItem={(id) => (
              <CompanionImportEditor
                id={id}
                jumpId={jumpGid}
                selfCharId={charGid}
                isNew={newImportIds.has(id)}
                onSubmit={() => clearNew(id)}
                onRemove={() => actions.removeImport(id)}
              />
            )}
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
