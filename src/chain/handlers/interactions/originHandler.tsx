import {
  OriginTemplate,
  JumpDoc,
  DocOriginCategory,
} from "../../data/JumpDoc";
import {
  createId,
  Id,
  TID,
  GID,
  PartialLookup,
} from "../../data/types";
import {
  AnnotationInteraction,
  AnnotationAction,
  JumpDocBuildData,
} from "../../state/ViewerActionStore";
import { InternalTagsMap, ChainMutators } from "../types";
import { Value, CostModifier } from "../../data/Purchase";
import {
  extractTagsWithExclusions,
  originTemplateInfo,
  resolveOriginTemplate,
  purchaseValueWithThreshold,
} from "../utils";
import { stripTemplating } from "../../data/JumpDoc";
import { formatCostDisplay, formatCostShort } from "@/ui/CostDropdown";
import { objMap } from "@/utilities/miscUtilities";
import { applyTagsWithCost } from "../../../utilities/tags";
import { TagFieldsSection } from "../components/TagFieldsSection";

type OriginInteractionState = {
  tags: Record<string, string>;
  selections: Record<string, { idx: number; freeform: string }>;
};

type OriginOptionEntry = {
  isFreeform: boolean;
  displayName: string;
  rawName: string | null;
  costStr: string | undefined;
};

type OriginOptionGroup = {
  categoryName: string;
  catId: Id<TID.OriginCategory>;
  options: OriginOptionEntry[];
};

function buildOriginOptionGroups(
  optionIndices: PartialLookup<TID.OriginCategory, number[]>,
  doc: JumpDoc,
): OriginOptionGroup[] {
  const groups: OriginOptionGroup[] = [];
  for (const catIdStr in optionIndices) {
    const catId = createId<TID.OriginCategory>(+catIdStr);
    const indices = optionIndices[catId] ?? [];
    const category = doc.originCategories.O[catId];
    if (!category || !category.singleLine) continue;
    const options: OriginOptionEntry[] = (indices as number[]).flatMap(i => {
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[i];
      if (!opt) return [];
      const isFreeform = opt.type === "freeform";
      const currency = doc.currencies.O[opt.cost.currency];
      const costStr = currency
        ? `${opt.cost.amount} ${currency.abbrev}`
        : undefined;
      return [
        {
          isFreeform,
          displayName: isFreeform
            ? `Manually set ${category.name}`
            : stripTemplating(opt.name),
          rawName: isFreeform ? null : opt.name,
          costStr,
        },
      ];
    });
    if (options.length > 0)
      groups.push({ categoryName: category.name, catId, options });
  }
  return groups;
}

function OriginOptionSelector({
  group,
  selectedIdx,
  freeformText,
  onSelect,
  onFreeformChange,
}: {
  group: OriginOptionGroup;
  selectedIdx: number;
  freeformText: string;
  onSelect: (i: number) => void;
  onFreeformChange: (v: string) => void;
}) {
  const selectedOpt = group.options[selectedIdx];
  const onlyFreeform =
    group.options.length === 1 && group.options[0]!.isFreeform;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-ghost font-medium uppercase tracking-wide">
        {group.categoryName}
      </p>
      {onlyFreeform ? (
        <input
          type="text"
          className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
          placeholder="Enter value…"
          value={freeformText}
          onChange={e => onFreeformChange(e.target.value)}
        />
      ) : (
        group.options.map((opt, i) => {
          const { main, aux } = opt.rawName
            ? originTemplateInfo(opt.rawName)
            : { main: opt.displayName, aux: undefined };
          return (
            <div key={i} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={`text-left flex items-center px-3 py-2 rounded border transition-colors ${i === selectedIdx
                  ? "border-accent2-ring bg-accent2-tint text-ink"
                  : "border-edge text-muted hover:border-trim hover:text-ink"
                  }`}
              >
                <span className="text-sm font-medium inline-flex items-center">
                  {opt.isFreeform ? opt.displayName : main}
                </span>
                {opt.costStr && (
                  <span className="text-xs text-ghost ml-2">
                    [{opt.costStr}]
                  </span>
                )}
                {aux && aux.length > 0 && (
                  <div className="text-xs text-ghost flex flex-col gap-0.5 ml-auto">
                    {aux.map((s, j) => (
                      <p key={j}>{s}</p>
                    ))}
                  </div>
                )}
              </button>
              {selectedOpt?.isFreeform && selectedIdx === i && (
                <input
                  type="text"
                  className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full mt-1"
                  placeholder="Enter value…"
                  value={freeformText}
                  onChange={e => onFreeformChange(e.target.value)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function OriginOptionGroups({
  groups,
  state,
  onChange,
}: {
  groups: OriginOptionGroup[];
  state: OriginInteractionState["selections"];
  onChange: (catIdStr: string, idx: number, freeform: string) => void;
}) {
  return (
    <div className={`flex flex-col ${groups.length > 1 ? "gap-3" : "gap-1"}`}>
      {groups.map(g => {
        const catIdStr = String(g.catId);
        const { idx, freeform } = state[catIdStr] ?? { idx: 0, freeform: "" };
        return (
          <OriginOptionSelector
            key={catIdStr}
            group={g}
            selectedIdx={idx}
            freeformText={freeform}
            onSelect={i => onChange(catIdStr, i, "")}
            onFreeformChange={v => onChange(catIdStr, idx, v)}
          />
        );
      })}
    </div>
  );
}

export function originInteraction(
  template: OriginTemplate | undefined,
  optionIndices: PartialLookup<TID.OriginCategory, number[]>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: InternalTagsMap,
  costOverride?: Value<TID.Currency>,
  freebie?: Id<TID.Companion> | -1,
): AnnotationInteraction<OriginInteractionState> {
  const groups = buildOriginOptionGroups(optionIndices, doc);
  const userTags = !template
    ? {}
    : extractTagsWithExclusions(
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

  const optionsTypeName =
    groups.length === 1 ? groups[0]!.categoryName : "Origin Options";
  const typeName = template
    ? (doc.originCategories.O[template.type]?.name ?? "Origin")
    : optionsTypeName;

  const alreadyPresent = (build: JumpDocBuildData) =>
    template !== undefined &&
    build.origins.some(o => o.template?.id == template.id);

  const getCost = (build: JumpDocBuildData): Value<TID.Currency> => {
    if (costOverride) return costOverride;
    if (!template) return [{ amount: 0, currency: 0 as any }];
    const hasSynergy = template.synergies?.some(sid =>
      build.origins.some(o => o.template?.id == sid),
    );
    const costAsValue = Array.isArray(template.cost) ? template.cost : [template.cost];
    if (!hasSynergy) return costAsValue;
    switch (template.synergyBenefit) {
      case "free":
        return [{ amount: 0, currency: 0 as any }];
      case "discounted":
        return purchaseValueWithThreshold(costAsValue, { modifier: CostModifier.Reduced }, true, doc.currencies);
      case "access":
      default:
        return costAsValue;
    }
  };

  const optionsCostStr = (
    state: OriginInteractionState,
  ): string | undefined => {
    const totals: Partial<Record<number, number>> = {};
    for (const catIdStr in optionIndices) {
      const catId = createId<TID.OriginCategory>(+catIdStr);
      const category = doc.originCategories.O[catId];
      if (!category?.singleLine) continue;
      const { idx } = state.selections[catIdStr] ?? { idx: 0 };
      const availIndices = optionIndices[catId] ?? [];
      const optionDocIdx = availIndices[idx];
      if (optionDocIdx === undefined) continue;
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[optionDocIdx];
      if (!opt) continue;
      const currKey = opt.cost.currency as unknown as number;
      totals[currKey] = (totals[currKey] ?? 0) + opt.cost.amount;
    }
    const parts = Object.entries(totals).map(([currIdStr, amount]) => {
      const curr = doc.currencies.O[createId<TID.Currency>(+currIdStr)];
      return `${amount} ${curr?.abbrev ?? "?"}`;
    });
    return parts.length > 0 ? parts.join(", ") : undefined;
  };

  const error = (build: JumpDocBuildData) => {
    if (!template) return undefined;
    if (freebie !== undefined) return undefined;
    if (
      template.synergyBenefit === "access" &&
      template.synergies?.every(sid =>
        build.origins.every(o => o.template?.id != sid),
      )
    ) {
      const originList =
        template.synergies
          ?.map(sid => doc.origins.O[sid]?.name ?? "?")
          .join(", ") ?? "";
      return `This origin is restricted to holders of: ${originList}.`;
    }
    return undefined;
  };

  const executeOptions = (
    mutators: ChainMutators,
    state: OriginInteractionState,
  ) => {
    for (const catIdStr in optionIndices) {
      const catId = createId<TID.OriginCategory>(+catIdStr);
      const category = doc.originCategories.O[catId];
      if (!category?.singleLine) continue;
      const { idx, freeform } = state.selections[catIdStr] ?? {
        idx: 0,
        freeform: "",
      };
      const availIndices = optionIndices[catId] ?? [];
      const optionDocIdx = availIndices[idx];
      if (optionDocIdx === undefined) continue;
      const opt = (category as DocOriginCategory & { singleLine: true })
        .options[optionDocIdx];
      if (!opt) continue;
      const value =
        opt.type === "freeform" ? freeform : resolveOriginTemplate(opt.name);
      mutators.setFreeFormOrigin(
        { categoryId: catId, value, cost: opt.cost },
        jumpId,
        charId,
        doc,
      );
    }
  };

  const actions = (
    _: JumpDocBuildData,
  ): AnnotationAction<OriginInteractionState>[] => [
      {
        name: "Remove",
        variant: "danger",
        condition: build => alreadyPresent(build),
        execute: (_, mutators) => {
          mutators.removeOrigin(template!.id, jumpId, charId);
          mutators.navigate({ sub: "" });
          return [];
        },
      },
      {
        name: template
          ? (build, state) => {
            const cost = getCost(build);
            const optStr = optionsCostStr(state);
            const base = formatCostDisplay(
              cost,
              { modifier: CostModifier.Full },
              doc.currencies,
            );
            return `Use Origin (${optStr ? `${base} + ${optStr}` : base})`;
          }
          : "Set Options",
        condition: build => !alreadyPresent(build),
        execute: (build, mutators, state) => {
          if (template) {
            mutators.addOriginFromTemplate(
              {
                template,
                tags: state.tags,
                cost: getCost(build),
                freebie: freebie,
              },
              jumpId,
              charId,
              doc,
            );
          }
          executeOptions(mutators, state);
          mutators.navigate({ sub: "", extraSearch: { origin: "1" } });
          return [];
        },
      },
    ];

  const hasOptions = groups.length > 0;
  const needsChoice = groups.some(
    g => g.options.length >= 2 || g.options.some(o => o.isFreeform),
  );

  return {
    initialize: () => ({
      tags: {},
      selections: Object.fromEntries(
        groups.map(g => [String(g.catId), { idx: 0, freeform: "" }]),
      ),
    }),
    error,
    preview: props => {
      if (alreadyPresent(props.buildData)) return undefined;
      if (!hasTags && !hasOptions) return undefined;
      return (
        <>
          {hasTags && (
            <TagFieldsSection
              tags={userTags}
              tagValues={props.state.tags}
              choiceContext={template?.choiceContext}
              onChangeTag={(name, value) =>
                props.setState({ tags: { ...props.state.tags, [name]: value } })
              }
            />
          )}
          {hasOptions && (
            <OriginOptionGroups
              groups={groups}
              state={props.state.selections}
              onChange={(catIdStr, idx, freeform) =>
                props.setState({
                  selections: {
                    ...props.state.selections,
                    [catIdStr]: { idx, freeform },
                  },
                })
              }
            />
          )}
        </>
      );
    },
    typeName,
    name: template
      ? hasTags
        ? (build, state) =>
          applyTagsWithCost(
            template.name,
            {
              ...(state.tags ?? {}),
              ...objMap(internalTags, l => l(build)),
            },
            Array.isArray(template.cost) ? template.cost : [template.cost],
            getCost(build),
            doc.currencies,
          )
        : template.name
      : `Set ${optionsTypeName}`,
    description: template?.description || undefined,
    costStr: (build, state) => {
      if (alreadyPresent(build)) return undefined;
      const cost = getCost(build);
      const base = template
        ? formatCostDisplay(
          cost,
          { modifier: CostModifier.Full },
          doc.currencies,
        )
        : undefined;
      const optStr = optionsCostStr(state);
      if (base && optStr) return `${base} + ${optStr}`;
      return base ?? optStr;
    },
    shortCostStr: build => {
      if (alreadyPresent(build)) return undefined;
      const cost = getCost(build);
      return template
        ? formatCostShort(
          cost,
          { modifier: CostModifier.Full },
          doc.currencies,
        )
        : undefined;
    },
    info: build => (alreadyPresent(build) ? "Already selected" : undefined),
    actions,
    forcePreview: build => !alreadyPresent(build) && (needsChoice || hasTags),
  };
}

export function randomizerInteraction(
  categoryId: Id<TID.OriginCategory>,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  internalTags: Record<string, (build: JumpDocBuildData) => string>,
): AnnotationInteraction<{}> {
  const category = doc.originCategories.O[categoryId] as DocOriginCategory & {
    singleLine: false;
  };
  const randomCost = category.random!.cost;

  const costStr = randomCost
    ? formatCostDisplay(
      [randomCost],
      { modifier: CostModifier.Full },
      doc.currencies,
    )
    : undefined;
  const shortCostStr = randomCost
    ? formatCostShort(
      [randomCost],
      { modifier: CostModifier.Full },
      doc.currencies,
    )
    : undefined;

  const getAvailable = (_: JumpDocBuildData): OriginTemplate[] => {
    const result: OriginTemplate[] = [];
    for (const idStr in doc.origins.O) {
      const tid = createId<TID.Origin>(+idStr);
      const template = doc.origins.O[tid];
      if (!template || template.type !== categoryId) continue;
      result.push(template);
    }
    return result;
  };

  return {
    initialize: () => ({}),
    error: () => undefined,
    preview: () => undefined,
    typeName: "Randomizer",
    name: category.name,
    costStr,
    shortCostStr,
    actions: [
      {
        name: "Randomize",
        condition: () => true,
        execute: build => {
          const available = getAvailable(build);
          if (available.length === 0) return [];
          const template =
            available[Math.floor(Math.random() * available.length)]!;
          return [
            originInteraction(
              template,
              {},
              doc,
              jumpId,
              charId,
              internalTags,
              [category.random!.cost],
              -1,
            ) as AnnotationInteraction<object>,
          ];
        },
      },
    ],
    forcePreview: () => true,
  };
}
