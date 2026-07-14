import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { CostModifier, Value } from "../../data/Purchase";
import { purchaseValueWithThreshold } from "../utils";

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

export function createOriginSynergyListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, _chain, doc, mutators) => {
      const removed: string[] = [];
      const repriced: string[] = [];
      for (const origin of build.origins) {
        if (!origin.template || origin.freebie !== undefined) continue;
        const template = doc.origins.O[origin.template.id];
        if (!template?.synergies?.length) continue;

        const synergyPresent = template.synergies.some(sid =>
          build.origins.some(o => o.template?.id === sid),
        );

        if (template.synergyBenefit === "access") {
          if (!synergyPresent) {
            removed.push(template.name);
            mutators.removeOrigin(template.id, jumpId, charId);
          }
        } else if (
          template.synergyBenefit === "discounted" ||
          template.synergyBenefit === "free"
        ) {
          const originalCost = origin.template.originalCost;
          const costAsValue = Array.isArray(template.cost)
            ? template.cost
            : [template.cost];
          if (!originalCost) continue;
          const originalHadSynergy =
            originalCost.modifier !== CostModifier.Full ||
            !valuesEqualTID(originalCost.cost, costAsValue);
          if (synergyPresent !== originalHadSynergy) {
            repriced.push(template.name);
            mutators.repriceOrigin(template.id, jumpId, charId, build, doc);
          }
        }
      }
      if (removed.length) toast.info(`Removed: ${fmtNames(removed)}`);
      if (repriced.length)
        toast.info(`Prices adjusted on ${fmtNames(repriced)}`);
    },
    build => [
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
    ],
  );
}
