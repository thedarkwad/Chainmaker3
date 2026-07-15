import { TID, GID, Id, createId } from "../../data/types";
import {
  AlternativeCost,
  BasicPurchaseTemplate,
  DrawbackTemplate,
  JumpDoc,
  PurchaseTemplate,
  VariableCost,
} from "@/jumpdoc/data/JumpDoc";
import { PossibleCost, ChainMutators } from "../types";
import {
  AnnotationAction,
  AnnotationInteraction,
  JumpDocBuildData,
} from "../../state/ViewerActionStore";
import {
  extractTagsWithExclusions,
  getPrereqError,
  computePossibleCosts,
  evalVariableCostExpr,
} from "../utils";
import { formatCostShort, formatCostDisplay } from "@/ui/CostDropdown";
import { objMap } from "@/utilities/miscUtilities";
import { applyTagsWithCost } from "../../../utilities/tags";
import { TagFieldsSection } from "../components/TagFieldsSection";
import { ParentSelectSection } from "../components/ParentSelectSection";
import { Value } from "@/chain/data/Purchase";

type PurchaseState = {
  tags: Record<string, string>;
  duration?: number;
  parent?: Id<GID.Purchase>;
};

export function purchaseInteraction<A extends TID.Drawback | TID.Purchase>(
  type: A extends TID.Purchase ? "purchase" : "drawback",
  template: A extends TID.Purchase ? BasicPurchaseTemplate : DrawbackTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: Record<string, (build: JumpDocBuildData) => string>,
  override?: {
    cost: PossibleCost;
    type: "scenario" | "import";
    source?: Id<TID.Scenario> | Id<TID.Companion>;
  },
): AnnotationInteraction<PurchaseState> {
  const userTags = extractTagsWithExclusions(
    template.name +
      "\n" +
      (template.description ?? "") +
      "\n" +
      (Array.isArray(template.cost)
        ? ""
        : Object.values(template.cost)
            .map((s) => `\${${s}}`)
            .join(" ")),
    Object.keys(internalTags),
  );
  const hasTags = Object.keys(userTags).length > 0;

  const isSubpurchase = "subtype" in template && template.subpurchase!;

  const possibleParentTIDs = isSubpurchase
    ? Object.entries(doc.availablePurchases.O)
        .filter(([_, pt]) => pt.subtype == template.subtype && !pt.subpurchase)
        .map(([idStr, _]) => createId<TID.Purchase>(+idStr))
    : [];

  const possibleParentGIDs = (build: JumpDocBuildData) =>
    possibleParentTIDs.flatMap((tid) => build.purchases[tid] ?? []);

  const copies = (build: JumpDocBuildData) =>
    (type == "purchase" ? build.purchases : build.drawbacks)[
      template.id as any
    ] ?? [];

  const safeCopies: (
    build: JumpDocBuildData,
    state: PurchaseState,
  ) => Id<GID.Purchase>[] = !isSubpurchase
    ? (b, _) => copies(b)
    : (b, s) => copies(b).filter((gid) => b.parents[gid] == s.parent);

  const isVariableCost = Array.isArray(template.cost)
    ? (_: JumpDocBuildData, __: PurchaseState) => false
    : (build: JumpDocBuildData, state: PurchaseState) => {
        const isFirstCopy = safeCopies(build, state).length == 0;
        for (const altCost of template.alternativeCosts ?? []) {
          if (
            altCostPrereqsMet(altCost, build, template.id, isFirstCopy) &&
            altCost.mandatory
          )
            return false;
        }
        return true;
      };

  const dummyTemplate = Array.isArray(template.cost)
    ? (_build: JumpDocBuildData, _state: PurchaseState) =>
        template as PurchaseTemplate<TID> & { cost: Value<TID.Currency> }
    : (build: JumpDocBuildData, state: PurchaseState) =>
        ({
          ...template,
          cost: Object.entries(template.cost as VariableCost).map(
            ([currIdStr, expr]) => ({
              currency: createId<TID.Currency>(+currIdStr),
              amount: evalVariableCostExpr(expr ?? "", {
                ...(state.tags ?? {}),
                ...objMap(internalTags, (l) => l(build)),
              }),
            }),
          ),
        }) as PurchaseTemplate<TID> & { cost: Value<TID.Currency> };

  const baseDescription = (build: JumpDocBuildData) => {
    let activeBoosters =
      template?.boosted?.filter?.(
        ({ booster, boosterKind }) =>
          (boosterKind == "drawback" ? build.drawbacks : build.purchases)[
            booster as any
          ]?.length,
      ) ?? [];
    return `${template.description}\n\n${activeBoosters.map((b) => b.description).join("\n\n")}`;
  };

  let getCost = (build: JumpDocBuildData, state: PurchaseState) =>
    override
      ? { default: override.cost, options: [] }
      : computePossibleCosts(
          dummyTemplate(build, state),
          build,
          doc,
          safeCopies(build, state).length === 0,
        );

  let error = (build: JumpDocBuildData) => {
    if (isSubpurchase && !possibleParentGIDs(build).length)
      return "This is a subpurchase. It can only be added as a component of a parent purchase.";

    let prereqErrors = (template.prerequisites ?? [])
      .map((p) => getPrereqError(p, build, doc))
      .filter((err) => err) as string[];
    let originError: string | undefined = undefined;
    if (
      template.originBenefit == "access" &&
      template.origins?.every?.((o) =>
        build.origins.every((bo) => bo.template?.id != o),
      )
    ) {
      originError = `Restricted to holders of ${template.origins?.map((o, i) => `${i == (template.origins?.length ?? 0) - 1 && i > 0 ? "or " : ""}"${doc.origins.O[o].name}"`).join(", ")}.`;
    }
    if (prereqErrors.length > 0 || originError)
      return `${prereqErrors.join(" ")} ${originError ?? ""}`;
  };

  let actions: (
    build: JumpDocBuildData,
    state: PurchaseState,
  ) => AnnotationAction<PurchaseState>[] = (build, state) => {
    let cost = getCost(build, { tags: {} });
    const seen = new Set<string>();
    const flatCosts = [cost.default, ...cost.options].filter((c) => {
      const key = formatCostShort(c.cost, c, doc.currencies);
      return seen.size === seen.add(key).size ? false : true;
    });
    let floatingDiscountCosts = flatCosts.filter(
      (c) => c.floatingDiscountOption,
    );

    return [
      {
        name: "Remove",
        variant: "danger",
        condition: (build) => safeCopies(build, state).length > 0,
        execute: (build, mutators, state) => {
          mutators.removePurchase(
            safeCopies(build, state)[0],
            build,
            state.parent,
          );
          mutators.navigate({
            sub: type === "drawback" ? "drawbacks" : "purchases",
          });
          return [];
        },
      },
      ...flatCosts.map((c, i) => {
        let possibleCost = (state: PurchaseState) =>
          ({
            ...c,
            cost:
              i == 0 && isVariableCost(build, state)
                ? dummyTemplate(build, state).cost
                : c.cost,
            floatingDiscountOption: undefined,
          }) satisfies PossibleCost;
        return {
          name: (_: JumpDocBuildData, state: PurchaseState) =>
            `Add (${formatCostShort(possibleCost(state).cost, c, doc.currencies)})`,
          condition: (build: JumpDocBuildData) =>
            safeCopies(build, state).length == 0 || template.allowMultiple,
          execute: (
            _: JumpDocBuildData,
            mutators: ChainMutators,
            state: PurchaseState,
          ) => {
            const newId = mutators.addPurchaseFromTemplate(
              {
                template: dummyTemplate(build, state) as any,
                cost: possibleCost(state),
                tags: state.tags,
                type,
                reward:
                  override?.type == "scenario"
                    ? (override?.source as Id<TID.Scenario>)
                    : undefined,
                parent: state.parent,
                freebie:
                  override?.type === "import"
                    ? (override.source as Id<TID.Companion>)
                    : undefined,
                customDuration: state.duration,
              },
              jumpId,
              charId,
              doc,
            );
            navAfterAdd(newId, mutators);
            return [];
          },
        };
      }),
      ...floatingDiscountCosts.map((c, i) => {
        let possibleCost = (state: PurchaseState) =>
          ({
            ...c,
            cost:
              i == 0 && isVariableCost(build, state)
                ? dummyTemplate(build, state).cost
                : c.cost,
            floatingDiscountOption: true,
          }) satisfies PossibleCost;
        return {
          name: (_: JumpDocBuildData, state: PurchaseState) =>
            `Use Floating Discount (${formatCostShort(possibleCost(state).cost, c, doc.currencies)})`,
          condition: (build: JumpDocBuildData) =>
            safeCopies(build, state).length == 0 || template.allowMultiple,
          execute: (
            _: JumpDocBuildData,
            mutators: ChainMutators,
            state: PurchaseState,
          ) => {
            const newId = mutators.addPurchaseFromTemplate(
              {
                template: dummyTemplate(build, state) as any,
                cost: possibleCost(state),
                tags: state.tags,
                type,
                parent: state.parent,
                reward:
                  override?.type == "scenario"
                    ? (override?.source as any)
                    : undefined,
                freebie:
                  override?.type === "import"
                    ? (override.source as Id<TID.Companion>)
                    : undefined,
                customDuration: state.duration,
              },
              jumpId,
              charId,
              doc,
            );
            navAfterAdd(newId, mutators);
            return [];
          },
        };
      }),
    ];
  };

  const subtypePlacement =
    type === "purchase"
      ? doc.purchaseSubtypes.O[(template as BasicPurchaseTemplate).subtype]
          ?.placement
      : undefined;

  const navAfterAdd = (
    newId: Id<GID.Purchase> | undefined,
    mutators: ChainMutators,
  ) => {
    if (newId === undefined) return;
    if (type === "drawback") {
      mutators.navigate({ sub: "drawbacks", scrollTo: newId });
    } else if (subtypePlacement !== "route") {
      mutators.navigate({ sub: "purchases", scrollTo: newId });
    }
  };

  const durationMod =
    type === "drawback"
      ? (template as DrawbackTemplate).durationMod
      : undefined;
  const isUserChoiceDuration = durationMod?.type === "choice";

  return {
    initialize: (build) => ({
      tags: {},
      ...(isUserChoiceDuration ? { duration: 1 } : {}),
      ...(isSubpurchase ? { parent: possibleParentGIDs(build)[0] } : {}),
    }),
    error,
    preview: (props: {
      buildData: JumpDocBuildData;
      state: PurchaseState;
      setState: (partial: Partial<PurchaseState>) => void;
    }) => {
      const parentGIDs = possibleParentGIDs(props.buildData);
      const showParentSelect = isSubpurchase && parentGIDs.length > 1;

      return hasTags || isUserChoiceDuration || showParentSelect ? (
        <div className="flex flex-col gap-2">
          {showParentSelect && (
            <ParentSelectSection
              parents={parentGIDs.map((id) => ({
                id,
                name: props.buildData.names[id] ?? "",
              }))}
              selectedParent={props.state.parent}
              onChangeParent={(parent) => props.setState({ parent })}
            />
          )}
          {hasTags &&
            (safeCopies(props.buildData, props.state).length == 0 ||
              template.allowMultiple) && (
              <TagFieldsSection
                tags={userTags}
                tagValues={props.state.tags}
                choiceContext={template.choiceContext}
                onChangeTag={(name, value) =>
                  props.setState({
                    tags: { ...props.state.tags, [name]: value },
                  })
                }
              />
            )}
          {isUserChoiceDuration && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ghost shrink-0">Duration:</span>
              <input
                type="number"
                min={1}
                value={props.state.duration ?? 1}
                onChange={(e) =>
                  props.setState({ duration: Number(e.target.value) })
                }
                className="w-16 text-xs bg-canvas border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring transition-colors"
              />
              <span className="text-xs text-ghost shrink-0">yr</span>
            </div>
          )}
        </div>
      ) : null;
    },
    typeName: type[0].toUpperCase() + type.slice(1),
    name: (build, state) =>
      applyTagsWithCost(
        template.name,
        { ...state.tags, ...objMap(internalTags, (f) => f(build)) },
        dummyTemplate(build, state).cost,
        getCost(build, state).default.cost,
        doc.currencies,
      ),
    description: (build, state) =>
      applyTagsWithCost(
        baseDescription(build),
        { ...state.tags, ...objMap(internalTags, (f) => f(build)) },
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
      isVariableCost(build, state)
        ? "variable"
        : formatCostShort(
            getCost(build, state).default.cost,
            getCost(build, state).default,
            doc.currencies,
          ),
    info: (build, state) =>
      safeCopies(build, state).length > 0
        ? `${safeCopies(build, state).length} cop${safeCopies(build, state).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: (build) =>
      (isSubpurchase && possibleParentGIDs(build).length > 1) ||
      (!(!template.allowMultiple && copies(build).length) &&
        (hasTags || isUserChoiceDuration)),
  };
}

function altCostPrereqsMet(
  altCost: AlternativeCost,
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
        return !build.origins.some((o) => o.template?.id === prereq.id);
    }
    return false;
  };
  return altCost.AND
    ? !altCost.prerequisites.some(notMet)
    : !altCost.prerequisites.every(notMet);
}
