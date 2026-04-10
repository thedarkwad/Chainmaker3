import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb://admin:Parakee3456%40home@104.128.64.158:27017/chainmaker?authSource=admin";
const OLD_PREFIX = "https://chainmaker-uploads.s3.us-east-005.backblazeb2.com";
const NEW_PREFIX = "https://f005.backblazeb2.com/file/chainmaker-uploads";

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db("chainmaker");

const images = db.collection("images");
const all = await images.find({ path: { $regex: `^${OLD_PREFIX.replace(/\./g, "\\.")}` } }).toArray();

console.log(`Found ${all.length} images with old URL prefix.`);

let updated = 0;
for (const img of all) {
  const newPath = img.path.replace(OLD_PREFIX, NEW_PREFIX);
  await images.updateOne({ _id: img._id }, { $set: { path: newPath } });
  updated++;
}

console.log(`Updated ${updated} image records.`);
await client.close();
