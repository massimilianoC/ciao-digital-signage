/**
 * Playwright Global Teardown
 *
 * Runs once after the entire test suite completes.
 * Removes ONLY the domain records that belong to the E2E test organization
 * (identified by slug TEST_ORG_SLUG, default "ciao-demo").
 *
 * Records owned by other organizations are NEVER touched.
 * Auth data (users, org, sessions) is preserved.
 *
 * Set E2E_SKIP_TEARDOWN=1 to disable (e.g. when debugging a failed run
 * and you need to inspect the DB state).
 */
import type { FullConfig } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";

/**
 * Collections where every document has an `orgId: ObjectId` field.
 * Only records matching the test org's ObjectId are deleted.
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
    "webapp_queue_plus_data",
    "webapp_queue_plus_tickets",
    "webapp_calendar_sources",
];

export default async function globalTeardown(_config: FullConfig) {
    if (process.env.E2E_SKIP_TEARDOWN === "1") {
        console.log("[teardown] E2E_SKIP_TEARDOWN=1 → skipping DB cleanup");
        return;
    }

    const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";
    const testOrgSlug = process.env.TEST_ORG_SLUG ?? "ciao-demo";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();

        // ── Resolve the test org's ObjectId by slug ──────────────────────────
        const org = await db.collection("organization").findOne({ slug: testOrgSlug });
        if (!org) {
            console.warn(
                `[teardown] Test org with slug "${testOrgSlug}" not found — skipping domain cleanup`,
            );
            return;
        }
        const testOrgObjectId = new ObjectId(org._id.toString());
        const filter = { orgId: testOrgObjectId };

        // ── Delete only records owned by the test org ────────────────────────
        const existing = await db.listCollections().toArray();
        const existingNames = new Set(existing.map((c) => c.name));

        let total = 0;
        for (const name of DOMAIN_COLLECTIONS) {
            if (!existingNames.has(name)) continue;
            const result = await db.collection(name).deleteMany(filter);
            if (result.deletedCount > 0) {
                console.log(`[teardown]   ${name}: removed ${result.deletedCount}`);
            }
            total += result.deletedCount;
        }

        console.log(
            `[teardown] DB cleanup complete — ${total} test records removed (org: ${testOrgSlug} / ${testOrgObjectId})`,
        );
    } catch (err) {
        // Log but don't fail the test run — teardown errors are non-blocking
        console.warn("[teardown] DB cleanup failed (non-fatal):", err);
    } finally {
        await client.close();
    }
}
