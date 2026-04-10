/**
 * One-time backfill: populate the denormalized `name` field on all Chain
 * documents that don't already have it set.
 *
 * Usage:
 *   node scripts/backfill-chain-names.mjs
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

const Chain = mongoose.model(
  "Chain",
  new mongoose.Schema({ contents: mongoose.Schema.Types.Mixed, name: String }, { strict: false }),
  "chains",
);

const cursor = Chain.find({ name: { $exists: false } }, { contents: 1 }).lean().cursor();

let updated = 0;
let skipped = 0;

for await (const doc of cursor) {
  const name = doc.contents?.name ?? "";
  if (!name) { skipped++; continue; }
  await Chain.updateOne({ _id: doc._id }, { $set: { name } });
  updated++;
}

console.log(`Done. Updated: ${updated}, skipped (no name in contents): ${skipped}`);
await mongoose.disconnect();
