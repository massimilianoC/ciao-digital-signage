"use client";

import { normalizeYouTubeInputToEmbed } from "@/lib/utils/youtube-embed";

interface YouTubeRendererProps {
  input: string;
  onLoad: () => void;
  onError: () => void;
}

export function YouTubeRenderer({ input, onLoad, onError }: YouTubeRendererProps) {
  const embedUrl = normalizeYouTubeInputToEmbed(input);

  return (
    <iframe
      src={embedUrl}
      title="youtube-content"
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      onLoad={onLoad}
      onError={onError}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        background: "black",
      }}
    />
  );
}
