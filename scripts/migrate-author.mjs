import mongoose from "mongoose";

const MONGODB_URI =
  "mongodb://localhost:27017/chainmaker?authSource=admin&directConnection=true";

await mongoose.connect(MONGODB_URI);

const db = mongoose.connection.db;
const result = await db
  .collection("jumpdocs")
  .updateMany({ author: { $exists: false } }, { $set: { author: [] } });

console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
await mongoose.disconnect();
