import { ReactNode, useEffect, useMemo, useState } from "react";
import { GID, Id, PartialIndex, PartialLookup, TID } from "../data/types";
import {
  useChain,
  useCompanionImports,
  useJumpBasicPurchases,
  useJumpDrawbacks,
  useJumpScenarios,
} from "../state/hooks";
import {
  AnnotationAction,
  AnnotationInteraction,
  BuildListener,
  JumpDocBuildData,
  useViewerActionStore,
} from "../state/ViewerActionStore2";
import { Chain } from "../data/Chain";
import {
  CostModifier,
  JumpPurchase,
  ModifiedCost,
  PurchaseType,
  purchaseValue,
  Value,
} from "../data/Purchase";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import {
  BasicPurchaseTemplate,
  DrawbackTemplate,
  JumpDoc,
  JumpDocPrerequisite,
  OriginTemplate,
  PurchaseTemplate,
  stripTemplating,
} from "../data/JumpDoc";
import { InteractionPreviewCard } from "./InteractionPreviewCard";
import { applyTags, extractTags, TagField } from "./annotationResolvers";
import { PurchaseSubtype } from "../data/Jump";
import { formatCostDisplay } from "@/ui/CostDropdown";
import { convertWhitespace } from "@/utilities/miscUtilities";

const MySwal = withReactContent(Swal);

export type AnnotationInteractionHandlerProps = {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  docId: string;
};

type PossibleCost = ModifiedCost<TID.Currency> & {
  cost: Value<TID.Currency>;
  floatingDiscountOption?: boolean;
};


// ─────────────────────────────────────────────────────────────────────────────
// Wrapper for Chain Mutation Hooks
// ─────────────────────────────────────────────────────────────────────────────

type ChainMutators = {
  addPurchaseFromTemplate: (data: {
    template: BasicPurchaseTemplate | DrawbackTemplate,
    type: "purchase" | "drawback",
    tags: Record<string, string>,
    cost: PossibleCost
  }, jumpId: Id<GID.Jump>, charId: Id<GID.Character>,) => Id<TID.Purchase>,
  addOriginFromTemplate: (ata: {
    template: OriginTemplate,
    tags: Record<string, string>,
    cost: PossibleCost
  }, jumpId: Id<GID.Jump>, charId: Id<GID.Character>,) => Id<TID.Origin>,
  repricePurchase: (id: Id<GID.Purchase>, cost: PossibleCost) => void,
  removePurchase: (id: Id<GID.Purchase>) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared tag fields UI
// ─────────────────────────────────────────────────────────────────────────────

function TagFieldsSection({
  tags,
  tagValues,
  choiceContext,
  onChangeTag,
}: {
  tags: TagField[];
  tagValues: Record<string, string>;
  choiceContext?: string;
  onChangeTag: (name: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-2 rounded-md border-edge bg-tint border">
      {tags.map((tag) => (
        <label key={tag.name} className="contents">
          <div
            className={`text-xs font-semibold text-muted text-right min-w-min max-w-max w-30 justify-self-end ${!tag.multiline ? "self-stretch items-center flex" : ""}`}
          >
            {tag.name
              .split(" ")
              .map((w) => w[0].toUpperCase() + w.slice(1))
              .join(" ")}
            :
          </div>
          {tag.multiline ? (
            <textarea
              className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              rows={3}
              value={tagValues[tag.name] ?? ""}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onChange={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
                onChangeTag(tag.name, e.target.value);
              }}
            />
          ) : (
            <input
              type="text"
              className="h-min bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              value={tagValues[tag.name] ?? ""}
              onChange={(e) => onChangeTag(tag.name, e.target.value)}
            />
          )}
        </label>
      ))}
      <div />
      {choiceContext && (
        <div className="text-xs text-ghost flex flex-col gap-1.5 max-w-sm">
          {convertWhitespace(choiceContext)}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Dialog wrapper (shown inside SweetAlert2)
// ─────────────────────────────────────────────────────────────────────────────

function InteractionDialog({
  interactions,
  build,
  onClose,
}: {
  interactions: AnnotationInteraction<object>[];
  build: JumpDocBuildData;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionState, setInteractionState] = useState<object>({});

  const enqueueInteractions = useViewerActionStore((s) => s.enqueueInteractions);

  let interaction = interactions[activeIndex];
  let errorMessage = interaction.error(build);
  let actions = (typeof interaction.actions == "function" ? interaction.actions(build) : interaction.actions)
    .filter((a) => a.condition(build))
    .map((a) => ({
      label: typeof a.name == "function" ? a.name(build, interactionState) : a.name,
      variant: a.variant ?? "confirm",
      onConfirm: () => a.execute(build, interactionState).forEach((followup) => enqueueInteractions([followup])),
    }));

  return (
    <div className="bg-surface rounded-xl border border-edge shadow-xl text-left w-max max-w-[90vw] md:max-w-[70vw] lg:max-w-[60vw] justify-items-center overflow-visible">
      {interactions.length > 1 && (
        <>
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink border-b border-edge">
            Multiple options — choose one:
          </p>
          <div className="flex flex-row flex-wrap justify-center gap-1 mx-2 mt-2 max-w-100">
            {interactions.map(({ name, initialize }, i) => (
              <button
                onClick={() => {
                  if (i != activeIndex) {
                    setActiveIndex(i);
                    setInteractionState(interactions[activeIndex].initialize(build));
                  }
                }}
                className={`text-xs px-2 py-0.5 rounded-full border ${i == activeIndex ? "bg-accent2-tint text-accent2 border-accent2-ring" : "text-muted border-transparent hover:text-ink hover:border-edge hover:bg-tint"}`}
              >
                {stripTemplating(typeof name == "function" ? name(build, initialize(build)) : name)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col max-w-120 w-full">
        <InteractionPreviewCard
          typeName={interaction.typeName}
          description={
            typeof interaction.description == "function"
              ? interaction.description(build, interactionState)
              : interaction.description
          }
          name={
            typeof interaction.name == "function"
              ? interaction.name(build, interactionState)
              : interaction.name
          }
          costStr={
            typeof interaction.costStr == "function"
              ? interaction.costStr(build, interactionState)
              : interaction.costStr
          }
          info={
            typeof interaction.info == "function"
              ? interaction.info(build, interactionState)
              : interaction.info
          }
          warning={
            typeof interaction.warning == "function"
              ? interaction.warning(build, interactionState)
              : interaction.warning
          }
          actions={actions}
          onClose={onClose}
          errorMessage={errorMessage}
        >
          <interaction.preview
            buildData={build}
            setState={(partial) => {
              setInteractionState((s) => ({ ...s, partial }));
            }}
            state={interactionState}
          />
        </InteractionPreviewCard>
      </div>
    </div>
  );
}

function singleActionAnnotation(a: AnnotationAction<{}>): AnnotationInteraction<{}> {
  return {
    initialize: () => ({}),
    error: () => undefined,
    preview: () => undefined,
    typeName: "",
    name: "",
    actions: [a],
    forcePreview: () => false
  };
}

function computeBuildData(
  chain: Chain,
  docId: string,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): JumpDocBuildData {
  let jump = chain.jumps.O[jumpId];

  let purchases: PartialIndex<TID.Purchase, GID.Purchase> = {};
  let drawbacks: PartialIndex<TID.Drawback, GID.Purchase> = {};
  let scenarios: PartialIndex<TID.Scenario, GID.Purchase> = {};
  let companionImports: PartialIndex<TID.Companion, GID.Purchase> = {};

  [
    ...(jump.purchases[charId] ?? []),
    ...(jump.drawbacks[charId] ?? []),
    ...(jump.scenarios[charId] ?? []),
  ]?.forEach((pId) => {
    let purchase = chain.purchases.O[pId] as JumpPurchase;
    if (purchase.template?.id == docId)
      switch (purchase.type) {
        case PurchaseType.Perk:
        case PurchaseType.Item:
          if (!purchases[purchase.template.id as Id<TID.Purchase>])
            purchases[purchase.template.id as Id<TID.Purchase>] = [];
          purchases[purchase.template.id as Id<TID.Purchase>]!.push(purchase.id);
          break;
        case PurchaseType.Companion:
          if (!companionImports[purchase.template.id as Id<TID.Companion>])
            companionImports[purchase.template.id as Id<TID.Companion>] = [];
          companionImports[purchase.template.id as Id<TID.Companion>]!.push(purchase.id);
          break;
        case PurchaseType.Drawback:
          if (!drawbacks[purchase.template.id as Id<TID.Drawback>])
            drawbacks[purchase.template.id as Id<TID.Drawback>] = [];
          drawbacks[purchase.template.id as Id<TID.Drawback>]!.push(purchase.id);
          break;
        case PurchaseType.Scenario:
          if (!scenarios[purchase.template.id as Id<TID.Scenario>])
            scenarios[purchase.template.id as Id<TID.Scenario>] = [];
          scenarios[purchase.template.id as Id<TID.Scenario>]!.push(purchase.id);
          break;
      }
  });

  return {
    purchases,
    drawbacks,
    scenarios,
    companionImports,
    currencyExchanges: jump.currencyExchanges[charId] ?? [],
    origins: Object.values(jump.origins[charId] ?? {}).flat(),
  };
}

function getPrereqError(prereq: JumpDocPrerequisite, build: JumpDocBuildData, doc: JumpDoc): string | undefined {
  let has: boolean;
  let name: string;
  switch (prereq.type) {
    case "drawback":
      has = (build.drawbacks[prereq.id] ?? []).length > 0;
      name = (doc.availableDrawbacks.O[prereq.id] ?? []).name;
      break;
    case "purchase":
      has = (build.purchases[prereq.id] ?? []).length > 0;
      name = (doc.availablePurchases.O[prereq.id] ?? []).name;
      break;
    case "scenario":
      has = (build.scenarios[prereq.id] ?? []).length > 0;
      name = (doc.availableScenarios.O[prereq.id] ?? []).name;
      break;
    case "origin":
      has = build.origins.some((o) => o.template?.id == prereq.id);
      name = doc.origins.O[prereq.id].name;
  }
  if (!has && prereq.positive)
    return `Restricted to holders of "${name}".`;
  if (has && !prereq.positive)
    return `Incompatible with "${name}".`;

}

function computePossibleCosts(
  template: PurchaseTemplate<TID>,
  build: JumpDocBuildData,
  doc: JumpDoc,
) {
  let isPurchase = (template as BasicPurchaseTemplate).subtype !== undefined;
  let floatingDiscountMode = isPurchase
    ? doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype].floatingDiscountMode
    : undefined;
  let maxFloatingDiscountThreshold: PartialLookup<TID.Currency, number> = {};

  if (floatingDiscountMode) {
    for (let sv of doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype]
      .floatingDiscountThresholds ?? [])
      maxFloatingDiscountThreshold[sv.currency] = Math.max(
        maxFloatingDiscountThreshold[sv.currency] ?? 0,
        sv.amount,
      );
  }

  let floatingDiscount = (c: PossibleCost) =>
    (purchaseValue(c.cost, c) as Value<TID.Currency>).every((c) => c.amount <= (maxFloatingDiscountThreshold[c.currency] ?? 0));


  let applyOrigin: (c: PossibleCost) => PossibleCost = (c) => {
    if (!build.origins.some((o) => o.template && (template.origins ?? []).includes(o.template.id)))
      return c;

    if (floatingDiscountMode == "origin" && floatingDiscount(c)) {
      return { ...c, floatingDiscountOption: true };
    }

    switch (template.originBenefit) {
      case "free":
        return {
          ...c,
          modifier: CostModifier.Free,
        };
      case "discounted":
        if (
          c.cost.every((c) => c.amount <= (doc.currencies.O[c.currency].discountFreeThreshold ?? 0))
        )
          return { ...c, modifier: CostModifier.Free };
        switch (c.modifier) {
          case CostModifier.Full:
            return { ...c, modifier: CostModifier.Free };
          case CostModifier.Reduced:
            return {
              ...c,
              modifier: CostModifier.Custom,
              modifiedTo: purchaseValue<TID.Currency>(
                purchaseValue<TID.Currency>(c.cost, { modifier: CostModifier.Reduced }),
                { modifier: CostModifier.Reduced },
              ) as Value<TID.Currency>,
            };
          case CostModifier.Custom:
            return {
              ...c,
              modifier: CostModifier.Custom,
              modifiedTo: purchaseValue<TID.Currency>(c.modifiedTo, {
                modifier: CostModifier.Reduced,
              }) as Value<TID.Currency>,
            };
          case CostModifier.Free:
            return c;
        }
      default:
        return c;
    }
  };

  let cost = applyOrigin({ cost: template.cost, modifier: CostModifier.Full });
  let costOptions = [];

  for (const altCost of template.alternativeCosts ?? []) {
    if (altCost.prerequisites.some((prereq) => getPrereqError(prereq, build, doc))) break;
    let newCost: PossibleCost = {
      cost: template.cost,
      modifier: CostModifier.Custom as const,
      modifiedTo: altCost.value,
    };
    if (altCost.beforeDiscounts) {
      newCost.floatingDiscountOption = floatingDiscountMode == "free" && floatingDiscount(newCost);
      newCost = applyOrigin(newCost);
    }
    if (altCost.mandatory) cost = newCost;
    else costOptions.push(newCost);
  }
  return { default: cost, options: costOptions };
}

// TODO: Origin / Origin Batch
// TODO: Origin Randomizer
// TODO: Scenarios
// TODO: Companion Import
// TODO: Currency Exchange

function purchaseInteraction<A extends TID.Drawback | TID.Purchase>(
  type: A extends TID.Purchase ? "purchase" : "drawback",
  template: A extends TID.Purchase ? BasicPurchaseTemplate : DrawbackTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  mutators: ChainMutators
): AnnotationInteraction<Record<string, string>> {
  const tags = extractTags([template.name, template.description]);
  const hasTags = tags.length > 0;

  const copies = (build: JumpDocBuildData) =>
    (type == "purchase" ? build.purchases : build.drawbacks)[template.id as any] ?? [];

  const baseDescription = (build: JumpDocBuildData) => {
    let activeBoosters = template.boosted.filter(
      ({ booster, boosterKind }) =>
        (boosterKind == "drawback" ? build.drawbacks : build.purchases)[booster as any]?.length,
    );
    return `${template.description}\n\n${activeBoosters.map((b) => b.description).join("\n\n")}`;
  };

  let getCost = (build: JumpDocBuildData) => computePossibleCosts(template, build, doc);

  let error = (build: JumpDocBuildData) => {
    let prereqErrors = (template.prerequisites ?? []).map((p) => getPrereqError(p, build, doc)).filter(err => err) as string[];
    let originError: string | undefined = undefined;
    if (template.originBenefit == "access" && template.origins?.every?.((o) => build.origins.every((bo => bo.template?.id != o)))) {
      originError = `Restricted to holders of ${template.origins?.map((o, i) => `${i == (template.origins?.length ?? 0) - 1 && i > 0 && "or "}"${doc.origins.O[o].name}"`).join(", ")}.`;
    };
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError}`;
  }

  let actions: (build: JumpDocBuildData) => AnnotationAction<Record<string, string>>[] = (build) => {

    let cost = getCost(build);
    let flatCosts = [cost.default, ...cost.options];
    let floatingDiscountCosts = flatCosts.filter(c => c.floatingDiscountOption);

    return [
      {
        name: "Remove",
        variant: "danger",
        condition: (build) => copies(build).length > 0,
        execute: (build) => mutators.removePurchase(copies(build)[0]) ?? []
      },
      ...flatCosts.map((c) => ({
        name: `Add(${formatCostDisplay(c.cost, c)
          })`,
        condition: (build: JumpDocBuildData) => copies(build).length == 0 || template.allowMultiple,
        execute: (_: JumpDocBuildData, tags: Record<string, string>) => {
          mutators.addPurchaseFromTemplate({ template, cost: { ...c, floatingDiscountOption: undefined }, tags, type }, jumpId, charId);
          return [];
        }
      }
      )),
      ...floatingDiscountCosts.map((c) => ({
        name: `Use Floating Discount(${formatCostDisplay(c.cost, c)
          })`,
        condition: (build: JumpDocBuildData) => copies(build).length == 0 || template.allowMultiple,
        execute: (_: JumpDocBuildData, tags: Record<string, string>) => {
          mutators.addPurchaseFromTemplate({ template, cost: c, tags, type }, jumpId, charId);
          return [];
        }
      }
      ))

    ]
  };

  return {
    initialize: () => ({}),
    error,
    preview: (props: { buildData: JumpDocBuildData, state: Record<string, string>, setState: (partial: Partial<Record<string, string>>) => void }) =>
      hasTags && (
        <TagFieldsSection
          tags={tags}
          tagValues={props.state}
          choiceContext={template.choiceContext}
          onChangeTag={(name, value) => props.setState({ [name]: value })}
        />
      )
    ,
    typeName: type[0].toUpperCase + type.slice(1),
    name: (_, tagValues) => (hasTags ? applyTags(template.name, tagValues) : template.name),
    description: (build, tagValues) =>
      hasTags ? applyTags(baseDescription(build), tagValues) : baseDescription(build),
    costStr: (build) => formatCostDisplay(getCost(build).default.cost, getCost(build).default),
    info: (build) => copies(build).length > 0 ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held` : undefined,
    actions,
    forcePreview: (_) => tags.length > 0,
  };
}

export function AnnotationInteractionHandler({
  jumpId,
  charId,
  docId,
}: AnnotationInteractionHandlerProps) {
  const listeners = useViewerActionStore((s) => s.listeners);
  const interactionQueue = useViewerActionStore((s) => s.interactionQueue);
  const enqueueInteractions = useViewerActionStore((s) => s.enqueueInteractions);
  const removeInteractions = useViewerActionStore((s) => s.removeInteractions);
  const removeListener = useViewerActionStore((s) => s.removeListener);

  const [currentInteractions, setCurrentInteractions] = useState<AnnotationInteraction<object>[]>(
    [],
  );

  const chain = useChain();
  const [buildData, setBuildData] = useState<JumpDocBuildData>();

  const { perkIds, itemIds } = useJumpBasicPurchases(jumpId, charId);
  const { drawbackIds } = useJumpDrawbacks(jumpId, charId);
  const { scenarioIds } = useJumpScenarios(jumpId, charId);
  const { importIds } = useCompanionImports(jumpId, charId);

  useEffect(() => {
    if (!chain) return;
    let newBuildData = computeBuildData(chain, docId, jumpId, charId);
    setBuildData(newBuildData);
    let destroyListeners: BuildListener[] = [];
    listeners.forEach((l) => {
      if (l.destroy(newBuildData)) destroyListeners.push(l);
      else if (l.condition(newBuildData)) l.action(newBuildData);
    });
    destroyListeners.forEach((l) => removeListener(l));
  }, [!!chain, JSON.stringify([perkIds, itemIds, drawbackIds, scenarioIds, importIds])]);

  useEffect(() => {
    if (!chain || !buildData || currentInteractions.length) return;

    let j = 0;
    for (; j < interactionQueue.length; j++) {
      let { interactions, character } = interactionQueue[j] ?? { interactions: [] };
      let currentBuildData =
        character === undefined ? buildData : computeBuildData(chain, docId, jumpId, charId);
      let errors = Object.fromEntries(
        interactions.map((i, index) => [index, i.error(currentBuildData)]),
      );
      if (interactions.length > 1) interactions = interactions.filter((_, index) => !errors[index]);

      if (interactions.length == 0) continue;

      let showPreview = false;
      if (interactions.length > 1) showPreview = true;
      else if (interactions[0].forcePreview(buildData)) showPreview = true;
      else {
        let actions = (typeof interactions[0].actions == "function" ? interactions[0].actions(currentBuildData) : interactions[0].actions).filter((a) => a.condition(currentBuildData));
        if (actions.length == 0) continue;
        if (actions.length > 1) showPreview = true;
      }

      if (showPreview) {
        setCurrentInteractions(interactions);
        break;
      }

      enqueueInteractions((typeof interactions[0].actions == "function" ? interactions[0].actions(currentBuildData) : interactions[0].actions)[0].execute(
        currentBuildData,
        interactions[0].initialize(currentBuildData),
      ));
    }

    removeInteractions(j);
  }, [interactionQueue.length, currentInteractions.length]);

  useEffect(() => {
    if (!currentInteractions.length || !buildData) return;
    MySwal.close();
    MySwal.fire({
      html: (
        <InteractionDialog
          interactions={currentInteractions}
          build={buildData}
          onClose={() => MySwal.close()}
        />
      ),
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      allowEscapeKey: true,
      padding: 0,
      background: "transparent",
      backdrop: true,
      didClose: () => setCurrentInteractions([]),
      customClass: {
        popup: "!bg-transparent !shadow-none !border-0 !p-0 !overflow-visible !w-auto !max-w-none",
        htmlContainer: "!m-0 !p-0 !overflow-visible",
        container: "!p-4",
      },
    });
  }, [currentInteractions, !!buildData]);

  return null;
}
