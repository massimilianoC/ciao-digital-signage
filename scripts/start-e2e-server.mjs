import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Guard against stale Next.js dev lock files left by interrupted runs.
const nextDevLock = resolve(process.cwd(), ".next", "dev", "lock");
rmSync(nextDevLock, { force: true });

await import("../server.js");
