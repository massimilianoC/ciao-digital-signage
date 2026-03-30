import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { getDay, getHours, getMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// ─── Lazy model accessors (reuse models registered by Next.js at runtime) ────
function getScreenModel() {
    return mongoose.models.Screen ?? mongoose.model("Screen", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, index: true },
        name: { type: String, required: true, trim: true },
        location: { type: String },
        timezone: { type: String, default: "UTC" },
        status: { type: String, enum: ["online", "offline", "pending"], default: "pending" },
        operatingMode: { type: String, enum: ["managed", "offline"], default: "managed" },
        disconnectPolicy: { type: String, enum: ["keep_cache", "show_default"], default: "keep_cache" },
        lastSeenAt: { type: Date, default: null },
        currentItemId: { type: String, default: null },
        disconnectEvents: { type: [Date], default: [] },
        lastErrorAt: { type: Date, default: null },
        lastErrorCode: { type: String, default: null },
        lastErrorMessage: { type: String, default: null },
        groupId: { type: mongoose.Schema.Types.ObjectId },
        defaultPlaylistId: { type: mongoose.Schema.Types.ObjectId },
        screenToken: { type: String, required: true },
        allowMultiSession: { type: Boolean, default: false },
        activePlayerSessionId: { type: String, default: null },
        activePlayerSessionBoundAt: { type: Date, default: null },
        activePlayerSessionLastSeenAt: { type: Date, default: null },
        betterAuthScreenId: { type: String },
    }, { timestamps: true }));
}

function getScheduleModel() {
    return mongoose.models.Schedule ?? mongoose.model("Schedule", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        scope: { type: String, enum: ["org", "group", "screen"], required: true },
        scopeId: { type: mongoose.Schema.Types.ObjectId, required: true },
        priority: { type: Number, enum: [1, 2, 3], required: true },
        playlistId: { type: mongoose.Schema.Types.ObjectId, ref: "Playlist" },
        layoutId: { type: mongoose.Schema.Types.ObjectId, ref: "CompositeLayout" },
        windows: [{
            startHHMM: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
            endHHMM: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
            daysOfWeek: { type: [Number], default: [] },
            rruleString: { type: String },
            timezone: { type: String, required: true },
        }],
        name: { type: String, required: true, trim: true },
        isActive: { type: Boolean, default: true },
    }, { timestamps: true }));
}

function getGroupModel() {
    return mongoose.models.Group ?? mongoose.model("Group", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String },
        defaultPlaylistId: { type: mongoose.Schema.Types.ObjectId },
        screenIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    }, { timestamps: true }));
}

function getForceOverrideModel() {
    return mongoose.models.ForceOverride ?? mongoose.model("ForceOverride", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
        playlistId: { type: mongoose.Schema.Types.ObjectId, ref: "Playlist", required: true },
        publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        expiresAt: { type: Date, default: null },
        isActive: { type: Boolean, default: true },
    }, { timestamps: true, versionKey: false }));
}

function getPlaylistModel() {
    return mongoose.models.Playlist ?? mongoose.model("Playlist", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        name: { type: String, required: true, trim: true },
        status: { type: String, enum: ["active", "suspended"], default: "active" },
        loop: { type: Boolean, default: true },
        stopOnLastItem: { type: Boolean, default: false },
        fitModeOverride: { type: String, enum: ["cover", "fit"], default: null },
        backgroundColorOverride: { type: String, default: null },
        transitionType: { type: String, enum: ["cut", "fade"], default: "fade" },
        transitionMs: { type: Number, default: 500 },
        items: [{
            contentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Content" },
            title: { type: String },
            thumbnailUrl: { type: String },
            fitMode: { type: String, enum: ["cover", "fit"] },
            backgroundColor: { type: String, default: null },
            durationMs: { type: Number },
            order: { type: Number, required: true, default: 0 },
        }],
    }, { timestamps: true }));
}

function getCompositeLayoutModel() {
    return mongoose.models.CompositeLayout ?? mongoose.model("CompositeLayout", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        name: { type: String, required: true, trim: true },
        status: { type: String, enum: ["active", "suspended"], default: "active" },
    }, { timestamps: true }));
}

async function isPlaylistActive(playlistId) {
    const Playlist = getPlaylistModel();
    const playlist = await Playlist.findById(playlistId)
        .select({ status: 1 })
        .lean();

    return (playlist?.status ?? "active") === "active";
}

function getContentModel() {
    return mongoose.models.Content ?? mongoose.model("Content", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        name: { type: String, required: true, trim: true },
        alias: { type: String, trim: true },
        status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
        type: { type: String, enum: ["image", "video", "url", "widget"], required: true },
        folder: { type: String, default: "/" },
        tags: { type: [String], default: [] },
        defaultDurationMs: { type: Number, default: 10000 },
        thumbnailUrl: { type: String },
        internalWebappAsset: { type: Boolean, default: false, index: true },
        config: { type: mongoose.Schema.Types.Mixed, default: {} },
    }, { timestamps: true }));
}

function toObjectId(id) {
    return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

const scopeRank = {
    org: 1,
    group: 2,
    screen: 3,
};

function parseHHMMToMinutes(hhmm) {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return hours * 60 + minutes;
}

function isWindowActiveAt(window, utcTimestamp, timezoneOverride) {
    const effectiveTimezone = timezoneOverride || window.timezone || "UTC";
    const localTime = toZonedTime(utcTimestamp, effectiveTimezone);
    const localDay = getDay(localTime);

    if (Array.isArray(window.daysOfWeek) && window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(localDay)) {
        return false;
    }

    const currentMinutes = getHours(localTime) * 60 + getMinutes(localTime);
    const startMinutes = parseHHMMToMinutes(window.startHHMM);
    const endMinutes = parseHHMMToMinutes(window.endHHMM);

    if (endMinutes <= startMinutes) {
        return false;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function buildManifest(screenId, orgId, items, resolvedLayer, ts, playback = {
    loop: true,
    stopOnLastItem: false,
    fitModeOverride: null,
    backgroundColorOverride: null,
    transitionType: "fade",
    transitionMs: 500,
}) {
    return {
        manifestId: randomUUID(),
        screenId,
        orgId,
        items,
        validFrom: ts.toISOString(),
        validUntil: null,
        transitionType: playback.transitionType === "cut" ? "cut" : "fade",
        transitionMs: typeof playback.transitionMs === "number" ? Math.max(0, playback.transitionMs) : 500,
        resolvedLayer,
        loop: playback.loop,
        stopOnLastItem: playback.stopOnLastItem,
        fitModeOverride: playback.fitModeOverride ?? null,
        backgroundColorOverride: playback.backgroundColorOverride ?? null,
    };
}

function toPlayerManifest(manifest) {
    const manifestItems = manifest.items ?? [];
    const isSoleInteractiveUrl =
        manifestItems.length === 1 &&
        manifestItems[0]?.type === "url" &&
        (!manifestItems[0]?.urlSubtype || manifestItems[0]?.urlSubtype === "webpage" ||
            manifestItems[0]?.urlSubtype === "pdf" ||
            !manifestItems[0]?.config?.urlSubtype || manifestItems[0]?.config?.urlSubtype === "webpage" ||
            manifestItems[0]?.config?.urlSubtype === "pdf");
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
            id: item.id ?? item.contentId ?? `${manifest.screenId}-${index}`,
            type: item.type,
            url: item.url ?? item.fileUrl ?? "",
            layoutId: item.type === "layout"
                ? String(item.contentId ?? item.id ?? "")
                : undefined,
            urlSubtype: item.urlSubtype ?? item.config?.urlSubtype,
            interactive: item.type === "url" && isSoleInteractiveUrl ? true : undefined,
            title: item.title,
            thumbnailUrl: item.thumbnailUrl,
            fitMode: item.fitMode,
            backgroundColor: item.backgroundColor ?? null,
            durationMs: item.durationMs ?? 10000,
        })),
    };
}

async function getPlaylistPlayback(playlistId) {
    const Playlist = getPlaylistModel();
    const playlist = await Playlist.findById(playlistId)
        .select({
            loop: 1,
            stopOnLastItem: 1,
            fitModeOverride: 1,
            backgroundColorOverride: 1,
            transitionType: 1,
            transitionMs: 1,
        })
        .lean();

    return {
        loop: playlist?.loop ?? true,
        stopOnLastItem: playlist?.stopOnLastItem ?? false,
        fitModeOverride: playlist?.fitModeOverride ?? null,
        backgroundColorOverride: playlist?.backgroundColorOverride ?? null,
        transitionType: playlist?.transitionType === "cut" ? "cut" : "fade",
        transitionMs:
            typeof playlist?.transitionMs === "number" && Number.isFinite(playlist.transitionMs)
                ? Math.max(0, Math.round(playlist.transitionMs))
                : 500,
    };
}

async function getPlaylistItems(playlistId) {
    const Playlist = getPlaylistModel();
    const Content = getContentModel();

    const playlist = await Playlist.findById(playlistId).lean();
    if (!playlist) {
        return [];
    }

    const orderedPlaylistItems = [...(playlist.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const contentIds = orderedPlaylistItems.map((item) => item.contentId);
    const contents = await Content.find({ _id: { $in: contentIds } }).lean();
    const contentById = new Map(contents.map((content) => [content._id.toString(), content]));

    const resolvedItems = [];
    for (const playlistItem of orderedPlaylistItems) {
        const content = contentById.get(playlistItem.contentId.toString());
        if (!content) {
            continue;
        }

        const fallbackThumb =
            content.type === "image" && typeof content.config?.fileUrl === "string"
                ? content.config.fileUrl
                : undefined;

        resolvedItems.push({
            contentId: content._id.toString(),
            title: playlistItem.title ?? content.name,
            thumbnailUrl: playlistItem.thumbnailUrl ?? content.thumbnailUrl ?? fallbackThumb,
            type: content.type,
            urlSubtype: content.config?.urlSubtype,
            fitMode: playlistItem.fitMode ?? "cover",
            backgroundColor: playlistItem.backgroundColor ?? null,
            fileUrl: content.config?.fileUrl,
            url: content.config?.url,
            config: content.config,
            durationMs: playlistItem.durationMs ?? content.defaultDurationMs,
        });
    }

    return resolvedItems;
}

async function resolveManifestForScreenRuntime(screenId, ts = new Date()) {
    const Screen = getScreenModel();
    const Schedule = getScheduleModel();
    const ForceOverride = getForceOverrideModel();
    const Group = getGroupModel();
    const CompositeLayout = getCompositeLayoutModel();

    const screen = await Screen.findById(screenId)
        .select({ orgId: 1, timezone: 1, groupId: 1, defaultPlaylistId: 1 })
        .lean();

    if (!screen?.orgId) {
        throw new Error(`SCREEN_NOT_FOUND:${screenId}`);
    }

    const orgId = screen.orgId.toString();
    const groupIds = screen.groupId ? [screen.groupId.toString()] : [];
    if (groupIds.length === 0) {
        const fallbackGroup = await Group.findOne({
            orgId: screen.orgId,
            screenIds: toObjectId(screenId),
        })
            .select({ _id: 1 })
            .lean();

        if (fallbackGroup?._id) {
            groupIds.push(fallbackGroup._id.toString());
        }
    }
    const defaultPlaylistId = screen.defaultPlaylistId ? screen.defaultPlaylistId.toString() : null;
    const orgObjectId = toObjectId(orgId);

    const forceOverride = await ForceOverride.findOne({ orgId: orgObjectId, isActive: true }).lean();
    if (forceOverride?.isActive) {
        if (forceOverride.expiresAt !== null && forceOverride.expiresAt < ts) {
            void ForceOverride.updateOne({ orgId: orgObjectId }, { $set: { isActive: false } });
        } else {
            const overridePlaylistId = forceOverride.playlistId.toString();
            const active = await isPlaylistActive(overridePlaylistId);
            if (active) {
                const items = await getPlaylistItems(overridePlaylistId);
                const playback = await getPlaylistPlayback(overridePlaylistId);
                const resolvedItems = items.map((item) => ({
                    ...item,
                    fitMode: playback.fitModeOverride ?? item.fitMode ?? "cover",
                    backgroundColor: playback.backgroundColorOverride ?? item.backgroundColor ?? null,
                }));
                if (resolvedItems.length === 0) {
                    return buildManifest(screenId, orgId, [], "no_content", ts);
                }
                return buildManifest(screenId, orgId, resolvedItems, "force_override", ts, playback);
            }
        }
    }

    const scopeFilters = [
        { scope: "org", scopeId: orgObjectId },
        { scope: "screen", scopeId: toObjectId(screenId) },
    ];

    if (groupIds.length > 0) {
        scopeFilters.push({
            scope: "group",
            scopeId: { $in: groupIds.map((id) => toObjectId(id)) },
        });
    }

    const schedules = await Schedule.find({
        orgId: orgObjectId,
        isActive: { $ne: false },
        $or: scopeFilters,
    }).lean();

    const activeSchedules = schedules.filter((schedule) =>
        Array.isArray(schedule.windows) && schedule.windows.some((window) => isWindowActiveAt(window, ts, screen.timezone)),
    );

    if (activeSchedules.length === 0) {
        if (defaultPlaylistId) {
            const active = await isPlaylistActive(defaultPlaylistId);
            if (active) {
                const defaultItems = await getPlaylistItems(defaultPlaylistId);
                const playback = await getPlaylistPlayback(defaultPlaylistId);
                const resolvedItems = defaultItems.map((item) => ({
                    ...item,
                    fitMode: playback.fitModeOverride ?? item.fitMode ?? "cover",
                    backgroundColor: playback.backgroundColorOverride ?? item.backgroundColor ?? null,
                }));
                if (resolvedItems.length === 0) {
                    return buildManifest(screenId, orgId, [], "no_content", ts);
                }
                return buildManifest(screenId, orgId, resolvedItems, "screen", ts, playback);
            }
        }

        return buildManifest(screenId, orgId, [], "no_content", ts);
    }

    const sortedSchedules = [...activeSchedules].sort((a, b) => {
        const scopeDiff = (scopeRank[b.scope] ?? 0) - (scopeRank[a.scope] ?? 0);
        if (scopeDiff !== 0) {
            return scopeDiff;
        }

        if ((b.priority ?? 0) !== (a.priority ?? 0)) {
            return (b.priority ?? 0) - (a.priority ?? 0);
        }

        const aCreatedAt = new Date(a.createdAt ?? 0).getTime();
        const bCreatedAt = new Date(b.createdAt ?? 0).getTime();
        if (bCreatedAt !== aCreatedAt) {
            return bCreatedAt - aCreatedAt;
        }

        return b._id.toString().localeCompare(a._id.toString());
    });
    const layerByScope = {
        org: "global",
        group: "group",
        screen: "screen",
    };

    for (const schedule of sortedSchedules) {
        if (schedule.layoutId) {
            const layout = await CompositeLayout.findById(schedule.layoutId)
                .select({ _id: 1, name: 1, status: 1 })
                .lean();

            if (!layout || (layout.status ?? "active") !== "active") {
                continue;
            }

            return buildManifest(
                screenId,
                orgId,
                [{
                    contentId: layout._id.toString(),
                    title: layout.name,
                    type: "layout",
                    durationMs: 0,
                }],
                layerByScope[schedule.scope] ?? "no_content",
                ts,
                {
                    loop: false,
                    stopOnLastItem: true,
                    fitModeOverride: null,
                    backgroundColorOverride: null,
                    transitionType: "cut",
                    transitionMs: 0,
                },
            );
        }

        const playlistId = schedule.playlistId ? schedule.playlistId.toString() : null;
        if (!playlistId) {
            // Layout-only schedules are handled elsewhere and should not break legacy playlist resolution.
            continue;
        }
        const active = await isPlaylistActive(playlistId);
        if (!active) {
            continue;
        }

        const items = await getPlaylistItems(playlistId);
        const playback = await getPlaylistPlayback(playlistId);
        const resolvedItems = items.map((item) => ({
            ...item,
            fitMode: playback.fitModeOverride ?? item.fitMode ?? "cover",
            backgroundColor: playback.backgroundColorOverride ?? item.backgroundColor ?? null,
        }));

        if (resolvedItems.length === 0) {
            continue;
        }

        return buildManifest(
            screenId,
            orgId,
            resolvedItems,
            layerByScope[schedule.scope] ?? "no_content",
            ts,
            playback,
        );
    }

    if (defaultPlaylistId) {
        const active = await isPlaylistActive(defaultPlaylistId);
        if (active) {
            const defaultItems = await getPlaylistItems(defaultPlaylistId);
            const playback = await getPlaylistPlayback(defaultPlaylistId);
            const resolvedItems = defaultItems.map((item) => ({
                ...item,
                fitMode: playback.fitModeOverride ?? item.fitMode ?? "cover",
                backgroundColor: playback.backgroundColorOverride ?? item.backgroundColor ?? null,
            }));
            if (resolvedItems.length === 0) {
                return buildManifest(screenId, orgId, [], "no_content", ts);
            }
            return buildManifest(screenId, orgId, resolvedItems, "screen", ts, playback);
        }
    }

    return buildManifest(screenId, orgId, [], "no_content", ts);
}

async function updatePresence(screenId, data) {
    const Screen = getScreenModel();
    const setFields = { ...data };
    const disconnectEvent = setFields.disconnectEvents;
    delete setFields.disconnectEvents;

    const updateDoc = {};
    if (Object.keys(setFields).length > 0) {
        updateDoc.$set = setFields;
    }

    if (disconnectEvent) {
        updateDoc.$push = {
            disconnectEvents: {
                $each: [disconnectEvent],
                $slice: -200,
            },
        };
    }

    await Screen.findByIdAndUpdate(screenId, updateDoc);
}

function emitScreenStatus(playerNsp, orgId, screenId, status, at) {
    playerNsp.server.of("/admin").to(`org:${orgId}`).emit("screen:status", {
        screenId,
        status,
        lastSeenAt: at.toISOString(),
    });
}

export function registerPlayerHandlers(playerNsp) {
    playerNsp.on("connection", async (socket) => {
        const screenId = socket.data.screenId;
        const orgId = socket.data.orgId;
        const groupId = socket.data.groupId;
        const isPreview = socket.data.preview === true;
        const playerSessionId = socket.data.playerSessionId;

        if (!screenId || !orgId) {
            socket.disconnect(true);
            return;
        }

        console.log(`[WS /player] connected: screen=${screenId} org=${orgId}`);

        try {
            if (!socket.recovered) {
                await socket.join(`screen:${screenId}`);
                await socket.join(`org:${orgId}`);
                if (groupId) {
                    await socket.join(`group:${groupId}`);
                }
            }

            if (!isPreview) {
                const connectedAt = new Date();
                await updatePresence(screenId, {
                    status: "online",
                    lastSeenAt: connectedAt,
                    activePlayerSessionId: playerSessionId,
                    activePlayerSessionLastSeenAt: connectedAt,
                });
                emitScreenStatus(playerNsp, orgId, screenId, "online", connectedAt);
            }

            if (!socket.recovered) {
                try {
                    const manifest = await resolveManifestForScreenRuntime(screenId, new Date());
                    socket.emit("content_update", { manifest: toPlayerManifest(manifest) });
                } catch (err) {
                    console.warn("[WS /player] manifest resolve failed (expected on first cold start):", err.message);
                }
            }
        } catch (error) {
            console.error("[WS /player] connection error:", error);
            socket.disconnect(true);
            return;
        }

        socket.on("player:request-state", async () => {
            try {
                if (!isPreview) {
                    const requestedAt = new Date();
                    await updatePresence(screenId, {
                        status: "online",
                        lastSeenAt: requestedAt,
                        activePlayerSessionId: playerSessionId,
                        activePlayerSessionLastSeenAt: requestedAt,
                    });
                }
                const manifest = await resolveManifestForScreenRuntime(screenId, new Date());
                socket.emit("content_update", { manifest: toPlayerManifest(manifest) });
            } catch (error) {
                console.error("[WS /player] request-state error:", error);
            }
        });

        socket.on("heartbeat", async (data) => {
            if (isPreview) {
                return;
            }
            await updatePresence(screenId, {
                status: "online",
                lastSeenAt: new Date(),
                currentItemId: data?.currentItemId,
                activePlayerSessionId: playerSessionId,
                activePlayerSessionLastSeenAt: new Date(),
            });
        });

        socket.on("player:heartbeat", async (data) => {
            if (isPreview) {
                return;
            }
            await updatePresence(screenId, {
                status: "online",
                lastSeenAt: new Date(),
                currentItemId: data?.currentItemId,
                activePlayerSessionId: playerSessionId,
                activePlayerSessionLastSeenAt: new Date(),
            });
        });

        socket.on("player:error", async (payload) => {
            if (isPreview) {
                return;
            }
            await updatePresence(screenId, {
                lastErrorAt: new Date(),
                lastErrorCode: payload?.code ?? null,
                lastErrorMessage: payload?.message ?? null,
            });
        });

        socket.on("disconnect", async (reason) => {
            if (isPreview) {
                return;
            }
            const disconnectedAt = new Date();
            await updatePresence(screenId, {
                status: "offline",
                lastSeenAt: disconnectedAt,
                disconnectEvents: disconnectedAt,
            });
            emitScreenStatus(playerNsp, orgId, screenId, "offline", disconnectedAt);
            console.log(`[WS /player] disconnected: screen=${screenId} (${reason})`);
        });
    });
}
