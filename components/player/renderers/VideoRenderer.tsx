"use client";

import { useEffect } from "react";

import { videoPool } from "@/lib/player/videoPool";

interface VideoRendererProps {
  url: string;
  onLoad: () => void;
  onError: () => void;
}

export function VideoRenderer({ url, onLoad, onError }: VideoRendererProps) {
  useEffect(() => {
    const element = videoPool.assign(0, url);
    element.autoplay = true;
    element.oncanplay = onLoad;
    element.onerror = onError;

    element.play().catch(() => {
      onError();
    });

    return () => {
      element.oncanplay = null;
      element.onerror = null;
      videoPool.release(0);
    };
  }, [onError, onLoad, url]);

  return null;
}
