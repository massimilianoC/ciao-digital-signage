import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { ContentModel } from "@/lib/db/models/Content";
import { ForceOverride } from "@/lib/db/models/ForceOverride";
import { PlaylistModel } from "@/lib/db/models/Playlist";
import { Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";
import { ScheduleService } from "@/lib/services/schedule.service";

type Params = { params: Promise<{ id: string }> };
type UsageScope = "org" | "group" | "screen";

function scheduleHref(scope: UsageScope, scopeId: string): string {
    if (scope === "org") {
        return "/schedules/global/org";
    }
    if (scope === "group") {
        return `/schedules/group/${scopeId}`;
    }
    return `/schedules/screen/${scopeId}`;
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const session = await getOrgIdFromSession(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
    }

    await connectDB();
    await ScheduleService.pruneInvalidSchedules(session.orgId);

    const orgObjectId = new Types.ObjectId(session.orgId);
    const contentObjectId = new Types.ObjectId(id);

    const contentExists = await ContentModel.exists({ _id: contentObjectId, orgId: orgObjectId });
    if (!contentExists) {
        return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const playlistsRaw = await PlaylistModel.find({
        orgId: orgObjectId,
        "items.contentId": contentObjectId,
    })
        .select({ _id: 1, name: 1, status: 1, updatedAt: 1, items: 1 })
        .lean<
            Array<{
                _id: Types.ObjectId;
                name: string;
                status: "active" | "suspended";
                updatedAt: Date;
                items: Array<{ contentId: Types.ObjectId }>;
            }>
        >();

    const playlists = playlistsRaw.map((playlist) => {
        const playlistId = playlist._id.toString();
        const contentUsageCount = playlist.items.filter((item) => item.contentId.toString() === id).length;

        return {
            id: playlistId,
            name: playlist.name,
            status: playlist.status,
            contentUsageCount,
            updatedAt: new Date(playlist.updatedAt).toISOString(),
            href: `/playlists/${playlistId}`,
        };
    });

    const playlistIdStrings = playlists.map((playlist) => playlist.id);
    if (playlistIdStrings.length === 0) {
        return NextResponse.json({ playlists: [], schedules: [], screens: [] });
    }

    const playlistObjectIds = playlistIdStrings.map((playlistId) => new Types.ObjectId(playlistId));
    const playlistIdSet = new Set(playlistIdStrings);

    const schedulesRaw = await Schedule.find({
        orgId: orgObjectId,
        playlistId: { $in: playlistObjectIds },
        isActive: true,
    })
        .select({ _id: 1, scope: 1, scopeId: 1, playlistId: 1, name: 1, updatedAt: 1 })
        .lean<
            Array<{
                _id: Types.ObjectId;
                scope: UsageScope;
                scopeId: Types.ObjectId;
                playlistId: Types.ObjectId;
                name: string;
                updatedAt: Date;
            }>
        >();

    const playlistNameById = new Map(playlists.map((playlist) => [playlist.id, playlist.name]));

    const schedules = schedulesRaw.map((schedule) => {
        const playlistId = schedule.playlistId.toString();
        const scopeId = schedule.scopeId.toString();

        return {
            id: schedule._id.toString(),
            name: schedule.name,
            scope: schedule.scope,
            scopeId,
            playlistId,
            playlistName: playlistNameById.get(playlistId) ?? "Playlist",
            updatedAt: new Date(schedule.updatedAt).toISOString(),
            href: scheduleHref(schedule.scope, scopeId),
        };
    });

    const groupScopeIds = new Set(
        schedulesRaw.filter((schedule) => schedule.scope === "group").map((schedule) => schedule.scopeId.toString()),
    );
    const screenScopeIds = new Set(
        schedulesRaw.filter((schedule) => schedule.scope === "screen").map((schedule) => schedule.scopeId.toString()),
    );
    const hasOrgScope = schedulesRaw.some((schedule) => schedule.scope === "org");

    const screenOrFilters: Array<Record<string, unknown>> = [{ defaultPlaylistId: { $in: playlistObjectIds } }];

    if (screenScopeIds.size > 0) {
        screenOrFilters.push({ _id: { $in: Array.from(screenScopeIds, (value) => new Types.ObjectId(value)) } });
    }

    if (groupScopeIds.size > 0) {
        screenOrFilters.push({ groupId: { $in: Array.from(groupScopeIds, (value) => new Types.ObjectId(value)) } });
    }

    const screensRaw = await ScreenModel.find(
        hasOrgScope
            ? { orgId: orgObjectId }
            : {
                orgId: orgObjectId,
                $or: screenOrFilters,
            },
    )
        .select({ _id: 1, name: 1, status: 1, groupId: 1, defaultPlaylistId: 1, lastSeenAt: 1 })
        .lean<
            Array<{
                _id: Types.ObjectId;
                name: string;
                status: "online" | "offline" | "pending";
                groupId?: Types.ObjectId | null;
                defaultPlaylistId?: Types.ObjectId | null;
                lastSeenAt?: Date | null;
            }>
        >();

    const screens = screensRaw.map((screen) => {
        const screenId = screen._id.toString();
        const reasons: string[] = [];

        if (screen.defaultPlaylistId && playlistIdSet.has(screen.defaultPlaylistId.toString())) {
            reasons.push("default playlist");
        }
        if (hasOrgScope) {
            reasons.push("org schedule");
        }
        if (screen.groupId && groupScopeIds.has(screen.groupId.toString())) {
            reasons.push("group schedule");
        }
        if (screenScopeIds.has(screenId)) {
            reasons.push("screen schedule");
        }

        return {
            id: screenId,
            name: screen.name,
            status: screen.status,
            lastSeenAt: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
            reasons,
            href: `/screens/${screenId}`,
        };
    });

    const activeOverride = await ForceOverride.findOne({
        orgId: orgObjectId,
        isActive: true,
        playlistId: { $in: playlistObjectIds },
    })
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>();

    return NextResponse.json({
        playlists,
        schedules,
        screens,
        counts: {
            playlist: playlists.length,
            schedule: schedules.length,
            screen: screens.length,
            layout: 0,
            forceOverride: activeOverride ? 1 : 0,
        },
    });
});