import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { GroupModel } from "@/lib/db/models/Group";
import { Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";
import { resolveManifestForScreen } from "@/lib/scheduling/runtime-resolver";
import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import type { ContentResolvedLayer } from "@/lib/scheduling/resolver";
import { ScheduleService } from "@/lib/services/schedule.service";

type LayoutUsageScope = "org" | "group" | "screen";

type LayoutReferenceDoc = {
    _id: Types.ObjectId;
    name: string;
    updatedAt: Date;
    zones?: Array<{
        content?: {
            type?: "playlist" | "content" | "layout";
            refId?: Types.ObjectId;
        };
    }>;
};

type ScheduleDoc = {
    _id: Types.ObjectId;
    name: string;
    scope: LayoutUsageScope;
    scopeId: Types.ObjectId;
    layoutId: Types.ObjectId;
    updatedAt: Date;
};

type ScreenDoc = {
    _id: Types.ObjectId;
    name: string;
    location?: string;
    status: "online" | "offline" | "pending";
    groupId?: Types.ObjectId | null;
    lastSeenAt?: Date | null;
};

export interface LayoutImpactLayoutRef {
    id: string;
    name: string;
    direct: boolean;
    updatedAt: string;
    href: string;
}

export interface LayoutImpactScheduleRef {
    id: string;
    name: string;
    scope: LayoutUsageScope;
    scopeId: string;
    layoutId: string;
    layoutName: string;
    direct: boolean;
    updatedAt: string;
    href: string;
}

export interface LayoutImpactScreenRef {
    id: string;
    name: string;
    location?: string;
    groupName?: string;
    status: "online" | "offline" | "pending";
    lastSeenAt: string | null;
    effectiveLayer: ContentResolvedLayer;
    sourceScheduleName: string | null;
    sourcePlaylistName: string | null;
    sourceLayoutId: string | null;
    sourceLayoutName: string | null;
    href: string;
}

export interface LayoutImpactData {
    layoutId: string;
    layoutName: string;
    impactedLayoutIds: string[];
    nestedLayouts: LayoutImpactLayoutRef[];
    schedules: LayoutImpactScheduleRef[];
    screens: LayoutImpactScreenRef[];
    counts: {
        layout: number;
        schedule: number;
        screen: number;
    };
}

function scheduleHref(scope: LayoutUsageScope, scopeId: string): string {
    if (scope === "org") {
        return "/schedules/global/org";
    }
    if (scope === "group") {
        return `/schedules/group/${scopeId}`;
    }
    return `/schedules/screen/${scopeId}`;
}

function toObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
}

function isNonNull<T>(value: T | null): value is T {
    return value !== null;
}

async function collectImpactedLayouts(
    orgObjectId: Types.ObjectId,
    layoutId: string,
): Promise<{
    layoutName: string;
    impactedLayoutIds: string[];
    nestedLayouts: LayoutImpactLayoutRef[];
    layoutNameById: Map<string, string>;
}> {
    const rootLayout = await CompositeLayoutModel.findOne({ _id: toObjectId(layoutId), orgId: orgObjectId })
        .select({ _id: 1, name: 1 })
        .lean<{ _id: Types.ObjectId; name: string } | null>();

    if (!rootLayout) {
        throw new Error("LAYOUT_NOT_FOUND");
    }

    const rootId = rootLayout._id.toString();
    const impactedLayoutIds = [rootId];
    const visited = new Set<string>([rootId]);
    const nestedLayouts: LayoutImpactLayoutRef[] = [];
    const layoutNameById = new Map<string, string>([[rootId, rootLayout.name]]);
    let frontier = [rootId];

    while (frontier.length > 0) {
        const frontierSet = new Set(frontier);
        const parentLayouts = await CompositeLayoutModel.find({
            orgId: orgObjectId,
            _id: { $nin: Array.from(visited, (value) => toObjectId(value)) },
            "zones.content.type": "layout",
            "zones.content.refId": { $in: frontier.map((value) => toObjectId(value)) },
        })
            .select({ _id: 1, name: 1, updatedAt: 1, zones: 1 })
            .lean<LayoutReferenceDoc[]>();

        const nextFrontier: string[] = [];

        for (const parentLayout of parentLayouts) {
            const parentId = parentLayout._id.toString();
            if (visited.has(parentId)) {
                continue;
            }

            const direct = (parentLayout.zones ?? []).some(
                (zone) => zone.content?.type === "layout" && zone.content.refId && frontierSet.has(zone.content.refId.toString()),
            );

            visited.add(parentId);
            impactedLayoutIds.push(parentId);
            layoutNameById.set(parentId, parentLayout.name);
            nestedLayouts.push({
                id: parentId,
                name: parentLayout.name,
                direct,
                updatedAt: new Date(parentLayout.updatedAt).toISOString(),
                href: `/layouts/${parentId}`,
            });
            nextFrontier.push(parentId);
        }

        frontier = nextFrontier;
    }

    return {
        layoutName: rootLayout.name,
        impactedLayoutIds,
        nestedLayouts,
        layoutNameById,
    };
}

async function collectSchedules(
    orgObjectId: Types.ObjectId,
    rootLayoutId: string,
    impactedLayoutIds: string[],
    layoutNameById: Map<string, string>,
): Promise<LayoutImpactScheduleRef[]> {
    const schedules = await Schedule.find({
        orgId: orgObjectId,
        isActive: true,
        layoutId: { $in: impactedLayoutIds.map((value) => toObjectId(value)) },
    })
        .select({ _id: 1, name: 1, scope: 1, scopeId: 1, layoutId: 1, updatedAt: 1 })
        .lean<ScheduleDoc[]>();

    return schedules.map((schedule) => {
        const scheduleLayoutId = schedule.layoutId.toString();
        const scopeId = schedule.scopeId.toString();
        return {
            id: schedule._id.toString(),
            name: schedule.name,
            scope: schedule.scope,
            scopeId,
            layoutId: scheduleLayoutId,
            layoutName: layoutNameById.get(scheduleLayoutId) ?? "Layout",
            direct: scheduleLayoutId === rootLayoutId,
            updatedAt: new Date(schedule.updatedAt).toISOString(),
            href: scheduleHref(schedule.scope, scopeId),
        };
    });
}

async function collectCurrentScreens(
    orgObjectId: Types.ObjectId,
    impactedLayoutIds: string[],
    schedules: LayoutImpactScheduleRef[],
    layoutNameById: Map<string, string>,
): Promise<LayoutImpactScreenRef[]> {
    if (schedules.length === 0) {
        return [];
    }

    const impactedLayoutIdSet = new Set(impactedLayoutIds);
    const hasOrgScope = schedules.some((schedule) => schedule.scope === "org");
    const groupScopeIds = Array.from(new Set(schedules.filter((schedule) => schedule.scope === "group").map((schedule) => schedule.scopeId)));
    const screenScopeIds = Array.from(new Set(schedules.filter((schedule) => schedule.scope === "screen").map((schedule) => schedule.scopeId)));

    const screenQuery = hasOrgScope
        ? { orgId: orgObjectId }
        : {
            orgId: orgObjectId,
            $or: [
                ...(groupScopeIds.length > 0 ? [{ groupId: { $in: groupScopeIds.map((value) => toObjectId(value)) } }] : []),
                ...(screenScopeIds.length > 0 ? [{ _id: { $in: screenScopeIds.map((value) => toObjectId(value)) } }] : []),
            ],
        };

    const candidateScreens = await ScreenModel.find(screenQuery)
        .select({ _id: 1, name: 1, location: 1, status: 1, groupId: 1, lastSeenAt: 1 })
        .lean<ScreenDoc[]>();

    if (candidateScreens.length === 0) {
        return [];
    }

    const groupIds = Array.from(
        new Set(
            candidateScreens
                .map((screen) => screen.groupId?.toString())
                .filter((value): value is string => Boolean(value)),
        ),
    );

    const groups = groupIds.length
        ? await GroupModel.find({ orgId: orgObjectId, _id: { $in: groupIds.map((value) => toObjectId(value)) } })
            .select({ _id: 1, name: 1 })
            .lean<Array<{ _id: Types.ObjectId; name: string }>>()
        : [];
    const groupNameById = new Map(groups.map((group) => [group._id.toString(), group.name]));

    const screenRefs = await Promise.all(
        candidateScreens.map(async (screen) => {
            const screenId = screen._id.toString();
            try {
                const manifest = await resolveManifestForScreen(screenId, new Date());
                const sourceLayoutId = manifest.source.layoutId;

                if (!sourceLayoutId || !impactedLayoutIdSet.has(sourceLayoutId)) {
                    return null;
                }

                return {
                    id: screenId,
                    name: screen.name,
                    location: screen.location,
                    groupName: screen.groupId ? groupNameById.get(screen.groupId.toString()) : undefined,
                    status: screen.status,
                    lastSeenAt: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
                    effectiveLayer: manifest.resolvedLayer,
                    sourceScheduleName: manifest.source.scheduleName,
                    sourcePlaylistName: manifest.source.playlistName,
                    sourceLayoutId,
                    sourceLayoutName: manifest.source.layoutName ?? layoutNameById.get(sourceLayoutId) ?? "Layout",
                    href: `/screens/${screenId}`,
                } satisfies LayoutImpactScreenRef;
            } catch {
                return null;
            }
        }),
    );

    return screenRefs
        .filter(isNonNull)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export async function getLayoutImpact(orgId: string, layoutId: string): Promise<LayoutImpactData> {
    await connectDB();
    await ScheduleService.pruneInvalidSchedules(orgId);

    const orgObjectId = toObjectId(orgId);
    const {
        layoutName,
        impactedLayoutIds,
        nestedLayouts,
        layoutNameById,
    } = await collectImpactedLayouts(orgObjectId, layoutId);
    const schedules = await collectSchedules(orgObjectId, layoutId, impactedLayoutIds, layoutNameById);
    const screens = await collectCurrentScreens(orgObjectId, impactedLayoutIds, schedules, layoutNameById);

    return {
        layoutId,
        layoutName,
        impactedLayoutIds,
        nestedLayouts,
        schedules,
        screens,
        counts: {
            layout: nestedLayouts.length,
            schedule: schedules.length,
            screen: screens.length,
        },
    };
}

export async function emitLayoutUpdateToScreens(orgId: string, layoutId: string): Promise<string[]> {
    const impact = await getLayoutImpact(orgId, layoutId);
    const screenIds = impact.screens.map((screen) => screen.id);

    if (screenIds.length > 0) {
        await Promise.all(screenIds.map((screenId) => emitManifestToScreen(screenId)));
    }

    return screenIds;
}
