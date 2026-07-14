import { GID, Id, LID, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { SimpleValue } from "../../data/Purchase";
import { convertCurrencyId } from "../utils";

export function setFreeFormOrigin(
  {
    categoryId,
    value,
    cost,
  }: {
    categoryId: Id<TID.OriginCategory>;
    value: string;
    cost: SimpleValue<TID.Currency>;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): void {
  setTracked("Set origin", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    let categoryLid: Id<LID.OriginCategory> | undefined;
    for (const lidStr in jump.originCategories.O) {
      const cat =
        jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
      if (cat?.template?.id === categoryId) {
        categoryLid = +lidStr as Id<LID.OriginCategory>;
        break;
      }
    }
    if (categoryLid === undefined) return;
    const convertedCost = {
      amount: cost.amount,
      currency: convertCurrencyId(cost.currency, doc, jump.currencies),
    };
    if (!jump.origins[charId]) jump.origins[charId] = {};
    const charOrigins = jump.origins[charId];
    if (!charOrigins[categoryLid]) charOrigins[categoryLid] = [];
    const list = charOrigins[categoryLid]!;
    const existing = list.find(o => !o.template);
    if (existing) {
      existing.summary = value;
      existing.value = convertedCost;
    } else {
      list.push({ summary: value, value: convertedCost });
    }
    c.budgetFlag += 1;
  });
}
