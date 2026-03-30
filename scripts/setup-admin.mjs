import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao?replicaSet=rs0";

const c = new MongoClient(MONGODB_URI);
await c.connect();
const db = c.db();

// 1. Promote to super-admin + verify email
const r = await db.collection("user").updateOne(
    { email: "admin@ciao.local" },
    { $set: { role: "super-admin", emailVerified: true } }
);
console.log("User updated:", r.modifiedCount);

// 2. Ensure org exists
const orgExists = await db.collection("organization").findOne({ slug: "ciao-demo" });
if (!orgExists) {
    const user = await db.collection("user").findOne({ email: "admin@ciao.local" });
    const orgId = new ObjectId();
    await db.collection("organization").insertOne({
        _id: orgId,
        name: "Ciao Demo",
        slug: "ciao-demo",
        createdAt: new Date(),
        metadata: "",
    });
    await db.collection("member").insertOne({
        _id: new ObjectId(),
        organizationId: orgId.toString(),
        userId: user._id.toString(),
        role: "owner",
        createdAt: new Date(),
    });
    console.log("Created org Ciao Demo + owner member");
} else {
    console.log("Org already exists:", orgExists._id);
}

// 3. Ensure OrgMeta exists
const user = await db.collection("user").findOne({ email: "admin@ciao.local" });
const org = await db.collection("organization").findOne({ slug: "ciao-demo" });
const metaExists = await db.collection("orgmetas").findOne({ orgId: org._id });
if (!metaExists) {
    await db.collection("orgmetas").insertOne({
        orgId: org._id,
        maxScreens: 100,
        maxStorage: 10737418240, // 10GB
        createdAt: new Date(),
    });
    console.log("Created OrgMeta");
} else {
    console.log("OrgMeta exists");
}

await c.close();
console.log("\n✅ Admin setup complete:");
console.log("   Email: admin@ciao.local");
console.log("   Password: Admin123!");
console.log("   Role: super-admin");
console.log("   Org: Ciao Demo");
