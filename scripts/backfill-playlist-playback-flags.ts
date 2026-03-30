import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";

async function main() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    try {
        const db = client.db();
        const playlists = db.collection("playlists");

        const loopBackfill = await playlists.updateMany(
            { loop: { $exists: false } },
            { $set: { loop: true } },
        );

        const stopOnLastItemBackfill = await playlists.updateMany(
            { stopOnLastItem: { $exists: false } },
            { $set: { stopOnLastItem: false } },
        );

        const total = await playlists.countDocuments();
        const withFlags = await playlists.countDocuments({
            loop: { $exists: true },
            stopOnLastItem: { $exists: true },
        });

        console.log("Playlist flags backfill completed");
        console.log(`- loop modified: ${loopBackfill.modifiedCount}`);
        console.log(`- stopOnLastItem modified: ${stopOnLastItemBackfill.modifiedCount}`);
        console.log(`- playlists total: ${total}`);
        console.log(`- playlists with both flags: ${withFlags}`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error("Playlist flags backfill failed", error);
    process.exit(1);
});
