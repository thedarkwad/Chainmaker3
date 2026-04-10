/**
 * One-off migration: reassign all documents owned by OLD_UID to NEW_UID.
 *
 * Usage:
 *   node scripts/reassign-owner.mjs
 *
 * Review the FROM / TO values below before running.
 */

import mongoose from "mongoose";

const MONGODB_URI =
  "mongodb://localhost:27017/chainmaker?authSource=admin&directConnection=true";

const FROM = "cw2MmMGjPLRlvWiZfkuIi2D3cSP2";
const TO   = "69ab8187018b846ba09227f4";

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const collections = ["chains", "jumpdocs", "images", "pdfs"];

for (const col of collections) {
  const result = await db
    .collection(col)
    .updateMany({ ownerUid: FROM }, { $set: { ownerUid: TO } });
  console.log(`${col}: ${result.modifiedCount} updated`);
}

// Also update the users collection — the User document itself uses firebaseUid,
// not ownerUid, so update that field separately.
const userResult = await db
  .collection("users")
  .updateMany({ firebaseUid: FROM }, { $set: { firebaseUid: TO } });
console.log(`users (firebaseUid): ${userResult.modifiedCount} updated`);

await mongoose.disconnect();
console.log("Done.");
