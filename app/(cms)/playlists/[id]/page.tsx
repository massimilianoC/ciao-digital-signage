import { headers } from "next/headers";
import { Types } from "mongoose";

import { PlaylistAddContent } from "@/components/cms/PlaylistAddContent";
import { PlaylistAssignmentsAccordion } from "@/components/cms/PlaylistAssignmentsAccordion";
import { PlaylistMetaBox } from "@/components/cms/PlaylistMetaBox";
import { PlaylistNameEditor } from "@/components/cms/PlaylistNameEditor";
import { PlaylistSortable } from "@/components/cms/PlaylistSortable";
import { type PlaylistItem } from "@/components/cms/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { type IContentItem } from "@/lib/db/models/Content";
import { ForceOverride } from "@/lib/db/models/ForceOverride";
import { Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";
import { PlaylistService } from "@/lib/services/playlist.service";

type Params = { params: Promise<{ id: string }> };

type PlaylistWithPopulatedItems = {
  name: string;
  status?: "active" | "suspended";
  createdAt: Date | string;
  updatedAt: Date | string;
  loop?: boolean;
  stopOnLastItem?: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
  transitionType?: "cut" | "fade";
  transitionMs?: number;
  items: Array<{
    title?: string;
    thumbnailUrl?: string;
    fitMode?: "cover" | "fit";
    backgroundColor?: string | null;
    contentId:
      | string
      | {
          _id?: string;
          name?: string;
          type?: IContentItem["type"];
          thumbnailUrl?: string;
          config?: {
            fileUrl?: string;
            fileSizeBytes?: number;
            urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
          };
        };
    durationMs?: number | null;
    durationOverride?: boolean;
  }>;
};

function normalizeAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) {
    return normalized;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function toPlainString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

function toByteSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (value && typeof value === "object") {
    const candidate = (value as { $numberLong?: unknown; valueOf?: () => unknown }).$numberLong
      ?? (typeof (value as { valueOf?: () => unknown }).valueOf === "function"
        ? (value as { valueOf: () => unknown }).valueOf()
        : undefined);

    if (candidate !== undefined && candidate !== value) {
      return toByteSize(candidate);
    }
  }

  return undefined;
}

function mapPlaylistItems(data: PlaylistWithPopulatedItems["items"]): PlaylistItem[] {
  return data.map((item, index) => {
    const populated = typeof item.contentId === "object" ? item.contentId : null;
    const contentId = populated?._id ? toPlainString(populated._id) : toPlainString(item.contentId);
    return {
      _id: `${contentId}-${index}`,
      contentId,
      name: item.title ? toPlainString(item.title) : populated?.name ? toPlainString(populated.name) : `Item ${index + 1}`,
      type: populated?.type ?? "image",
      urlSubtype: populated?.config?.urlSubtype,
      thumbnailUrl: normalizeAssetUrl(item.thumbnailUrl) ?? normalizeAssetUrl(populated?.thumbnailUrl),
      previewUrl: normalizeAssetUrl(populated?.config?.fileUrl),
      fileSizeBytes: toByteSize(populated?.config?.fileSizeBytes),
      fitMode: item.fitMode === "fit" ? "fit" : "cover",
      backgroundColor: typeof item.backgroundColor === "string" ? item.backgroundColor : null,
      durationSeconds: Math.max(1, Math.round((item.durationMs ?? 10000) / 1000)),
      durationOverride: item.durationOverride === true,
    };
  });
}

export default async function PlaylistEditorPage({ params }: Params) {
  const { id } = await params;

  let playlistName = "Playlist Editor";
  let playlistStatus: "active" | "suspended" = "active";
  let items: PlaylistItem[] = [];
  let loop = true;
  let stopOnLastItem = false;
  let fitModeOverride: "cover" | "fit" | null = null;
  let backgroundColorOverride: string | null = null;
  let transitionType: "cut" | "fade" = "fade";
  let transitionMs = 500;
  let createdAt = new Date().toISOString();
  let updatedAt = new Date().toISOString();
  let totalDurationSeconds = 0;
  let totalSizeBytes = 0;
  let lastEditedBy: string | null = null;
  let lastPlaybackAt: string | null = null;
  let assignments: Array<{ id: string; scope: "org" | "group" | "screen"; scopeId: string; name: string }> = [];
  let relatedPlayers: Array<{ id: string; name: string; status: "online" | "offline" | "pending"; lastSeenAt?: string | null }> = [];

  try {
    const authed = await getSessionAndOrg(await headers());
    const orgId = authed?.orgId;

    if (orgId) {
      await connectDB();
      const service = new PlaylistService(orgId);
      const playlist = (await service.getByIdPopulated(id)) as PlaylistWithPopulatedItems | null;

      if (playlist) {
        playlistName = playlist.name;
        playlistStatus = playlist.status ?? "active";
        items = mapPlaylistItems(playlist.items);
        totalDurationSeconds = items.reduce((sum, item) => sum + item.durationSeconds, 0);
        totalSizeBytes = items.reduce((sum, item) => sum + (item.fileSizeBytes ?? 0), 0);
        loop = playlist.loop ?? true;
        stopOnLastItem = playlist.stopOnLastItem ?? false;
        fitModeOverride = playlist.fitModeOverride ?? null;
        backgroundColorOverride = playlist.backgroundColorOverride ?? null;
        transitionType = playlist.transitionType === "cut" ? "cut" : "fade";
        transitionMs = typeof playlist.transitionMs === "number" ? Math.max(0, playlist.transitionMs) : 500;
        createdAt = new Date(playlist.createdAt).toISOString();
        updatedAt = new Date(playlist.updatedAt).toISOString();
        lastEditedBy = "Not tracked yet";
      }

      const orgObjectId = new Types.ObjectId(orgId);
      const playlistObjectId = new Types.ObjectId(id);

      const [schedules, defaultScreens, allGroups, activeOverride] = await Promise.all([
        Schedule.find({ orgId: orgObjectId, playlistId: playlistObjectId, isActive: true })
          .select({ _id: 1, scope: 1, scopeId: 1, name: 1 })
          .lean<Array<{ _id: Types.ObjectId; scope: "org" | "group" | "screen"; scopeId: Types.ObjectId; name: string }>>(),
        ScreenModel.find({ orgId: orgObjectId, defaultPlaylistId: playlistObjectId })
          .select({ _id: 1, name: 1, status: 1, lastSeenAt: 1 })
          .lean<Array<{ _id: Types.ObjectId; name: string; status: "online" | "offline" | "pending"; lastSeenAt?: Date | null }>>(),
        ScreenModel.find({ orgId: orgObjectId, groupId: { $exists: true, $ne: null } })
          .select({ _id: 1, groupId: 1, name: 1, status: 1, lastSeenAt: 1 })
          .lean<Array<{ _id: Types.ObjectId; groupId?: Types.ObjectId | null; name: string; status: "online" | "offline" | "pending"; lastSeenAt?: Date | null }>>(),
        ForceOverride.findOne({ orgId: orgObjectId, isActive: true, playlistId: playlistObjectId })
          .select({ _id: 1 })
          .lean<{ _id: Types.ObjectId } | null>(),
      ]);

      const relatedPlayerMap = new Map<string, { id: string; name: string; status: "online" | "offline" | "pending"; lastSeenAt?: string | null }>();

      for (const screen of defaultScreens) {
        relatedPlayerMap.set(screen._id.toString(), {
          id: screen._id.toString(),
          name: screen.name,
          status: screen.status,
          lastSeenAt: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
        });
      }

      assignments = schedules.map((schedule) => ({
        id: schedule._id.toString(),
        scope: schedule.scope,
        scopeId: schedule.scopeId.toString(),
        name: schedule.name,
      }));

      const groupIds = schedules
        .filter((schedule) => schedule.scope === "group")
        .map((schedule) => schedule.scopeId.toString());

      const screenIds = schedules
        .filter((schedule) => schedule.scope === "screen")
        .map((schedule) => schedule.scopeId.toString());

      for (const screen of allGroups) {
        const idString = screen._id.toString();
        const groupIdString = screen.groupId?.toString();
        const includedByGroup = groupIdString ? groupIds.includes(groupIdString) : false;
        const includedByScreen = screenIds.includes(idString);
        const includedByGlobal = schedules.some((schedule) => schedule.scope === "org");

        if (includedByGroup || includedByScreen || includedByGlobal) {
          relatedPlayerMap.set(idString, {
            id: idString,
            name: screen.name,
            status: screen.status,
            lastSeenAt: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
          });
        }
      }

      if (activeOverride) {
        assignments = [
          ...assignments,
          {
            id: `override-${activeOverride._id.toString()}`,
            scope: "org",
            scopeId: orgId,
            name: "Force override active",
          },
        ];
      }

      relatedPlayers = Array.from(relatedPlayerMap.values());
      const playbackDates = relatedPlayers
        .map((player) => player.lastSeenAt)
        .filter((value): value is string => Boolean(value))
        .map((value) => new Date(value).getTime())
        .filter((value) => Number.isFinite(value));

      if (playbackDates.length > 0) {
        lastPlaybackAt = new Date(Math.max(...playbackDates)).toISOString();
      }
    }
  } catch {
    items = [];
  }

  const totalMinutes = Math.floor(totalDurationSeconds / 60);
  const remainingSeconds = totalDurationSeconds % 60;
  const totalSizeMb = totalSizeBytes > 0 ? (totalSizeBytes / 1024 / 1024).toFixed(2) : "0.00";

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <PlaylistNameEditor playlistId={id} initialName={playlistName} />
          <PlaylistAddContent playlistId={id} currentItems={items} />
        </div>
        <div className="w-full lg:flex-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Playlist overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2 lg:flex-nowrap">
                <div className="flex min-w-[120px] flex-1 items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{playlistStatus}</p>
                </div>
                <div className="flex min-w-[120px] flex-1 items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Items</p>
                  <p className="font-medium">{items.length}</p>
                </div>
                <div className="flex min-w-[140px] flex-1 items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</p>
                  <p className="font-medium">{totalMinutes}m {remainingSeconds}s</p>
                </div>
                <div className="flex min-w-[130px] flex-1 items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Size</p>
                  <p className="font-medium">{totalSizeMb} MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ScrollArea className="mb-6 max-h-[70vh] pr-2">
        <PlaylistSortable
          playlistId={id}
          initialItems={items}
          initialLoop={loop}
          initialStopOnLastItem={stopOnLastItem}
          initialFitModeOverride={fitModeOverride}
          initialBackgroundColorOverride={backgroundColorOverride}
          initialTransitionType={transitionType}
          initialTransitionMs={transitionMs}
        />
      </ScrollArea>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Runtime and distribution</h2>
          <p className="text-xs text-muted-foreground">Status controls and where this playlist is currently applied.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_340px] xl:items-start">
          <PlaylistAssignmentsAccordion assignments={assignments} players={relatedPlayers} />
          <PlaylistMetaBox
            playlistId={id}
            status={playlistStatus}
            itemCount={items.length}
            totalDurationSeconds={totalDurationSeconds}
            totalSizeBytes={totalSizeBytes}
            createdAt={createdAt}
            updatedAt={updatedAt}
            lastEditedBy={lastEditedBy}
            lastPlaybackAt={lastPlaybackAt}
          />
        </div>
      </section>
    </div>
  );
}
