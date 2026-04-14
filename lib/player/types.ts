export type ContentItemType = "image" | "video" | "url" | "widget" | "layout";
export type UrlSubtype = "youtube" | "video" | "image" | "pdf" | "webpage";

export interface ContentItem {
  id: string;
  type: ContentItemType;
  url: string;
  urlSubtype?: UrlSubtype;
  /** For type "layout": the composite layout id */
  layoutId?: string;
  /** true when this URL item is the sole item in its playlist (enables interactive iframe) */
  interactive?: boolean;
  title?: string;
  thumbnailUrl?: string;
  fitMode?: "cover" | "fit";
  backgroundColor?: string | null;
  durationMs: number;
  durationOverride?: boolean;
  label?: string;
}

export interface ContentManifest {
  screenId: string;
  items: ContentItem[];
  resolvedAt: string;
  scheduleId?: string;
  loop?: boolean;
  stopOnLastItem?: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
  transitionType?: "cut" | "fade";
  transitionMs?: number;
}

export interface ContentUpdateEvent {
  manifest: ContentManifest;
}

export interface ClockSyncEvent {
  serverTs: number;
}

export interface PlayerServerToClientEvents {
  content_update: (data: ContentUpdateEvent) => void;
  force_override: (data: ContentUpdateEvent) => void;
  override_clear: () => void;
  clock_sync: (data: ClockSyncEvent) => void;
  remote_refresh: () => void;
}

export interface PlayerClientToServerEvents {
  "player:request-state": (payload: { screenId: string }) => void;
  heartbeat: (payload: { currentItemId?: string }) => void;
  "player:heartbeat": (payload: { screenId: string; ts: number }) => void;
  "player:error": (payload: { code?: string; message?: string }) => void;
}
