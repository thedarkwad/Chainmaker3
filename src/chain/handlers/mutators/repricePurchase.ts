import { GID, Id, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpDoc, VariableCost } from "@/jumpdoc/data/JumpDoc";
import { JumpPurchase, PurchaseType, Value } from "../../data/Purchase";
import { PossibleCost } from "../types";
import { convertModifiedCost, convertValue } from "../utils";

export function repricePurchase(
  id: Id<GID.Purchase>,
  cost: PossibleCost,
  doc: JumpDoc,
): void {
  setTracked("Reprice purchase", c => {
    const p = c.purchases.O[id] as JumpPurchase | undefined;
    if (!p || !p.template) return;
    const jump = c.jumps.O[p.jumpId];
    if (!jump) return;
    let templateValue: Value<TID.Currency> | VariableCost;
    if (p.type == PurchaseType.Drawback)
      templateValue = doc.availableDrawbacks.O[p.template.id as any].cost;
    else if (p.type == PurchaseType.Companion)
      templateValue = doc.availableCompanions.O[p.template.id as any].cost;
    else
      templateValue = doc.availablePurchases.O[p.template.id as any].cost;
    p.value = convertValue(
      Array.isArray(templateValue) ? templateValue : cost.cost,
      doc,
      jump.currencies,
    );
    p.cost = convertModifiedCost(
      Array.isArray(templateValue) ? templateValue : cost.cost,
      cost,
      doc,
      jump.currencies,
      false,
    );
    p.template.originalCost = cost;
    if ("usesFloatingDiscount" in p) p.usesFloatingDiscount = false;
    c.budgetFlag += 1;
  });
}
