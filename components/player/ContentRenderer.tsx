"use client";

import type { ReactElement } from "react";

import type { ContentManifest } from "@/lib/player/types";

import { CompositeLayoutRenderer } from "./renderers/CompositeLayoutRenderer";
import { IFrameRenderer } from "./renderers/IFrameRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";
import { PdfRenderer } from "./renderers/PdfRenderer";
import { VideoRenderer } from "./renderers/VideoRenderer";
import { WidgetRenderer } from "./renderers/WidgetRenderer";

/** Convert a plain YouTube watch/short URL to an embed URL at render time. */
function toYoutubeEmbedUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    let videoId: string | null = null;
    if (u.hostname.includes("youtu.be")) {
      videoId = u.pathname.slice(1).split("/")[0] ?? null;
    } else if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
  } catch {
    // fall through
  }
  return rawUrl;
}

interface ContentRendererProps {
  manifest: ContentManifest | null;
  currentItemIndex: number;
  videoSlotIndex?: number;
  onLoad: () => void;
  onError: () => void;
  onVideoEnded?: () => void;
  screenId?: string;
  screenToken?: string;
  previewMode?: boolean;
}

export function ContentRenderer({
  manifest,
  currentItemIndex,
  videoSlotIndex,
  onLoad,
  onError,
  onVideoEnded,
  screenId,
  screenToken,
  previewMode = false,
}: ContentRendererProps) {
  if (!manifest || manifest.items.length === 0) {
    return null;
  }

  const item = manifest.items[currentItemIndex % manifest.items.length];
  if (!item) {
    return null;
  }

  const effectiveBackgroundColor = item.backgroundColor ?? manifest.backgroundColorOverride ?? "#000000";

  const isVideoLike = item.type === "video" || (item.type === "url" && item.urlSubtype === "video");
  const shouldLoopVideo =
    isVideoLike &&
    manifest.items.length === 1 &&
    (manifest.loop ?? true) &&
    !(manifest.stopOnLastItem ?? false) &&
    item.durationOverride !== true;

  let rendered: ReactElement | null = null;

  switch (item.type) {
    case "image":
      rendered = (
        <ImageRenderer
          url={item.url}
          fitMode={item.fitMode}
          onLoad={onLoad}
          onError={onError}
        />
      );
      break;
    case "video":
      rendered = (
        <VideoRenderer
          url={item.url}
          slotIndex={videoSlotIndex}
          onLoad={onLoad}
          onError={onError}
          onEnded={item.durationOverride === true ? undefined : onVideoEnded}
          loop={shouldLoopVideo}
        />
      );
      break;
    case "url": {
      const sub = item.urlSubtype ?? "webpage";
      if (sub === "youtube") {
        rendered = (
          <IFrameRenderer
            url={toYoutubeEmbedUrl(item.url)}
            type="url"
            urlSubtype="youtube"
            onLoad={onLoad}
            onError={onError}
          />
        );
      } else if (sub === "video") {
        rendered = (
          <VideoRenderer
            url={item.url}
            slotIndex={videoSlotIndex}
            onLoad={onLoad}
            onError={onError}
            onEnded={item.durationOverride === true ? undefined : onVideoEnded}
            loop={shouldLoopVideo}
          />
        );
      } else if (sub === "image") {
        rendered = (
          <ImageRenderer
            url={item.url}
            fitMode={item.fitMode}
            onLoad={onLoad}
            onError={onError}
          />
        );
      } else if (sub === "pdf") {
        rendered = (
          <PdfRenderer
            url={item.url}
            interactive={item.interactive}
            onLoad={onLoad}
            onError={onError}
          />
        );
      } else {
        // webpage (default)
        rendered = (
          <IFrameRenderer
            url={item.url}
            type="url"
            urlSubtype="webpage"
            interactive={item.interactive}
            onLoad={onLoad}
            onError={onError}
          />
        );
      }
      break;
    }
    case "widget":
      rendered = <WidgetRenderer url={item.url} onLoad={onLoad} onError={onError} />;
      break;
    case "layout":
      {
        const resolvedLayoutId = item.layoutId ?? item.id;
        if (resolvedLayoutId && screenId && screenToken) {
        rendered = (
          <CompositeLayoutRenderer
            layoutId={resolvedLayoutId}
            screenId={screenId}
            token={screenToken}
            onLoad={onLoad}
            onError={onError}
            previewMode={previewMode}
          />
        );
        } else {
          onError();
          return null;
        }
      }
      break;
    default:
      return null;
  }

  const renderKey = `${manifest.resolvedAt}-${currentItemIndex}-${item.id}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: effectiveBackgroundColor,
        overflow: "hidden",
      }}
    >
      <div
        key={renderKey}
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        {rendered}
      </div>
    </div>
  );
}
