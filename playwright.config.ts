import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const E2E_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false, // sequential — tests depend on auth state
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: "html",
    timeout: 30_000,
    globalSetup: "./e2e/global-setup.ts",

    use: {
        baseURL: E2E_BASE_URL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    /* Starts server if not running, reuses it if already running */
    webServer: {
        command: "node scripts/start-e2e-server.mjs",
        url: `${E2E_BASE_URL}/api/health`,
        env: {
            ...process.env,
            PORT: E2E_PORT,
            SCREEN_WARNING_AFTER_MS: process.env.SCREEN_WARNING_AFTER_MS ?? "3000",
            SCREEN_DISCONNECTED_AFTER_MS: process.env.SCREEN_DISCONNECTED_AFTER_MS ?? "8000",
        },
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
