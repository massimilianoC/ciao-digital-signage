import { createServer } from "node:net";
import { execSync } from "node:child_process";
import { spawn } from "node:child_process";

const preferredPort = Number(process.env.PORT || 3100);
const host = process.env.HOSTNAME || "localhost";
const shouldKillOnConflict = process.env.NO_KILL_PORT !== "1";

function isPortFree(port) {
    return new Promise((resolve) => {
        const tester = createServer()
            .once("error", () => resolve(false))
            .once("listening", () => {
                tester.close(() => resolve(true));
            })
            .listen(port, "127.0.0.1");
    });
}

function findListeningPidWindows(port) {
    try {
        const cmd = `powershell -NoProfile -Command \"(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)\"`;
        const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        const pid = Number(out);
        return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

function killPidWindows(pid) {
    try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: ["ignore", "pipe", "pipe"] });
        return true;
    } catch {
        return false;
    }
}

async function findAlternativePort(startPort) {
    for (let port = startPort + 1; port <= startPort + 20; port += 1) {
        if (await isPortFree(port)) {
            return port;
        }
    }
    return null;
}

function printLinks(baseUrl) {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(" Ciao MVP links");
    console.log("════════════════════════════════════════════════════════════");
    console.log(` Health API:            ${baseUrl}/api/health`);
    console.log(` Login:                 ${baseUrl}/login`);
    console.log(` Dashboard:             ${baseUrl}/dashboard`);
    console.log(` Content Library:       ${baseUrl}/content`);
    console.log(` Playlists:             ${baseUrl}/playlists`);
    console.log(` Screens:               ${baseUrl}/screens`);
    console.log(` Register Screen (CMS): ${baseUrl}/screens/new`);
    console.log(` Schedules:             ${baseUrl}/schedules`);
    console.log(` Pairing Code API:      ${baseUrl}/api/screens/generate-code`);
    console.log("════════════════════════════════════════════════════════════\n");
}

async function waitForHealth(baseUrl, timeoutMs = 45000) {
    const startedAt = Date.now();
    let attempts = 0;

    while (Date.now() - startedAt < timeoutMs) {
        attempts += 1;
        try {
            const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
            if (response.ok) {
                return { ok: true, attempts, elapsedMs: Date.now() - startedAt };
            }
        } catch {
            // Server still booting.
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
    }

    return { ok: false, attempts, elapsedMs: Date.now() - startedAt };
}

async function main() {
    let selectedPort = preferredPort;

    const free = await isPortFree(preferredPort);
    if (!free) {
        console.warn(`⚠ Port ${preferredPort} is already in use.`);

        let released = false;
        if (process.platform === "win32" && shouldKillOnConflict) {
            const pid = findListeningPidWindows(preferredPort);
            if (pid) {
                console.warn(`→ Trying to stop PID ${pid} on port ${preferredPort}...`);
                released = killPidWindows(pid);
            }
            if (released) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        const freeAfterKill = await isPortFree(preferredPort);
        if (!freeAfterKill) {
            const alt = await findAlternativePort(preferredPort);
            if (!alt) {
                console.error(`❌ Could not free port ${preferredPort} and no alternative port found.`);
                process.exit(1);
            }
            selectedPort = alt;
            console.warn(`→ Using alternative port ${selectedPort}.`);
        } else {
            console.warn(`→ Port ${preferredPort} released, continuing.`);
        }
    }

    const baseUrl = `http://${host}:${selectedPort}`;
    console.log(`\n[dev-start] Starting server process on ${baseUrl}...`);

    const child = spawn(process.execPath, ["server.js"], {
        stdio: "inherit",
        env: {
            ...process.env,
            PORT: String(selectedPort),
            HOSTNAME: host,
        },
    });

    console.log(`[dev-start] Waiting for service health at ${baseUrl}/api/health`);
    const health = await waitForHealth(baseUrl);

    if (health.ok) {
        console.log(`[dev-start] Service ONLINE (${health.elapsedMs}ms, ${health.attempts} checks).`);
        printLinks(baseUrl);
    } else {
        console.warn(
            `[dev-start] Service not confirmed online after ${health.elapsedMs}ms (${health.attempts} checks). Check server logs above.`,
        );
    }

    child.on("exit", (code) => {
        process.exit(code ?? 0);
    });
}

main().catch((error) => {
    console.error("❌ dev-start failed:", error);
    process.exit(1);
});
