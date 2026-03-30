import { describe, expect, it } from "vitest";

import {
    getWebappDatasetSandboxContract,
    listWebappDatasetSandboxContracts,
} from "@/lib/sdk/webapp-host.service";

describe("webapp-host.service dataset sandbox contracts", () => {
    it("lists contracts for all supported webapps", () => {
        const contracts = listWebappDatasetSandboxContracts();
        const appIds = contracts.map((contract) => contract.appId).sort();
        expect(appIds).toEqual(["google-calendar", "queue", "queue-plus", "wordpress-link"]);
    });

    it("google-calendar uses app-managed custom configurator", () => {
        const contract = getWebappDatasetSandboxContract("google-calendar");
        expect(contract.sandboxed).toBe(true);
        expect(contract.manager.mode).toBe("app");
        expect(contract.manager.customConfiguratorId).toBe("google-calendar.sources-manager");
        expect(contract.dataset.supportsBinding).toBe(true);
    });

    it("queue is sdk-managed and supports dataset CRUD", () => {
        const contract = getWebappDatasetSandboxContract("queue");
        expect(contract.manager.mode).toBe("sdk");
        expect(contract.manager.readOnly).toBe(false);
        expect(contract.dataset.supportsCrud).toBe(true);
        expect(contract.dataset.supportsBinding).toBe(false);
    });

    it("wordpress-link is sdk-managed with full binding roles", () => {
        const contract = getWebappDatasetSandboxContract("wordpress-link");
        expect(contract.manager.mode).toBe("sdk");
        expect(contract.manager.customConfiguratorId).toBe("wordpress-link.dataset-editor");
        expect(contract.dataset.supportsCrud).toBe(true);
        expect(contract.dataset.bindingRoles).toEqual([
            "primary",
            "secondary",
            "fallback",
            "overlay",
        ]);
    });
});
