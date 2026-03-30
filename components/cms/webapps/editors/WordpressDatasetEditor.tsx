"use client";

import { useEffect, useMemo, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { JSONSchema7 } from "json-schema";

import { Button } from "@/components/ui/button";
import { JsonTreeEditor } from "@/components/cms/webapps/editors/JsonTreeEditor";

type SourceKind = "wordpress-posts" | "wordpress-custom" | "woocommerce-products";
type AuthMode = "none" | "basic" | "woo-consumer";

type PrefetchPayload = {
    fieldCandidates: string[];
    warnings: string[];
    sampleItems: Array<Record<string, unknown>>;
    discovery: {
        siteName: string;
        collections: Array<{
            label: string;
            sourceKind: SourceKind;
            endpoint: string;
            postType?: string;
        }>;
    };
    recommendation?: {
        sourceKind: SourceKind;
        postType?: string;
        matchedEndpoint: string;
        confidence: number;
        notes: string[];
    };
};

interface Props {
    value: Record<string, unknown>;
    readOnly?: boolean;
    onChange: (value: Record<string, unknown>) => void;
}

const schema: JSONSchema7 = {
    type: "object",
    required: ["sourceKind", "authMode", "baseUrl", "itemsPerPage", "refreshSeconds"],
    properties: {
        sourceKind: {
            type: "string",
            title: "Source Kind",
            enum: ["wordpress-posts", "wordpress-custom", "woocommerce-products"],
        },
        authMode: {
            type: "string",
            title: "Auth Mode",
            enum: ["none", "basic", "woo-consumer"],
        },
        baseUrl: {
            type: "string",
            title: "Base URL",
        },
        postType: {
            type: "string",
            title: "Post Type",
        },
        itemsPerPage: {
            type: "number",
            title: "Items Per Page",
            minimum: 1,
            maximum: 100,
        },
        refreshSeconds: {
            type: "number",
            title: "Refresh Seconds",
            minimum: 30,
            maximum: 3600,
        },
        sampleUrl: {
            type: "string",
            title: "Sample URL",
        },
    },
};

const uiSchema = {
    "ui:submitButtonOptions": { norender: true },
    baseUrl: { "ui:placeholder": "https://example.com" },
    sampleUrl: { "ui:placeholder": "https://example.com/product/sample" },
} as const;

function normalizeConfig(value: Record<string, unknown>): Record<string, unknown> {
    return {
        sourceKind: typeof value.sourceKind === "string" ? value.sourceKind : "wordpress-posts",
        authMode: typeof value.authMode === "string" ? value.authMode : "none",
        baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
        postType: typeof value.postType === "string" ? value.postType : "",
        itemsPerPage: typeof value.itemsPerPage === "number" ? value.itemsPerPage : 24,
        refreshSeconds: typeof value.refreshSeconds === "number" ? value.refreshSeconds : 180,
        sampleUrl: typeof value.sampleUrl === "string" ? value.sampleUrl : "",
    };
}

export function WordpressDatasetEditor({ value, readOnly = false, onChange }: Props) {
    const [mode, setMode] = useState<"form" | "tree">("form");
    const [config, setConfig] = useState<Record<string, unknown>>(() => normalizeConfig(value));
    const [prefetching, setPrefetching] = useState(false);
    const [prefetch, setPrefetch] = useState<PrefetchPayload | null>(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const normalized = normalizeConfig(value);
        setConfig(normalized);
    }, [value]);

    const formData = useMemo(() => normalizeConfig(config), [config]);

    function pushChange(nextValue: Record<string, unknown>) {
        setConfig(nextValue);
        onChange(nextValue);
    }

    async function handlePrefetch() {
        setPrefetching(true);
        setMessage("");
        try {
            const response = await fetch("/api/webapps/wordpress-link/prefetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceKind: formData.sourceKind,
                    authMode: formData.authMode,
                    baseUrl: formData.baseUrl,
                    postType: formData.postType || undefined,
                    itemsPerPage: formData.itemsPerPage,
                    sampleUrl: formData.sampleUrl || undefined,
                    taxonomyFilters: [],
                }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Prefetch failed");
            }

            const payload = (await response.json()) as PrefetchPayload;
            setPrefetch(payload);
            setMessage("Discovery completata");

            if (payload.recommendation) {
                pushChange({
                    ...formData,
                    sourceKind: payload.recommendation.sourceKind,
                    postType: payload.recommendation.postType ?? formData.postType,
                });
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Prefetch failed");
        } finally {
            setPrefetching(false);
        }
    }

    return (
        <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wordpress Dataset Editor</p>
                    <p className="text-xs text-muted-foreground">Schema-driven form con discovery remota e tree editor avanzato.</p>
                </div>
                <div className="flex gap-2">
                    <Button type="button" size="sm" variant={mode === "form" ? "default" : "outline"} onClick={() => setMode("form")}>
                        Form
                    </Button>
                    <Button type="button" size="sm" variant={mode === "tree" ? "default" : "outline"} onClick={() => setMode("tree")}>
                        Tree
                    </Button>
                </div>
            </div>

            {mode === "form" ? (
                <div className="space-y-3">
                    <Form
                        schema={schema}
                        uiSchema={uiSchema}
                        validator={validator}
                        formData={formData}
                        disabled={readOnly}
                        onChange={(event) => pushChange(normalizeConfig((event.formData ?? {}) as Record<string, unknown>))}
                    />

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => void handlePrefetch()} disabled={readOnly || prefetching || !String(formData.baseUrl || "").trim()}>
                            {prefetching ? "Discovery..." : "Run Discovery"}
                        </Button>
                        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
                    </div>

                    {prefetch ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collections</p>
                                <div className="mt-2 space-y-2 text-xs">
                                    {prefetch.discovery.collections.slice(0, 8).map((entry) => (
                                        <button
                                            key={`${entry.endpoint}-${entry.sourceKind}`}
                                            type="button"
                                            className="block w-full rounded border border-border px-2 py-2 text-left hover:bg-accent"
                                            onClick={() => pushChange({
                                                ...formData,
                                                sourceKind: entry.sourceKind,
                                                postType: entry.postType ?? "",
                                            })}
                                            disabled={readOnly}
                                        >
                                            <span className="font-medium">{entry.label}</span>
                                            <span className="block text-muted-foreground">{entry.endpoint}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Field Candidates</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {prefetch.fieldCandidates.slice(0, 24).map((field) => (
                                        <span key={field} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : (
                <JsonTreeEditor value={config} onChange={pushChange} readOnly={readOnly} />
            )}
        </div>
    );
}