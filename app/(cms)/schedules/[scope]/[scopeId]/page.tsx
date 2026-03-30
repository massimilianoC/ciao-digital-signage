import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { Types } from "mongoose";
import { PlaylistService } from "@/lib/services/playlist.service";
import { ScheduleService } from "@/lib/services/schedule.service";
import { ScreenService } from "@/lib/services/screen.service";
import { GroupService } from "@/lib/services/group.service";
import { resolveManifestForScreen } from "@/lib/scheduling/runtime-resolver";

import { AffectedScreensPanel } from "@/components/cms/schedule-editor/AffectedScreensPanel";
import { ParkedSchedulesAccordion } from "@/components/cms/schedule-editor/ParkedSchedulesAccordion";
import { TimelineGrid } from "@/components/cms/schedule-editor/TimelineGrid";

type Scope = "global" | "group" | "screen";

type EffectiveLayer = "global" | "group" | "screen" | "force_override" | "no_content";

const VALID_SCOPES: Scope[] = ["global", "group", "screen"];
const VISIBLE_LAYERS_BY_SCOPE: Record<Scope, Scope[]> = {
  global: ["global"],
  group: ["group", "global"],
  screen: ["screen", "group", "global"],
};

type ScheduleRuleView = {
  _id: string;
  layer: Scope;
  scopeId: string;
  playlistId?: string;
  playlistName?: string;
  layoutId?: string;
  layoutName?: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[];
};

type PlaylistOption = {
  _id: string;
  name: string;
};

type LayoutOption = {
  _id: string;
  name: string;
};

type ParkedScheduleView = {
  _id: string;
  name: string;
  playlistName: string;
  isActive: boolean;
  updatedAt: string;
  windows: Array<{
    startHHMM: string;
    endHHMM: string;
    daysOfWeek: number[];
    timezone: string;
  }>;
};

type AffectedScreenView = {
  screenId: string;
  name: string;
  location?: string;
  groupName?: string;
  effectiveLayer: EffectiveLayer;
  sourceScheduleName?: string | null;
  sourcePlaylistName?: string | null;
};

interface PageProps {
  params: Promise<{ scope: string; scopeId: string }>;
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hourString = "0", minuteString = "0"] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export default async function ScheduleEditorPage({ params }: PageProps) {
  const { scope, scopeId } = await params;
  if (!VALID_SCOPES.includes(scope as Scope)) {
    notFound();
  }

  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");
  const { session, orgId } = authed;

  const orgTimezone = (session.user as { timezone?: string }).timezone ?? "UTC";
  const editableLayer = scope as Scope;
  const effectiveScopeId = editableLayer === "global" ? orgId : scopeId;

  let initialRules: ScheduleRuleView[] = [];
  let playlists: PlaylistOption[] = [];
  let layouts: LayoutOption[] = [];
  let affectedScreens: AffectedScreenView[] = [];
  let parkedSchedules: ParkedScheduleView[] = [];

  try {
    await connectDB();
    const [allRules, scopedRulesWithParking, playlistDocs, screenDocs, groupDocs, layoutDocs] = await Promise.all([
      ScheduleService.listByOrg(orgId),
      ScheduleService.listByScope(
        orgId,
        editableLayer === "global" ? "org" : editableLayer,
        effectiveScopeId,
        { includeInactive: true },
      ),
      new PlaylistService(orgId).list(),
      new ScreenService(orgId).list(),
      new GroupService(orgId).list(),
      CompositeLayoutModel.find({ orgId: new Types.ObjectId(orgId), status: "active" })
        .select({ name: 1 })
        .lean<Array<{ _id: Types.ObjectId; name: string }>>(),
    ]);

    const playlistMap = new Map<string, string>(
      playlistDocs.map((playlist) => [playlist._id.toString(), playlist.name]),
    );
    const layoutMap = new Map<string, string>(
      layoutDocs.map((layout) => [layout._id.toString(), layout.name]),
    );
    const groupNameById = new Map<string, string>(
      groupDocs.map((group) => [group._id.toString(), group.name]),
    );

    const targetScreen =
      editableLayer === "screen"
        ? screenDocs.find((screen) => screen._id.toString() === scopeId)
        : null;
    const targetScreenGroupId = targetScreen?.groupId?.toString() ?? null;

    playlists = playlistDocs.map((playlist) => ({
      _id: playlist._id.toString(),
      name: playlist.name,
    }));

    layouts = layoutDocs.map((layout) => ({
      _id: layout._id.toString(),
      name: layout.name,
    }));

    parkedSchedules = scopedRulesWithParking
      .filter((schedule) => schedule.isActive === false)
      .map((schedule) => {
        const playlistIdStr = schedule.playlistId?.toString();
        const layoutIdStr = schedule.layoutId?.toString();
        const contentName = layoutIdStr
          ? (layoutMap.get(layoutIdStr) ?? "Layout")
          : (playlistIdStr ? (playlistMap.get(playlistIdStr) ?? "Playlist") : "—");
        return {
          _id: schedule._id.toString(),
          name: schedule.name,
          playlistName: contentName,
          isActive: false,
          updatedAt: schedule.updatedAt.toISOString(),
          windows: schedule.windows.map((window) => ({
            startHHMM: window.startHHMM,
            endHHMM: window.endHHMM,
            daysOfWeek: window.daysOfWeek,
            timezone: window.timezone,
          })),
        };
      });

    initialRules = allRules
      .filter((schedule) => {
        if (editableLayer === "global") {
          return schedule.scope === "org";
        }
        if (editableLayer === "group") {
          return (
            (schedule.scope === "group" && schedule.scopeId.toString() === scopeId) ||
            schedule.scope === "org"
          );
        }

        const scheduleScopeId = schedule.scopeId.toString();
        if (schedule.scope === "screen" && scheduleScopeId === scopeId) {
          return true;
        }
        if (schedule.scope === "group" && targetScreenGroupId && scheduleScopeId === targetScreenGroupId) {
          return true;
        }
        return schedule.scope === "org";
      })
      .flatMap((schedule) =>
        schedule.windows.map((window, index) => {
          const start = parseTime(window.startHHMM);
          const end = parseTime(window.endHHMM);
          const playlistIdStr = schedule.playlistId?.toString();
          const layoutIdStr = schedule.layoutId?.toString();

          const layer: Scope =
            schedule.scope === "org"
              ? "global"
              : schedule.scope === "group"
                ? "group"
                : "screen";

          return {
            _id: schedule._id.toString(),
            layer,
            scopeId: schedule.scopeId.toString(),
            ...(playlistIdStr ? { playlistId: playlistIdStr, playlistName: playlistMap.get(playlistIdStr) ?? "Playlist" } : {}),
            ...(layoutIdStr ? { layoutId: layoutIdStr, layoutName: layoutMap.get(layoutIdStr) ?? "Layout" } : {}),
            startHour: start.hour,
            startMinute: start.minute,
            endHour: end.hour,
            endMinute: end.minute,
            days: window.daysOfWeek.length ? window.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
            _sortIndex: index,
          };
        }),
      )
      .sort((a, b) => a.startHour - b.startHour || a.startMinute - b.startMinute)
      .map(({ _sortIndex: _discard, ...rule }) => rule);

    const candidateScreens =
      editableLayer === "global"
        ? screenDocs
        : editableLayer === "group"
          ? screenDocs.filter((screen) => screen.groupId?.toString() === scopeId)
          : screenDocs.filter((screen) => screen._id.toString() === scopeId);

    affectedScreens = await Promise.all(
      candidateScreens.map(async (screen) => {
        const screenId = screen._id.toString();
        try {
          const manifest = await resolveManifestForScreen(screenId);
          return {
            screenId,
            name: screen.name,
            location: screen.location,
            groupName: screen.groupId ? groupNameById.get(screen.groupId.toString()) : undefined,
            effectiveLayer: manifest.resolvedLayer,
            sourceScheduleName: manifest.source.scheduleName,
            sourcePlaylistName: manifest.source.playlistName,
          };
        } catch {
          return {
            screenId,
            name: screen.name,
            location: screen.location,
            groupName: screen.groupId ? groupNameById.get(screen.groupId.toString()) : undefined,
            effectiveLayer: "no_content" as const,
            sourceScheduleName: null,
            sourcePlaylistName: null,
          };
        }
      }),
    );
  } catch {
    initialRules = [];
    playlists = [];
    affectedScreens = [];
    parkedSchedules = [];
  }

  const titleMap: Record<Scope, string> = {
    global: "Global Schedule",
    group: "Group Schedule",
    screen: "Screen Schedule",
  };

  return (
    <main className="p-6">
      <section className="mb-6">
        <h1 className="text-2xl font-bold">{titleMap[editableLayer]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {editableLayer === "global" &&
            "Rules here apply as defaults for all screens in the organization."}
          {editableLayer === "group" &&
            "Rules here override global schedules for screens in this group."}
          {editableLayer === "screen" &&
            "Rules here take highest priority for this specific screen."} Times shown in {orgTimezone}.
        </p>
      </section>

      <TimelineGrid
        initialRules={initialRules}
        playlists={playlists}
        layouts={layouts}
        scopeId={effectiveScopeId}
        orgTimezone={orgTimezone}
        editableLayer={editableLayer}
        visibleLayers={VISIBLE_LAYERS_BY_SCOPE[editableLayer]}
      />

      <div className="mt-5">
        <ParkedSchedulesAccordion schedules={parkedSchedules} />
      </div>

      <div className="mt-5">
        <AffectedScreensPanel
          title="Monitor impattati"
          description="Layer effettivo calcolato ora per ogni monitor coinvolto in questo contesto."
          screens={affectedScreens}
        />
      </div>
    </main>
  );
}
