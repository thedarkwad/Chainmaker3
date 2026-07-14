import { createId, GID, Id, LID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { ScenarioTemplate, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { Value, ScenarioReward, Scenario, CostModifier, PurchaseType, RewardType } from "../../data/Purchase";
import { applyTags } from "../../../utilities/tags";
import { convertCurrencyId, convertSubtypeId } from "../utils";

export function addScenarioFromTemplate(
  {
    template,
    tags,
    rewardGroupIndex,
  }: {
    template: ScenarioTemplate;
    tags: Record<string, string>;
    rewardGroupIndex: number | undefined;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): Id<GID.Purchase> | undefined {
  let newId: Id<GID.Purchase> | undefined;
  setTracked("Add scenario", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const initValue: Value = Object.keys(jump.currencies.O).map(cid => ({
      currency: createId<LID.Currency>(+cid),
      amount: 0,
    }));
    const rewardTemplates =
      rewardGroupIndex != null
        ? (template.rewardGroups?.[rewardGroupIndex]?.rewards ?? [])
        : [];
    const rewards: ScenarioReward[] = [];
    for (const r of rewardTemplates) {
      if (r.type === RewardType.Currency) {
        rewards.push({
          type: r.type,
          value: r.value,
          currency: convertCurrencyId(r.currency, doc, jump.currencies),
        });
      } else if (r.type === RewardType.Stipend) {
        const subtype = convertSubtypeId(
          r.subtype,
          doc,
          jump.purchaseSubtypes,
        );
        if (subtype == null) continue;
        rewards.push({
          type: r.type,
          value: r.value,
          currency: convertCurrencyId(r.currency, doc, jump.currencies),
          subtype,
        });
      } else if (
        r.type === RewardType.Item ||
        r.type === RewardType.Perk
      ) {
        rewards.push({ type: r.type, id: r.id });
      } else if (r.type === RewardType.Companion) {
        rewards.push({
          type: r.type,
          id: r.id,
          name: doc.availableCompanions.O[r.id]?.name ?? "",
        });
      }
    }
    newId = c.purchases.fId;
    const resolvedName = applyTags(template.name, tags);
    const resolvedDescription = applyTags(template.description, tags);
    const scenario: Scenario = {
      id: newId,
      charId,
      jumpId,
      name: resolvedName,
      description: resolvedDescription,
      type: PurchaseType.Scenario,
      cost: { modifier: CostModifier.Full },
      value: initValue,
      rewards,
      template: {
        id: template.id as any,
        jumpdoc: "",
        tags,
        originalName: resolvedName,
        originalDescription: resolvedDescription,
      },
    };
    c.purchases.O[newId] = scenario;
    c.purchases.fId = createId<GID.Purchase>(newId + 1);
    if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
    jump.scenarios[charId]!.push(newId);
    c.budgetFlag += 1;
  });
  return newId;
}
