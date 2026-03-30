import { getIO } from "../socket/index";

import { resolveManifestForScreen } from "./runtime-resolver";

type UrlSubtype = "youtube" | "video" | "image" | "pdf" | "webpage";

function asUrlSubtype(value: unknown): UrlSubtype | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "youtube" || value === "video" || value === "image" || value === "pdf" || value === "webpage") {
    return value;
  }

  return undefined;
}

function toPlayerManifest(
  manifest: Awaited<ReturnType<typeof resolveManifestForScreen>>,
): {
  screenId: string;
  resolvedAt: string;
  scheduleId: string;
  loop: boolean;
  stopOnLastItem: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
  transitionType?: "cut" | "fade";
  transitionMs?: number;
  items: Array<{
    id: string;
    type: "image" | "video" | "url" | "widget" | "layout";
    url: string;
    layoutId?: string;
    urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
    interactive?: boolean;
    title?: string;
    thumbnailUrl?: string;
    fitMode?: "cover" | "fit";
    backgroundColor?: string | null;
    durationMs: number;
  }>;
} {
  const manifestItems = manifest.items ?? [];
  const isSoleInteractiveUrl =
    manifestItems.length === 1 &&
    manifestItems[0]?.type === "url" &&
    (!manifestItems[0]?.urlSubtype || manifestItems[0]?.urlSubtype === "webpage" || manifestItems[0]?.urlSubtype === "pdf" ||
      !manifestItems[0]?.config?.urlSubtype || manifestItems[0]?.config?.urlSubtype === "webpage" || manifestItems[0]?.config?.urlSubtype === "pdf");

  return {
    screenId: manifest.screenId,
    resolvedAt: manifest.validFrom ?? new Date().toISOString(),
    scheduleId: manifest.manifestId,
    loop: manifest.loop ?? true,
    stopOnLastItem: manifest.stopOnLastItem ?? false,
    fitModeOverride: manifest.fitModeOverride ?? null,
    backgroundColorOverride: manifest.backgroundColorOverride ?? null,
    transitionType: manifest.transitionType === "cut" ? "cut" : "fade",
    transitionMs: typeof manifest.transitionMs === "number" ? Math.max(0, manifest.transitionMs) : 500,
    items: manifestItems.map((item, index) => ({
      id: String(item.contentId ?? `${manifest.screenId}-${index}`),
      type: item.type,
      url: item.url ?? item.fileUrl ?? "",
      layoutId:
        item.type === "layout"
          ? String(item.contentId ?? item.id ?? "")
          : undefined,
      urlSubtype: asUrlSubtype(item.urlSubtype ?? item.config?.urlSubtype),
      interactive: item.type === "url" && isSoleInteractiveUrl ? true : undefined,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      fitMode: item.fitMode,
      backgroundColor: item.backgroundColor ?? null,
      durationMs: item.durationMs ?? 10000,
    })),
  };
}

export async function emitManifestToScreen(screenId: string): Promise<void> {
  const io = getIO();
  const manifest = await resolveManifestForScreen(screenId, new Date());

  io.of("/player").to(`screen:${screenId}`).emit("content_update", {
    manifest: toPlayerManifest(manifest),
  });
}
