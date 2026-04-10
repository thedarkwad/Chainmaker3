/**
 * One-time backfill: populate the `purchases` collection from all existing
 * JumpDoc documents.
 *
 * Usage:
 *   node scripts/backfill-purchases.mjs
 *
 * Requires MONGODB_URI to be set in the environment (or .env file).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import mongoose from "mongoose";

// Load .env manually (no dotenv dependency)
try {
  const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

const JumpDoc = mongoose.model(
  "JumpDoc",
  new mongoose.Schema(
    { contents: mongoose.Schema.Types.Mixed, publicUid: String, name: String, published: Boolean },
    { strict: false },
  ),
  "jumpdocs",
);

const Purchase = mongoose.model(
  "Purchase",
  new mongoose.Schema({}, { strict: false }),
  "purchases",
);

const RewardType = { Item: 1, Perk: 2 };

function buildDocs(publicUid, docName, published, contents) {
  const scenarioRewardIds = new Set();
  for (const scenario of Object.values(contents.availableScenarios?.O ?? {})) {
    for (const group of scenario?.rewardGroups ?? []) {
      for (const reward of group.rewards ?? []) {
        if (reward.type === RewardType.Item || reward.type === RewardType.Perk) {
          scenarioRewardIds.add(reward.id);
        }
      }
    }
  }

  const docs = [];
  for (const [tidStr, template] of Object.entries(contents.availablePurchases?.O ?? {})) {
    if (!template) continue;
    const templateId = Number(tidStr);

    const subtype = contents.purchaseSubtypes?.O?.[template.subtype];
    // PurchaseType.Perk = 0, PurchaseType.Item = 1
    const purchaseType = subtype?.type === 0 ? "perk" : "item";

    const cpEntry = template.cost?.find((sv) => sv.currency === 0);
    const hasNonZeroCost = template.cost?.some((sv) => sv.amount > 0) ?? false;
    const cost = cpEntry != null
      ? { kind: "cp", amount: cpEntry.amount }
      : hasNonZeroCost
        ? { kind: "custom" }
        : { kind: "cp", amount: 0 };

    docs.push({
      docId: publicUid,
      templateId,
      name: template.name,
      description: template.description ?? "",
      choiceContext: template.choiceContext,
      purchaseType,
      cost,
      isScenarioReward: scenarioRewardIds.has(templateId),
      docName,
      published: published ?? false,
    });
  }
  return docs;
}

const cursor = JumpDoc.find({}, { contents: 1, publicUid: 1, name: 1, published: 1 })
  .lean()
  .cursor();

let processed = 0;
let totalPurchases = 0;

for await (const doc of cursor) {
  if (!doc.contents || !doc.publicUid) continue;
  const docs = buildDocs(doc.publicUid, doc.name ?? "", doc.published ?? false, doc.contents);
  await Purchase.deleteMany({ docId: doc.publicUid });
  if (docs.length > 0) await Purchase.insertMany(docs);
  totalPurchases += docs.length;
  processed++;
  if (processed % 10 === 0) console.log(`  processed ${processed} docs...`);
}

console.log(`Done. Processed ${processed} JumpDocs, inserted ${totalPurchases} purchase records.`);
await mongoose.disconnect();
