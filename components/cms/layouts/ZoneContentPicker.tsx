"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import type { ZoneContent, ZoneContentType } from "./types";

interface ContentOption {
  id: string;
  label: string;
  type: ZoneContentType;
  isDisabled: boolean;
  disabledReason?: "loop" | "max_depth";
}

interface ZoneContentPickerProps {
  currentLayoutId: string | undefined;
  currentDepth?: number;
  onAssign: (content: ZoneContent) => void;
  onClose: () => void;
}

const MAX_NESTING_DEPTH = 3;

export function ZoneContentPicker({
  currentLayoutId,
  currentDepth = 0,
  onAssign,
  onClose,
}: ZoneContentPickerProps) {
  const [tab, setTab] = useState<ZoneContentType>("playlist");
  const [options, setOptions] = useState<ContentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async (type: ZoneContentType) => {
    setLoading(true);
    setError(null);
    try {
      let url = "";
      if (type === "playlist") url = "/api/playlists";
      else if (type === "content") url = "/api/content";
      else if (type === "layout") url = "/api/layouts";

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Caricamento fallito");

      const data = (await res.json()) as Array<{
        _id: string;
        name?: string;
        title?: string;
        zones?: unknown[];
      }>;

      const maxDepthReached = currentDepth >= MAX_NESTING_DEPTH - 1;

      const mapped: ContentOption[] = data.map((item) => {
        const isCurrentLayout = type === "layout" && item._id === currentLayoutId;
        const isDisabled = isCurrentLayout || (type === "layout" && maxDepthReached);
        const disabledReason: ContentOption["disabledReason"] = isCurrentLayout
          ? "loop"
          : maxDepthReached && type === "layout"
            ? "max_depth"
            : undefined;

        return {
          id: item._id,
          label: item.name ?? item.title ?? item._id,
          type,
          isDisabled,
          disabledReason,
        };
      });

      setOptions(mapped);
    } catch {
      setError("Impossibile caricare i contenuti");
    } finally {
      setLoading(false);
    }
  }, [currentLayoutId, currentDepth]);

  useEffect(() => {
    void fetchOptions(tab);
  }, [tab, fetchOptions]);

  const tabs: { id: ZoneContentType; label: string }[] = [
    { id: "playlist", label: "Playlist" },
    { id: "content", label: "Asset" },
    { id: "layout", label: "Layout" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          width: "min(480px, 92vw)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15 }}>Scegli contenuto zona</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--muted-foreground))",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: "none",
                border: "none",
                borderBottom: tab === t.id ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                color: tab === t.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : error ? (
            <div style={{ padding: 16, color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
              {error}
            </div>
          ) : options.length === 0 ? (
            <div style={{ padding: 16, color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
              Nessun elemento disponibile
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {options.map((opt: ContentOption) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={opt.isDisabled}
                    onClick={() => {
                      if (!opt.isDisabled) {
                        onAssign({ type: opt.type, refId: opt.id, label: opt.label });
                      }
                    }}
                    title={
                      opt.disabledReason === "loop"
                        ? "Causerebbe un loop"
                        : opt.disabledReason === "max_depth"
                          ? "Profondità massima di nesting raggiunta"
                          : undefined
                    }
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid hsl(var(--border))",
                      padding: "10px 16px",
                      cursor: opt.isDisabled ? "not-allowed" : "pointer",
                      opacity: opt.isDisabled ? 0.4 : 1,
                      fontSize: 13,
                      color: "hsl(var(--foreground))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span>{opt.label}</span>
                    {opt.disabledReason && (
                      <span
                        style={{
                          fontSize: 10,
                          background: "hsl(var(--muted))",
                          borderRadius: 4,
                          padding: "2px 6px",
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        {opt.disabledReason === "loop" ? "loop" : "max depth"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
