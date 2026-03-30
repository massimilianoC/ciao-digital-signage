"use client";

import { IFrameRenderer } from "./IFrameRenderer";

interface WidgetRendererProps {
  url: string;
  onLoad: () => void;
  onError: () => void;
}

export function WidgetRenderer({ url, onLoad, onError }: WidgetRendererProps) {
  return <IFrameRenderer url={url} type="widget" onLoad={onLoad} onError={onError} />;
}
