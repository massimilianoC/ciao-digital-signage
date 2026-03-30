"use client";

import { useEffect, useRef } from "react";

interface Props {
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
    readOnly?: boolean;
}

export function JsonTreeEditor({ value, onChange, readOnly = false }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<{ destroy: () => void; update: (value: unknown) => void } | null>(null);

    useEffect(() => {
        let disposed = false;

        async function init() {
            if (!containerRef.current) return;

            const { JSONEditor } = await import("jsoneditor");
            if (disposed || !containerRef.current) return;

            const editor = new JSONEditor(containerRef.current, {
                mode: readOnly ? "view" : "tree",
                modes: readOnly ? ["view"] : ["tree", "code", "view"],
                mainMenuBar: !readOnly,
                navigationBar: true,
                statusBar: false,
                onChangeJSON: (nextValue: unknown) => {
                    if (readOnly) return;
                    if (nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)) {
                        onChange(nextValue as Record<string, unknown>);
                    }
                },
            });

            editor.set(value);
            editorRef.current = {
                destroy: () => editor.destroy(),
                update: (nextValue: unknown) => editor.update(nextValue),
            };
        }

        void init();

        return () => {
            disposed = true;
            editorRef.current?.destroy();
            editorRef.current = null;
        };
    }, [onChange, readOnly]);

    useEffect(() => {
        editorRef.current?.update(value);
    }, [value]);

    return <div ref={containerRef} className="jsoneditor-host min-h-96 overflow-hidden rounded-md border border-border bg-background" />;
}