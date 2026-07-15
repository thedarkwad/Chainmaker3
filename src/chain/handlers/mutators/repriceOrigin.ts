import { GID, Id, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { JumpDocBuildData } from "../../state/ViewerActionStore";
import { CostModifier } from "../../data/Purchase";
import { purchaseValueWithThreshold, convertValue } from "../utils";

export function repriceOrigin(
  templateId: Id<TID.Origin>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  build: JumpDocBuildData,
  doc: JumpDoc,
): void {
  const template = doc.origins.O[templateId];
  if (!template) return;
  const hasSynergy = template.synergies?.some(sid =>
    build.origins.some(o => o.template?.id === sid),
  );
  let newTidCost = Array.isArray(template.cost)
    ? template.cost
    : [template.cost];
  if (
    hasSynergy &&
    (template.synergyBenefit == "discounted" ||
      template.synergyBenefit == "free")
  ) {
    newTidCost = purchaseValueWithThreshold(
      newTidCost,
      {
        modifier:
          template.synergyBenefit == "discounted"
            ? CostModifier.Reduced
            : CostModifier.Free,
      },
      true,
      doc.currencies,
    );
  }

  setTracked("Reprice origin", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const charOrigins = jump.origins[charId];
    if (!charOrigins) return;
    for (const lidStr in charOrigins) {
      const origin = charOrigins[lidStr as any]?.find(
        o => o.template?.id === templateId,
      );
      if (!origin) continue;
      origin.value = convertValue(newTidCost, doc, jump.currencies);
      origin.template!.originalCost = {
        cost: newTidCost,
        modifier: CostModifier.Full,
      };
      c.budgetFlag += 1;
    }
  });
}
