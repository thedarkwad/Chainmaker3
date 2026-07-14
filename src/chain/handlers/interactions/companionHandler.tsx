import { CompanionTemplate, JumpDoc, VariableCost } from "@/jumpdoc/data/JumpDoc";
import { createId, Id, TID, GID } from "../../data/types";
import {
  AnnotationInteraction,
  AnnotationAction,
  JumpDocBuildData,
} from "../../state/ViewerActionStore";
import { InternalTagsMap, ChainMutators, PossibleCost } from "../types";
import {
  extractTagsWithExclusions,
  getPrereqError,
  computePossibleCosts,
  evalVariableCostExpr,
} from "../utils";
import { useAllCharacters } from "../../state/hooks";
import { useChainStore } from "../../state/Store";
import {
  PurchaseType,
  CompanionImport,
  Value,
  CostModifier,
} from "../../data/Purchase";
import { purchaseInteraction } from "./purchaseHandler";
import { originInteraction } from "./originHandler";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { CompanionMultiSelect } from "../../components/CompanionMultiSelect";
import { NewCompanionModal } from "../../components/NewCompanionModal";
import { TagFieldsSection } from "../components/TagFieldsSection";
import { formatCostDisplay, formatCostShort } from "@/ui/CostDropdown";
import { objMap } from "@/utilities/miscUtilities";
import { applyTagsWithCost } from "../../../utilities/tags";

type CompanionInteractionState = {
  follower: boolean;
  selectedIds: Id<GID.Character>[];
  charInfos: { name: string; species: string; gender: string }[];
  showNewCompanionModal: boolean;
  tags: Record<string, string>;
};

function buildFreebieInteractions(
  importId: Id<TID.Companion>,
  freebies: NonNullable<CompanionTemplate["freebies"]>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  companionCharIds: Id<GID.Character>[],
  internalTags: Record<string, (build: JumpDocBuildData) => string>,
): {
  interaction: [AnnotationInteraction<object>];
  character: Id<GID.Character>;
}[] {
  const freeOverride = {
    cost: {
      cost: [] as Value<TID.Currency>,
      modifier: CostModifier.Free,
    } as PossibleCost,
    type: "import" as const,
    source: importId,
  };
  const result: {
    interaction: [AnnotationInteraction<object>];
    character: Id<GID.Character>;
  }[] = [];
  for (const companionCharId of companionCharIds) {
    for (const freebie of freebies) {
      if (freebie.type === "purchase") {
        const tmpl = doc.availablePurchases.O[freebie.id];
        if (tmpl)
          result.push({
            interaction: [
              purchaseInteraction(
                "purchase",
                tmpl,
                doc,
                jumpId,
                companionCharId,
                internalTags,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ],
            character: +companionCharId as any,
          });
      } else if (freebie.type === "drawback") {
        const tmpl = doc.availableDrawbacks.O[freebie.id];
        if (tmpl)
          result.push({
            interaction: [
              purchaseInteraction(
                "drawback",
                tmpl,
                doc,
                jumpId,
                companionCharId,
                internalTags,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ],
            character: +companionCharId as any,
          });
      } else {
        result.push({
          interaction: [
            originInteraction(
              doc.origins.O[freebie.id],
              {},
              doc,
              jumpId,
              companionCharId,
              internalTags,
              undefined,
              importId,
            ) as AnnotationInteraction<object>,
          ],
          character: +companionCharId as any,
        });
      }
    }
  }
  return result;
}

function buildConfirmDeleteInteraction(
  existingId: Id<GID.Purchase>,
  charIdsToDelete: Id<GID.Character>[],
  message: string,
): AnnotationInteraction<object> {
  return {
    initialize: () => ({}),
    error: () => undefined,
    preview: () => undefined,
    typeName: "Companion Import",
    name: "Confirm Deletion",
    description: message,
    actions: [
      {
        name: "Confirm Delete",
        variant: "danger",
        condition: () => true,
        execute: (build, mutators) => {
          mutators.removeCharacters(charIdsToDelete);
          mutators.removePurchase(existingId, build);
          mutators.navigate({ sub: "companions" });
          return [];
        },
      },
      {
        name: "Cancel",
        variant: "warn",
        condition: () => true,
        execute: () => {
          return [];
        },
      },
    ],
    forcePreview: () => true,
  };
}

function CompanionCharField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <span className="text-xs text-muted shrink-0 w-14 text-right">
        {label}:
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 text-xs bg-tint border border-edge rounded px-1.5 py-0.5 text-ink focus:outline-none focus:border-accent"
        placeholder={label.toLowerCase()}
      />
    </>
  );
}

function CompanionPreviewInner({
  template,
  adding,
  state,
  setState,
  selfCharId,
  internalTags,
}: {
  template: CompanionTemplate;
  adding: boolean;
  state: CompanionInteractionState;
  setState: (partial: Partial<CompanionInteractionState>) => void;
  selfCharId: Id<GID.Character>;
  internalTags: InternalTagsMap;
}) {
  const allChars = useAllCharacters();
  const userTags = extractTagsWithExclusions(
    template.name +
    "\n" +
    (template.description ?? "") +
    "\n" +
    (Array.isArray(template.cost)
      ? ""
      : Object.values(template.cost)
        .map(s => `\${${s}}`)
        .join(" ")),
    Object.keys(internalTags),
  );
  const hasTags = Object.keys(userTags).length > 0;
  const selectableChars = allChars.filter(c => c.id !== selfCharId);
  const selectedChars = state.selectedIds
    .map(id => selectableChars.find(c => c.id === id))
    .filter(
      (c): c is { id: Id<GID.Character>; name: string } => c !== undefined,
    );
  const availableChars = selectableChars.filter(
    c => !state.selectedIds.includes(c.id),
  );

  return (
    <>
      {state.showNewCompanionModal && (
        <NewCompanionModal
          onDone={newId =>
            setState({
              selectedIds: [...state.selectedIds, newId],
              showNewCompanionModal: false,
            })
          }
          onCancel={() => setState({ showNewCompanionModal: false })}
        />
      )}
      {hasTags && (
        <TagFieldsSection
          tags={userTags}
          tagValues={state.tags}
          choiceContext={template.choiceContext}
          onChangeTag={(name, value) =>
            setState({ tags: { ...state.tags, [name]: value } })
          }
        />
      )}
      {adding && (
        <div className="px-2 pb-1">
          <SegmentedControl
            value={state.follower ? "follower" : "companion"}
            onChange={v => setState({ follower: v === "follower" })}
            options={[
              { value: "companion", label: "Companion" },
              { value: "follower", label: "Follower" },
            ]}
          />
        </div>
      )}
      {adding && template.specificCharacter && !state.follower && (
        <div className="px-2 pb-2 flex flex-col gap-3">
          {state.charInfos.map((ci, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr] gap-1.5 self-center items-center"
            >
              {state.charInfos.length > 1 && (
                <span className="col-span-2 text-xs text-muted font-medium">
                  Character #{i + 1}
                </span>
              )}
              <CompanionCharField
                label="Name"
                value={ci.name}
                onChange={v =>
                  setState({
                    charInfos: state.charInfos.map((c, j) =>
                      j === i ? { ...c, name: v } : c,
                    ),
                  })
                }
              />
              <CompanionCharField
                label="Species"
                value={ci.species}
                onChange={v =>
                  setState({
                    charInfos: state.charInfos.map((c, j) =>
                      j === i ? { ...c, species: v } : c,
                    ),
                  })
                }
              />
              <CompanionCharField
                label="Gender"
                value={ci.gender}
                onChange={v =>
                  setState({
                    charInfos: state.charInfos.map((c, j) =>
                      j === i ? { ...c, gender: v } : c,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
      {adding && !template.specificCharacter && !state.follower && (
        <div className="px-2 pb-2 flex flex-col gap-1.5">
          <span className="text-xs text-muted font-medium">
            Chosen Companions ({state.selectedIds.length} of {template.count}):
          </span>
          <CompanionMultiSelect
            selected={selectedChars}
            available={availableChars}
            onAdd={id => setState({ selectedIds: [...state.selectedIds, id] })}
            onRemove={id =>
              setState({
                selectedIds: state.selectedIds.filter(cid => cid !== id),
              })
            }
            onNew={() => setState({ showNewCompanionModal: true })}
            max={template.count}
          />
        </div>
      )}
    </>
  );
}

export function companionImportInteraction(
  template: CompanionTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: Record<string, (build: JumpDocBuildData) => string>,
): AnnotationInteraction<CompanionInteractionState> {
  const userTags = extractTagsWithExclusions(
    template.name +
    "\n" +
    (template.description ?? "") +
    "\n" +
    (Array.isArray(template.cost)
      ? ""
      : Object.values(template.cost)
        .map(s => `\${${s}}`)
        .join(" ")),
    Object.keys(internalTags),
  );

  const copies = (build: JumpDocBuildData) =>
    build.companionImports[template.id] ?? [];

  const dummyTemplate = Array.isArray(template.cost)
    ? (_build: JumpDocBuildData, _state: CompanionInteractionState) =>
      ({
        ...template,
        allowMultiple: !template.specificCharacter,
      }) as CompanionTemplate & { cost: Value<TID.Currency> }
    : (build: JumpDocBuildData, state: CompanionInteractionState) =>
      ({
        ...template,
        allowMultiple: !template.specificCharacter,
        cost: Object.entries(template.cost as VariableCost).map(
          ([currIdStr, expr]) => ({
            currency: createId<TID.Currency>(+currIdStr),
            amount: evalVariableCostExpr(expr ?? "", {
              ...state.tags,
              ...objMap(internalTags, f => f(build)),
            }),
          }),
        ),
      }) as CompanionTemplate & { cost: Value<TID.Currency> };

  const getCost = (build: JumpDocBuildData, state: CompanionInteractionState) =>
    computePossibleCosts(
      dummyTemplate(build, state) as any,
      build,
      doc,
      copies(build).length === 0,
    );

  const isVariableCost = Array.isArray(template.cost)
    ? (_: JumpDocBuildData) => false
    : (build: JumpDocBuildData) => {
      const isFirstCopy = copies(build).length === 0;
      for (const altCost of template.alternativeCosts ?? []) {
        if (
          altCostPrereqsMet(altCost, build, template.id, isFirstCopy) &&
          altCost.mandatory
        )
          return false;
      }
      return true;
    };

  const error = (build: JumpDocBuildData) => {
    const prereqErrors = (template.prerequisites ?? [])
      .map(p => getPrereqError(p, build, doc))
      .filter(e => e) as string[];
    let originError: string | undefined;
    if (
      template.originBenefit == "access" &&
      template.origins?.every?.(o =>
        build.origins.every(bo => bo.template?.id != o),
      )
    ) {
      originError = `Restricted to holders of ${template.origins
        ?.map(
          (o, i) =>
            `${i == (template.origins?.length ?? 0) - 1 && i > 0 ? "or " : ""}"${doc.origins.O[o].name}"`,
        )
        .join(", ")}.`;
    }
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError ?? ""}`;
  };

  const actions = (
    build: JumpDocBuildData,
  ): AnnotationAction<CompanionInteractionState>[] => {
    const cost = getCost(build, {
      tags: {},
      follower: false,
      selectedIds: [],
      charInfos: [],
      showNewCompanionModal: false,
    });
    const seen = new Set<string>();
    const flatCosts = [cost.default, ...cost.options].filter(c => {
      const key = formatCostShort(c.cost, c, doc.currencies);
      return seen.size === seen.add(key).size ? false : true;
    });

    return [
      {
        name: "Remove",
        variant: "danger",
        condition: build => copies(build).length > 0,
        execute: (build, mutators) => {
          const existingId = copies(build)[0];
          const storeState = useChainStore.getState();
          const chain = storeState.chain;
          const jumpAccess = storeState.calculatedData.jumpAccess;
          const purchase = chain?.purchases.O[existingId];
          if (purchase?.type === PurchaseType.Companion) {
            const ci = purchase as CompanionImport;
            const linkedChars = ci.importData.characters.filter(
              cid =>
                chain?.characters.O[cid]?.originalImportTID?.templateId ===
                template.id,
            );
            if (linkedChars.length > 0) {
              const isActive = (cid: Id<GID.Character>) => {
                const access = jumpAccess?.[cid];
                if (
                  access &&
                  [...access].some(jid => jid !== (jumpId as number))
                )
                  return true;
                if ((chain?.jumps.O[jumpId]?.purchases[cid]?.length ?? 0) > 0)
                  return true;
                if ((chain?.jumps.O[jumpId]?.drawbacks[cid]?.length ?? 0) > 0)
                  return true;
                return false;
              };
              const activeChars = linkedChars
                .map(cid => ({
                  id: cid,
                  name: chain?.characters.O[cid]?.name ?? "",
                }))
                .filter(({ id }) => isActive(id));
              if (activeChars.length > 0) {
                const names = activeChars.map(c => c.name).join(", ");
                return [
                  buildConfirmDeleteInteraction(
                    existingId,
                    linkedChars,
                    `This will also delete: ${names}. They have activity elsewhere. Are you sure?`,
                  ),
                ];
              }
              mutators.removeCharacters(linkedChars);
            }
          }
          mutators.removePurchase(existingId, build);
          return [];
        },
      },
      ...flatCosts.map((c, i) => {
        const possibleCost = (state: CompanionInteractionState) =>
          ({
            ...c,
            cost:
              i == 0 && isVariableCost(build)
                ? dummyTemplate(build, state).cost
                : c.cost,
            floatingDiscountOption: undefined,
          }) satisfies PossibleCost;
        return {
          name: (_: JumpDocBuildData, state: CompanionInteractionState) =>
            `Add (${formatCostShort(possibleCost(state).cost, c, doc.currencies)})`,
          condition: (build: JumpDocBuildData) =>
            copies(build).length === 0 || !template.specificCharacter,
          blocker: (_: JumpDocBuildData, state: CompanionInteractionState) =>
            !state.follower &&
              !template.specificCharacter &&
              state.selectedIds.length === 0
              ? "You must select or create at least one character in order to add them as a companion."
              : undefined,
          execute: (
            build: JumpDocBuildData,
            mutators: ChainMutators,
            state: CompanionInteractionState,
          ) => {
            const tmpl = dummyTemplate(build, state);
            const resolvedCost = possibleCost(state);
            if (state.follower) {
              const newId = mutators.addFollower(
                { template: tmpl as any, cost: resolvedCost, tags: state.tags },
                jumpId,
                charId,
                doc,
              );
              if (newId !== undefined)
                mutators.navigate({ sub: "purchases", scrollTo: newId });
              return [];
            }
            if (template.specificCharacter) {
              const newCharIds = state.charInfos.map(ci =>
                mutators.createCompanion({
                  template,
                  name: ci.name,
                  gender: ci.gender,
                  species: ci.species,
                }),
              );
              const newId = mutators.addCompanionImport(
                {
                  template: tmpl,
                  companionIds: newCharIds,
                  tags: state.tags,
                  cost: resolvedCost,
                },
                jumpId,
                charId,
                doc,
              );
              if (newId !== undefined)
                mutators.navigate({ sub: "purchases", scrollTo: newId });
              return buildFreebieInteractions(
                template.id,
                template.freebies ?? [],
                doc,
                jumpId,
                newCharIds,
                internalTags,
              );
            }
            const newId = mutators.addCompanionImport(
              {
                template: tmpl,
                companionIds: state.selectedIds,
                tags: state.tags,
                cost: resolvedCost,
              },
              jumpId,
              charId,
              doc,
            );
            if (newId !== undefined)
              mutators.navigate({ sub: "companions", scrollTo: newId });
            return buildFreebieInteractions(
              template.id,
              template.freebies ?? [],
              doc,
              jumpId,
              state.selectedIds,
              internalTags,
            );
          },
        };
      }),
    ];
  };

  return {
    initialize: _ => ({
      follower: false,
      selectedIds: [],
      charInfos: (template.specificCharacter
        ? (template.characterInfo ?? [{ name: "", species: "", gender: "" }])
        : []
      ).map(ci => ({
        name: ci?.name ?? "",
        species: ci?.species ?? "",
        gender: ci?.gender ?? "",
      })),
      showNewCompanionModal: false,
      tags: {},
    }),
    error,
    preview: props => (
      <>
        <CompanionPreviewInner
          template={template}
          adding={
            copies(props.buildData).length === 0 || !template.specificCharacter
          }
          state={props.state}
          setState={props.setState}
          selfCharId={charId}
          internalTags={internalTags}
        />
      </>
    ),
    typeName: "Companion Import",
    name: (build, state) =>
      applyTagsWithCost(
        template.name,
        { ...state.tags, ...objMap(internalTags, f => f(build)) },
        dummyTemplate(build, state).cost,
        getCost(build, state).default.cost,
        doc.currencies,
      ),
    description: (build, state) =>
      applyTagsWithCost(
        template.description,
        { ...state.tags, ...objMap(internalTags, f => f(build)) },
        dummyTemplate(build, state).cost,
        getCost(build, state).default.cost,
        doc.currencies,
      ),
    costStr: (build, state) =>
      formatCostDisplay(
        getCost(build, state).default.cost,
        getCost(build, state).default,
        doc.currencies,
      ),
    shortCostStr: (build, state) =>
      isVariableCost(build)
        ? "variable"
        : formatCostShort(
          getCost(build, state).default.cost,
          getCost(build, state).default,
          doc.currencies,
        ),
    info: build =>
      copies(build).length > 0
        ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: () => true,
  };
}

function altCostPrereqsMet(
  altCost: any,
  build: JumpDocBuildData,
  templateId: number,
  isFirstCopy: boolean,
): boolean {
  if (altCost.prerequisites.length === 0) return true;
  const notMet = (prereq: any): boolean => {
    if (
      isFirstCopy &&
      prereq.type === "purchase" &&
      (prereq.id as number) === templateId
    )
      return true;
    switch (prereq.type) {
      case "purchase":
        return (build.purchases[prereq.id] ?? []).length === 0;
      case "drawback":
        return (build.drawbacks[prereq.id] ?? []).length === 0;
      case "scenario":
        return (build.scenarios[prereq.id] ?? []).length === 0;
      case "companion":
        return (build.companionImports[prereq.id] ?? []).length === 0;
      case "origin":
        return !build.origins.some(o => o.template?.id === prereq.id);
    }
    return false;
  };
  return altCost.AND
    ? !altCost.prerequisites.some(notMet)
    : !altCost.prerequisites.every(notMet);
}
