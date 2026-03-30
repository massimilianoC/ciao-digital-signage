#!/usr/bin/env node
/**
 * kill-port.mjs
 * Frees PORT (default 3100) before starting the dev server.
 * Works on Windows (netstat / taskkill) and Unix (lsof / kill).
 */

import { execSync } from "node:child_process";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3100;

function killPort(port) {
    try {
        if (process.platform === "win32") {
            const output = execSync(`netstat -ano | findstr :${port}`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            const pids = new Set();
            for (const line of output.split("\n")) {
                const match = line.trim().match(/(\d+)$/);
                if (match) pids.add(match[1]);
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
                    console.log(`  killed PID ${pid}`);
                } catch {
                    // already exited
                }
            }
        } else {
            const raw = execSync(`lsof -ti:${port}`, {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            }).trim();
            for (const pid of raw.split("\n").filter(Boolean)) {
                try {
                    execSync(`kill -9 ${pid}`, { stdio: "pipe" });
                    console.log(`  killed PID ${pid}`);
                } catch {
                    // already exited
                }
            }
        }
    } catch {
        // nothing listening on that port — no action needed
    }
}

console.log(`Freeing port ${PORT}...`);
killPort(PORT);
console.log(`Port ${PORT} ready.`);
