import { expect, test } from "@playwright/test";

interface QueueCreateResponse {
    instanceId: string;
    playerUrl: string;
    mode: string;
    queueName: string;
}

function extractToken(url: string): string {
    const parsed = new URL(url, "http://localhost:3100");
    return parsed.searchParams.get("token") ?? "";
}

test.describe("Queue modes and kiosk flow @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("creates queue/remote/waiting-list/kiosk and validates control flow", async ({ page }) => {
        const stamp = Date.now();
        const queueName = `sportello-${stamp}`;

        const sharedSettings = {
            queueName,
            queueType: "numeric",
            maxWaiting: 20,
            showWaitingCount: true,
            accentColor: "#2563EB",
            serviceMode: "round-robin",
            bookingEnabled: true,
            roundRobinMaxNumber: 9,
            waitingListLimit: 6,
        };

        async function createInstance(mode: "queue" | "remote" | "waiting-list" | "kiosk") {
            const payload = {
                name: `queue-${mode}-${stamp}`,
                settings: {
                    ...sharedSettings,
                    mode,
                    queueName: mode === "kiosk" ? `kiosk-${stamp}` : queueName,
                    kioskQueueNames: mode === "kiosk" ? [queueName] : undefined,
                },
                defaultDurationMs: 30_000,
            };

            const res = await page.request.post("/api/webapps/queue", { data: payload });
            expect(res.ok()).toBe(true);
            return (await res.json()) as QueueCreateResponse;
        }

        const queueInstance = await createInstance("queue");
        const remoteInstance = await createInstance("remote");
        const waitingListInstance = await createInstance("waiting-list");
        const kioskInstance = await createInstance("kiosk");

        const remoteToken = extractToken(remoteInstance.playerUrl);
        const waitingToken = extractToken(waitingListInstance.playerUrl);
        const kioskToken = extractToken(kioskInstance.playerUrl);

        expect(remoteToken).not.toBe("");
        expect(waitingToken).not.toBe("");
        expect(kioskToken).not.toBe("");

        // Remote issues two tickets, then advances once
        const issueRes = await page.request.post(
            `/api/public/webapps/queue/${remoteInstance.instanceId}/control?token=${encodeURIComponent(remoteToken)}`,
            { data: { action: "issue" } },
        );
        expect(issueRes.ok()).toBe(true);

        const issueRes2 = await page.request.post(
            `/api/public/webapps/queue/${remoteInstance.instanceId}/control?token=${encodeURIComponent(remoteToken)}`,
            { data: { action: "issue" } },
        );
        expect(issueRes2.ok()).toBe(true);

        const advanceRes = await page.request.post(
            `/api/public/webapps/queue/${remoteInstance.instanceId}/control?token=${encodeURIComponent(remoteToken)}`,
            { data: { action: "advance" } },
        );
        expect(advanceRes.ok()).toBe(true);

        const waitingStateRes = await page.request.get(
            `/api/public/webapps/queue/${waitingListInstance.instanceId}/state?token=${encodeURIComponent(waitingToken)}`,
        );
        expect(waitingStateRes.ok()).toBe(true);
        const waitingState = await waitingStateRes.json();
        expect(waitingState.mode).toBe("waiting-list");
        expect(waitingState.currentServing).toBe("1");
        expect(waitingState.waitingCount).toBe(1);

        // Kiosk issues on the shared queue
        const kioskIssueRes = await page.request.post(
            `/api/public/webapps/queue/${kioskInstance.instanceId}/control?token=${encodeURIComponent(kioskToken)}`,
            { data: { action: "issueForQueue", queueName } },
        );
        expect(kioskIssueRes.ok()).toBe(true);

        const queueStateRes = await page.request.get(
            `/api/public/webapps/queue/${queueInstance.instanceId}/state?token=${encodeURIComponent(extractToken(queueInstance.playerUrl))}`,
        );
        expect(queueStateRes.ok()).toBe(true);
        const queueState = await queueStateRes.json();
        expect(queueState.mode).toBe("queue");
        expect(queueState.waitingCount).toBe(2);
    });
});
