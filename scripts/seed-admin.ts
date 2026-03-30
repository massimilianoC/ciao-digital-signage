/**
 * Seed script: creates a super-admin user + organization.
 *
 * Usage:  npx tsx scripts/seed-admin.ts
 *
 * - Connects directly to MongoDB (reads MONGODB_URI from .env.local)
 * - Creates user via better-auth API simulation (direct DB insert)
 * - Sets role to "super-admin", marks email as verified
 * - Creates a default organization + OrgMeta
 *
 * Safe to run multiple times — skips if user already exists.
 */

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import crypto from "node:crypto";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";
const ADMIN_EMAIL = "admin@ciao.local";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_NAME = "Super Admin";
const ORG_NAME = "Ciao Demo";
const ORG_SLUG = "ciao-demo";

async function hashPassword(password: string): Promise<string> {
    // better-auth uses scrypt by default
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
}

async function main() {
    console.log("🔌 Connecting to MongoDB...");
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    // ── 1. Check if admin already exists ──────────────────────────────────
    const usersCol = db.collection("user");
    const existing = await usersCol.findOne({ email: ADMIN_EMAIL });
    if (existing) {
        console.log(`✅ User ${ADMIN_EMAIL} already exists (id: ${existing._id})`);
        // Ensure role is set
        if (existing.role !== "super-admin") {
            await usersCol.updateOne(
                { _id: existing._id },
                { $set: { role: "super-admin", emailVerified: true } },
            );
            console.log("   → Updated role to super-admin");
        }
    } else {
        // ── 2. Create user ──────────────────────────────────────────────────
        const userId = new ObjectId();
        const now = new Date();
        await usersCol.insertOne({
            _id: userId,
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            emailVerified: true,
            role: "super-admin",
            createdAt: now,
            updatedAt: now,
        });
        console.log(`✅ Created user: ${ADMIN_EMAIL} (id: ${userId})`);

        // ── 3. Create account (email+password) ──────────────────────────────
        const accountsCol = db.collection("account");
        const hashedPassword = await hashPassword(ADMIN_PASSWORD);
        await accountsCol.insertOne({
            _id: new ObjectId(),
            userId: userId.toString(),
            providerId: "credential",
            accountId: userId.toString(),
            password: hashedPassword,
            createdAt: now,
            updatedAt: now,
        });
        console.log("   → Created credential account");
    }

    // ── 4. Ensure org exists ──────────────────────────────────────────────
    const orgsCol = db.collection("organization");
    let org = await orgsCol.findOne({ slug: ORG_SLUG });
    if (!org) {
        const orgId = new ObjectId();
        const adminUser =
            existing ?? (await usersCol.findOne({ email: ADMIN_EMAIL }));
        org = {
            _id: orgId,
            name: ORG_NAME,
            slug: ORG_SLUG,
            logo: null,
            metadata: null,
            createdAt: new Date(),
        };
        await orgsCol.insertOne(org);
        console.log(`✅ Created organization: ${ORG_NAME} (id: ${orgId})`);

        // Add admin as owner member
        const membersCol = db.collection("member");
        await membersCol.insertOne({
            _id: new ObjectId(),
            organizationId: orgId.toString(),
            userId: adminUser!._id.toString(),
            role: "owner",
            createdAt: new Date(),
        });
        console.log("   → Added admin as org owner");

        // Create OrgMeta sidecar
        const orgMetaCol = db.collection("orgmetas");
        const existingMeta = await orgMetaCol.findOne({
            betterAuthOrgId: orgId.toString(),
        });
        if (!existingMeta) {
            await orgMetaCol.insertOne({
                _id: new ObjectId(),
                betterAuthOrgId: orgId.toString(),
                status: "active",
                quota: { maxScreens: 50, maxStorageBytes: 10_737_418_240 },
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            console.log("   → Created OrgMeta");
        }
    } else {
        console.log(`✅ Organization "${ORG_NAME}" already exists (id: ${org._id})`);

        // ── Ensure member link is correct (re-link if userId changed) ───────
        const adminUser = existing ?? (await usersCol.findOne({ email: ADMIN_EMAIL }));
        const membersCol = db.collection("member");
        const currentMember = await membersCol.findOne({ organizationId: org._id.toString() });
        if (!currentMember) {
            await membersCol.insertOne({
                _id: new ObjectId(),
                organizationId: org._id.toString(),
                userId: adminUser!._id.toString(),
                role: "owner",
                createdAt: new Date(),
            });
            console.log("   → Added admin as org owner (was missing)");
        } else if (currentMember.userId !== adminUser!._id.toString()) {
            await membersCol.updateOne(
                { _id: currentMember._id },
                { $set: { userId: adminUser!._id.toString() } },
            );
            console.log(`   → Re-linked member: ${currentMember.userId} → ${adminUser!._id.toString()}`);
        } else {
            console.log("   → Member link is correct");
        }
    }

    // ── 5. Summary ────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(50));
    console.log("  Ciao Super-Admin Seed Complete");
    console.log("═".repeat(50));
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  Role:     super-admin`);
    console.log(`  Org:      ${ORG_NAME} (${ORG_SLUG})`);
    console.log("═".repeat(50));
    console.log("\n  Open http://localhost:3000/login to sign in\n");

    await client.close();
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
