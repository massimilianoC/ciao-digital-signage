import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import {
    deleteInstance,
    getInstanceAggregate,
    setInstanceName,
    setInstanceStatus,
    updateInstanceSettings,
} from "@/lib/sdk/webapp-instance.service";
import { getRegistryEntry } from "@/lib/sdk/webapp-registry";
import { listQueuePlusCatalogForOrg } from "@/lib/services/queue-plus.service";

function toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => String(entry)).filter(Boolean);
}

async function normalizeQueuePlusSettingsPatch(
    orgId: string,
    currentMode: unknown,
    patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const catalog = await listQueuePlusCatalogForOrg(orgId);
    const validDatasetIds = new Set(catalog.map((entry) => entry.datasetId));

    const normalized = { ...patch };
    normalized.serviceMode = "multigate";
    normalized.displayBindingMode = "remote-controlled";

    const effectiveMode = typeof patch.mode === "string" ? patch.mode : (typeof currentMode === "string" ? currentMode : "queue");

    if (typeof patch.datasetId === "string" && !validDatasetIds.has(patch.datasetId)) {
        delete normalized.datasetId;
    }

    if ("allowedDatasetIds" in patch) {
        normalized.allowedDatasetIds = toStringList(patch.allowedDatasetIds)
            .filter((datasetId) => validDatasetIds.has(datasetId));
    }

    if ("kioskDatasetIds" in patch) {
        normalized.kioskDatasetIds = toStringList(patch.kioskDatasetIds)
            .filter((datasetId) => validDatasetIds.has(datasetId));
    }

    if ("waitingListDatasetIds" in patch) {
        normalized.waitingListDatasetIds = toStringList(patch.waitingListDatasetIds)
            .filter((datasetId) => validDatasetIds.has(datasetId));
    }

    if (effectiveMode !== "kiosk") {
        delete normalized.ticketDeliveryMode;
        delete normalized.enableDigitalTicket;
        delete normalized.printerProfile;
    }

    return normalized;
}

/** GET /api/webapps/instances/[instanceId] */
export const GET = withErrorHandler(
    async (req: NextRequest, { params }: { params: { instanceId: string } }) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { instanceId } = await params;
        const agg = await getInstanceAggregate(sess.orgId, instanceId);
        const registryEntry = getRegistryEntry(agg.instance.appId as WebAppId);

        const playerUrl = registryEntry
            ? registryEntry.playerPath(instanceId, agg.instance.publicToken)
            : null;

        return NextResponse.json({
            instanceId,
            appId: agg.instance.appId,
            name: agg.instance.name,
            status: agg.instance.status,
            publicToken: agg.instance.publicToken,
            contentId: agg.instance.contentId ? String(agg.instance.contentId) : null,
            settings: agg.settings,
            health: agg.health,
            lastSyncAt: agg.lastSyncAt,
            playerUrl,
        });
    },
);

/** PATCH /api/webapps/instances/[instanceId] — update settings or status */
export const PATCH = withErrorHandler(
    async (req: NextRequest, { params }: { params: { instanceId: string } }) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { instanceId } = await params;
        const body = await req.json();

        if (body.status === "active" || body.status === "suspended") {
            await setInstanceStatus(sess.orgId, instanceId, body.status, sess.userId ?? "");
        }

        if (typeof body.name === "string" && body.name.trim()) {
            await setInstanceName(sess.orgId, instanceId, body.name, sess.userId ?? "");
        }

        if (body.settings && typeof body.settings === "object") {
            const aggregate = await getInstanceAggregate(sess.orgId, instanceId);
            let settingsPatch = body.settings as Record<string, unknown>;

            if (aggregate.instance.appId === "queue-plus") {
                settingsPatch = await normalizeQueuePlusSettingsPatch(
                    sess.orgId,
                    (aggregate.settings as Record<string, unknown>)?.mode,
                    settingsPatch,
                );
            }

            await updateInstanceSettings(
                sess.orgId,
                instanceId,
                sess.userId ?? "",
                settingsPatch,
            );
        }

        return NextResponse.json({ ok: true });
    },
);

/** DELETE /api/webapps/instances/[instanceId] */
export const DELETE = withErrorHandler(
    async (req: NextRequest, { params }: { params: { instanceId: string } }) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { instanceId } = await params;
        await deleteInstance(sess.orgId, instanceId);

        return NextResponse.json({ ok: true });
    },
);
