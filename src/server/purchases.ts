import { type JumpDoc } from "@/chain/data/JumpDoc";
import { PurchaseType, RewardType } from "@/chain/data/Purchase";
import { Models } from "./db";

/**
 * Atomically replaces all purchase template documents for a given JumpDoc.
 * Called after every successful JumpDoc save to keep the `purchases` collection
 * in sync with `contents.availablePurchases`.
 */
export async function syncJumpDocPurchases(
  docPublicUid: string,
  docName: string,
  published: boolean,
  contents: JumpDoc,
): Promise<void> {
  // Collect IDs of purchases that appear as rewards in any scenario.
  const scenarioRewardIds = new Set<number>();
  for (const scenario of Object.values(contents.availableScenarios.O)) {
    for (const group of scenario?.rewardGroups ?? []) {
      for (const reward of group.rewards) {
        if (reward.type === RewardType.Item || reward.type === RewardType.Perk) {
          scenarioRewardIds.add(reward.id as number);
        }
      }
    }
  }

  const docs: object[] = [];
  for (const [tidStr, template] of Object.entries(contents.availablePurchases.O)) {
    if (!template) continue;
    if (!template.name || !template.description) continue;
    const templateId = Number(tidStr);

    const subtype = contents.purchaseSubtypes.O[template.subtype as never];
    const purchaseType = subtype?.type === PurchaseType.Perk ? "perk" : "item";

    // Default currency is TID key 0.
    const cpEntry = template.cost.find((sv) => (sv.currency as number) === 0);
    const hasNonZeroCost = template.cost.some((sv) => (sv.amount as number) > 0);
    const cost =
      cpEntry != null
        ? { kind: "cp", amount: cpEntry.amount }
        : hasNonZeroCost
          ? { kind: "custom" }
          : { kind: "cp", amount: 0 };

    docs.push({
      docId: docPublicUid,
      templateId,
      name: template.name,
      description: template.description,
      choiceContext: template.choiceContext,
      purchaseType,
      cost,
      isScenarioReward: scenarioRewardIds.has(templateId),
      docName,
      published,
    });
  }

  await Models.Purchase.deleteMany({ docId: docPublicUid });
  if (docs.length > 0) await Models.Purchase.insertMany(docs);
}
