import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener, JumpDocBuildData } from "../../state/ViewerActionStore";
import {
  CostModifier,
  JumpPurchase,
  purchaseValue,
  Value,
  BasicPurchase,
} from "../../data/Purchase";
import { PurchaseTemplate, VariableCost } from "../../data/JumpDoc";
import { formatCostShort } from "@/ui/CostDropdown";
import {
  evalVariableCostExpr,
  computePossibleCosts,
  purchaseValueWithThreshold,
} from "../utils";
import { objMap } from "@/utilities/miscUtilities";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

const valuesEqualTID = (
  a: Value<TID.Currency>,
  b: Value<TID.Currency>,
): boolean => {
  const normalize = (v: Value<TID.Currency>) =>
    [...v].sort((x, y) => (x.currency as number) - (y.currency as number));
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length !== nb.length) return false;
  return na.every(
    (sv, i) => sv.currency === nb[i]!.currency && sv.amount === nb[i]!.amount,
  );
};

export function createRepricePurchasesListener(
  internalTags: Record<string, (build: JumpDocBuildData) => string>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, currentChain, doc, mutators) => {
      const repriced: string[] = [];

      const repriceGids = (
        gids: Id<GID.Purchase>[],
        template: PurchaseTemplate<TID>,
        skipRewardFreebie: boolean,
      ) => {
        for (let i = 0; i < gids.length; i++) {
          const gid = gids[i]!;
          const p = currentChain.purchases.O[gid] as JumpPurchase | undefined;
          if (
            skipRewardFreebie &&
            ((p as BasicPurchase).reward != null ||
              (p as BasicPurchase).freebie !== undefined)
          )
            continue;
          if (!p?.template?.originalCost) continue;
          const originalCost = p.template.originalCost;
          const originalEffective = purchaseValue(
            originalCost.cost,
            originalCost,
          );

          const resolvedCost: Value<TID.Currency> = Array.isArray(template.cost)
            ? (template.cost as Value<TID.Currency>)
            : Object.entries(template.cost as VariableCost).map(
                ([currIdStr, expr]) => ({
                  currency: createId<TID.Currency>(+currIdStr),
                  amount: evalVariableCostExpr(expr ?? "", {
                    ...(p.template?.tags ?? {}),
                    ...objMap(internalTags, l => l(build)),
                  }),
                }),
              );

          const dummyTemplate = {
            ...template,
            cost: resolvedCost,
          } as PurchaseTemplate<TID> & { cost: Value<TID.Currency> };
          const possibleCosts = computePossibleCosts(
            dummyTemplate,
            build,
            doc,
            i === 0,
          );

          const allCosts = [possibleCosts.default, ...possibleCosts.options];
          const costsToCheck = originalCost.floatingDiscountOption
            ? allCosts.filter(c => c.floatingDiscountOption)
            : allCosts;

          const stillValid = costsToCheck.some(c =>
            valuesEqualTID(
              originalEffective,
              purchaseValueWithThreshold(
                c.cost,
                c,
                i === 0,
                doc.currencies,
              ) as Value<TID.Currency>,
            ),
          );

          if (!stillValid) {
            repriced.push(p.name);
            mutators.repricePurchase(
              gid,
              { ...possibleCosts.default, floatingDiscountOption: undefined },
              doc,
            );
          }
        }
      };

      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        const template = doc.availablePurchases.O[tid];
        if (template) repriceGids(build.purchases[tid] ?? [], template, true);
      }

      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        const template = doc.availableDrawbacks.O[tid];
        if (template) repriceGids(build.drawbacks[tid] ?? [], template, false);
      }

      for (const tidStr in build.companionImports) {
        const tid = createId<TID.Companion>(+tidStr);
        const template = doc.availableCompanions.O[tid];
        if (template)
          repriceGids(
            build.companionImports[tid] ?? [],
            { ...template, allowMultiple: !template.specificCharacter },
            false,
          );
      }

      if (repriced.length)
        toast.info(`Prices adjusted on ${fmtNames(repriced)}`);
    },
    (build, chain) => [
      [
        build.origins
          .map(o => o.template?.id ?? "")
          .sort()
          .join(","),
        chain.jumps.O[jumpId].purchases[charId]?.length,
        chain.jumps.O[jumpId].drawbacks[charId]?.length,
        chain.jumps.O[jumpId].scenarios[charId]?.length,
      ],
    ],
  );
}
