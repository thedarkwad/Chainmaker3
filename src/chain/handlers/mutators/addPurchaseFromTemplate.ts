import {
  GID,
  Id,
  LID,
  registryAdd,
  TID,
} from "../../data/types";
import { setTracked } from "../../state/hooks";
import { BasicPurchaseTemplate, DrawbackTemplate, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { applyTagsWithCost } from "../../../utilities/tags";
import { convertModifiedCost, convertValue } from "../utils";
import { PurchaseType, Value } from "../../data/Purchase";
import { PossibleCost } from "../types";

export function addPurchaseFromTemplate(
  {
    template,
    type,
    tags,
    cost,
    reward,
    freebie,
    customDuration,
  }: {
    template: (BasicPurchaseTemplate | DrawbackTemplate) & {
      cost: Value<TID.Currency>;
    };
    type: "purchase" | "drawback";
    tags: Record<string, string>;
    cost: PossibleCost;
    reward?: Id<TID.Scenario>;
    freebie?: Id<TID.Companion>;
    customDuration?: number;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): Id<GID.Purchase> | undefined {
  let newId: Id<GID.Purchase> | undefined;
  setTracked("Add purchase", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    c.budgetFlag += 1;
    if (type == "purchase") {
      let subtype = +Object.keys(jump.purchaseSubtypes.O).filter(
        id =>
          jump.purchaseSubtypes.O[+id as any].templateId ==
          (template as BasicPurchaseTemplate).subtype,
      )[0] as Id<LID.PurchaseSubtype>;
      if (subtype === undefined) return;
      const resolvedName = applyTagsWithCost(
        template.name,
        tags,
        template.cost,
        cost.cost,
        doc.currencies,
      );
      const resolvedDescription = applyTagsWithCost(
        template.description ?? "",
        tags,
        template.cost,
        cost.cost,
        doc.currencies,
      );
      newId = registryAdd(c.purchases, {
        charId,
        jumpId,
        name: resolvedName,
        description: resolvedDescription,
        type: jump.purchaseSubtypes.O[subtype].type,
        cost: convertModifiedCost(
          template.cost,
          cost,
          doc,
          jump.currencies,
          cost.floatingDiscountOption ?? false,
        ),
        reward,
        ...(freebie !== undefined ? { freebie } : {}),
        value: convertValue(template.cost, doc, jump.currencies),
        categories: [],
        tags: [],
        subtype,
        duration: (template as BasicPurchaseTemplate).temporary
          ? 1
          : undefined,
        template: {
          id: template.id as any,
          jumpdoc: "",
          originalCost: cost,
          tags,
          originalName: resolvedName,
          originalDescription: resolvedDescription,
        },
        usesFloatingDiscount: cost.floatingDiscountOption ?? false,
      });
      if (!jump.purchases[charId]) jump.purchases[charId] = [];
      jump.purchases[charId]!.push(newId);
    } else {
      const resolvedName = applyTagsWithCost(
        template.name,
        tags,
        template.cost,
        cost.cost,
        doc.currencies,
      );
      const resolvedDescription = applyTagsWithCost(
        template.description ?? "",
        tags,
        template.cost,
        cost.cost,
        doc.currencies,
      );
      newId = registryAdd(c.purchases, {
        charId,
        jumpId,
        duration: 1,
        overrides: {},
        name: resolvedName,
        description: resolvedDescription,
        type: PurchaseType.Drawback,
        cost: convertModifiedCost(
          template.cost,
          cost,
          doc,
          jump.currencies,
          cost.floatingDiscountOption ?? false,
        ),
        value: convertValue(template.cost, doc, jump.currencies),
        template: {
          id: template.id as any,
          jumpdoc: "",
          originalCost: cost,
          tags,
          originalName: resolvedName,
          originalDescription: resolvedDescription,
        },
        ...(freebie !== undefined ? { freebie } : {}),
        ...(customDuration !== undefined ? { customDuration } : {}),
      });
      if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
      jump.drawbacks[charId]!.push(newId);
    }
    c.budgetFlag += 1;
  });
  return newId;
}
