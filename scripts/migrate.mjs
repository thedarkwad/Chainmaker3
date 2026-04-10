import { MongoClient } from "mongodb";

const SOURCE_URI = "mongodb://localhost:27017/chainmaker?authSource=admin&directConnection=true";
const TARGET_URI = "mongodb://admin:Parakee3456%40home@104.128.64.158:27017/?authSource=admin";
const DB_NAME = "chainmaker";

const source = new MongoClient(SOURCE_URI);
const target = new MongoClient(TARGET_URI);

await source.connect();
await target.connect();
console.log("Connected to both databases.");

const sourceDb = source.db(DB_NAME);
const targetDb = target.db(DB_NAME);

const collections = await sourceDb.listCollections().toArray();
console.log(`Found collections: ${collections.map((c) => c.name).join(", ")}`);

for (const { name } of collections) {
  const docs = await sourceDb.collection(name).find({}).toArray();
  console.log(`Migrating ${name}: ${docs.length} documents...`);
  if (docs.length > 0) {
    await targetDb.collection(name).deleteMany({});
    const result = await targetDb.collection(name).insertMany(docs);
    const count = await targetDb.collection(name).countDocuments();
    console.log(`  inserted: ${result.insertedCount}, verified in target: ${count}`);
  }
}

await source.close();
await target.close();
console.log("Migration complete.");
