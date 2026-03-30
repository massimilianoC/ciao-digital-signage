/**
 * Reset Test Data Script
 *
 * Clears all domain/app collections from MongoDB while preserving auth data
 * (users, accounts, organizations, memberships, orgmetas, sessions).
 *
 * Use this to clean up accumulated test data after E2E test runs.
 *
 * Usage:
 *   npm run db:reset
 *   npx tsx scripts/reset-test-data.ts
 *
 * Safe: never deletes user/auth/org records.
 */

import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";

/**
 * Collections that hold domain/app data created by tests.
 * Mongoose pluralises model name to lowercase for collections without explicit names.
 */
const DOMAIN_COLLECTIONS = [
    // Content & media
    "contents",
    "playlists",
    "forceoverrides",
    // Screens & groups
    "screens",
    "groups",
    "pairingcodes",
    // Scheduling
    "schedules",
    // WebApp infrastructure
    "webapp_configs",
    "webapp_instances",
    "webapp_state",
    "webapp_secrets_refs",
    "webapp_datasets",
    "webapp_dataset_bindings",
    "webapp_queue_data",
    "webapp_calendar_sources",
];

/**
 * Collections that must NEVER be cleared — they hold auth state.
 * Listed here for documentation / safety reference only.
 */
const PRESERVED_COLLECTIONS = [
    "user",
    "account",
    "organization",
    "member",
    "orgmetas",
    "session",
    "verification",
    "jwks",
];

export async function resetTestData(uri = MONGODB_URI): Promise<void> {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    let cleared = 0;
    let skipped = 0;

    for (const name of DOMAIN_COLLECTIONS) {
        if (!existingNames.has(name)) {
            skipped++;
            continue;
        }
        const result = await db.collection(name).deleteMany({});
        console.log(`  ✓ ${name}: deleted ${result.deletedCount} documents`);
        cleared++;
    }

    if (skipped > 0) {
        console.log(`  (${skipped} collections not found — already empty or never created)`);
    }

    await client.close();
}

// ── CLI entry-point ──────────────────────────────────────────────────────────
async function main() {
    console.log("\n🗑️  Ciao — Reset Test Data");
    console.log("─".repeat(50));
    console.log("Preserving:", PRESERVED_COLLECTIONS.join(", "));
    console.log("─".repeat(50));

    await resetTestData();

    console.log("─".repeat(50));
    console.log("✅ Reset complete. DB is clean — only auth/org data remains.\n");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
});
