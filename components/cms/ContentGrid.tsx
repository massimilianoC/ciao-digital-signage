"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppWindow, ChevronDown, ChevronRight, FileText, Globe, ImageIcon, LayoutGrid, Music2, Rows3, Trash2, Video } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ContentPreviewModal } from "@/components/cms/ContentPreviewModal";
import { getContentDisplayName, type ContentItem } from "@/components/cms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ContentGridProps {
  initialItems: ContentItem[];
  orgId: string;
}

interface ContentUsageInfo {
  counts: {
    playlist: number;
    schedule: number;
    screen: number;
    layout: number;
    forceOverride: number;
  };
}

type SearchOperator = "AND" | "OR" | "NOT";
type ViewMode = "grid" | "list" | "compact";
type ContentStatusFilter = "all" | "active" | "suspended";
type SemanticCategory = "media" | "docs" | "webapps";
type MediaSubtype = "all" | "image" | "video" | "audio";
type DocSubtype = "all" | "pdf" | "other";

interface SearchChip {
  id: string;
  term: string;
  operator: SearchOperator;
}

const semanticCategories: SemanticCategory[] = ["media", "docs", "webapps"];

const WEBAPP_GENERIC_TAGS = new Set(["webapp", "web-app", "instance", "instances", "connector", "content"]);

function isAudio(item: ContentItem): boolean {
  const mime = (item.mimeType ?? "").toLowerCase();
  return mime.startsWith("audio/");
}

function isPdf(item: ContentItem): boolean {
  if (item.urlSubtype === "pdf") {
    return true;
  }

  const mime = (item.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf") {
    return true;
  }

  return item.url.toLowerCase().includes(".pdf");
}

function isWebappInstance(item: ContentItem): boolean {
  if ((item.tags ?? []).some((tag) => tag.toLowerCase() === "webapp")) {
    return true;
  }

  const folder = (item.folder ?? "").toLowerCase();
  if (folder.includes("/connectors/")) {
    return true;
  }

  return item.url.toLowerCase().includes("/webapps/");
}

function isDocument(item: ContentItem): boolean {
  if (isPdf(item)) {
    return true;
  }

  const mime = (item.mimeType ?? "").toLowerCase();
  return mime.startsWith("application/") && !isWebappInstance(item);
}

function isMedia(item: ContentItem): boolean {
  if (isWebappInstance(item) || isDocument(item)) {
    return false;
  }

  return item.type === "image" || item.type === "video" || isAudio(item);
}

function titleize(value: string): string {
  const cleaned = value.replace(/[-_]+/g, " ").trim();
  if (!cleaned) {
    return "Other";
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getWebappGroup(item: ContentItem): string {
  const specificTag = (item.tags ?? [])
    .map((tag) => tag.toLowerCase())
    .find((tag) => !WEBAPP_GENERIC_TAGS.has(tag));

  if (specificTag) {
    return specificTag;
  }

  const folderMatch = (item.folder ?? "").toLowerCase().match(/\/connectors\/([^/]+)/);
  if (folderMatch?.[1]) {
    return folderMatch[1];
  }

  const urlMatch = item.url.toLowerCase().match(/\/webapps\/([^/?]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  return "other";
}

export function ContentGrid({ initialItems }: ContentGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [filterInput, setFilterInput] = useState("");
  const [searchChips, setSearchChips] = useState<SearchChip[]>([]);
  const [nextOperator, setNextOperator] = useState<SearchOperator>("AND");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState<ContentStatusFilter>("all");
  const [activeCategory, setActiveCategory] = useState<SemanticCategory>("media");
  const [activeMediaSubtype, setActiveMediaSubtype] = useState<MediaSubtype>("all");
  const [activeDocSubtype, setActiveDocSubtype] = useState<DocSubtype>("all");
  const [activeWebappGroup, setActiveWebappGroup] = useState<string>("all");
  const [collapsedWebappGroups, setCollapsedWebappGroups] = useState<Record<string, boolean>>({});
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [usageById, setUsageById] = useState<Record<string, ContentUsageInfo | undefined>>({});
  const [loadingUsageId, setLoadingUsageId] = useState<string | null>(null);

  const loadUsage = useCallback(async (id: string) => {
    if (usageById[id] || loadingUsageId === id) {
      return;
    }

    setLoadingUsageId(id);
    try {
      const response = await fetch(`/api/content/${id}/usage`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const usage = (await response.json()) as ContentUsageInfo;
      setUsageById((previous) => ({ ...previous, [id]: usage }));
    } finally {
      setLoadingUsageId((current) => (current === id ? null : current));
    }
  }, [loadingUsageId, usageById]);

  const normalizedFilterInput = filterInput.trim().toLowerCase();

  useEffect(() => {
    const mediaId = searchParams.get("media");
    if (!mediaId) {
      setPreviewItem(null);
      return;
    }

    const found = items.find((item) => item._id === mediaId) ?? null;
    setPreviewItem(found);
  }, [items, searchParams]);

  const updateMediaQuery = useCallback((mediaId: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (mediaId) {
      nextParams.set("media", mediaId);
    } else {
      nextParams.delete("media");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete content");
      }
      setItems((prev) => prev.filter((item) => item._id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
      alert(error instanceof Error ? error.message : "Failed to delete content");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const addSearchChip = useCallback(() => {
    const term = filterInput.trim();
    if (!term) {
      return;
    }

    setSearchChips((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        term,
        operator: nextOperator,
      },
    ]);
    setFilterInput("");
  }, [filterInput, nextOperator]);

  const removeSearchChip = useCallback((chipId: string) => {
    setSearchChips((previous) => previous.filter((chip) => chip.id !== chipId));
  }, []);

  const baseFilteredItems = useMemo(() => {
    const andTerms = searchChips
      .filter((chip) => chip.operator === "AND")
      .map((chip) => chip.term.toLowerCase());
    const orTerms = searchChips
      .filter((chip) => chip.operator === "OR")
      .map((chip) => chip.term.toLowerCase());
    const notTerms = searchChips
      .filter((chip) => chip.operator === "NOT")
      .map((chip) => chip.term.toLowerCase());

    return items.filter((item) => {
      const itemName = typeof item.name === "string" ? item.name : String(item.name ?? "");
      const displayName = getContentDisplayName(item);
      const searchable = [
        displayName,
        itemName,
        item.type,
        item.folder ?? "",
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();

      const chipModeActive = searchChips.length > 0;
      const matchesAnd = andTerms.every((term) => searchable.includes(term));
      const matchesOr = orTerms.length === 0 || orTerms.some((term) => searchable.includes(term));
      const matchesNot = notTerms.every((term) => !searchable.includes(term));
      const matchesFilter = chipModeActive
        ? matchesAnd && matchesOr && matchesNot
        : normalizedFilterInput.length === 0 || searchable.includes(normalizedFilterInput);
      const itemStatus = item.status ?? "active";
      const matchesStatus = statusFilter === "all" ? true : itemStatus === statusFilter;
      return matchesFilter && matchesStatus;
    });
  }, [items, normalizedFilterInput, searchChips, statusFilter]);

  const webappGroups = useMemo(() => {
    const groups = new Set<string>();

    for (const item of baseFilteredItems) {
      if (isWebappInstance(item)) {
        groups.add(getWebappGroup(item));
      }
    }

    return ["all", ...Array.from(groups).sort()];
  }, [baseFilteredItems]);

  useEffect(() => {
    if (activeWebappGroup !== "all" && !webappGroups.includes(activeWebappGroup)) {
      setActiveWebappGroup("all");
    }
  }, [activeWebappGroup, webappGroups]);

  const filteredItems = useMemo(() => {
    return baseFilteredItems.filter((item) => {
      if (activeCategory === "media") {
        if (!isMedia(item)) {
          return false;
        }

        if (activeMediaSubtype === "all") {
          return true;
        }

        if (activeMediaSubtype === "image") {
          return item.type === "image";
        }

        if (activeMediaSubtype === "video") {
          return item.type === "video";
        }

        return isAudio(item);
      }

      if (activeCategory === "docs") {
        if (!isDocument(item)) {
          return false;
        }

        if (activeDocSubtype === "all") {
          return true;
        }

        if (activeDocSubtype === "pdf") {
          return isPdf(item);
        }

        return !isPdf(item);
      }

      if (!isWebappInstance(item)) {
        return false;
      }

      if (activeWebappGroup === "all") {
        return true;
      }

      return getWebappGroup(item) === activeWebappGroup;
    });
  }, [activeCategory, activeDocSubtype, activeMediaSubtype, activeWebappGroup, baseFilteredItems]);

  const groupedWebappItems = useMemo(() => {
    if (activeCategory !== "webapps") {
      return [] as Array<{ group: string; items: ContentItem[] }>;
    }

    const map = new Map<string, ContentItem[]>();

    for (const item of filteredItems) {
      const group = getWebappGroup(item);
      const current = map.get(group) ?? [];
      current.push(item);
      map.set(group, current);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, grouped]) => ({
        group,
        items: grouped.sort((left, right) => {
          const leftTime = Date.parse(left.createdAt);
          const rightTime = Date.parse(right.createdAt);
          return Number.isNaN(rightTime) || Number.isNaN(leftTime) ? 0 : rightTime - leftTime;
        }),
      }));
  }, [activeCategory, filteredItems]);

  const categoryCounts = useMemo(() => {
    let media = 0;
    let docs = 0;
    let webapps = 0;

    for (const item of baseFilteredItems) {
      if (isWebappInstance(item)) {
        webapps += 1;
      } else if (isDocument(item)) {
        docs += 1;
      } else if (isMedia(item)) {
        media += 1;
      }
    }

    return { media, docs, webapps };
  }, [baseFilteredItems]);

  const mediaSubtypeCounts = useMemo(() => {
    let image = 0;
    let video = 0;
    let audio = 0;

    for (const item of baseFilteredItems) {
      if (!isMedia(item)) {
        continue;
      }

      if (item.type === "image") {
        image += 1;
      } else if (item.type === "video") {
        video += 1;
      } else if (isAudio(item)) {
        audio += 1;
      }
    }

    return {
      all: image + video + audio,
      image,
      video,
      audio,
    };
  }, [baseFilteredItems]);

  const docSubtypeCounts = useMemo(() => {
    let pdf = 0;
    let other = 0;

    for (const item of baseFilteredItems) {
      if (!isDocument(item)) {
        continue;
      }

      if (isPdf(item)) {
        pdf += 1;
      } else {
        other += 1;
      }
    }

    return {
      all: pdf + other,
      pdf,
      other,
    };
  }, [baseFilteredItems]);

  const webappGroupFacetCounts = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of baseFilteredItems) {
      if (!isWebappInstance(item)) {
        continue;
      }

      const group = getWebappGroup(item);
      map.set(group, (map.get(group) ?? 0) + 1);
    }

    return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [baseFilteredItems]);

  useEffect(() => {
    const validGroups = new Set(groupedWebappItems.map((entry) => entry.group));
    setCollapsedWebappGroups((previous) => {
      const next: Record<string, boolean> = {};

      for (const [group, isCollapsed] of Object.entries(previous)) {
        if (validGroups.has(group)) {
          next[group] = isCollapsed;
        }
      }

      return next;
    });
  }, [groupedWebappItems]);

  const collapseAllGroups = useCallback(() => {
    setCollapsedWebappGroups(
      groupedWebappItems.reduce<Record<string, boolean>>((accumulator, entry) => {
        accumulator[entry.group] = true;
        return accumulator;
      }, {}),
    );
  }, [groupedWebappItems]);

  const expandAllGroups = useCallback(() => {
    setCollapsedWebappGroups(
      groupedWebappItems.reduce<Record<string, boolean>>((accumulator, entry) => {
        accumulator[entry.group] = false;
        return accumulator;
      }, {}),
    );
  }, [groupedWebappItems]);

  const toggleGroupCollapsed = useCallback((group: string) => {
    setCollapsedWebappGroups((previous) => ({
      ...previous,
      [group]: !previous[group],
    }));
  }, []);

  const renderDeleteAction = (item: ContentItem, mode: ViewMode) => (
    <div
      className={
        mode === "grid"
          ? "absolute top-1 right-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity"
          : "relative z-10 shrink-0 opacity-100"
      }
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <AlertDialog>
        <AlertDialogTrigger
          aria-label={`Delete ${getContentDisplayName(item)}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-destructive hover:bg-destructive hover:text-destructive-foreground backdrop-blur-sm transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void loadUsage(item._id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete content</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{getContentDisplayName(item)}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 text-foreground">Permanent removal warning</p>
              <p className="mb-2">This media will be permanently removed from all playlists and scheduling contexts that currently reference it.</p>
              {loadingUsageId === item._id && !usageById[item._id] ? (
                <p>Checking usage...</p>
              ) : usageById[item._id] ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Impact analysis before delete</p>
                  <p>Playlists: {usageById[item._id]?.counts?.playlist ?? 0}</p>
                  <p>Schedules: {usageById[item._id]?.counts?.schedule ?? 0}</p>
                  <p>Screens (default playlist): {usageById[item._id]?.counts?.screen ?? 0}</p>
                  <p>Force overrides: {usageById[item._id]?.counts?.forceOverride ?? 0}</p>
                  <p>Layouts: prototype only (not tracked yet)</p>
                </div>
              ) : (
                <p>Usage details unavailable. Proceed carefully.</p>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingId === item._id}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item._id);
              }}
            >
              {deletingId === item._id ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search content..."
          value={filterInput}
          onChange={(event) => setFilterInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addSearchChip();
            }
          }}
          className="max-w-xs"
        />
        <select
          value={nextOperator}
          onChange={(event) => setNextOperator(event.target.value as SearchOperator)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
          <option value="NOT">NOT</option>
        </select>
        <Button size="sm" variant="outline" onClick={addSearchChip}>Add criterion</Button>
        {searchChips.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setSearchChips([])}>Clear criteria</Button>
        ) : null}

        {semanticCategories.map((category) => (
          <Button
            key={category}
            variant={category === activeCategory ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(category)}
          >
            {category === "media" ? "Media" : category === "docs" ? "Docs" : "WebApp Instances"}
          </Button>
        ))}

        {activeCategory === "media" ? (
          <>
            <div className="h-6 w-px bg-border" />
            {(["all", "image", "video", "audio"] as MediaSubtype[]).map((subtype) => (
              <Button
                key={subtype}
                size="sm"
                variant={activeMediaSubtype === subtype ? "default" : "outline"}
                onClick={() => setActiveMediaSubtype(subtype)}
              >
                {subtype[0].toUpperCase() + subtype.slice(1)}
              </Button>
            ))}
          </>
        ) : null}

        {activeCategory === "docs" ? (
          <>
            <div className="h-6 w-px bg-border" />
            {(["all", "pdf", "other"] as DocSubtype[]).map((subtype) => (
              <Button
                key={subtype}
                size="sm"
                variant={activeDocSubtype === subtype ? "default" : "outline"}
                onClick={() => setActiveDocSubtype(subtype)}
              >
                {subtype === "other" ? "Other docs" : subtype.toUpperCase()}
              </Button>
            ))}
          </>
        ) : null}

        {activeCategory === "webapps" ? (
          <>
            <div className="h-6 w-px bg-border" />
            {webappGroups.map((group) => (
              <Button
                key={group}
                size="sm"
                variant={activeWebappGroup === group ? "default" : "outline"}
                onClick={() => setActiveWebappGroup(group)}
              >
                {group === "all" ? "All webapps" : titleize(group)}
              </Button>
            ))}
          </>
        ) : null}

        <div className="h-6 w-px bg-border" />
        <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>All status</Button>
        <Button size="sm" variant={statusFilter === "active" ? "default" : "outline"} onClick={() => setStatusFilter("active")}>Active</Button>
        <Button size="sm" variant={statusFilter === "suspended" ? "default" : "outline"} onClick={() => setStatusFilter("suspended")}>Suspended</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant={viewMode === "grid" ? "default" : "outline"} onClick={() => setViewMode("grid")}>
            <LayoutGrid className="h-4 w-4" />
            Grid
          </Button>
          <Button size="sm" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>
            <Rows3 className="h-4 w-4" />
            List
          </Button>
          <Button size="sm" variant={viewMode === "compact" ? "default" : "outline"} onClick={() => setViewMode("compact")}>
            No icons
          </Button>
        </div>
      </div>

      {searchChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {searchChips.map((chip) => (
            <div key={chip.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-xs">
              <span className="font-semibold text-muted-foreground">{chip.operator}</span>
              <span>{chip.term}</span>
              <button
                type="button"
                onClick={() => removeSearchChip(chip.id)}
                className="ml-1 rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Remove ${chip.term}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-card p-3 h-fit">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</p>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => setActiveCategory("media")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeCategory === "media" ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
            >
              <span>Media</span>
              <Badge variant="secondary" className="text-[10px]">{categoryCounts.media}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("docs")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeCategory === "docs" ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
            >
              <span>Docs</span>
              <Badge variant="secondary" className="text-[10px]">{categoryCounts.docs}</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("webapps")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeCategory === "webapps" ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
            >
              <span>WebApp Instances</span>
              <Badge variant="secondary" className="text-[10px]">{categoryCounts.webapps}</Badge>
            </button>
          </div>

          {activeCategory === "media" ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Media Type</p>
              <div className="mt-2 space-y-1">
                {([
                  ["all", mediaSubtypeCounts.all],
                  ["image", mediaSubtypeCounts.image],
                  ["video", mediaSubtypeCounts.video],
                  ["audio", mediaSubtypeCounts.audio],
                ] as Array<[MediaSubtype, number]>).map(([subtype, count]) => (
                  <button
                    key={subtype}
                    type="button"
                    onClick={() => setActiveMediaSubtype(subtype)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeMediaSubtype === subtype ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
                  >
                    <span>{subtype[0].toUpperCase() + subtype.slice(1)}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeCategory === "docs" ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document Type</p>
              <div className="mt-2 space-y-1">
                {([
                  ["all", docSubtypeCounts.all],
                  ["pdf", docSubtypeCounts.pdf],
                  ["other", docSubtypeCounts.other],
                ] as Array<[DocSubtype, number]>).map(([subtype, count]) => (
                  <button
                    key={subtype}
                    type="button"
                    onClick={() => setActiveDocSubtype(subtype)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeDocSubtype === subtype ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
                  >
                    <span>{subtype === "other" ? "Other docs" : subtype.toUpperCase()}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeCategory === "webapps" ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WebApp Type</p>
              <div className="mt-2 space-y-1 max-h-60 overflow-auto pr-1">
                <button
                  type="button"
                  onClick={() => setActiveWebappGroup("all")}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeWebappGroup === "all" ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
                >
                  <span>All webapps</span>
                  <Badge variant="secondary" className="text-[10px]">{categoryCounts.webapps}</Badge>
                </button>
                {webappGroupFacetCounts.map(([group, count]) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActiveWebappGroup(group)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${activeWebappGroup === group ? "bg-accent text-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}
                  >
                    <span>{titleize(group)}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div>
        {activeCategory === "webapps" && groupedWebappItems.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={expandAllGroups}>Expand all</Button>
              <Button size="sm" variant="outline" onClick={collapseAllGroups}>Collapse all</Button>
            </div>
            {groupedWebappItems.map((grouped) => (
              <section key={grouped.group} className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(grouped.group)}
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold hover:bg-accent"
                  >
                    {collapsedWebappGroups[grouped.group] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {titleize(grouped.group)}
                  </button>
                  <Badge variant="secondary" className="text-xs">{grouped.items.length}</Badge>
                </div>
                {collapsedWebappGroups[grouped.group] ? null : (
                <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" : "space-y-2"}>
                  {grouped.items.map((item) => {
                    const displayName = getContentDisplayName(item);
                    if (viewMode === "grid") {
                      return (
                        <Card
                          key={item._id}
                          className={`group relative cursor-pointer transition-shadow ${item.status === "suspended" ? "opacity-60 grayscale" : "hover:shadow-md"}`}
                          onClick={() => {
                            setPreviewItem(item);
                            updateMediaQuery(item._id);
                          }}
                        >
                          {renderDeleteAction(item, "grid")}
                          <div className="aspect-video bg-muted rounded-t overflow-hidden flex items-center justify-center">
                            <AppWindow className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <CardContent className="p-2">
                            <p className="text-xs font-medium truncate">{displayName}</p>
                            <Badge variant="outline" className="text-xs mt-1">WebApp</Badge>
                            {item.status === "suspended" ? (
                              <Badge variant="secondary" className="ml-1 text-xs mt-1">suspended</Badge>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    }

                    return (
                      <div
                        key={item._id}
                        className="group relative flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent/30"
                        onClick={() => {
                          setPreviewItem(item);
                          updateMediaQuery(item._id);
                        }}
                      >
                        <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
                          <AppWindow className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">WebApp instance {item.folder ? `· ${item.folder}` : ""}</p>
                        </div>
                        {renderDeleteAction(item, viewMode === "list" ? "list" : "compact")}
                      </div>
                    );
                  })}
                </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" : "space-y-2"}>
            {filteredItems.map((item) => {
          const displayName = getContentDisplayName(item);
          if (viewMode === "grid") {
            return (
              <Card
                key={item._id}
                className={`group relative cursor-pointer transition-shadow ${item.status === "suspended" ? "opacity-60 grayscale" : "hover:shadow-md"}`}
                onClick={() => {
                  setPreviewItem(item);
                  updateMediaQuery(item._id);
                }}
              >
                {renderDeleteAction(item, "grid")}
                <div className="aspect-video bg-muted rounded-t overflow-hidden flex items-center justify-center">
                  {item.type === "image" && (
                    <img src={item.thumbnailUrl || item.url} alt={displayName} className="w-full h-full object-cover" />
                  )}
                  {item.type === "video" && <Video className="h-6 w-6 text-muted-foreground" />}
                  {isAudio(item) && <Music2 className="h-6 w-6 text-muted-foreground" />}
                  {isPdf(item) && <FileText className="h-6 w-6 text-muted-foreground" />}
                  {!isAudio(item) && !isPdf(item) && (item.type === "widget" || (item.type === "url" && item.urlSubtype !== "pdf")) && <Globe className="h-6 w-6 text-muted-foreground" />}
                </div>
                <CardContent className="p-2">
                  <p className="text-xs font-medium truncate">{displayName}</p>
                  {item.alias?.trim() ? (
                    <p className="text-[10px] truncate text-muted-foreground">Original: {item.name}</p>
                  ) : null}
                  <Badge variant="outline" className="text-xs mt-1">
                    {item.type}
                  </Badge>
                  {item.status === "suspended" ? (
                    <Badge variant="secondary" className="ml-1 text-xs mt-1">suspended</Badge>
                  ) : null}
                </CardContent>
              </Card>
            );
          }

          if (viewMode === "list") {
            return (
              <div
                key={item._id}
                className="group relative flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent/30"
                onClick={() => {
                  setPreviewItem(item);
                  updateMediaQuery(item._id);
                }}
              >
                <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
                  {item.type === "image" ? (
                    <img src={item.thumbnailUrl || item.url} alt={displayName} className="h-full w-full object-cover" />
                  ) : isPdf(item) ? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  ) : isAudio(item) ? (
                    <Music2 className="h-4 w-4 text-muted-foreground" />
                  ) : item.type === "video" ? (
                    <Video className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.type} {item.folder ? `· ${item.folder}` : ""}</p>
                </div>
                <Badge variant="outline" className="text-xs">{item.type}</Badge>
                {item.status === "suspended" ? <Badge variant="secondary" className="text-xs">suspended</Badge> : null}
                {renderDeleteAction(item, "list")}
              </div>
            );
          }

          return (
            <div
              key={item._id}
              className="group relative flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent/30"
              onClick={() => {
                setPreviewItem(item);
                updateMediaQuery(item._id);
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.type}
                  {item.tags && item.tags.length > 0 ? ` · ${item.tags.join(", ")}` : ""}
                </p>
              </div>
              {renderDeleteAction(item, "compact")}
            </div>
          );
            })}

            {filteredItems.length === 0 && (
              <div className={`${viewMode === "grid" ? "col-span-full" : ""} border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground`}>
                <ImageIcon className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">No content found.</p>
              </div>
            )}
          </div>
        )}

        {activeCategory === "webapps" && groupedWebappItems.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
            <AppWindow className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">No WebApp instances found.</p>
          </div>
        ) : null}
        </div>
      </div>

      <ContentPreviewModal
        item={previewItem}
        open={Boolean(previewItem)}
        onItemUpdated={(updatedItem) => {
          setItems((previous) => previous.map((item) => (item._id === updatedItem._id ? updatedItem : item)));
          setPreviewItem(updatedItem);
        }}
        onItemDeleted={(itemId) => {
          setItems((previous) => previous.filter((item) => item._id !== itemId));
          setPreviewItem(null);
          updateMediaQuery(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
            updateMediaQuery(null);
          }
        }}
      />
    </div>
  );
}
