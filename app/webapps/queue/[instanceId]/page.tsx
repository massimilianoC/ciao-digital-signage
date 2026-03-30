import { notFound } from "next/navigation";

import QueueDisplayApp from "@/webapps/queue/src/QueueDisplayApp";
import QueueKioskApp from "@/webapps/queue/src/QueueKioskApp";
import QueueRemoteApp from "@/webapps/queue/src/QueueRemoteApp";
import QueueWaitingListApp from "@/webapps/queue/src/QueueWaitingListApp";
import { buildInstanceChannelKey, buildQueueChannelKey } from "@/lib/realtime/webapp-events";
import { getQueueAggregateForPublicAccess } from "@/lib/services/queue-connector.service";
import { getQueueDatasetById } from "@/lib/services/queue-connector.service";

interface Props {
    params: Promise<{ instanceId: string }>;
    searchParams: Promise<{ token?: string; mode?: string }>;
}

export default async function QueuePlayerPage({ params, searchParams }: Props) {
    const { instanceId } = await params;
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
                <p className="text-red-400 text-lg">Token di accesso mancante.</p>
            </div>
        );
    }

    if (!instanceId) return notFound();

    const aggregate = await getQueueAggregateForPublicAccess(instanceId, token);
    if (!aggregate) return notFound();

    const mode = aggregate.config.mode === "display" ? "queue" : aggregate.config.mode;

    const kioskQueueNames = mode === "kiosk"
        ? await Promise.all(
            (aggregate.config.kioskDatasetIds ?? []).map(async (datasetId) => {
                const dataset = await getQueueDatasetById(String(aggregate.instance.orgId), datasetId);
                const config = (dataset?.config ?? {}) as Record<string, unknown>;
                return typeof config.queueName === "string" ? config.queueName : null;
            }),
        )
        : [];

    const primaryQueueName = aggregate.queueData?.queueName ?? aggregate.config.datasetId;
    const channelKeys = mode === "kiosk"
        ? [
            buildInstanceChannelKey(instanceId),
            ...kioskQueueNames
                .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
                .map((queueName) => buildQueueChannelKey(queueName.toLowerCase())),
        ]
        : [buildInstanceChannelKey(instanceId), buildQueueChannelKey(primaryQueueName.toLowerCase())];

    if (mode === "remote") {
        return <QueueRemoteApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    if (mode === "waiting-list") {
        return <QueueWaitingListApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    if (mode === "kiosk") {
        return <QueueKioskApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
    }

    return <QueueDisplayApp instanceId={instanceId} token={token} channelKeys={channelKeys} />;
}
