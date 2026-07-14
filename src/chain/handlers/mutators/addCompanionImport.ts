import { createId, GID, Id, LID, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { CompanionTemplate, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { CompanionImport, PurchaseType, Value } from "../../data/Purchase";
import { applyTagsWithCost } from "../../../utilities/tags";
import { PossibleCost } from "../types";
import { convertCurrencyId, convertSubtypeId, convertModifiedCost, convertValue } from "../utils";

export function addCompanionImport(
  {
    template,
    companionIds,
    tags,
    cost,
  }: {
    template: CompanionTemplate & {
      cost: Value<TID.Currency>;
    };
    companionIds: Id<GID.Character>[];
    tags: Record<string, string>;
    cost: PossibleCost;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): Id<GID.Purchase> | undefined {
  let newId: Id<GID.Purchase> | undefined;
  setTracked("Add companion import", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const allowances: Record<Id<LID.Currency>, number> = {};
    for (const tidStr in template.allowances) {
      const tid = createId<TID.Currency>(+tidStr);
      const lid = convertCurrencyId(tid, doc, jump.currencies);
      allowances[lid] = template.allowances[tid];
    }
    const stipend: Record<
      Id<LID.Currency>,
      Record<Id<LID.PurchaseSubtype>, number>
    > = {};
    for (const tidCurrStr in template.stipend) {
      const tidCurr = createId<TID.Currency>(+tidCurrStr);
      const lidCurr = convertCurrencyId(tidCurr, doc, jump.currencies);
      const inner = template.stipend[tidCurr];
      const convertedInner: Record<Id<LID.PurchaseSubtype>, number> = {};
      for (const tidSubStr in inner) {
        const tidSub = createId<TID.PurchaseSubtype>(+tidSubStr);
        const lidSub = convertSubtypeId(
          tidSub,
          doc,
          jump.purchaseSubtypes,
        );
        if (lidSub == null) continue;
        convertedInner[lidSub] = inner[tidSub];
      }
      stipend[lidCurr] = convertedInner;
    }
    newId = c.purchases.fId;

    let resolvedName = applyTagsWithCost(
      template.name,
      tags,
      template.cost,
      cost.cost,
      doc.currencies,
    );

    let resolvedDescription = applyTagsWithCost(
      template.description,
      tags,
      template.cost,
      cost.cost,
      doc.currencies,
    );

    const purchase: CompanionImport = {
      id: newId,
      charId,
      jumpId,
      name: resolvedName,
      description: resolvedDescription,
      type: PurchaseType.Companion,
      cost: convertModifiedCost(
        template.cost,
        cost,
        doc,
        jump.currencies,
        cost.floatingDiscountOption ?? false,
      ),
      value: convertValue(template.cost, doc, jump.currencies),
      template: {
        id: template.id,
        jumpdoc: "",
        originalCost: cost,
        tags,
        originalName: resolvedName,
        originalDescription: resolvedDescription,
      },
      importData: {
        characters: companionIds,
        allowances: allowances as any,
        stipend: stipend as any,
      },
    };
    c.purchases.O[newId] = purchase as never;
    c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
    if (!jump.purchases[charId]) jump.purchases[charId] = [];
    jump.purchases[charId]!.push(newId);
    c.budgetFlag += 1;
  });
  return newId;
}
