import { expect, test } from "@playwright/test";

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

test.describe("Webapps Dataset Sandboxed Flow @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("google-calendar app-managed dataset path is exposed through common dataset API", async ({ page }) => {
        const suffix = uniqueSuffix();

        const createRes = await page.request.post("/api/webapps/google-calendar/sources", {
            data: {
                name: `E2E Calendar Source ${suffix}`,
                type: "ics-url",
                timezone: "Europe/Rome",
                refreshSeconds: 300,
                icsUrl: "https://calendar.google.com/calendar/ical/en.italian%23holiday%40group.v.calendar.google.com/public/basic.ics",
                tags: ["e2e", "dataset"],
            },
        });
        expect(createRes.ok()).toBe(true);

        const sourceBody = (await createRes.json()) as { source?: { id?: string } };
        const sourceId = sourceBody.source?.id;
        expect(sourceId).toBeTruthy();

        const datasetsRes = await page.request.get("/api/webapps/datasets?appId=google-calendar");
        expect(datasetsRes.ok()).toBe(true);
        const datasetsBody = (await datasetsRes.json()) as { datasets?: Array<{ datasetId: string }> };
        const found = (datasetsBody.datasets ?? []).some((dataset) => dataset.datasetId === sourceId);
        expect(found).toBe(true);

        const validateRes = await page.request.post(
            `/api/webapps/datasets/${encodeURIComponent(sourceId || "")}/validate?appId=google-calendar`,
        );
        expect(validateRes.ok()).toBe(true);
    });

    test("queue dataset-first flow uses explicit datasetId and common dataset API", async ({ page }) => {
        const suffix = uniqueSuffix();
        const queueName = `e2e-queue-${suffix}`;

        const createDatasetRes = await page.request.post("/api/webapps/datasets?appId=queue", {
            data: {
                name: queueName,
                datasetKind: "queue-shared-state",
                storageMode: "app-collection",
                editorMode: "raw-json",
                config: {
                    queueName,
                    queueType: "numeric",
                    prefix: "",
                    maxWaiting: 50,
                    bookingEnabled: true,
                    serviceMode: "reservation",
                    roundRobinMaxNumber: 99,
                },
            },
        });
        expect(createDatasetRes.ok()).toBe(true);
        const createDatasetBody = (await createDatasetRes.json()) as { dataset?: { datasetId?: string } };
        const datasetId = createDatasetBody.dataset?.datasetId;
        expect(datasetId).toBeTruthy();

        const createRes = await page.request.post("/api/webapps/queue", {
            data: {
                name: `E2E Queue ${suffix}`,
                settings: {
                    mode: "queue",
                    datasetId,
                    queueType: "numeric",
                    serviceMode: "reservation",
                    bookingEnabled: true,
                    roundRobinMaxNumber: 99,
                    maxWaiting: 50,
                    showWaitingCount: true,
                    waitingListLimit: 8,
                    accentColor: "#2563EB",
                },
                defaultDurationMs: 30000,
            },
        });
        expect(createRes.ok()).toBe(true);

        const datasetsRes = await page.request.get("/api/webapps/datasets?appId=queue");
        expect(datasetsRes.ok()).toBe(true);
        const datasetsBody = (await datasetsRes.json()) as {
            datasets?: Array<{ datasetId: string; readOnly: boolean; managedBy: string }>;
        };

        const row = (datasetsBody.datasets ?? []).find((dataset) => dataset.datasetId === datasetId);
        expect(row).toBeTruthy();
        expect(row?.readOnly).toBe(false);
        expect(row?.managedBy).toBe("sdk");

        const validateRes = await page.request.post(
            `/api/webapps/datasets/${encodeURIComponent(datasetId || "")}/validate?appId=queue`,
        );
        expect(validateRes.ok()).toBe(true);
        const validateBody = (await validateRes.json()) as { valid?: boolean };
        expect(validateBody.valid).toBe(true);
    });

    test("wordpress-link sdk-managed dataset supports CRUD and instance binding", async ({ page }) => {
        const suffix = uniqueSuffix();

        const createInstanceRes = await page.request.post("/api/webapps/wordpress-link", {
            data: {
                name: `E2E WordpressLink ${suffix}`,
                defaultDurationMs: 45000,
                settings: {
                    sourceKind: "wordpress-posts",
                    authMode: "none",
                    baseUrl: "https://wordpress.org",
                    title: "E2E Catalog",
                    itemsPerPage: 12,
                    order: "desc",
                    orderby: "date",
                    refreshSeconds: 180,
                    viewMode: "grid",
                    autoScrollMode: "none",
                    templatePreset: "catalog-grid-rich",
                    taxonomyFilters: [],
                    fieldBindings: {
                        title: "title.rendered",
                        subtitle: "date",
                        description: "excerpt.rendered",
                        image: "_embedded.wp:featuredmedia[].source_url",
                        chips: "_embedded.wp:term[]",
                        ctaLabel: "title.rendered",
                        ctaHref: "link",
                    },
                    theme: {
                        accentColor: "#0EA5E9",
                        cardStyle: "soft",
                        detailPanelMode: "sidebar",
                        galleryDescriptionMax: 96,
                        galleryChipLimit: 6,
                    },
                },
            },
        });
        expect(createInstanceRes.ok()).toBe(true);
        const instanceBody = (await createInstanceRes.json()) as { instanceId?: string };
        const instanceId = instanceBody.instanceId;
        expect(instanceId).toBeTruthy();

        const createDatasetRes = await page.request.post("/api/webapps/datasets?appId=wordpress-link", {
            data: {
                name: `E2E WPL Dataset ${suffix}`,
                datasetKind: "wordpress-source",
                storageMode: "inline",
                editorMode: "raw-json",
                config: {
                    sourceKind: "wordpress-posts",
                    baseUrl: "https://wordpress.org",
                },
                summary: {
                    e2e: true,
                },
                tags: ["e2e"],
            },
        });
        expect(createDatasetRes.ok()).toBe(true);

        const datasetBody = (await createDatasetRes.json()) as { dataset?: { datasetId?: string } };
        const datasetId = datasetBody.dataset?.datasetId;
        expect(datasetId).toBeTruthy();

        const bindRes = await page.request.patch(
            `/api/webapps/instances/${encodeURIComponent(instanceId || "")}/datasets`,
            {
                data: {
                    bindings: [
                        {
                            datasetId,
                            role: "primary",
                            required: true,
                            order: 0,
                        },
                    ],
                },
            },
        );
        expect(bindRes.ok()).toBe(true);

        const bindingsRes = await page.request.get(
            `/api/webapps/instances/${encodeURIComponent(instanceId || "")}/datasets`,
        );
        expect(bindingsRes.ok()).toBe(true);
        const bindingsBody = (await bindingsRes.json()) as {
            bindings?: Array<{ datasetId: string; role: string }>;
        };

        const linked = (bindingsBody.bindings ?? []).some(
            (binding) => binding.datasetId === datasetId && binding.role === "primary",
        );
        expect(linked).toBe(true);

        const validateRes = await page.request.post(
            `/api/webapps/datasets/${encodeURIComponent(datasetId || "")}/validate?appId=wordpress-link`,
        );
        expect(validateRes.ok()).toBe(true);

        const clearBindingsRes = await page.request.patch(
            `/api/webapps/instances/${encodeURIComponent(instanceId || "")}/datasets`,
            { data: { bindings: [] } },
        );
        expect(clearBindingsRes.ok()).toBe(true);

        const deleteRes = await page.request.delete(
            `/api/webapps/datasets/${encodeURIComponent(datasetId || "")}?appId=wordpress-link`,
        );
        expect(deleteRes.ok()).toBe(true);
    });
});
