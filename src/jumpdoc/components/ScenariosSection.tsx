/**
 * ScenariosSection — list of scenario templates in the JumpDoc editor.
 * Fields: name, description, allowMultiple, rewardGroups (Outcomes).
 */

import { memo, useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { PickerModal, PickerGroup, PickerItem } from "./PickerModal";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { TemplateCard } from "./TemplateCard";
import { RareFieldsGroup } from "./RareFieldsGroup";
import { PurchasePrerequisiteEditor, PurchasePrerequisitePickerModal } from "./PurchasesSection";
import {
  BlurInput,
  DescriptionArea,
  CurrencySelect,
  PurchaseSubtypeSelect,
  BlurNumberInput,
} from "./JumpDocFields";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDocScenarioIds,
  useJumpDocScenario,
  useModifyJumpDocScenario,
  useAddJumpDocScenario,
  useRemoveJumpDocScenario,
  useRemoveBoundFromScenario,
  useAddJumpDocScenarioOutcome,
  useRemoveJumpDocScenarioOutcome,
  useModifyJumpDocScenarioOutcome,
  useJumpDocPurchasesWithRewardType,
  useJumpDocFirstSubtypeIdByType,
  useJumpDocFirstCurrencyId,
  useAddJumpDocPurchase,
  useJumpDocPurchase,
  useAddJumpDocPrereq,
  useRemoveJumpDocPrereq,
  useJumpDocCompanionsForPicker,
  useAddJumpDocCompanionForReward,
  useJumpDocCompanion,
} from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import type { ScenarioRewardTemplate } from "@/chain/data/JumpDoc";
import { PurchaseType, RewardType } from "@/chain/data/Purchase";

export function ScenariosSection({
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  open,
  forceOpenNonce,
  singleId,
}: SectionSharedProps<TID.Scenario> & { open?: boolean; forceOpenNonce?: number; singleId?: number }) {
  const scenarioIds = useJumpDocScenarioIds();
  const addScenario = useAddJumpDocScenario();

  const displayedIds = singleId !== undefined
    ? scenarioIds.filter((id) => (id as number) === singleId)
    : scenarioIds;

  return (
    <CollapsibleSection
      title="Scenarios"
      defaultOpen
      open={singleId !== undefined ? true : open}
      forceOpenNonce={forceOpenNonce}
      styled
      action={
        singleId === undefined ? (
          <button
            title="Add scenario"
            onClick={() => addScenario()}
            className="p-0.5 rounded text-ghost hover:text-violet-400 hover:bg-violet-400/10 transition-colors"
          >
            <Plus size={11} />
          </button>
        ) : undefined
      }
    >
      {displayedIds.length === 0 && (
        <p className="text-xs text-ghost px-1 py-0.5">No scenarios yet.</p>
      )}
      {displayedIds.map((id) => (
        <ScenarioCard
          key={id as number}
          id={id}
          addBoundsTarget={addBoundsTarget}
          registerRef={registerRef}
          isScrollTarget={activeScrollKey === `scenario-${id as number}`}
          isAnyScrollTarget={activeScrollKey !== null}
          onAddBoundsRequest={onAddBoundsRequest}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScenarioCard
// ─────────────────────────────────────────────────────────────────────────────

const ScenarioCard = memo(function ScenarioCard({
  id,
  addBoundsTarget,
  registerRef,
  isScrollTarget,
  isAnyScrollTarget,
  onAddBoundsRequest,
}: {
  id: Id<TID.Scenario>;
  addBoundsTarget: SectionSharedProps<TID.Scenario>["addBoundsTarget"];
  registerRef: SectionSharedProps<TID.Scenario>["registerRef"];
  isScrollTarget: boolean;
  isAnyScrollTarget: boolean;
  onAddBoundsRequest: SectionSharedProps<TID.Scenario>["onAddBoundsRequest"];
}) {
  const scenario = useJumpDocScenario(id);
  const modify = useModifyJumpDocScenario(id);
  const removeScenario = useRemoveJumpDocScenario();
  const removeBound = useRemoveBoundFromScenario();
  const addPrereq = useAddJumpDocPrereq("scenario", id as number);
  const removePrereq = useRemoveJumpDocPrereq("scenario", id as number);
  const [prereqPickerOpen, setPrereqPickerOpen] = useState(false);
  if (!scenario) return null;

  const key = `scenario-${id}`;

  return (
    <TemplateCard
      type="scenario"
      id={id}
      name={scenario.name}
      summary={scenario.description}
      bounds={scenario.bounds}
      addBoundsTarget={addBoundsTarget}
      isScrollTarget={isScrollTarget}
      isAnyScrollTarget={isAnyScrollTarget}
      cardRef={(el) => registerRef(key, el)}
      onNameCommit={(v) =>
        modify("Rename Scenario", (t) => {
          t.name = v;
        })
      }
      onAddBound={() => onAddBoundsRequest("scenario", id)}
      onRemoveBound={(i) => removeBound(id, i)}
      onDelete={() => removeScenario(id)}
    >
      <DescriptionArea
        value={scenario.description}
        onCommit={(v) =>
          modify("Set Scenario Description", (t) => {
            t.description = v;
          })
        }
      />

      <OutcomesEditor id={id} />

      <RareFieldsGroup
        fields={[
          {
            key: "prereqs",
            isActive: !!(scenario.prerequisites?.length),
            dormant: () => (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                  onClick={() => setPrereqPickerOpen(true)}
                >
                  <Plus size={8} /> add prereq / incompatibility
                </button>
                {prereqPickerOpen && (
                  <PurchasePrerequisitePickerModal
                    onSelect={(prereq) => {
                      addPrereq(prereq);
                      setPrereqPickerOpen(false);
                    }}
                    onClose={() => setPrereqPickerOpen(false)}
                  />
                )}
              </>
            ),
            active: () => (
              <PurchasePrerequisiteEditor
                prerequisites={scenario.prerequisites}
                onAdd={addPrereq}
                onRemove={removePrereq}
              />
            ),
          },
        ]}
      />
    </TemplateCard>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// OutcomesEditor — pill list of reward groups
// ─────────────────────────────────────────────────────────────────────────────

function OutcomesEditor({ id }: { id: Id<TID.Scenario> }) {
  const scenario = useJumpDocScenario(id);
  const addOutcome = useAddJumpDocScenarioOutcome(id);
  const removeOutcome = useRemoveJumpDocScenarioOutcome(id);
  const modifyOutcome = useModifyJumpDocScenarioOutcome(id);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const groups = scenario?.rewardGroups ?? [];

  // Keep active index in bounds after deletions
  const clampedActive = activeIndex !== null && activeIndex < groups.length ? activeIndex : null;

  function handleAdd() {
    addOutcome();
    setActiveIndex(groups.length); // new item will be at this index
  }

  function handleRemove(i: number) {
    removeOutcome(i);
    setActiveIndex((prev) => {
      if (prev === null) return null;
      if (prev === i) return null;
      if (prev > i) return prev - 1;
      return prev;
    });
  }

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-line">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted font-semibold shrink-0">Outcomes</span>
        {groups.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(clampedActive === i ? null : i)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              clampedActive === i
                ? "bg-violet-400/15 text-violet-400 border-violet-400/50"
                : "bg-surface text-ink border-edge hover:border-violet-400/50 hover:text-violet-400"
            }`}
          >
            {g.title || `Outcome ${i + 1}`}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-edge text-ghost hover:border-violet-400/60 hover:text-violet-400 transition-colors"
        >
          <Plus size={10} />
          Add
        </button>
      </div>

      {clampedActive !== null && groups[clampedActive] && (
        <OutcomeEditor
          groupIndex={clampedActive}
          group={groups[clampedActive]}
          onModify={modifyOutcome}
          onDelete={() => handleRemove(clampedActive)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OutcomeEditor — expanded editor for a single reward group
// ─────────────────────────────────────────────────────────────────────────────

type RewardGroup = { title: string; context: string; rewards: ScenarioRewardTemplate[] };
type ModifyOutcome = (
  actionName: string,
  groupIndex: number,
  updater: (group: RewardGroup) => void,
) => void;

function OutcomeEditor({
  groupIndex,
  group,
  onModify,
  onDelete,
}: {
  groupIndex: number;
  group: RewardGroup;
  onModify: ModifyOutcome;
  onDelete: () => void;
}) {
  const firstCurrencyId = useJumpDocFirstCurrencyId();
  const firstPerkSubtypeId = useJumpDocFirstSubtypeIdByType(PurchaseType.Perk);
  const firstItemSubtypeId = useJumpDocFirstSubtypeIdByType(PurchaseType.Item);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [companionPickerOpen, setCompanionPickerOpen] = useState(false);

  function addCurrencyReward() {
    onModify("Add Currency Reward", groupIndex, (g) => {
      g.rewards.push({ type: RewardType.Currency, value: 0, currency: firstCurrencyId });
    });
  }

  function addStipendReward() {
    const subtypeId = firstPerkSubtypeId ?? firstItemSubtypeId ?? (0 as Id<TID.PurchaseSubtype>);
    onModify("Add Stipend Reward", groupIndex, (g) => {
      g.rewards.push({
        type: RewardType.Stipend,
        value: 0,
        currency: firstCurrencyId,
        subtype: subtypeId,
      });
    });
  }

  function handlePurchaseSelected(
    purchaseId: Id<TID.Purchase>,
    rewardType: RewardType.Perk | RewardType.Item,
  ) {
    onModify("Add Purchase Reward", groupIndex, (g) => {
      g.rewards.push({ type: rewardType, id: purchaseId });
    });
    setPickerOpen(false);
  }

  function handleCompanionSelected(companionId: Id<TID.Companion>) {
    onModify("Add Companion Reward", groupIndex, (g) => {
      g.rewards.push({ type: RewardType.Companion, id: companionId });
    });
    setCompanionPickerOpen(false);
  }

  function removeReward(rewardIndex: number) {
    onModify("Remove Reward", groupIndex, (g) => {
      g.rewards.splice(rewardIndex, 1);
    });
  }

  function updateReward(rewardIndex: number, updated: ScenarioRewardTemplate) {
    onModify("Update Reward", groupIndex, (g) => {
      g.rewards[rewardIndex] = updated;
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-2 border-l-2 border-violet-400/30" key={groupIndex}>
      {/* Title + delete */}
      <div className="flex items-center gap-1">
        <BlurInput
          value={group.title}
          onCommit={(v) =>
            onModify("Set Outcome Title", groupIndex, (g) => {
              g.title = v;
            })
          }
          placeholder="Outcome title (optional)"
          className="flex-1 text-xs"
        />
        <button
          type="button"
          title="Delete outcome"
          onClick={onDelete}
          className="p-1 text-ghost hover:text-danger transition-colors shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Context */}
      <DescriptionArea
        key={groupIndex}
        value={group.context}
        placeholder="Context / additional description (optional)"
        onCommit={(v) =>
          onModify("Set Outcome Context", groupIndex, (g) => {
            g.context = v;
          })
        }
      />

      {/* Add buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <div className="text-xs text-ghost font-medium self-center">Add Reward:</div>
        <button
          type="button"
          onClick={addCurrencyReward}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border border-edge text-ghost hover:text-accent hover:border-accent/60 transition-colors"
        >
          <Plus size={10} /> Currency
        </button>
        <button
          type="button"
          onClick={addStipendReward}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border border-edge text-ghost hover:text-accent hover:border-accent/60 transition-colors"
        >
          <Plus size={10} /> Stipend
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border border-edge text-ghost hover:text-accent hover:border-accent/60 transition-colors"
        >
          <Plus size={10} /> Purchase
        </button>
        <button
          type="button"
          onClick={() => setCompanionPickerOpen(true)}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border border-edge text-ghost hover:text-accent hover:border-accent/60 transition-colors"
        >
          <Plus size={10} /> Companion
        </button>
      </div>

      {/* Rewards list */}
      {group.rewards.length > 0 && (
        <div className="flex flex-row flex-wrap gap-1">
          {group.rewards.map((reward, i) =>
            reward.type === RewardType.Currency ? (
              <CurrencyRewardRow
                key={i}
                reward={reward}
                onChange={(r) => updateReward(i, r)}
                onRemove={() => removeReward(i)}
              />
            ) : reward.type === RewardType.Stipend ? (
              <StipendRewardRow
                key={i}
                reward={reward}
                onChange={(r) => updateReward(i, r)}
                onRemove={() => removeReward(i)}
              />
            ) : reward.type === RewardType.Companion ? (
              <CompanionRewardRow key={i} reward={reward} onRemove={() => removeReward(i)} />
            ) : (
              <PurchaseRewardRow key={i} reward={reward} onRemove={() => removeReward(i)} />
            ),
          )}
        </div>
      )}

      {pickerOpen && (
        <PurchasePickerModal
          onSelect={handlePurchaseSelected}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {companionPickerOpen && (
        <CompanionPickerModal
          onSelect={handleCompanionSelected}
          onClose={() => setCompanionPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reward row components
// ─────────────────────────────────────────────────────────────────────────────

type CurrencyReward = { type: RewardType.Currency; value: number; currency: Id<TID.Currency> };
type StipendReward = {
  type: RewardType.Stipend;
  value: number;
  currency: Id<TID.Currency>;
  subtype: Id<TID.PurchaseSubtype>;
};
type PurchaseReward = { type: RewardType.Perk | RewardType.Item; id: Id<TID.Purchase> };

function CurrencyRewardRow({
  reward,
  onChange,
  onRemove,
}: {
  reward: CurrencyReward;
  onChange: (r: CurrencyReward) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-accent2-tint border border-accent2/40 p-1 rounded-sm w-fit">
      <span className="text-xs font-medium text-accent2 shrink-0">Currency:</span>
      <BlurNumberInput
        value={reward.value}
        onCommit={(v) => onChange({ ...reward, value: v })}
        className="w-14 py-0 text-xs"
      />
      <CurrencySelect
        value={reward.currency}
        onChange={(id) => onChange({ ...reward, currency: id })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-ghost hover:text-danger transition-colors p-0.5 ml-auto"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function StipendRewardRow({
  reward,
  onChange,
  onRemove,
}: {
  reward: StipendReward;
  onChange: (r: StipendReward) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-accent2-tint border border-accent2/40 p-1 rounded-sm w-fit">
      <span className="text-xs font-medium text-accent2 shrink-0">Stipend:</span>
      <BlurNumberInput
        value={reward.value}
        onCommit={(v) => onChange({ ...reward, value: v })}
        className="w-14 text-xs"
        min={-99999}
      />
      <CurrencySelect
        value={reward.currency}
        onChange={(id) => onChange({ ...reward, currency: id })}
      />
      <PurchaseSubtypeSelect
        value={reward.subtype}
        onChange={(id) => onChange({ ...reward, subtype: id })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-ghost hover:text-danger transition-colors p-0.5 ml-auto"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function PurchaseRewardRow({ reward, onRemove }: { reward: PurchaseReward; onRemove: () => void }) {
  const purchase = useJumpDocPurchase(reward.id);
  const typeLabel = reward.type === RewardType.Perk ? "Perk:" : "Item:";
  return (
    <div className="flex items-center gap-1 bg-accent2-tint border border-accent2/40 px-1 py-2 rounded-sm w-fit">
      <span className="text-xs text-accent2 shrink-0 font-medium">{typeLabel}</span>
      <span className="text-xs flex-1 truncate">{purchase?.name || `#${reward.id}`}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-ghost hover:text-danger transition-colors p-0.5 ml-auto"
      >
        <X size={11} />
      </button>
    </div>
  );
}

type CompanionReward = { type: RewardType.Companion; id: Id<TID.Companion> };

function CompanionRewardRow({ reward, onRemove }: { reward: CompanionReward; onRemove: () => void }) {
  const companion = useJumpDocCompanion(reward.id);
  return (
    <div className="flex items-center gap-1 bg-accent2-tint border border-accent2/40 px-1 py-2 rounded-sm w-fit">
      <span className="text-xs text-accent2 shrink-0 font-medium">Companion Import:</span>
      <span className="text-xs flex-1 truncate">{companion?.name || `#${reward.id}`}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-ghost hover:text-danger transition-colors p-0.5 ml-auto"
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PurchasePickerModal — portals into #jumpdoc-editor-panel (left panel only)
// ─────────────────────────────────────────────────────────────────────────────

function PurchasePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: Id<TID.Purchase>, rewardType: RewardType.Perk | RewardType.Item) => void;
  onClose: () => void;
}) {
  const purchases = useJumpDocPurchasesWithRewardType();
  const addPurchase = useAddJumpDocPurchase();
  const firstPerkSubtypeId = useJumpDocFirstSubtypeIdByType(PurchaseType.Perk);
  const firstItemSubtypeId = useJumpDocFirstSubtypeIdByType(PurchaseType.Item);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<PurchaseType.Perk | PurchaseType.Item>(PurchaseType.Perk);
  const [filter, setFilter] = useState("");

  const filtered = purchases.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const perks = filtered.filter((p) => p.rewardType === RewardType.Perk);
  const items = filtered.filter((p) => p.rewardType === RewardType.Item);

  function handleCreate() {
    const subtypeId = newType === PurchaseType.Perk ? firstPerkSubtypeId : firstItemSubtypeId;
    const newId = addPurchase(subtypeId!, undefined, {
      desc: newDescription,
      title: newName.trim(),
      currency: 0 as Id<TID.Currency>,
      amount: 0,
    });
    onSelect(newId, newType === PurchaseType.Perk ? RewardType.Perk : RewardType.Item);
  }

  const createNewFooter = (
    <div className="px-3 py-3 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Create new</p>
      <input
        type="text"
        placeholder="Name…"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
      />
      <DescriptionArea
        value={newDescription}
        onCommit={(v) => setNewDescription(v)}
        className="bg-surface"
        maxHeight="20rem"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink">
          <input
            type="radio"
            checked={newType === PurchaseType.Perk}
            onChange={() => setNewType(PurchaseType.Perk)}
            className="accent-accent"
          />
          Perk
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink">
          <input
            type="radio"
            checked={newType === PurchaseType.Item}
            onChange={() => setNewType(PurchaseType.Item)}
            className="accent-accent"
          />
          Item
        </label>
      </div>
      <button
        type="button"
        onClick={handleCreate}
        disabled={!newName.trim()}
        className="px-3 py-1.5 rounded text-sm bg-accent2-tint text-accent2 border border-accent2/40 hover:bg-accent2/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Create &amp; Add
      </button>
    </div>
  );

  return (
    <PickerModal
      title="Add Purchase Reward"
      filter={filter}
      onFilterChange={setFilter}
      onClose={onClose}
      footer={createNewFooter}
    >
      {purchases.length === 0 && (
        <p className="text-xs text-ghost px-1 py-1">No purchases defined yet.</p>
      )}
      {perks.length > 0 && (
        <PickerGroup label="Perks">
          {perks.map((p) => (
            <PickerItem
              key={p.id as number}
              name={p.name}
              subtitle={p.subtypeName}
              onClick={() => onSelect(p.id, p.rewardType)}
            />
          ))}
        </PickerGroup>
      )}
      {items.length > 0 && (
        <PickerGroup label="Items">
          {items.map((p) => (
            <PickerItem
              key={p.id as number}
              name={p.name}
              subtitle={p.subtypeName}
              onClick={() => onSelect(p.id, p.rewardType)}
            />
          ))}
        </PickerGroup>
      )}
      {filtered.length === 0 && purchases.length > 0 && (
        <p className="text-xs text-ghost px-1">No matches.</p>
      )}
    </PickerModal>
  );
}

function CompanionPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: Id<TID.Companion>) => void;
  onClose: () => void;
}) {
  const companions = useJumpDocCompanionsForPicker();
  const addCompanion = useAddJumpDocCompanionForReward();

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCharName, setNewCharName] = useState("");
  const [newGender, setNewGender] = useState("");
  const [newSpecies, setNewSpecies] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = companions.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  function handleCreate() {
    const newId = addCompanion(
      newName.trim(),
      newDescription,
      newCharName.trim(),
      newGender.trim(),
      newSpecies.trim(),
    );
    onSelect(newId);
  }

  const createNewFooter = (
    <div className="px-3 py-3 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Create new</p>
      <input
        type="text"
        placeholder="Import name…"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
      />
      <DescriptionArea
        value={newDescription}
        onCommit={(v) => setNewDescription(v)}
        className="bg-surface"
        maxHeight="20rem"
        placeholder="Description (optional)"
      />
      <input
        type="text"
        placeholder="Character name..."
        value={newCharName}
        onChange={(e) => setNewCharName(e.target.value)}
        className="bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
      />
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Gender (if known/applicable)"
          value={newGender}
          onChange={(e) => setNewGender(e.target.value)}
          className="flex-1 bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
        />
        <input
          type="text"
          placeholder="Species..."
          value={newSpecies}
          onChange={(e) => setNewSpecies(e.target.value)}
          className="flex-1 bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={handleCreate}
        disabled={!newName.trim()}
        className="px-3 py-1.5 rounded text-sm bg-accent2-tint text-accent2 border border-accent2/40 hover:bg-accent2/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Create &amp; Add
      </button>
    </div>
  );

  return (
    <PickerModal
      title="Add Companion Import Reward"
      filter={filter}
      onFilterChange={setFilter}
      onClose={onClose}
      footer={createNewFooter}
    >
      {companions.length === 0 && (
        <p className="text-xs text-ghost px-1 py-1">No companion imports defined yet.</p>
      )}
      {filtered.length > 0 && (
        <PickerGroup label="Companion Imports">
          {filtered.map((c) => (
            <PickerItem
              key={c.id as number}
              name={c.name}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </PickerGroup>
      )}
      {filtered.length === 0 && companions.length > 0 && (
        <p className="text-xs text-ghost px-1">No matches.</p>
      )}
    </PickerModal>
  );
}
