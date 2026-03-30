"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { IFrameRenderer } from "./IFrameRenderer";
import { ImageRenderer } from "./ImageRenderer";
import { PdfRenderer } from "./PdfRenderer";
import { VideoRenderer } from "./VideoRenderer";
import { WidgetRenderer } from "./WidgetRenderer";

interface LayoutZoneData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  backgroundImage?: string;
  padding?: number;
  borderRadius?: number;
  borderColor?: string;
  borderSize?: number;
  dropShadow?: boolean;
  content?: {
    type: "playlist" | "content" | "layout";
    refId: string;
    label: string;
  };
  resolved?:
    | {
      kind: "media";
      mediaType: "image" | "video" | "url" | "widget";
      url: string;
      urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
      fitMode?: "cover" | "fit";
      backgroundColor?: string | null;
    }
    | {
      kind: "layout";
      layoutId: string;
    };
}

interface LayoutData {
  _id: string;
  resolution: { width: number; height: number };
  backgroundImage?: string;
  zones: LayoutZoneData[];
}

interface CompositeLayoutRendererProps {
  layoutId: string;
  screenId: string;
  token: string;
  onLoad: () => void;
  onError: () => void;
  depth?: number;
  previewMode?: boolean;
}

/**
 * Renders a composite layout by fetching the layout definition from the server
 * and rendering each zone. Zones without content are rendered as empty placeholders.
 *
 * Note: For the MVP, zones with playlist/content references show a placeholder.
 * Full recursive zone rendering (playlist in zone, nested layout) is a P2 feature.
 */
export function CompositeLayoutRenderer({
  layoutId,
  screenId,
  token,
  onLoad,
  onError,
  depth = 0,
  previewMode = false,
}: CompositeLayoutRendererProps) {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchLayout = async () => {
      setLoading(true);
      setLayout(null);

      try {
        const url = `/api/player/layout?layoutId=${encodeURIComponent(layoutId)}&screenId=${encodeURIComponent(screenId)}&token=${encodeURIComponent(token)}${previewMode ? "&preview=1" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setLoading(false);
            onError();
          }
          return;
        }
        const data = (await res.json()) as LayoutData;
        if (!cancelled) {
          setLayout(data);
          setLoading(false);
          onLoad();
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          onError();
        }
      }
    };

    void fetchLayout();
    return () => {
      cancelled = true;
    };
  }, [layoutId, previewMode, screenId, token, onLoad, onError]);

  if (loading) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
        }}
      >
        <Loader2 size={24} style={{ color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!layout) return null;

  const noop = () => {
    // no-op for nested renderers
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: layout.backgroundImage
          ? `url(${layout.backgroundImage}) center/cover no-repeat #000`
          : "#000",
      }}
    >
      {layout.zones.map((zone: LayoutZoneData) => (
        <div
          key={zone.id}
          style={{
            position: "absolute",
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            width: `${zone.width}%`,
            height: `${zone.height}%`,
            overflow: "hidden",
            background: zone.backgroundImage
              ? `url(${zone.backgroundImage}) center/cover no-repeat #111`
              : "#111",
            padding: `${zone.padding ?? 0}px`,
            borderRadius: `${zone.borderRadius ?? 0}px`,
            border: `${zone.borderSize ?? 0}px solid ${zone.borderColor ?? "transparent"}`,
            boxSizing: "border-box",
            boxShadow: zone.dropShadow ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
          }}
        >
          {zone.resolved?.kind === "media" && zone.resolved.mediaType === "image" ? (
            <ImageRenderer
              url={zone.resolved.url}
              fitMode={zone.resolved.fitMode ?? "cover"}
              onLoad={noop}
              onError={noop}
            />
          ) : null}

          {zone.resolved?.kind === "media" && zone.resolved.mediaType === "video" ? (
            <VideoRenderer url={zone.resolved.url} onLoad={noop} onError={noop} />
          ) : null}

          {zone.resolved?.kind === "media" && zone.resolved.mediaType === "widget" ? (
            <WidgetRenderer url={zone.resolved.url} onLoad={noop} onError={noop} />
          ) : null}

          {zone.resolved?.kind === "media" && zone.resolved.mediaType === "url" && zone.resolved.urlSubtype === "pdf" ? (
            <PdfRenderer url={zone.resolved.url} onLoad={noop} onError={noop} />
          ) : null}

          {zone.resolved?.kind === "media" && zone.resolved.mediaType === "url" && zone.resolved.urlSubtype !== "pdf" ? (
            <IFrameRenderer
              url={zone.resolved.url}
              type="url"
              urlSubtype={zone.resolved.urlSubtype ?? "webpage"}
              onLoad={noop}
              onError={noop}
            />
          ) : null}

          {zone.resolved?.kind === "layout" && depth < 2 ? (
            <CompositeLayoutRenderer
              layoutId={zone.resolved.layoutId}
              screenId={screenId}
              token={token}
              onLoad={noop}
              onError={noop}
              depth={depth + 1}
              previewMode={previewMode}
            />
          ) : null}

          {!zone.resolved ? <div style={{ width: "100%", height: "100%", background: "#111" }} /> : null}
        </div>
      ))}
    </div>
  );
}
