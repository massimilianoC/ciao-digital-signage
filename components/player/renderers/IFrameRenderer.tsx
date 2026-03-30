"use client";

import type { ContentItemType, UrlSubtype } from "@/lib/player/types";

interface IFrameRendererProps {
  url: string;
  type: ContentItemType;
  urlSubtype?: UrlSubtype;
  /** true when this item is the only one in its playlist → full interactive sandbox */
  interactive?: boolean;
  onLoad: () => void;
  onError: () => void;
}

function computeSandbox(type: ContentItemType, urlSubtype?: UrlSubtype, interactive?: boolean): string {
  if (type === "widget") return "allow-scripts allow-same-origin";
  // url type
  const sub = urlSubtype ?? "webpage";
  if (sub === "youtube") return "allow-scripts allow-same-origin allow-popups allow-presentation";
  if (sub === "video" || sub === "image") return "allow-scripts allow-same-origin";
  // webpage
  if (interactive) {
    return "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads";
  }
  return "allow-scripts allow-same-origin";
}

function computeAllow(urlSubtype?: UrlSubtype): string {
  if (urlSubtype === "youtube") return "autoplay; encrypted-media; fullscreen";
  return "autoplay";
}

export function IFrameRenderer({ url, type, urlSubtype, interactive, onLoad, onError }: IFrameRendererProps) {
  const sandbox = computeSandbox(type, urlSubtype, interactive);
  const allow = computeAllow(urlSubtype);

  return (
    <iframe
      src={url}
      title="content"
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      allow={allow}
      onLoad={onLoad}
      onError={onError}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}
