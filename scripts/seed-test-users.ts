import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";
const ORG_NAME = process.env.TEST_ORG_NAME ?? "Ciao Demo";
const ORG_SLUG = process.env.TEST_ORG_SLUG ?? "ciao-demo";

type TestUser = {
    key: string;
    name: string;
    email: string;
    password: string;
    appRole: "super-admin" | "admin" | "member";
    orgMemberRole: "owner" | "member";
};

const TEST_USERS: TestUser[] = [
    {
        key: "SUPER_ADMIN",
        name: "Super Admin",
        email: process.env.SUPER_ADMIN_EMAIL ?? "admin@ciao.local",
        password: process.env.SUPER_ADMIN_PASSWORD ?? "Admin123!",
        appRole: "super-admin",
        orgMemberRole: "owner",
    },
    {
        key: "ORG_ADMIN",
        name: "Org Admin",
        email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@ciao.local",
        password: process.env.ORG_ADMIN_PASSWORD ?? "Admin123!",
        appRole: "admin",
        orgMemberRole: "owner",
    },
    {
        key: "ORG_MEMBER",
        name: "Org Member",
        email: process.env.ORG_MEMBER_EMAIL ?? "org-member@ciao.local",
        password: process.env.ORG_MEMBER_PASSWORD ?? "Admin123!",
        appRole: "member",
        orgMemberRole: "member",
    },
];

async function signUpIfMissing(user: TestUser): Promise<void> {
    const payload = { email: user.email, password: user.password, name: user.name };
    const resp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: BASE_URL,
            referer: `${BASE_URL}/register`,
        },
        body: JSON.stringify(payload),
    });

    if (resp.ok) {
        console.log(`✅ sign-up ok: ${user.email}`);
        return;
    }

    const raw = await resp.text();
    const alreadyExists = /exist|already|duplicate|taken/i.test(raw);
    if (alreadyExists) {
        console.log(`ℹ️ user exists: ${user.email}`);
        return;
    }

    throw new Error(`Sign-up failed for ${user.email}: ${resp.status} ${raw}`);
}

async function ensureOrg(db: ReturnType<MongoClient["db"]>) {
    const orgsCol = db.collection("organization");
    const orgMetaCol = db.collection("orgmetas");
    let org = await orgsCol.findOne({ slug: ORG_SLUG });

    if (!org) {
        const orgId = new ObjectId();
        org = {
            _id: orgId,
            name: ORG_NAME,
            slug: ORG_SLUG,
            logo: null,
            metadata: null,
            createdAt: new Date(),
        };
        await orgsCol.insertOne(org);
        console.log(`✅ created org: ${ORG_NAME} (${ORG_SLUG})`);
    } else {
        console.log(`ℹ️ org exists: ${ORG_NAME} (${ORG_SLUG})`);
    }

    const orgId = org._id.toString();
    const existingMeta = await orgMetaCol.findOne({ betterAuthOrgId: orgId });
    if (!existingMeta) {
        await orgMetaCol.insertOne({
            _id: new ObjectId(),
            betterAuthOrgId: orgId,
            status: "active",
            quota: { maxScreens: 100, maxStorageBytes: 10_737_418_240 },
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log("✅ created orgmeta");
    }

    return orgId;
}

async function ensureRoleAndMembership(
    db: ReturnType<MongoClient["db"]>,
    orgId: string,
    user: TestUser,
): Promise<void> {
    const usersCol = db.collection("user");
    const membersCol = db.collection("member");

    const dbUser = await usersCol.findOne({ email: user.email });
    if (!dbUser) {
        throw new Error(`User not found after sign-up: ${user.email}`);
    }

    await usersCol.updateOne(
        { _id: dbUser._id },
        {
            $set: {
                role: user.appRole,
                emailVerified: true,
                updatedAt: new Date(),
            },
        },
    );

    const existingMember = await membersCol.findOne({ organizationId: orgId, userId: dbUser._id.toString() });
    if (!existingMember) {
        await membersCol.insertOne({
            _id: new ObjectId(),
            organizationId: orgId,
            userId: dbUser._id.toString(),
            role: user.orgMemberRole,
            createdAt: new Date(),
        });
        console.log(`✅ membership created: ${user.email} (${user.orgMemberRole})`);
        return;
    }

    if (existingMember.role !== user.orgMemberRole) {
        await membersCol.updateOne(
            { _id: existingMember._id },
            { $set: { role: user.orgMemberRole } },
        );
        console.log(`✅ membership updated: ${user.email} (${user.orgMemberRole})`);
    }
}

async function main() {
    console.log("🔎 Verifying server availability...");
    const healthResp = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthResp || !healthResp.ok) {
        throw new Error(`Server not reachable at ${BASE_URL}. Start with: node server.js`);
    }

    console.log("🔐 Creating/updating test users via auth API...");
    for (const user of TEST_USERS) {
        await signUpIfMissing(user);
    }

    console.log("🗄️ Aligning roles/memberships in MongoDB...");
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    const orgId = await ensureOrg(db);
    for (const user of TEST_USERS) {
        await ensureRoleAndMembership(db, orgId, user);
    }

    await client.close();

    console.log("\n" + "═".repeat(64));
    console.log(" TEST USERS READY");
    console.log("═".repeat(64));
    console.log(` ORG: ${ORG_NAME} (${ORG_SLUG})`);
    for (const user of TEST_USERS) {
        console.log(` ${user.key}: ${user.email} / ${user.password}  [appRole=${user.appRole}]`);
    }
    console.log("═".repeat(64) + "\n");
}

main().catch((error) => {
    console.error("❌ seed-test-users failed:", error);
    process.exit(1);
});
