"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { ContentPickerDialog } from "@/components/cms/ContentPickerDialog";
import { getContentDisplayName, type ContentItem, type PlaylistItem } from "@/components/cms/types";
import { Button } from "@/components/ui/button";

interface PlaylistAddContentProps {
  playlistId: string;
  currentItems: PlaylistItem[];
}

const DEFAULT_DURATION_MS = 10_000;

type PlaylistApiItem = {
  contentId:
    | string
    | {
      _id?: string;
      type?: "image" | "video" | "url" | "widget";
      config?: {
        urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
      };
    };
  title?: string;
  thumbnailUrl?: string;
  fitMode?: "cover" | "fit";
  backgroundColor?: string | null;
  durationMs?: number | null;
  durationOverride?: boolean;
};

type PlaylistApiResponse = {
  items?: PlaylistApiItem[];
};

export function PlaylistAddContent({
  playlistId,
  currentItems,
}: PlaylistAddContentProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async (selectedItems: ContentItem[]) => {
    if (selectedItems.length === 0 || saving) return;

    setOpen(false);
    setSaving(true);

    try {
      let sourceItems: Array<{
        contentId: string;
        title?: string;
        thumbnailUrl?: string;
        fitMode: "cover" | "fit";
        backgroundColor?: string | null;
        durationMs: number | null;
        durationOverride: boolean;
      }> = [];

      const latest = await fetch(`/api/playlists/${playlistId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (latest.ok) {
        const body = (await latest.json()) as PlaylistApiResponse;
        sourceItems = (body.items ?? []).flatMap((item) => {
            const rawContentId =
              typeof item.contentId === "string"
                ? item.contentId
                : item.contentId?._id;
            const contentId =
              typeof rawContentId === "string" ? rawContentId : "";

            if (!contentId) return [];

            const fitMode: "cover" | "fit" = item.fitMode === "fit" ? "fit" : "cover";
            const contentType = typeof item.contentId === "object" ? item.contentId?.type : undefined;
            const urlSubtype = typeof item.contentId === "object" ? item.contentId?.config?.urlSubtype : undefined;
            const isVideoLike = contentType === "video" || (contentType === "url" && urlSubtype === "video");
            const durationOverride = isVideoLike ? item.durationOverride === true : true;

            return [{
              contentId,
              title: item.title,
              thumbnailUrl: item.thumbnailUrl,
              fitMode,
              backgroundColor: item.backgroundColor,
              durationMs: durationOverride ? (item.durationMs ?? DEFAULT_DURATION_MS) : null,
              durationOverride,
            }];
          });
      } else {
        sourceItems = currentItems.map((item) => {
          const isVideoLike = item.type === "video" || (item.type === "url" && item.urlSubtype === "video");
          const durationOverride = isVideoLike ? item.durationOverride === true : true;
          return {
            contentId: item.contentId,
            title: item.name,
            thumbnailUrl: item.thumbnailUrl,
            fitMode: item.fitMode === "fit" ? "fit" : "cover",
            backgroundColor: item.backgroundColor,
            durationMs: durationOverride ? item.durationSeconds * 1000 : null,
            durationOverride,
          };
        });
      }

      // Keep existing order and durations, but normalize duplicate content IDs.
      const existingByContentId = new Map<string, {
        contentId: string;
        title?: string;
        thumbnailUrl?: string;
        fitMode: "cover" | "fit";
        backgroundColor?: string | null;
        durationMs: number | null;
        durationOverride: boolean;
      }>();
      for (const item of sourceItems) {
        if (!existingByContentId.has(item.contentId)) {
          existingByContentId.set(item.contentId, {
            contentId: item.contentId,
            title: item.title,
            thumbnailUrl: item.thumbnailUrl,
            fitMode: item.fitMode,
            backgroundColor: item.backgroundColor ?? null,
            durationMs: item.durationMs,
            durationOverride: item.durationOverride,
          });
        }
      }
      const existingPayload = Array.from(existingByContentId.values());

      // Add only new selected items not already in playlist.
      const selectedNewByContentId = new Map<string, {
        contentId: string;
        title: string;
        thumbnailUrl?: string;
        fitMode: "cover" | "fit";
        backgroundColor?: string | null;
        durationMs: number | null;
        durationOverride: boolean;
      }>();
      for (const item of selectedItems) {
        if (existingByContentId.has(item._id)) continue;
        if (!selectedNewByContentId.has(item._id)) {
          const isVideoLike = item.type === "video" || (item.type === "url" && item.urlSubtype === "video");
          selectedNewByContentId.set(item._id, {
            contentId: item._id,
            title: getContentDisplayName(item),
            thumbnailUrl: item.thumbnailUrl,
            fitMode: "cover",
            backgroundColor: item.backgroundColor ?? null,
            durationMs: isVideoLike ? null : DEFAULT_DURATION_MS,
            durationOverride: !isVideoLike,
          });
        }
      }

      if (selectedNewByContentId.size === 0) {
        return;
      }

      const combined = [...existingPayload, ...Array.from(selectedNewByContentId.values())];

      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: combined }),
      });

      if (!res.ok) {
        console.error("Failed to add content:", await res.text());
      }

      // Refresh server data so the PlaylistSortable picks up the new items
      router.refresh();
    } catch (err) {
      console.error("Failed to add content:", err);
    } finally {
      setSaving(false);
    }
  };

  const existingContentIds = currentItems.map((item) => item.contentId);

  return (
    <>
      <Button
        onClick={() => {
          setDialogKey((k) => k + 1);
          setOpen(true);
        }}
        disabled={saving}
        size="sm"
      >
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Adding…" : "Add Content"}
      </Button>

      <ContentPickerDialog
        key={dialogKey}
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        existingContentIds={existingContentIds}
      />
    </>
  );
}
