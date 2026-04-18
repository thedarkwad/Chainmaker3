import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Plus, X } from "lucide-react";
import { AddButton } from "@/ui/FormPrimitives";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import type { CurrencyExchange, Currency } from "@/chain/data/Jump";
import {
  useChainDrawbackIds,
  useCurrencies,
  useCurrencyExchanges,
  useJumpDrawbacks,
  useJumpIsSuplement,
  useJumpScenarios,
  useRetainedDrawbackIds,
  useBankDeposit,
  usePastePurchases,
  useBudget,
  useJumpDrawbackLimit,
  useChainSettingsConfig,
} from "@/chain/state/hooks";
import { BlurNumberInput } from "@/ui/BlurNumberInput";
import { DrawbackOverrideCard } from "@/chain/components/DrawbackOverrideCard";
import { DrawbackEditor, ScenarioEditor } from "@/chain/components/PurchaseEditor";
import { DraggablePurchaseList, PasteButton } from "@/chain/components/DraggablePurchaseList";
import { CollapsibleSection } from "@/ui/CollapsibleSection";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId/drawbacks")({
  validateSearch: (search: Record<string, unknown>) => ({
    scrollTo: typeof search.scrollTo === "string" ? search.scrollTo : undefined,
    exchange: typeof search.exchange === "string" ? search.exchange : undefined,
  }),
  component: DrawbacksTab,
});

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Currency exchanges
// ─────────────────────────────────────────────────────────────────────────────

type CurrencyEntry = [string, Currency];

function ExchangeChip({
  exchange,
  currencyEntries,
  onRemove,
  onUpdate,
}: {
  exchange: CurrencyExchange;
  currencyEntries: CurrencyEntry[];
  onRemove: () => void;
  onUpdate: (updater: (ex: CurrencyExchange) => void) => void;
}) {
  const [fromAmt, setFromAmt] = useState(String(exchange.oamount));
  const [toAmt, setToAmt] = useState(String(exchange.tamount));

  useEffect(() => setFromAmt(String(exchange.oamount)), [exchange.oamount]);
  useEffect(() => setToAmt(String(exchange.tamount)), [exchange.tamount]);

  const inputCls =
    "w-14 text-right text-xs bg-surface/40 border border-accent2/25 rounded px-1.5 py-0.5 tabular-nums focus:outline-none focus:border-accent2 transition-colors";
  const selectCls =
    "bg-transparent text-accent2 font-bold text-xs focus:outline-none cursor-pointer";

  return (
    <div className="inline-flex items-center justify-items-center text-sm gap-1.5 px-2.5 py-1 bg-accent2-tint/50 border border-accent2 rounded-lg">
      Traded
      <input
        type="number"
        min={0}
        step={50}
        className={inputCls}
        value={fromAmt}
        onChange={(e) => setFromAmt(e.target.value)}
        onBlur={(e) => {
          const v = Math.max(0, +e.target.value || 0);
          setFromAmt(String(v));
          onUpdate((ex) => {
            ex.oamount = v;
          });
        }}
      />
      <select
        value={exchange.oCurrency}
        onChange={(e) =>
          onUpdate((ex) => {
            ex.oCurrency = createId<LID.Currency>(+e.target.value);
          })
        }
        className={selectCls}
      >
        {currencyEntries.map(([id, cur]) => (
          <option key={id} value={id}>
            {cur.abbrev}
          </option>
        ))}
      </select>
      for
      <input
        type="number"
        min={0}
        step={50}
        className={inputCls}
        value={toAmt}
        onChange={(e) => setToAmt(e.target.value)}
        onBlur={(e) => {
          const v = Math.max(0, +e.target.value || 0);
          setToAmt(String(v));
          onUpdate((ex) => {
            ex.tamount = v;
          });
        }}
      />
      <select
        value={exchange.tCurrency}
        onChange={(e) =>
          onUpdate((ex) => {
            ex.tCurrency = createId<LID.Currency>(+e.target.value);
          })
        }
        className={selectCls}
      >
        {currencyEntries.map(([id, cur]) => (
          <option key={id} value={id} className="text-ink">
            {cur.abbrev}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Remove exchange"
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded text-accent2/50 hover:text-danger transition-colors shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function CurrencyExchangeSection({
  jumpId,
  charId,
  forceOpenNonce,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  forceOpenNonce?: number;
}) {
  const currencies = useCurrencies(jumpId);
  const { exchanges, addExchange, removeExchange, updateExchange } = useCurrencyExchanges(
    jumpId,
    charId,
  );

  const currencyEntries = currencies ? (Object.entries(currencies.O) as CurrencyEntry[]) : [];

  if (currencyEntries.length < 2) return null;

  const title = exchanges.length > 0 ? `Currency Exchanges (${exchanges.length})` : "Currency Exchanges";

  return (
    <CollapsibleSection
      title={title}
      defaultOpen={exchanges.length > 0}
      forceOpenNonce={forceOpenNonce}
      action={
        <button
          type="button"
          title="Add exchange"
          onClick={() => addExchange()}
          className="p-0.5 rounded transition-colors hover:bg-accent/20"
        >
          <Plus size={14} />
        </button>
      }
    >
      {exchanges.length === 0 ? (
        <p className="text-xs text-ghost text-center py-3 italic">No exchanges yet.</p>
      ) : (
        <div className="flex flex-row flex-wrap gap-2 px-1 py-1">
          {exchanges.map((ex, idx) => (
            <ExchangeChip
              key={idx}
              exchange={ex}
              currencyEntries={currencyEntries}
              onRemove={() => removeExchange(idx)}
              onUpdate={(updater) => updateExchange(idx, updater)}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Bank bar
// ─────────────────────────────────────────────────────────────────────────────

function BankBar({ charId, jumpId }: { charId: Id<GID.Character>; jumpId: Id<GID.Jump> }) {
  const {
    enabled,
    maxDeposit,
    bankBalance,
    totalBankDeposit,
    depositAmount,
    currency,
    adjustedDeposit,
    setDeposit,
  } = useBankDeposit(charId, jumpId);

  if (!enabled) return null;

  return (
    <div className="flex items-center justify-center gap-6 px-4 py-2 border border-edge bg-surface text-sm">
      <span className="text-muted">
        Bank Balance: <span className="font-semibold text-ink">{bankBalance}</span>
      </span>
      <label className="flex items-center gap-2 text-muted">
        Current Deposit:
        <BlurNumberInput
          value={depositAmount}
          onCommit={setDeposit}
          max={maxDeposit - totalBankDeposit + Math.max(0, depositAmount)}
          min={Math.min(0, adjustedDeposit - bankBalance)}
          step={25}
          className="w-20"
        />
        <span className="text-xs">{currency}</span>
      </label>
    </div>
  );
}

function DrawbacksTab() {
  const { chainId, charId, jumpId } = Route.useParams();
  const { exchange } = Route.useSearch();
  const navigate = useNavigate();
  const jumpGid = createId<GID.Jump>(+jumpId);
  const charGid = createId<GID.Character>(+charId);
  const [exchangeNonce, setExchangeNonce] = useState(0);

  useEffect(() => {
    if (exchange !== undefined) {
      setExchangeNonce((n) => n + 1);
      navigate({ to: ".", search: (s) => ({ ...s, exchange: undefined }), replace: true });
    }
  }, [exchange]);

  const chainSettings = useChainSettingsConfig();

  const isSupplementJump = useJumpIsSuplement(jumpGid);
  const chainDrawbackIds = useChainDrawbackIds(charGid, jumpGid);
  const retainedDrawbackIds = useRetainedDrawbackIds(charGid, jumpGid);
  const { drawbackIds, actions: drawbackActions } = useJumpDrawbacks(jumpGid, charGid);
  const { scenarioIds, actions: scenarioActions } = useJumpScenarios(jumpGid, charGid);
  const budget = useBudget(charGid, jumpGid);
  const drawbackLimit = useJumpDrawbackLimit(jumpGid);
  const limitExceeded = drawbackLimit != null && drawbackLimit > 0 && (budget?.drawbackCP ?? 0) > drawbackLimit;
  const [newDrawbackIds, setNewDrawbackIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());
  const [newScenarioIds, setNewScenarioIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());
  const pastePurchases = usePastePurchases(jumpGid, charGid);

  const clearNew = (
    id: Id<GID.Purchase>,
    setter: (fn: (prev: Set<Id<GID.Purchase>>) => Set<Id<GID.Purchase>>) => void,
  ) =>
    setter((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <div className="flex flex-col gap-1">
      {/* ── Bank Bar ── */}
      <BankBar charId={charGid} jumpId={jumpGid} key={`bank_${charGid}_${jumpGid}`} />

      {/* ── Drawback Limit Warning ── */}
      {limitExceeded && (
        <div className="flex items-start justify-center gap-1.5 rounded px-2 py-1.5 text-sm bg-danger/15 text-danger border border-danger/30">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Drawback limit exceeded ({budget!.drawbackCP} / {drawbackLimit} CP). Additional drawbacks will grant no additional points.</span>
        </div>
      )}

      {/* ── Chain Drawbacks ── */}
      {!(isSupplementJump && !chainSettings.settings?.chainDrawbacksSupplements) && chainDrawbackIds.length > 0 && (
        <CollapsibleSection title="Chain Drawbacks" defaultOpen={false}>
          <div className="flex flex-col gap-1">
            {chainDrawbackIds.map((id) => (
              <DrawbackOverrideCard
                key={id}
                id={id}
                jumpId={jumpGid}
                charId={charGid}
                chainId={chainId}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Retained Drawbacks ── */}
      {retainedDrawbackIds.length > 0 && (
        <CollapsibleSection title="Retained Drawbacks">
          <div className="flex flex-col gap-1">
            {retainedDrawbackIds.map((id) => (
              <DrawbackOverrideCard
                key={id}
                id={id}
                jumpId={jumpGid}
                charId={charGid}
                chainId={chainId}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Currency Exchanges ── */}
      <CurrencyExchangeSection jumpId={jumpGid} charId={charGid} forceOpenNonce={exchangeNonce} />

      {/* ── Drawbacks ── */}
      <CollapsibleSection
        title="Drawbacks"
        action={
          <>
            <PasteButton clipboardKey="drawback" onPaste={() => pastePurchases("drawback")} />
            <AddButton
              label="Add drawback"
              onClick={() => {
                const id = drawbackActions.addDrawback();
                setNewDrawbackIds((prev) => new Set(prev).add(id));
              }}
            />
          </>
        }
      >
        {drawbackIds.length === 0 ? (
          <p className="text-xs text-ghost text-center py-3 italic">No drawbacks yet.</p>
        ) : (
          <DraggablePurchaseList
            ids={drawbackIds}
            onReorder={drawbackActions.reorderDrawbacks}
            renderItem={(id) => (
              <DrawbackEditor
                id={id}
                isNew={newDrawbackIds.has(id)}
                onSubmit={() => clearNew(id, setNewDrawbackIds)}
                onRemove={() => drawbackActions.removeDrawback(id)}
                clipboardKey="drawback"
              />
            )}
          />
        )}
      </CollapsibleSection>

      {/* ── Scenarios ── */}
      <CollapsibleSection
        title="Scenarios"
        action={
          <>
            <PasteButton clipboardKey="scenario" onPaste={() => pastePurchases("scenario")} />
            <AddButton
              label="Add scenario"
              onClick={() => {
                const id = scenarioActions.addScenario();
                setNewScenarioIds((prev) => new Set(prev).add(id));
              }}
            />
          </>
        }
      >
        {scenarioIds.length === 0 ? (
          <p className="text-xs text-ghost text-center py-3 italic">No scenarios yet.</p>
        ) : (
          <DraggablePurchaseList
            ids={scenarioIds}
            onReorder={scenarioActions.reorderScenarios}
            renderItem={(id) => (
              <ScenarioEditor
                id={id}
                isNew={newScenarioIds.has(id)}
                onSubmit={() => clearNew(id, setNewScenarioIds)}
                onRemove={() => scenarioActions.removeScenario(id)}
                clipboardKey="scenario"
              />
            )}
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
