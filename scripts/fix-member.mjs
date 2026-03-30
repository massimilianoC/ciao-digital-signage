import { MongoClient } from "mongodb";

const client = new MongoClient("mongodb://localhost:27017/ciao?replicaSet=rs0");
await client.connect();
const db = client.db();

const user = await db.collection("user").findOne({ email: "admin@ciao.local" });
const org = await db.collection("organization").findOne({ slug: "ciao-demo" });

if (!user || !org) {
    console.error("User or org not found!");
    await client.close();
    process.exit(1);
}

const userId = user._id.toString();
const orgId = org._id.toString();
console.log("Fixing member: userId =>", userId, "orgId =>", orgId);

const result = await db.collection("member").updateMany(
    { organizationId: orgId },
    { $set: { userId } }
);
console.log("Updated members:", result.modifiedCount);

// Also ensure member exists (create if missing)
const existing = await db.collection("member").findOne({ organizationId: orgId, userId });
if (!existing) {
    const { ObjectId } = (await import("mongodb")).default ?? { ObjectId: null };
    await db.collection("member").insertOne({
        _id: new (await import("mongodb")).ObjectId().toString(),
        organizationId: orgId,
        userId,
        role: "owner",
        createdAt: new Date(),
    });
    console.log("Created new member document");
}

const members = await db.collection("member").find().toArray();
console.log("Members:", JSON.stringify(members, null, 2));

await client.close();
