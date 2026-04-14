"use client";

import { useEffect } from "react";

import { videoPool } from "@/lib/player/videoPool";

interface VideoRendererProps {
  url: string;
  slotIndex?: number;
  onLoad: () => void;
  onError: () => void;
  onEnded?: () => void;
  loop?: boolean;
}

export function VideoRenderer({ url, slotIndex = 0, onLoad, onError, onEnded, loop = false }: VideoRendererProps) {
  useEffect(() => {
    const element = videoPool.assign(slotIndex, url);
    element.autoplay = true;
    element.loop = loop;
    element.oncanplay = onLoad;
    element.onerror = () => {
      // Aborted fetches are expected during slot swaps/preload races.
      if (element.error?.code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }

      onError();
    };
    element.onended = loop ? null : (onEnded ?? null);

    if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      onLoad();
    }

    element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      onError();
    });

    return () => {
      element.oncanplay = null;
      element.onerror = null;
      element.onended = null;
      element.loop = false;
      videoPool.release(slotIndex);
    };
  }, [loop, onEnded, onError, onLoad, slotIndex, url]);

  return null;
}
