import { notFound } from "next/navigation";

import QueuePlusDisplayApp from "@/webapps/queue-plus/src/QueuePlusDisplayApp";
import QueuePlusKioskApp from "@/webapps/queue-plus/src/QueuePlusKioskApp";
import QueuePlusRemoteApp from "@/webapps/queue-plus/src/QueuePlusRemoteApp";
import QueuePlusWaitingListApp from "@/webapps/queue-plus/src/QueuePlusWaitingListApp";
import { buildInstanceChannelKey, buildQueueChannelKey } from "@/lib/realtime/webapp-events";
import { getQueuePlusAggregateForPublicAccess } from "@/lib/services/queue-plus.service";
import { getQueuePlusDatasetById } from "@/lib/services/queue-plus.service";

function safeBuildQueueChannelKey(queueName: string): string | null {
    try {
        return buildQueueChannelKey(queueName.toLowerCase());
    } catch {
        return null;
    }
}

interface Props {
    params: Promise<{ instanceId: string }>;
    searchParams: Promise<{ token?: string; mode?: string }>;
}

export default async function QueuePlusPlayerPage({ params, searchParams }: Props) {
    const { instanceId } = await params;
    const { token } = await searchParams;

    if (!token) {
        return <div className="flex h-screen items-center justify-center bg-gray-950 text-white"><p className="text-lg text-red-400">Token di accesso mancante.</p></div>;
    }

    if (!instanceId) return notFound();

    const aggregate = await getQueuePlusAggregateForPublicAccess(instanceId, token);
    if (!aggregate) return notFound();

    const mode = aggregate.config.mode === "display" ? "queue" : aggregate.config.mode;

    const kioskQueueNames = mode === "kiosk"
        ? await Promise.all(
            (aggregate.config.kioskDatasetIds ?? []).map(async (datasetId) => {
                const dataset = await getQueuePlusDatasetById(String(aggregate.instance.orgId), datasetId);
                const config = (dataset?.config ?? {}) as Record<string, unknown>;
                return typeof config.queueName === "string" ? config.queueName : null;
            }),
        )
        : [];

    const remoteQueueNames = mode === "remote"
        ? await Promise.all(
            ([aggregate.config.datasetId, ...(aggregate.config.allowedDatasetIds ?? [])]).map(async (datasetId) => {
                const dataset = await getQueuePlusDatasetById(String(aggregate.instance.orgId), datasetId);
                const config = (dataset?.config ?? {}) as Record<string, unknown>;
                return typeof config.queueName === "string" ? config.queueName : null;
            }),
        )
        : [];

    const waitingListQueueNames = mode === "waiting-list"
        ? await Promise.all(
            ([aggregate.config.datasetId, ...(aggregate.config.waitingListDatasetIds ?? [])]).map(async (datasetId) => {
                const dataset = await getQueuePlusDatasetById(String(aggregate.instance.orgId), datasetId);
                const config = (dataset?.config ?? {}) as Record<string, unknown>;
                return typeof config.queueName === "string" ? config.queueName : null;
            }),
        )
        : [];

    const primaryQueueName = aggregate.queueData?.queueName ?? aggregate.config.datasetId;
    const kioskChannels = kioskQueueNames
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .map((queueName) => safeBuildQueueChannelKey(queueName))
        .filter((entry): entry is string => entry !== null);
    const remoteChannels = remoteQueueNames
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .map((queueName) => safeBuildQueueChannelKey(queueName))
        .filter((entry): entry is string => entry !== null);
    const waitingListChannels = waitingListQueueNames
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .map((queueName) => safeBuildQueueChannelKey(queueName))
        .filter((entry): entry is string => entry !== null);
    const primaryChannel = safeBuildQueueChannelKey(primaryQueueName.toLowerCase());

    const channelKeys = mode === "kiosk"
        ? [buildInstanceChannelKey(instanceId), ...kioskChannels]
        : mode === "remote"
            ? [buildInstanceChannelKey(instanceId), ...remoteChannels]
            : mode === "waiting-list"
                ? [buildInstanceChannelKey(instanceId), ...waitingListChannels]
                : [buildInstanceChannelKey(instanceId), ...(primaryChannel ? [primaryChannel] : [])];

    if (mode === "remote") {
        return <QueuePlusRemoteApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    if (mode === "waiting-list") {
        return <QueuePlusWaitingListApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    if (mode === "kiosk") {
        return <QueuePlusKioskApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    return <QueuePlusDisplayApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
}
