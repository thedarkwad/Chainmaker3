import { GID, Id, LID, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { OriginTemplate, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import type { Origin } from "../../data/Jump";
import { CostModifier, Value } from "../../data/Purchase";
import { applyTagsWithCost } from "../../../utilities/tags";
import { convertValue } from "../utils";

export function addOriginFromTemplate(
  {
    template,
    tags,
    cost,
    freebie,
  }: {
    template: OriginTemplate;
    tags: Record<string, string>;
    cost: Value<TID.Currency>;
    freebie?: Id<TID.Companion> | -1;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): Id<TID.Origin> {
  setTracked("Add origin", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;

    // Find the LID.OriginCategory that links to this template's TID category.
    let categoryLid: Id<LID.OriginCategory> | undefined;
    for (const lidStr in jump.originCategories.O) {
      const cat =
        jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
      if (cat?.template?.id === template.type) {
        categoryLid = +lidStr as Id<LID.OriginCategory>;
        break;
      }
    }
    if (categoryLid === undefined) return;

    const chainCat = jump.originCategories.O[categoryLid];
    const docCat = doc.originCategories.O[template.type];
    const effectiveMax = chainCat?.multiple ? (docCat?.max ?? 9999) : 1;

    const origins = jump.origins[charId] as
      | Record<Id<LID.OriginCategory>, Origin[]>
      | undefined;
    const list = origins?.[categoryLid] ?? [];

    // Evict the first entry if already at capacity.
    if (list.length >= effectiveMax && list.length > 0) {
      list.splice(0, 1);
    }

    const convertedCost = convertValue(cost, doc, jump.currencies);
    const templateCostAsValue = Array.isArray(template.cost) ? template.cost : [template.cost];

    const newOrigin: Origin = {
      summary: applyTagsWithCost(
        template.name,
        tags,
        templateCostAsValue,
        cost,
        doc.currencies,
      ),
      ...(template.description
        ? {
          description: applyTagsWithCost(
            template.description,
            tags,
            templateCostAsValue,
            cost,
            doc.currencies,
          ),
        }
        : {}),
      value: convertedCost,
      template: {
        jumpdoc: "",
        id: template.id,
        originalCost: { cost: cost, modifier: CostModifier.Full },
      },
      ...(freebie !== undefined ? { freebie } : {}),
    };

    if (!jump.origins[charId]) jump.origins[charId] = {};
    const categoryOrigins = jump.origins[charId];
    if (!categoryOrigins[categoryLid]) categoryOrigins[categoryLid] = [];
    categoryOrigins[categoryLid].push(newOrigin);

    c.budgetFlag += 1;
  });
  return template.id;
}
