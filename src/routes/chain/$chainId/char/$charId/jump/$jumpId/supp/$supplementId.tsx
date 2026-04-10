import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { BlurNumberInput } from "@/ui/BlurNumberInput";

import { CompanionAccess, SupplementType } from "@/chain/data/ChainSupplement";
import { JumpSourceType, type JumpSource } from "@/chain/data/Jump";
import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import {
  useAllCharacters,
  useCharacter,
  useChainSupplement,
  useJumpSupplementImports,
  useJumpSupplementPurchases,
  useJumpSupplementScenarios,
  usePreviousSupplementPurchases,
  useSetObsolete,
  useSupplementAccess,
  useSupplementBudget,
  useSupplementImport,
  useSupplementInvestment,
  usePastePurchases,
} from "@/chain/state/hooks";
import {
  SupplementPurchaseEditor,
  SupplementScenarioEditor,
  PurchaseEditor,
  type WidgetDef,
} from "@/chain/components/PurchaseEditor";
import { DraggablePurchaseList, PasteButton } from "@/chain/components/DraggablePurchaseList";
import { PurchasePreview } from "@/chain/components/PurchasePreview";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { CompanionMultiSelect } from "@/chain/components/CompanionMultiSelect";
import { NewCompanionModal } from "@/chain/components/NewCompanionModal";

export const Route = createFileRoute(
  "/chain/$chainId/char/$charId/jump/$jumpId/supp/$supplementId",
)({ component: SupplementTab });

// ─────────────────────────────────────────────────────────────────────────────

function SupplementSection({
  label,
  jumpId,
  charId,
  suppId,
  type,
  currency,
}: {
  label: string;
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  suppId: Id<GID.Supplement>;
  type: PurchaseType.SupplementPerk | PurchaseType.SupplementItem;
  currency: string;
}) {
  const { purchaseIds, actions } = useJumpSupplementPurchases(jumpId, charId, suppId, type);
  const [newIds, setNewIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());
  const pastePurchases = usePastePurchases(jumpId, charId);

  const clipboardKey =
    type === PurchaseType.SupplementPerk
      ? `supplement-perk`
      : `supplement-item`;

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <CollapsibleSection
      title={label}
      action={
        <>
          <PasteButton clipboardKey={clipboardKey} onPaste={() => pastePurchases(clipboardKey, suppId)} />
          <button
            type="button"
            title={`Add ${label.toLowerCase()}`}
            onClick={() => {
              const id = actions.addPurchase();
              setNewIds((prev) => new Set(prev).add(id));
            }}
            className="p-0.5 rounded transition-colors hover:bg-accent/20"
          >
            <Plus size={14} />
          </button>
        </>
      }
    >
      {purchaseIds.length === 0 ? (
        <p className="text-xs text-ghost text-center py-3 italic">No {label.toLowerCase()} yet.</p>
      ) : (
        <DraggablePurchaseList
          ids={purchaseIds}
          onReorder={actions.reorderPurchases}
          renderItem={(id) => (
            <SupplementPurchaseEditor
              id={id}
              isNew={newIds.has(id)}
              onSubmit={() => clearNew(id)}
              onRemove={() => actions.removePurchase(id)}
              currencyLabel={currency}
              clipboardKey={clipboardKey}
            />
          )}
        />
      )}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones — supplement scenarios (only shown when enableScenarios is true)
// ─────────────────────────────────────────────────────────────────────────────

function MilestonesSection({
  jumpId,
  charId,
  suppId,
  currency,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  suppId: Id<GID.Supplement>;
  currency: string;
}) {
  const { scenarioIds, actions } = useJumpSupplementScenarios(jumpId, charId, suppId);
  const [newIds, setNewIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <CollapsibleSection
      title="Milestones"
      action={
        <button
          type="button"
          title="Add milestone"
          onClick={() => {
            const id = actions.addScenario();
            setNewIds((prev) => new Set(prev).add(id));
          }}
          className="p-0.5 rounded transition-colors hover:bg-accent/20"
        >
          <Plus size={14} />
        </button>
      }
    >
      {scenarioIds.length === 0 ? (
        <p className="text-xs text-ghost text-center py-3 italic">No milestones yet.</p>
      ) : (
        <DraggablePurchaseList
          ids={scenarioIds}
          onReorder={actions.reorderScenarios}
          renderItem={(id) => (
            <SupplementScenarioEditor
              id={id}
              currency={currency}
              isNew={newIds.has(id)}
              onSubmit={() => clearNew(id)}
              onRemove={() => actions.removeScenario(id)}
            />
          )}
        />
      )}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Previous Purchases — collapsed read-only list with obsolete toggles
// ─────────────────────────────────────────────────────────────────────────────

function PreviousSupplementPurchasesSection({
  jumpId,
  charId,
  suppId,
  chainId,
  charIdStr,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  suppId: Id<GID.Supplement>;
  chainId: string;
  charIdStr: string;
}) {
  const entries = usePreviousSupplementPurchases(jumpId, charId, suppId);
  const setObsolete = useSetObsolete();

  if (entries.length === 0) return null;

  return (
    <CollapsibleSection title="Previous Purchases" defaultOpen={false} secondary>
      {entries.map(({ id, isObsolete }) => (
        <PurchasePreview
          key={id as number}
          id={id}
          chainId={chainId}
          charId={charIdStr}
          showObsoleteToggle
          isObsolete={isObsolete}
          onSetObsolete={(obsolete) => setObsolete(id, jumpId, obsolete)}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget / Investment bar
// ─────────────────────────────────────────────────────────────────────────────

function BudgetBar({
  jumpId,
  charId,
  suppId,
  suppName,
  suppSource,
  currency,
  showInvestment,
  maxInvestment,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  suppId: Id<GID.Supplement>;
  suppName: string;
  suppSource: JumpSource;
  currency: string;
  showInvestment: boolean;
  maxInvestment: number;
}) {
  const budget = useSupplementBudget(charId, jumpId, suppId);
  const {
    value: investment,
    setValue: setInvestment,
    chunkTotal,
  } = useSupplementInvestment(charId, jumpId, suppId);

  const capRef = useRef<number | null>(null);
  if (capRef.current === null)
    capRef.current = Math.max(0, maxInvestment - chunkTotal + Math.max(investment, 0));

  return (
    <div className="flex items-center justify-center gap-6 px-4 py-2 border border-edge bg-surface text-sm">
      <span className="font-semibold text-ink flex gap-2 items-center">
        {suppName}
        {suppSource.type === JumpSourceType.URL && (
          <a
            href={suppSource.URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </span>
      <span className="text-muted">
        Budget:{" "}
        <span className="font-semibold text-ink">
          {budget ?? "—"} {currency}
        </span>
      </span>
      {showInvestment ? (
        <label className="flex items-center gap-2 text-muted">
          Investment:
          <BlurNumberInput
            value={investment}
            onCommit={setInvestment}
            max={capRef.current}
            step={50}
            className="w-20"
          />
          <span className="text-xs">{currency}</span>
        </label>
      ) : (
        <div className="h-7.5" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplementImportEditor — one supplement import entry (character select + allowance/percentage)
// ─────────────────────────────────────────────────────────────────────────────

function SupplementImportEditor({
  id,
  charId,
  currency,
  isNew,
  onSubmit,
  onRemove,
}: {
  id: Id<GID.Purchase>;
  charId: Id<GID.Character>;
  currency: string;
  isNew: boolean;
  onSubmit: () => void;
  onRemove: () => void;
}) {
  const { supplementImport, modify } = useSupplementImport(id);
  const allChars = useAllCharacters();
  const [showingNewCompanion, setShowingNewCompanion] = useState(false);

  if (!supplementImport) return null;

  const selectableChars = allChars.filter((c) => (c.id as number) !== (charId as number));
  const selectedIds = supplementImport.importData.characters;
  const selectedChars = selectedIds
    .map((cid) => selectableChars.find((c) => (c.id as number) === (cid as number)))
    .filter((c): c is { id: Id<GID.Character>; name: string } => c !== undefined);
  const availableChars = selectableChars.filter(
    (c) => !selectedIds.some((sel) => (sel as number) === (c.id as number)),
  );

  const handleAddChar = (cid: Id<GID.Character>) => {
    modify("Add companion to supplement import", (p) => {
      if (!p.importData.characters.some((c) => (c as number) === (cid as number)))
        p.importData.characters.push(cid);
    });
  };

  const handleRemoveChar = (cid: Id<GID.Character>) => {
    modify("Remove companion from supplement import", (p) => {
      p.importData.characters = p.importData.characters.filter(
        (c) => (c as number) !== (cid as number),
      );
    });
  };

  const handleNewCompanion = () => {
    setShowingNewCompanion(true);
  };

  const charViewNode =
    selectedChars.length > 0 ? (
      <div className="pl-3 py-2 flex flex-wrap gap-1.5">
        {selectedChars.map((c) => (
          <span
            key={c.id as number}
            className="text-xs px-2.5 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2/30"
          >
            {c.name || "(Unnamed)"}
          </span>
        ))}
      </div>
    ) : (
      <div className="py-1.5" />
    );

  const charEditNode = (
    <div className="px-3 py-2">
      <CompanionMultiSelect
        selected={selectedChars}
        available={availableChars}
        onAdd={handleAddChar}
        onRemove={handleRemoveChar}
        onNew={handleNewCompanion}
      />
    </div>
  );

  const { allowance, percentage } = supplementImport.importData;
  const budgetViewNode =
    allowance !== 0 || percentage !== 0 ? (
      <div className="px-3 text-xs text-muted flex gap-3 mb-2">
        {allowance !== 0 && (
          <span>
            <span className="font-semibold text-ink">Allowance: </span>
            {allowance} {currency}
          </span>
        )}
        {percentage !== 0 && (
          <span>
            <span className="font-semibold text-ink">Share: </span>
            {percentage}%
          </span>
        )}
      </div>
    ) : null;

  const budgetEditNode = (
    <div className="flex flex-wrap gap-3 px-3 py-2 items-center text-sm">
      <label className="flex items-center gap-1.5 text-muted">
        Allowance:
        <input
          type="number"
          min={0}
          step={50}
          className="w-20 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring bg-transparent"
          defaultValue={allowance}
          onBlur={(e) => {
            const n = e.target.valueAsNumber;
            if (!isNaN(n) && n !== supplementImport.importData.allowance)
              modify("Set supplement import allowance", (p) => {
                p.importData.allowance = n;
              });
          }}
        />
        <span className="text-xs text-muted">{currency}</span>
      </label>
      <label className="flex items-center gap-1.5 text-muted">
        Share:
        <input
          type="number"
          min={0}
          max={100}
          step={5}
          className="w-16 border border-edge rounded px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:border-accent-ring bg-transparent"
          defaultValue={percentage}
          onBlur={(e) => {
            const n = e.target.valueAsNumber;
            if (!isNaN(n) && n !== supplementImport.importData.percentage)
              modify("Set supplement import share", (p) => {
                p.importData.percentage = Math.min(100, Math.max(0, n));
              });
          }}
        />
        <span className="text-xs text-muted">%</span>
      </label>
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

function SupplementImportsSection({
  jumpId,
  charId,
  suppId,
  suppName,
  currency,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  suppId: Id<GID.Supplement>;
  suppName: string;
  currency: string;
}) {
  const { importIds, actions } = useJumpSupplementImports(jumpId, charId, suppId);
  const [newIds, setNewIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const addNew = () => {
    const id = actions.addImport();
    setNewIds((prev) => new Set(prev).add(id));
  };

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <CollapsibleSection
      title={`${suppName} Imports`}
      action={
        <button
          type="button"
          title="Add supplement import"
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
            <SupplementImportEditor
              id={id}
              charId={charId}
              currency={currency}
              isNew={newIds.has(id)}
              onSubmit={() => clearNew(id)}
              onRemove={() => actions.removeImport(id)}
            />
          )}
        />
      )}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SupplementTab() {
  const { chainId, charId, jumpId, supplementId } = Route.useParams();
  const jumpGid = createId<GID.Jump>(+jumpId);
  const charGid = createId<GID.Character>(+charId);
  const suppGid = createId<GID.Supplement>(+supplementId);

  const supplement = useChainSupplement(suppGid);
  const { char } = useCharacter(charGid);
  const supplementAccess = useSupplementAccess(charGid);
  const hasJumpAccess = supplementAccess?.[suppGid]?.has(jumpGid as number) ?? false;

  if (!supplement)
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full border border-edge rounded-lg bg-surface px-6 py-5 flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Supplement not found</p>
          <p className="text-sm text-muted">This supplement no longer exists in the chain.</p>
        </div>
      </div>
    );

  if (!hasJumpAccess)
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full border border-edge rounded-lg bg-surface px-6 py-5 flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">No access</p>
          <p className="text-sm text-muted">{supplement.name} is not available in this jump.</p>
        </div>
      </div>
    );

  const currency = supplement.currency || "SP";
  const showPerks =
    supplement.type === SupplementType.Perk || supplement.type === SupplementType.Dual;
  const showItems =
    supplement.type === SupplementType.Item || supplement.type === SupplementType.Dual;
  const showMilestones = supplement.enableScenarios;
  const showImports = supplement.companionAccess === CompanionAccess.Imports;
  const showInvestment =
    (supplement.maxInvestment ?? 0) > 0 &&
    (supplement.investmentRatio ?? 0) > 0 &&
    // Companions imported via Imports access don't invest — only the primary jumper does.
    !(supplement.companionAccess === CompanionAccess.Imports && !char?.primary);

  return (
    <div className="flex flex-col gap-1">
      <BudgetBar
        jumpId={jumpGid}
        charId={charGid}
        suppId={suppGid}
        suppName={supplement.name}
        suppSource={supplement.source}
        currency={currency}
        showInvestment={showInvestment}
        maxInvestment={supplement.maxInvestment ?? 0}
      />
      <PreviousSupplementPurchasesSection
        jumpId={jumpGid}
        charId={charGid}
        suppId={suppGid}
        chainId={chainId}
        charIdStr={charId}
      />
      {showPerks && (
        <SupplementSection
          label={`${supplement.name} Perks`}
          jumpId={jumpGid}
          charId={charGid}
          suppId={suppGid}
          type={PurchaseType.SupplementPerk}
          currency={currency}
        />
      )}
      {showItems && (
        <SupplementSection
          label={`${supplement.name} Items`}
          jumpId={jumpGid}
          charId={charGid}
          suppId={suppGid}
          type={PurchaseType.SupplementItem}
          currency={currency}
        />
      )}
      {showMilestones && (
        <MilestonesSection jumpId={jumpGid} charId={charGid} suppId={suppGid} currency={currency} />
      )}
      {showImports && (
        <SupplementImportsSection
          jumpId={jumpGid}
          charId={charGid}
          suppId={suppGid}
          suppName={supplement.name}
          currency={currency}
        />
      )}
    </div>
  );
}
