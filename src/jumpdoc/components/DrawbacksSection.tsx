/**
 * DrawbacksSection — list of drawback templates in the JumpDoc editor.
 * Fields: name, description, cost (Value), origins (multiselect), allowMultiple.
 */

import { memo, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { TemplateCard } from "./TemplateCard";
import { DescriptionArea, BlurNumberInput, ChoiceContextEditor, InternalTagsField } from "./JumpDocFields";
import { Checkbox } from "@/ui/Checkbox";
import { AlternativeCostEditor } from "./AlternativeCostEditor";
import { VariableCostEditor } from "./VariableCostEditor";
import { PurchasePrerequisiteEditor, PurchasePrerequisitePickerModal } from "./PurchasesSection";
import { RareFieldsGroup } from "./RareFieldsGroup";
import { CostDropdown } from "@/ui/CostDropdown";
import { CostModifier } from "@/chain/data/Purchase";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDoc,
  useModifyJumpDoc,
  useJumpDocDrawbackIds,
  useJumpDocDrawback,
  useModifyJumpDocDrawback,
  useAddJumpDocDrawback,
  useRemoveJumpDocDrawback,
  useRemoveBoundFromDrawback,
  useJumpDocCurrenciesRegistry,
  useJumpDocFirstCurrencyId,
  useAddJumpDocPrereq,
  useRemoveJumpDocPrereq,
  useDuplicateJumpDocDrawback,
} from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import type { DrawbackDurationMod, VariableCost } from "@/chain/data/JumpDoc";

export function DurationModActiveRow({
  value,
  onChange,
}: {
  value: DrawbackDurationMod;
  onChange: (v: DrawbackDurationMod | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-1.5 border-t border-line">
      <div className="relative shrink-0">
        <select
          value={value.type}
          onChange={(e) => {
            const t = e.target.value as DrawbackDurationMod["type"];
            if (t === "choice") onChange({ type: "choice" });
            else onChange({ type: t, years: value.type !== "choice" ? value.years : 1 });
          }}
          className="appearance-none bg-canvas border border-edge rounded px-2 py-1 pr-6 text-xs text-ink focus:outline-none focus:border-accent-ring transition-colors"
        >
          <option value="inc">Duration increased by:</option>
          <option value="set">Duration set to:</option>
          <option value="choice">Duration entered by user</option>
        </select>
        <ChevronDown
          size={10}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
        />
      </div>
      {value.type !== "choice" && (
        <>
          <BlurNumberInput
            value={value.years}
            onCommit={(n) => onChange({ ...value, years: n })}
            className="w-16"
          />
          <span className="text-xs text-ghost shrink-0">Years</span>
        </>
      )}
      <button
        onClick={() => onChange(undefined)}
        className="text-ghost hover:text-red-400 transition-colors p-0.5"
      >
        <X size={10} />
      </button>
    </div>
  );
}

export function DrawbacksSection({
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  open,
  forceOpenNonce,
  singleId,
}: SectionSharedProps<TID.Drawback> & { open?: boolean; forceOpenNonce?: number; singleId?: number }) {
  const doc = useJumpDoc();
  const modifyDoc = useModifyJumpDoc();
  const drawbackIds = useJumpDocDrawbackIds();
  const addDrawback = useAddJumpDocDrawback();

  const displayedIds = singleId !== undefined
    ? drawbackIds.filter((id) => (id as number) === singleId)
    : drawbackIds;

  return (
    <CollapsibleSection
      title="Drawbacks"
      defaultOpen
      open={singleId !== undefined ? true : open}
      forceOpenNonce={forceOpenNonce}
      styled
      action={
        singleId === undefined ? (
          <button
            title="Add drawback"
            onClick={() => addDrawback()}
            className="p-0.5 rounded text-ghost hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Plus size={11} />
          </button>
        ) : undefined
      }
    >
      {singleId === undefined && (
        <div className="flex items-center justify-center gap-2 px-1 pb-1">
          <span className="text-xs text-muted shrink-0">Drawback limit:</span>
          <BlurNumberInput
            value={doc?.drawbackLimit ?? 0}
            onCommit={(n) =>
              modifyDoc("Set Drawback Limit", (d) => {
                d.drawbackLimit = n || null;
              })
            }
            placeholder="none"
            className="w-20"
          />
          <span className="text-xs text-ghost">(0 = no limit)</span>
        </div>
      )}
      {displayedIds.length === 0 && (
        <p className="text-xs text-ghost px-1 py-0.5">No drawbacks yet.</p>
      )}
      {displayedIds.map((id) => (
        <DrawbackCard
          key={id as number}
          id={id}
          addBoundsTarget={addBoundsTarget}
          registerRef={registerRef}
          isScrollTarget={activeScrollKey === `drawback-${id as number}`}
          isAnyScrollTarget={activeScrollKey !== null}
          onAddBoundsRequest={onAddBoundsRequest}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DrawbackCard
// ─────────────────────────────────────────────────────────────────────────────

const DrawbackCard = memo(function DrawbackCard({
  id,
  addBoundsTarget,
  registerRef,
  isScrollTarget,
  isAnyScrollTarget,
  onAddBoundsRequest,
}: {
  id: Id<TID.Drawback>;
  addBoundsTarget: SectionSharedProps<TID.Drawback>["addBoundsTarget"];
  registerRef: SectionSharedProps<TID.Drawback>["registerRef"];
  isScrollTarget: boolean;
  isAnyScrollTarget: boolean;
  onAddBoundsRequest: SectionSharedProps<TID.Drawback>["onAddBoundsRequest"];
}) {
  const drawback = useJumpDocDrawback(id);
  const modify = useModifyJumpDocDrawback(id);
  const removeDrawback = useRemoveJumpDocDrawback();
  const duplicateDrawback = useDuplicateJumpDocDrawback();
  const removeBound = useRemoveBoundFromDrawback();
  const addPrereq = useAddJumpDocPrereq("drawback", id as number);
  const removePrereq = useRemoveJumpDocPrereq("drawback", id as number);
  const currencies = useJumpDocCurrenciesRegistry();
  const firstCurrencyId = useJumpDocFirstCurrencyId();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [prereqPickerOpen, setPrereqPickerOpen] = useState(false);
  if (!drawback) return null;

  const key = `drawback-${id as number}`;
  const fullCost = { modifier: CostModifier.Full } as const;

  return (
    <TemplateCard
      type="drawback"
      showTemplateTip
      id={id}
      name={drawback.name}
      bounds={drawback.bounds}
      addBoundsTarget={addBoundsTarget}
      isScrollTarget={isScrollTarget}
      isAnyScrollTarget={isAnyScrollTarget}
      cardRef={(el) => registerRef(key, el)}
      onNameCommit={(v) =>
        modify("Rename Drawback", (t) => {
          t.name = v;
        })
      }
      onDuplicate={() => duplicateDrawback(id)}
      onAddBound={() => onAddBoundsRequest("drawback", id)}
      onRemoveBound={(i) => removeBound(id, i)}
      onDelete={() => removeDrawback(id)}
      onBecomeScrollTarget={() => descriptionRef.current?.focus()}
      headerExtra={
        <div className="flex items-center gap-1 shrink-0">
          {currencies && Array.isArray(drawback.cost) && (
            <CostDropdown
              value={drawback.cost}
              cost={fullCost}
              currencies={currencies}
              hideModifier
              onChange={(v) =>
                modify("Set Drawback Cost", (t) => {
                  t.cost = v;
                })
              }
            />
          )}
          {!Array.isArray(drawback.cost) && (
            <span className="text-xs text-muted mx-1">Variable Value</span>
          )}
        </div>
      }
    >
      <DescriptionArea
        value={drawback.description}
        onCommit={(v) =>
          modify("Set Drawback Description", (t) => {
            t.description = v;
          })
        }
        textareaRef={descriptionRef}
      />
      <ChoiceContextEditor
        name={drawback.name}
        description={drawback.description}
        choiceContext={drawback.choiceContext}
        onCommit={(v) =>
          modify("Set Choice Context", (t) => {
            t.choiceContext = v;
          })
        }
      />

      <div className="flex items-center gap-4 flex-wrap">
        <Checkbox
          checked={!!drawback.capstoneBooster}
          onChange={(v) =>
            modify("Toggle Capstone Booster", (t) => {
              t.capstoneBooster = v;
            })
          }
        >
          Capstone Booster or Combo Trigger
        </Checkbox>
        <Checkbox
          checked={drawback.allowMultiple}
          onChange={(v) =>
            modify("Toggle Allow Multiple", (t) => {
              t.allowMultiple = v;
            })
          }
        >
          Can Be Taken Multiple Times
        </Checkbox>
      </div>

      <RareFieldsGroup
        fields={[
          {
            key: "variableCost",
            isActive: !Array.isArray(drawback.cost),
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Enable Variable Cost", (t) => {
                    t.cost = { [firstCurrencyId]: "" } as VariableCost;
                  })
                }
              >
                use variable cost
              </button>
            ),
            active: () => (
              <div className="pt-1.5 border-t border-line">
                <VariableCostEditor
                  value={drawback.cost as VariableCost}
                  onCommit={(name, updated) => modify(name, (t) => { t.cost = updated; })}
                  onRemove={() => modify("Disable Variable Cost", (t) => { t.cost = []; })}
                />
              </div>
            ),
          },
          {
            key: "durationMod",
            isActive: !!drawback.durationMod,
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Set Duration Mod", (t) => {
                    t.durationMod = { type: "inc", years: 1 };
                  })
                }
              >
                <Plus size={10} /> duration mod
              </button>
            ),
            active: () => (
              <DurationModActiveRow
                value={drawback.durationMod!}
                onChange={(v) =>
                  modify("Set Duration Mod", (t) => {
                    t.durationMod = v;
                  })
                }
              />
            ),
          },
          {
            key: "altCosts",
            isActive: !!(drawback.alternativeCosts?.length),
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Add Alternative Cost", (t) => {
                    if (!t.alternativeCosts) t.alternativeCosts = [];
                    t.alternativeCosts.push({
                      value: [{ amount: 0, currency: firstCurrencyId }],
                      prerequisites: [],
                      mandatory: false,
                    });
                  })
                }
              >
                <Plus size={8} /> add alternative cost
              </button>
            ),
            active: () => (
              <AlternativeCostEditor
                alternativeCosts={drawback.alternativeCosts}
                onAdd={(cost) =>
                  modify("Add Alternative Cost", (t) => {
                    if (!t.alternativeCosts) t.alternativeCosts = [];
                    t.alternativeCosts.push(cost);
                  })
                }
                onRemove={(i) =>
                  modify("Remove Alternative Cost", (t) => {
                    t.alternativeCosts?.splice(i, 1);
                  })
                }
                onModify={(i, updated) =>
                  modify("Update Alternative Cost", (t) => {
                    if (t.alternativeCosts) t.alternativeCosts[i] = updated;
                  })
                }
              />
            ),
          },
          {
            key: "prereqs",
            isActive: !!(drawback.prerequisites?.length),
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
                prerequisites={drawback.prerequisites}
                onAdd={addPrereq}
                onRemove={removePrereq}
              />
            ),
          },
          {
            key: "internalTags",
            isActive: drawback.internalTags !== undefined,
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() => modify("Add Internal Tags", t => { t.internalTags = []; })}
              >
                <Plus size={8} /> add internal tag
              </button>
            ),
            active: () => (
              <InternalTagsField
                tags={drawback.internalTags!}
                onChange={tags => modify("Edit Internal Tags", (t) => { t.internalTags = tags; })}
                onUndefined={() => modify("Remove Internal Tags", t => { t.internalTags = undefined; })}
              />
            ),
          },
        ]}
      />
    </TemplateCard>
  );
});
