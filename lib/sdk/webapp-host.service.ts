import { type WebAppId } from "@/lib/db/models/WebAppInstance";

export interface WebappDatasetSandboxContract {
    appId: WebAppId;
    sandboxed: true;
    manager: {
        mode: "sdk" | "app";
        route: string;
        customConfiguratorId: string;
        readOnly: boolean;
    };
    dataset: {
        supportsCrud: boolean;
        supportsBinding: boolean;
        bindingRoles: Array<"primary" | "secondary" | "fallback" | "overlay">;
    };
}

const CONTRACTS: Record<WebAppId, WebappDatasetSandboxContract> = {
    "google-calendar": {
        appId: "google-calendar",
        sandboxed: true,
        manager: {
            mode: "app",
            route: "/content/google-calendar/sources",
            customConfiguratorId: "google-calendar.sources-manager",
            readOnly: false,
        },
        dataset: {
            supportsCrud: false,
            supportsBinding: true,
            bindingRoles: ["primary", "fallback"],
        },
    },
    queue: {
        appId: "queue",
        sandboxed: true,
        manager: {
            mode: "sdk",
            route: "/webapps/queue/datasets",
            customConfiguratorId: "queue.dataset-manager",
            readOnly: false,
        },
        dataset: {
            supportsCrud: true,
            supportsBinding: false,
            bindingRoles: ["primary"],
        },
    },
    "queue-plus": {
        appId: "queue-plus",
        sandboxed: true,
        manager: {
            mode: "sdk",
            route: "/webapps/queue-plus/datasets",
            customConfiguratorId: "queue-plus.dataset-manager",
            readOnly: false,
        },
        dataset: {
            supportsCrud: true,
            supportsBinding: false,
            bindingRoles: ["primary"],
        },
    },
    "wordpress-link": {
        appId: "wordpress-link",
        sandboxed: true,
        manager: {
            mode: "sdk",
            route: "/webapps/wordpress-link/datasets",
            customConfiguratorId: "wordpress-link.dataset-editor",
            readOnly: false,
        },
        dataset: {
            supportsCrud: true,
            supportsBinding: true,
            bindingRoles: ["primary", "secondary", "fallback", "overlay"],
        },
    },
};

export function getWebappDatasetSandboxContract(appId: WebAppId): WebappDatasetSandboxContract {
    return CONTRACTS[appId];
}

export function listWebappDatasetSandboxContracts(): WebappDatasetSandboxContract[] {
    return Object.values(CONTRACTS);
}
