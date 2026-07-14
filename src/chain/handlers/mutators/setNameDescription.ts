import { GID, Id } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpPurchase } from "../../data/Purchase";

export function setNameDescription(
  id: Id<GID.Purchase>,
  name: string,
  description: string,
): void {
  setTracked("Rename purchase", c => {
    const p = c.purchases.O[id] as JumpPurchase | undefined;
    if (!p?.template) return;
    p.name = name;
    p.description = description;
    p.template.originalName = name;
    p.template.originalDescription = description;
    c.budgetFlag += 1;
  });
}
