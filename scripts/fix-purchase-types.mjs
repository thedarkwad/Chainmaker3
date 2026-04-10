/**
 * One-time fix: swap "perk" ↔ "item" in the purchases collection.
 *
 * Background: the original backfill had PurchaseType.Perk and PurchaseType.Item
 * reversed (Perk=0, Item=1 — not Perk=1, Item=0 as the script assumed).
 *
 * Usage:
 *   node scripts/fix-purchase-types.mjs
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import mongoose from "mongoose";

try {
  const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("MONGODB_URI is not set"); process.exit(1); }

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

const db = mongoose.connection.db;
const col = db.collection("purchases");

// Two-phase swap via a temporary sentinel to avoid collisions
const { modifiedCount: a } = await col.updateMany({ purchaseType: "perk" }, { $set: { purchaseType: "__perk__" } });
const { modifiedCount: b } = await col.updateMany({ purchaseType: "item" }, { $set: { purchaseType: "perk" } });
const { modifiedCount: c } = await col.updateMany({ purchaseType: "__perk__" }, { $set: { purchaseType: "item" } });

console.log(`Swapped: ${a} perks → item, ${b} items → perk (via sentinel: ${c})`);
await mongoose.disconnect();
