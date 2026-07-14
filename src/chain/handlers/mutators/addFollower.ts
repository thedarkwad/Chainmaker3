import { createId, GID, Id, LID, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { CompanionTemplate, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { BasicPurchase, PurchaseType, Value } from "../../data/Purchase";
import { applyTagsWithCost } from "../../../utilities/tags";
import { PossibleCost } from "../types";
import { convertModifiedCost, convertValue } from "../utils";

export function addFollower(
  {
    template,
    cost,
    tags,
  }: {
    template: CompanionTemplate & { cost: Value<TID.Currency> };
    cost: PossibleCost;
    tags: Record<string, string>;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): Id<GID.Purchase> | undefined {
  let newId: Id<GID.Purchase> | undefined;
  setTracked("Add follower", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const subtypeEntry = Object.entries(jump.purchaseSubtypes.O).find(
      ([, st]) => st?.type === PurchaseType.Item,
    );
    if (!subtypeEntry) return;
    const subtype = createId<LID.PurchaseSubtype>(+subtypeEntry[0]);
    newId = c.purchases.fId;
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
    const purchase: BasicPurchase = {
      id: newId,
      charId,
      jumpId,
      name: resolvedName,
      description: resolvedDescription,
      type: PurchaseType.Item,
      cost: convertModifiedCost(
        cost.cost,
        cost,
        doc,
        jump.currencies,
        cost.floatingDiscountOption ?? false,
      ),
      value: convertValue(cost.cost, doc, jump.currencies),
      template: {
        id: template.id,
        jumpdoc: "",
        tags,
        originalName: resolvedName,
        originalDescription: resolvedDescription,
      },
      subtype,
      categories: [],
      tags: [],
      follower: true,
    };
    c.purchases.O[newId] = purchase;
    c.purchases.fId = createId<GID.Purchase>(newId + 1);
    if (!jump.purchases[charId]) jump.purchases[charId] = [];
    jump.purchases[charId]!.push(newId);
    c.budgetFlag += 1;
  });
  return newId;
}
