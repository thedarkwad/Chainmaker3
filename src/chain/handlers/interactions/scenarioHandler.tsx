import {
  ScenarioTemplate,
  JumpDoc,
  ScenarioRewardTemplate,
} from "../../data/JumpDoc";
import { Id, TID, GID } from "../../data/types";
import {
  AnnotationInteraction,
  AnnotationAction,
  JumpDocBuildData,
} from "../../state/ViewerActionStore";
import { PossibleCost } from "../types";
import { getPrereqError, extractTagsWithExclusions } from "../utils";
import { RewardType, Value, CostModifier } from "../../data/Purchase";
import { purchaseInteraction } from "./purchaseHandler";
import { companionImportInteraction } from "./companionHandler";
import { TagFieldsSection } from "../components/TagFieldsSection";
import { objMap, convertWhitespace } from "@/utilities/miscUtilities";
import { applyTags } from "../../../utilities/tags";

type ScenarioRewardGroup = NonNullable<
  ScenarioTemplate["rewardGroups"]
>[number];

type ScenarioInteractionState = {
  tags: Record<string, string>;
  selectedOutcome: number;
};

function RewardLine({
  reward,
  doc,
}: {
  reward: ScenarioRewardGroup["rewards"][number];
  doc: JumpDoc;
}) {
  if (reward.type === RewardType.Currency) {
    const abbrev = doc.currencies.O[reward.currency]?.abbrev ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev}
      </span>
    );
  }
  if (reward.type === RewardType.Stipend) {
    const abbrev = doc.currencies.O[reward.currency]?.abbrev ?? "?";
    const subtypeName = doc.purchaseSubtypes.O[reward.subtype]?.name ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev} ({subtypeName} stipend)
      </span>
    );
  }
  if (reward.type === RewardType.Companion) {
    const companion = doc.availableCompanions.O[reward.id];
    return (
      <span className="text-xs text-ink">
        Companion import: {companion?.name}
      </span>
    );
  }
  const purchase = doc.availablePurchases.O[reward.id];
  return <span className="text-xs text-ink">{purchase?.name}</span>;
}

function ScenarioOutcomeSelector({
  groups,
  selectedIndex,
  onSelect,
  doc,
}: {
  groups: ScenarioRewardGroup[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  doc: JumpDoc;
}) {
  const group = groups[selectedIndex];
  return (
    <div className="flex flex-col gap-2 pb-1">
      <div className="flex flex-wrap items-center gap-1.5 pl-3">
        <span className="text-xs text-muted font-semibold shrink-0">
          Outcome:
        </span>
        {groups.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              selectedIndex === i
                ? "bg-accent2-tint text-accent2 border-accent2"
                : "bg-surface text-ink border-edge hover:border-accent2 hover:text-accent2"
            }`}
          >
            {g.title || `Outcome ${i + 1}`}
          </button>
        ))}
      </div>
      {group && (
        <div className="flex flex-col justify-center gap-2 rounded border border-accent-ring/15 bg-tint/50 p-5">
          {group.context && (
            <div className="text-xs text-muted flex flex-col gap-1">
              {convertWhitespace(group.context)}
            </div>
          )}
          {group.rewards.length > 0 && (
            <div className="flex flex-row flex-wrap gap-x-1.5 text-xs">
              <span className="font-medium">Rewards:</span>
              {group.rewards.map((r, i) => (
                <span key={i}>
                  <RewardLine reward={r} doc={doc} />
                  {i < group.rewards.length - 1 ? "; " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function scenarioInteraction(
  template: ScenarioTemplate,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: Record<string, (b: JumpDocBuildData) => string>,
): AnnotationInteraction<ScenarioInteractionState> {
  const userTags = extractTagsWithExclusions(
    template.name + "\n" + (template.description ?? "") + "\n",
    Object.keys(internalTags),
  );
  const hasTags = Object.keys(userTags).length > 0;

  const rewardGroups = template.rewardGroups ?? [];

  const copies = (build: JumpDocBuildData) =>
    build.scenarios[template.id as any] ?? [];

  const error = (build: JumpDocBuildData) => {
    let prereqErrors = (template.prerequisites ?? [])
      .map(p => getPrereqError(p, build, doc))
      .filter(err => err) as string[];
    let originError: string | undefined = undefined;
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
    _: JumpDocBuildData,
  ): AnnotationAction<ScenarioInteractionState>[] => [
    {
      name: "Remove",
      variant: "danger",
      condition: build => copies(build).length > 0,
      execute: (build, mutators) => {
        mutators.removePurchase(copies(build)[0], build);
        mutators.navigate({ sub: "drawbacks" });
        return [];
      },
    },
    {
      name: "Add",
      condition: build => copies(build).length == 0 || template.allowMultiple,
      execute: (build, mutators, { tags: tagValues, selectedOutcome }) => {
        const newId = mutators.addScenarioFromTemplate(
          {
            template,
            tags: { ...tagValues, ...objMap(internalTags, f => f(build)) },
            rewardGroupIndex:
              rewardGroups.length > 0 ? selectedOutcome : undefined,
          },
          jumpId,
          charId,
          doc,
        );
        if (newId !== undefined)
          mutators.navigate({ sub: "drawbacks", scrollTo: newId });

        const group = rewardGroups[selectedOutcome];
        if (!group) return [];

        const freeOverride = {
          cost: {
            cost: [] as Value<TID.Currency>,
            modifier: CostModifier.Free,
          } as PossibleCost,
          type: "scenario" as const,
          source: template.id,
        };

        const purchaseRewards = group.rewards
          .filter(
            (
              r,
            ): r is Extract<
              ScenarioRewardTemplate,
              { type: RewardType.Item | RewardType.Perk }
            > => r.type === RewardType.Item || r.type === RewardType.Perk,
          )
          .flatMap(r => {
            const tmpl = doc.availablePurchases.O[r.id];
            return [
              purchaseInteraction(
                "purchase",
                tmpl,
                doc,
                jumpId,
                charId,
                internalTags,
                freeOverride,
              ) as AnnotationInteraction<object>,
            ];
          });

        const companionRewards = group.rewards
          .filter(
            (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
              r.type === RewardType.Companion,
          )
          .flatMap(r => {
            const tmpl = doc.availableCompanions.O[r.id];
            if (!tmpl) return [];
            return [
              companionImportInteraction(
                tmpl,
                doc,
                jumpId,
                charId,
                internalTags,
              ) as AnnotationInteraction<object>,
            ];
          });

        return [...purchaseRewards, ...companionRewards];
      },
    },
  ];

  return {
    initialize: () => ({ tags: {}, selectedOutcome: 0 }),
    error,
    preview: props => {
      const adding = copies(props.buildData).length === 0;
      if (!hasTags && (!adding || rewardGroups.length === 0)) return undefined;
      return (
        <>
          {hasTags && (
            <TagFieldsSection
              tags={userTags}
              tagValues={props.state.tags}
              choiceContext={template.choiceContext}
              onChangeTag={(name, value) =>
                props.setState({ tags: { ...props.state.tags, [name]: value } })
              }
            />
          )}
          {adding && rewardGroups.length > 0 && (
            <ScenarioOutcomeSelector
              groups={rewardGroups}
              selectedIndex={props.state.selectedOutcome}
              onSelect={i => props.setState({ selectedOutcome: i })}
              doc={doc}
            />
          )}
        </>
      );
    },
    typeName: "Scenario",
    name: (build, { tags: tagValues }) =>
      applyTags(template.name, {
        ...tagValues,
        ...objMap(internalTags, f => f(build)),
      }),
    description: (build, { tags: tagValues }) =>
      applyTags(template.description, {
        ...tagValues,
        ...objMap(internalTags, f => f(build)),
      }),
    info: build =>
      copies(build).length > 0
        ? `${copies(build).length} cop${copies(build).length === 1 ? "y" : "ies"} already held`
        : undefined,
    actions,
    forcePreview: build =>
      hasTags || (copies(build).length === 0 && rewardGroups.length > 1),
  };
}
