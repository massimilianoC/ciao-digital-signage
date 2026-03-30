"use client";

import { useState } from "react";

import type { ConfigSchema, ConfigSchemaField } from "@/lib/sdk/config-schema.types";

interface Props {
    schema: ConfigSchema;
    initialValues?: Record<string, unknown>;
    onChange: (values: Record<string, unknown>) => void;
}

function fieldVisible(field: ConfigSchemaField, values: Record<string, unknown>): boolean {
    if (!field.conditions || field.conditions.length === 0) return true;
    return field.conditions.every((c) => values[c.field] === c.value);
}

export function WebappAutoConfigForm({ schema, initialValues = {}, onChange }: Props) {
    const defaults = Object.fromEntries(
        schema.fields
            .filter((f) => f.default !== undefined)
            .map((f) => [f.key, f.default]),
    );

    const [values, setValues] = useState<Record<string, unknown>>({
        ...defaults,
        ...initialValues,
    });

    function update(key: string, value: unknown) {
        const next = { ...values, [key]: value };
        setValues(next);
        onChange(next);
    }

    return (
        <div className="space-y-4">
            {schema.fields.map((field) => {
                if (!fieldVisible(field, values)) return null;

                const val = values[field.key];

                return (
                    <div key={field.key} className="space-y-1">
                        <label className="block text-sm font-medium text-foreground">
                            {field.label}
                            {field.required && (
                                <span className="ml-1 text-destructive">*</span>
                            )}
                        </label>

                        {field.type === "select" && (
                            <select
                                value={String(val ?? "")}
                                onChange={(e) => update(field.key, e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {!field.required && <option value="">-- Seleziona --</option>}
                                {field.options?.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        )}

                        {field.type === "toggle" && (
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(val ?? field.default)}
                                    onChange={(e) => update(field.key, e.target.checked)}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm text-muted-foreground">
                                    {val ? "Attivo" : "Disattivo"}
                                </span>
                            </label>
                        )}

                        {field.type === "number" && (
                            <input
                                type="number"
                                value={val !== undefined ? String(val) : ""}
                                placeholder={field.placeholder}
                                onChange={(e) => update(field.key, e.target.valueAsNumber)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        )}

                        {field.type === "color" && (
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={String(val ?? field.default ?? "#000000")}
                                    onChange={(e) => update(field.key, e.target.value)}
                                    className="h-8 w-16 cursor-pointer rounded border border-input"
                                />
                                <span className="text-sm font-mono text-muted-foreground">
                                    {String(val ?? field.default ?? "")}
                                </span>
                            </div>
                        )}

                        {field.type === "textarea" && (
                            <textarea
                                value={String(val ?? "")}
                                placeholder={field.placeholder}
                                rows={4}
                                onChange={(e) => update(field.key, e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                            />
                        )}

                        {field.type === "secret" && (
                            <input
                                type="password"
                                value={String(val ?? "")}
                                placeholder={field.placeholder ?? "••••••••"}
                                onChange={(e) => update(field.key, e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                            />
                        )}

                        {(field.type === "text" ||
                            field.type === "url") && (
                            <input
                                type={field.type === "url" ? "url" : "text"}
                                value={String(val ?? "")}
                                placeholder={field.placeholder}
                                onChange={(e) => update(field.key, e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        )}

                        {field.hint && (
                            <p className="text-xs text-muted-foreground">{field.hint}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
