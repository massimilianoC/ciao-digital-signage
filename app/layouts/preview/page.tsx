"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { LayoutZone } from "@/components/cms/layouts/types";
import { IFrameRenderer } from "@/components/player/renderers/IFrameRenderer";
import { ImageRenderer } from "@/components/player/renderers/ImageRenderer";
import { PdfRenderer } from "@/components/player/renderers/PdfRenderer";
import { VideoRenderer } from "@/components/player/renderers/VideoRenderer";
import { WidgetRenderer } from "@/components/player/renderers/WidgetRenderer";

type PreviewDraft = {
  name: string;
  resolution: { width: number; height: number };
  backgroundImage?: string;
  zones: LayoutZone[];
  updatedAt: number;
};

type ContentListItem = {
  _id: string;
  name: string;
  type: "image" | "video" | "url" | "widget";
  config?: {
    fileUrl?: string;
    url?: string;
    urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
  };
};

type PlaylistResponse = {
  _id: string;
  name: string;
  items?: Array<{
    contentId:
      | string
      | {
          _id?: string;
          name?: string;
          type?: "image" | "video" | "url" | "widget";
          config?: {
            fileUrl?: string;
            url?: string;
            urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
          };
        };
  }>;
};

type RenderPayload =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "url"; url: string; urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage" }
  | { kind: "widget"; url: string }
  | { kind: "layout" }
  | { kind: "empty" };

function parseDraft(raw: string | null): PreviewDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PreviewDraft;
    if (!parsed || !Array.isArray(parsed.zones) || !parsed.resolution) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function LayoutPreviewPage() {
  const searchParams = useSearchParams();
  const draftKey = searchParams.get("draftKey") ?? "layout-preview-draft:new";
  const isEmbedded = searchParams.get("embedded") === "1";
  const forceFullscreen = searchParams.get("fullscreen") === "1";
  const kioskMode = searchParams.get("kiosk") === "1";
  const [draft, setDraft] = useState<PreviewDraft | null>(null);
  const [zonePayloads, setZonePayloads] = useState<Record<string, RenderPayload>>({});
  const fullscreenRootRef = useRef<HTMLDivElement>(null);

  const onLoad = useCallback(() => {
    // no-op for preview
  }, []);

  const onError = useCallback(() => {
    // no-op for preview
  }, []);

  const layoutBackground = useMemo(() => {
    if (!draft?.backgroundImage) return "radial-gradient(circle at 20% 20%, #1f2937 0%, #0b1220 65%)";
    return `url(${draft.backgroundImage}) center/cover no-repeat #0f172a`;
  }, [draft?.backgroundImage]);

  const fullscreenUrl = useMemo(
    () => `/layouts/preview?draftKey=${encodeURIComponent(draftKey)}&fullscreen=1&kiosk=1`,
    [draftKey],
  );

  useEffect(() => {
    const pullDraft = () => {
      const next = parseDraft(window.localStorage.getItem(draftKey));
      setDraft(next);
    };

    pullDraft();
    const interval = window.setInterval(pullDraft, 600);

    const onStorage = (event: StorageEvent) => {
      if (event.key === draftKey) {
        setDraft(parseDraft(event.newValue));
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [draftKey]);

  useEffect(() => {
    let cancelled = false;

    const resolvePayload = async () => {
      if (!draft) {
        setZonePayloads({});
        return;
      }

      const zonesWithContent = draft.zones.filter((zone) => zone.content);
      if (zonesWithContent.length === 0) {
        setZonePayloads({});
        return;
      }

      const contentRes = await fetch("/api/content?includeInternalWebappAssets=true", { cache: "no-store" });
      const contentItems = (await contentRes.json().catch(() => [])) as ContentListItem[];
      const contentById = new Map(contentItems.map((item) => [item._id, item]));

      const playlistIds = Array.from(
        new Set(
          zonesWithContent
            .filter((zone) => zone.content?.type === "playlist")
            .map((zone) => zone.content?.refId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const playlistEntries = await Promise.all(
        playlistIds.map(async (id) => {
          const resp = await fetch(`/api/playlists/${id}`, { cache: "no-store" });
          if (!resp.ok) return [id, null] as const;
          const data = (await resp.json().catch(() => null)) as PlaylistResponse | null;
          return [id, data] as const;
        }),
      );
      const playlistById = new Map(playlistEntries);

      const nextPayloads: Record<string, RenderPayload> = {};

      for (const zone of draft.zones) {
        if (!zone.content) {
          nextPayloads[zone.id] = { kind: "empty" };
          continue;
        }

        if (zone.content.type === "layout") {
          nextPayloads[zone.id] = { kind: "layout" };
          continue;
        }

        const fromContent = (item: ContentListItem | null | undefined): RenderPayload => {
          if (!item) return { kind: "empty" };
          const url = item.config?.fileUrl || item.config?.url || "";
          if (!url) return { kind: "empty" };
          if (item.type === "image") return { kind: "image", url };
          if (item.type === "video") return { kind: "video", url };
          if (item.type === "widget") return { kind: "widget", url };
          return { kind: "url", url, urlSubtype: item.config?.urlSubtype };
        };

        if (zone.content.type === "content") {
          nextPayloads[zone.id] = fromContent(contentById.get(zone.content.refId));
          continue;
        }

        if (zone.content.type === "playlist") {
          const playlist = playlistById.get(zone.content.refId);
          const firstItem = playlist?.items?.[0];
          if (!firstItem) {
            nextPayloads[zone.id] = { kind: "empty" };
            continue;
          }

          if (typeof firstItem.contentId === "string") {
            nextPayloads[zone.id] = fromContent(contentById.get(firstItem.contentId));
          } else {
            const contentLike: ContentListItem = {
              _id: firstItem.contentId?._id || "",
              name: firstItem.contentId?.name || "",
              type: firstItem.contentId?.type || "url",
              config: firstItem.contentId?.config,
            };
            nextPayloads[zone.id] = fromContent(contentLike);
          }
          continue;
        }

        nextPayloads[zone.id] = { kind: "empty" };
      }

      if (!cancelled) {
        setZonePayloads(nextPayloads);
      }
    };

    void resolvePayload();

    return () => {
      cancelled = true;
    };
  }, [draft]);

  useEffect(() => {
    if (!forceFullscreen) return;
    const element = fullscreenRootRef.current;
    if (!element || document.fullscreenElement) return;

    const tryFullscreen = async () => {
      try {
        await element.requestFullscreen();
      } catch {
        // User can still activate fullscreen via the button in UI.
      }
    };

    void tryFullscreen();
  }, [forceFullscreen]);

  const requestFullscreenNow = useCallback(async () => {
    const element = fullscreenRootRef.current;
    if (!element) return;
    if (document.fullscreenElement) return;
    try {
      await element.requestFullscreen();
    } catch {
      // ignore
    }
  }, []);

  const openFullscreenWindow = useCallback(() => {
    if (window.top) {
      window.top.location.href = fullscreenUrl;
      return;
    }
    window.location.href = fullscreenUrl;
  }, [fullscreenUrl]);

  if (!draft) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200" ref={fullscreenRootRef}>
        <div className="rounded-3xl border border-slate-700 bg-slate-900/80 px-6 py-5 text-center shadow-2xl backdrop-blur">
          <h1 className="mb-2 text-base font-semibold">Preview layout</h1>
          <p className="text-sm text-slate-400">Nessuna bozza disponibile. Apri la preview dall&apos;editor layout.</p>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={fullscreenRootRef}
      className={isEmbedded || forceFullscreen || kioskMode ? "min-h-screen bg-slate-950 text-slate-200" : "min-h-screen bg-slate-950 px-4 py-4 text-slate-200 md:px-6"}
    >
      <section className={isEmbedded || forceFullscreen || kioskMode ? "mx-auto w-full" : "mx-auto w-full max-w-[1500px]"}>
        {!isEmbedded && !kioskMode && (
          <div className="mb-3 flex items-center justify-between">
            <h1 className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-1 text-sm font-semibold tracking-wide">
              Preview: {draft.name || "Nuovo layout"}
            </h1>
            <div className="flex items-center gap-2">
              {forceFullscreen ? (
                <button
                  type="button"
                  onClick={() => void requestFullscreenNow()}
                  className="rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1 text-xs text-slate-200 transition hover:border-slate-300"
                >
                  Entra in fullscreen
                </button>
              ) : null}
              <span className="text-xs text-slate-400">Live refresh</span>
            </div>
          </div>
        )}

        <div
          onClick={isEmbedded ? openFullscreenWindow : undefined}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: `${draft.resolution.width}/${draft.resolution.height}`,
            borderRadius: isEmbedded || forceFullscreen || kioskMode ? 0 : 24,
            overflow: "hidden",
            border: isEmbedded || forceFullscreen || kioskMode ? "none" : "1px solid rgba(148,163,184,0.35)",
            background: layoutBackground,
            cursor: isEmbedded ? "zoom-in" : "default",
            minHeight: forceFullscreen || kioskMode ? "100vh" : undefined,
          }}
        >
          {draft.zones.map((zone: LayoutZone, idx: number) => {
            const label = zone.label || zone.content?.label || `Zona ${idx + 1}`;
            const contentLabel = zone.content
              ? `[${zone.content.type}] ${zone.content.label}`
              : "Nessun contenuto";
            const payload = zonePayloads[zone.id] ?? { kind: "empty" as const };

            return (
              <article
                key={zone.id}
                style={{
                  position: "absolute",
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.width}%`,
                  height: `${zone.height}%`,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  padding: `${zone.padding ?? 0}px`,
                  borderRadius: `${zone.borderRadius ?? 0}px`,
                  border: `${zone.borderSize ?? 0}px solid ${zone.borderColor ?? "transparent"}`,
                  background: zone.backgroundImage
                    ? `url(${zone.backgroundImage}) center/cover no-repeat #111827`
                    : "#111827",
                  boxShadow: zone.dropShadow ? "0 10px 30px rgba(0,0,0,0.45)" : "none",
                }}
              >
                {payload.kind === "image" ? <ImageRenderer url={payload.url} fitMode="cover" onLoad={onLoad} onError={onError} /> : null}
                {payload.kind === "video" ? <VideoRenderer url={payload.url} onLoad={onLoad} onError={onError} /> : null}
                {payload.kind === "widget" ? <WidgetRenderer url={payload.url} onLoad={onLoad} onError={onError} /> : null}
                {payload.kind === "url" && payload.urlSubtype === "pdf" ? (
                  <PdfRenderer url={payload.url} onLoad={onLoad} onError={onError} />
                ) : null}
                {payload.kind === "url" && payload.urlSubtype !== "pdf" ? (
                  <IFrameRenderer url={payload.url} type="url" urlSubtype={payload.urlSubtype ?? "webpage"} onLoad={onLoad} onError={onError} />
                ) : null}

                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/65 to-black/15 p-2 text-slate-100">
                  <div className="truncate text-[11px] font-semibold">{label}</div>
                  <div className="truncate text-[10px] text-slate-300">
                    {payload.kind === "empty" ? "Contenuto non risolto" : contentLabel}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
