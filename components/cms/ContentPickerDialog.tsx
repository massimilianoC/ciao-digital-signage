"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Globe,
  ImageIcon,
  Loader2,
  Puzzle,
  Search,
  Video,
} from "lucide-react";

import { getContentDisplayName, type ContentItem } from "@/components/cms/types";
import { DropUploader } from "@/components/cms/DropUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms the selection. */
  onConfirm: (items: ContentItem[]) => Promise<void> | void;
  /** Optional list of content IDs already in the playlist (shown as dimmed). */
  existingContentIds?: string[];
}

type PickerView = "browse" | "upload";

type UploadApiItem = {
  _id: string;
  name: string;
  alias?: string;
  type: ContentItem["type"];
  thumbnailUrl?: string;
  createdAt?: string;
  config?: {
    fileUrl?: string;
    url?: string;
  };
};

const CONTENT_TYPES: Array<"all" | ContentItem["type"]> = [
  "all",
  "image",
  "video",
  "url",
  "widget",
];

const typeIcon: Record<ContentItem["type"], React.ReactNode> = {
  image: <ImageIcon className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  url: <Globe className="h-4 w-4" />,
  widget: <Puzzle className="h-4 w-4" />,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ContentPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  existingContentIds = [],
}: ContentPickerDialogProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<PickerView>("browse");
  const [activeType, setActiveType] = useState<(typeof CONTENT_TYPES)[number]>(
    "all",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const normalizedSearch = search.toLowerCase();

  const mapApiItem = useCallback((item: UploadApiItem): ContentItem => {
    return {
      _id: item._id,
      name: item.name,
      alias: item.alias,
      type: item.type,
      url: item.config?.fileUrl ?? item.config?.url ?? "",
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt ?? new Date().toISOString(),
    };
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/content?includeInternalWebappAssets=true", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load content");
      }

      const data = (await res.json()) as ContentItem[];
      setItems(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Fetch content on mount (parent remounts via key when dialog opens) */
  useEffect(() => {
    void loadItems();

    return undefined;
  }, [loadItems]);

  const handleUploadComplete = useCallback(
    (uploadedItem: UploadApiItem) => {
      const normalized = mapApiItem(uploadedItem);
      setItems((previous) => {
        const filteredItems = previous.filter((item) => item._id !== normalized._id);
        return [normalized, ...filteredItems];
      });
      setSelected((previous) => {
        const next = new Set(previous);
        next.add(normalized._id);
        return next;
      });
      setSearch("");
      setActiveType(normalized.type);
      setView("browse");
    },
    [mapApiItem],
  );

  /* Derived filtered list */
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const itemName =
        typeof item.name === "string" ? item.name : String(item.name ?? "");
      const displayName = getContentDisplayName(item);
      const matchesSearch = `${displayName} ${itemName}`.toLowerCase().includes(normalizedSearch);
      const matchesType =
        activeType === "all" ? true : item.type === activeType;
      return matchesSearch && matchesType;
    });
  }, [items, normalizedSearch, activeType]);

  const existingSet = useMemo(
    () => new Set(existingContentIds),
    [existingContentIds],
  );

  /* Selection helpers */
  const toggleSelection = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    if (submitting) return;
    const selectedItems = items.filter((item) => selected.has(item._id));
    setSubmitting(true);
    try {
      await onConfirm(selectedItems);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Content to Playlist</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={view === "browse" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("browse")}
          >
            Browse library
          </Button>
          <Button
            type="button"
            variant={view === "upload" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("upload")}
          >
            Upload files
          </Button>
        </div>

        {view === "browse" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search content..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {CONTENT_TYPES.map((type) => (
                <Button
                  key={type}
                  variant={type === activeType ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveType(type)}
                >
                  {type === "all"
                    ? "All"
                    : type[0].toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>

            <ScrollArea className="flex-1 min-h-0 mt-2">
              {loading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading content…
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center py-16 text-destructive">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mb-2" />
                  <p className="text-sm">No content found.</p>
                </div>
              )}

              {!loading && !error && filtered.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-2">
                  {filtered.map((item) => {
                    const isSelected = selected.has(item._id);
                    const isExisting = existingSet.has(item._id);

                    return (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => {
                          if (isExisting) return;
                          toggleSelection(item._id);
                        }}
                        disabled={isExisting || submitting}
                        className={`
                      relative rounded-lg border text-left transition-all
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      ${isSelected
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border hover:border-muted-foreground/40 hover:shadow-sm"
                      }
                      ${isExisting ? "opacity-60" : ""}
                    `}
                      >
                        <div className="aspect-video bg-muted rounded-t-lg overflow-hidden flex items-center justify-center">
                          {item.type === "image" && item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={getContentDisplayName(item)}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              {typeIcon[item.type]}
                            </span>
                          )}
                        </div>

                        <div className="p-2">
                          <p className="text-xs font-medium truncate">
                            {getContentDisplayName(item)}
                          </p>
                          {item.alias?.trim() ? (
                            <p className="text-[10px] truncate text-muted-foreground">Original: {item.name}</p>
                          ) : null}
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {item.type}
                          </Badge>
                          {isExisting && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] mt-1 ml-1"
                            >
                              already added
                            </Badge>
                          )}
                        </div>

                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 rounded-full bg-primary p-0.5 text-primary-foreground">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Upload media without leaving the playlist editor. Newly uploaded items are selected automatically and returned to the library view.
            </div>
            <DropUploader
              onUploadComplete={handleUploadComplete}
              onUrlSaved={() => {
                onOpenChange(false);
              }}
            />
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-0">
          <p className="text-xs text-muted-foreground mr-auto">
            {selected.size} item{selected.size !== 1 ? "s" : ""} selected
          </p>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            disabled={selected.size === 0 || submitting}
            onClick={handleConfirm}
          >
            {submitting ? "Adding..." : "Add Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
