export interface ContentItem {
  _id: string;
  name: string;
  alias?: string;
  status?: "active" | "suspended";
  type: "image" | "video" | "url" | "widget";
  url: string;
  urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
  thumbnailUrl?: string;
  backgroundColor?: string | null;
  tags?: string[];
  folder?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  createdAt: string;
}

export function getContentDisplayName(content: Pick<ContentItem, "name" | "alias">): string {
  const alias = typeof content.alias === "string" ? content.alias.trim() : "";
  if (alias) {
    return alias;
  }

  return typeof content.name === "string" && content.name.trim() ? content.name : "Untitled content";
}

export interface PlaylistItem {
  _id: string;
  contentId: string;
  name: string;
  type: "image" | "video" | "url" | "widget";
  urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
  thumbnailUrl?: string;
  previewUrl?: string;
  fileSizeBytes?: number;
  fitMode?: "cover" | "fit";
  backgroundColor?: string | null;
  durationSeconds: number;
  durationOverride?: boolean;
}
