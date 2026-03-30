import { Server } from "socket.io";
import { setIO } from "./index.js";
import { registerAdminHandlers } from "./handlers/admin.handlers.js";
import { registerPlayerHandlers } from "./handlers/player.handlers.js";
import { authenticateWebappSocket, registerWebappHandlers } from "./handlers/webapp.handlers.js";
import mongoose from "mongoose";

const PLAYER_SESSION_COOKIE_NAME = "ciao_player_session";
const DEFAULT_PLAYER_SESSION_LOCK_TTL_MS = 45_000;

// ─── Ensure Mongoose connection ──────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";

async function ensureDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getPlayerSessionLockTtlMs() {
  return parsePositiveInt(process.env.PLAYER_SESSION_LOCK_TTL_MS, DEFAULT_PLAYER_SESSION_LOCK_TTL_MS);
}

function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) {
    return null;
  }

  const chunks = String(cookieHeader).split(";");
  for (const chunk of chunks) {
    const [rawName, ...rest] = chunk.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    return decodeURIComponent(rest.join("="));
  }

  return null;
}

function isPlayerSessionId(value) {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

async function claimPlayerSessionLock(Screen, screenId, token, sessionId) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - getPlayerSessionLockTtlMs());

  const claimFilter = {
    _id: screenId,
    screenToken: token,
    $or: [
      { allowMultiSession: true },
      { activePlayerSessionId: sessionId },
      { activePlayerSessionId: { $exists: false } },
      { activePlayerSessionId: null },
      { activePlayerSessionLastSeenAt: { $lt: staleBefore } },
      { status: { $ne: "online" } },
    ],
  };

  const claimed = await Screen.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        activePlayerSessionId: sessionId,
        activePlayerSessionBoundAt: now,
        activePlayerSessionLastSeenAt: now,
      },
    },
    { new: true },
  ).select({ allowMultiSession: 1, activePlayerSessionId: 1 });

  if (claimed) {
    return { granted: true, code: "OK" };
  }

  const existing = await Screen.findOne({ _id: screenId, screenToken: token })
    .select({ allowMultiSession: 1, activePlayerSessionId: 1, activePlayerSessionLastSeenAt: 1, status: 1 });

  if (!existing) {
    return { granted: false, code: "INVALID_TOKEN" };
  }

  const stale =
    !existing.activePlayerSessionLastSeenAt ||
    existing.activePlayerSessionLastSeenAt < staleBefore ||
    existing.status !== "online";

  if (existing.allowMultiSession || existing.activePlayerSessionId === sessionId || stale) {
    const retryClaim = await Screen.findOneAndUpdate(
      claimFilter,
      {
        $set: {
          activePlayerSessionId: sessionId,
          activePlayerSessionBoundAt: now,
          activePlayerSessionLastSeenAt: now,
        },
      },
      { new: true },
    ).select({ activePlayerSessionId: 1, allowMultiSession: 1 });

    if (retryClaim?.allowMultiSession || retryClaim?.activePlayerSessionId === sessionId) {
      return { granted: true, code: "OK" };
    }
  }

  return { granted: false, code: "SESSION_LOCKED" };
}

// ─── Lazy Screen model (reuse if already registered by Next.js) ──────────────
function getScreenModel() {
  if (mongoose.models.Screen) return mongoose.models.Screen;
  const s = new mongoose.Schema({
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
  }, { timestamps: true });
  return mongoose.model("Screen", s);
}

export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    cors: {
      origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 10_000,
    pingInterval: 15_000,
  });

  setIO(io);

  // ── Dev logging for all socket events ─────────────────────────────────────
  const isDev = process.env.NODE_ENV !== "production";

  const playerNsp = io.of("/player");
  const adminNsp = io.of("/admin");
  const activationNsp = io.of("/activation");
  const webappNsp = io.of("/webapp");

  playerNsp.use(async (socket, next) => {
    const authData = socket.handshake.auth ?? socket.handshake.query;

    const token = authData.token;
    const screenId = authData.screenId;
    const isPreview = authData.preview === true || authData.preview === "true";

    if (isDev) console.log(`[WS /player] auth attempt screenId=${screenId} token=${token ? "****" : "NONE"}`);

    if (!token || !screenId) {
      return next(new Error("MISSING_CREDENTIALS"));
    }

    try {
      await ensureDB();
      const Screen = getScreenModel();

      if (!isPreview) {
        const cookieSessionId = parseCookieValue(socket.handshake.headers.cookie, PLAYER_SESSION_COOKIE_NAME);
        if (!isPlayerSessionId(cookieSessionId)) {
          return next(new Error("MISSING_PLAYER_SESSION"));
        }

        const lockResult = await claimPlayerSessionLock(Screen, screenId, token, cookieSessionId);
        if (!lockResult.granted) {
          return next(new Error(lockResult.code));
        }

        socket.data.playerSessionId = cookieSessionId;
      }

      const screen = await Screen.findOne({ _id: screenId, screenToken: token });

      if (!screen) {
        return next(new Error("INVALID_TOKEN"));
      }

      socket.data.screenId = screen._id.toString();
      socket.data.orgId = screen.orgId?.toString();
      socket.data.groupId = screen.groupId?.toString();
      socket.data.preview = isPreview;
      if (isDev) console.log(`[WS /player] ✅ auth OK screen=${socket.data.screenId} org=${socket.data.orgId}`);
      next();
    } catch (err) {
      console.error("[player-ns] auth error:", err);
      return next(new Error("AUTH_ERROR"));
    }
  });

  adminNsp.use((socket, next) => {
    const authData = socket.handshake.auth ?? socket.handshake.query;

    const orgId = authData.orgId;

    if (!orgId) {
      return next(new Error("MISSING_ORG_ID"));
    }

    // TODO: Add full session/cookie validation via better-auth.
    // For now we only require orgId presence. This is acceptable because
    // the /admin namespace is only connected from CMS pages that are
    // already auth-gated by the Next.js middleware.
    socket.data.orgId = orgId;
    if (isDev) console.log(`[WS /admin] ✅ auth OK org=${orgId}`);
    next();
  });

  activationNsp.use((socket, next) => {
    const authData = socket.handshake.auth ?? socket.handshake.query;
    const screenId = authData.screenId;

    if (!screenId) {
      return next(new Error("MISSING_SCREEN_ID"));
    }

    socket.data.screenId = String(screenId);
    next();
  });

  activationNsp.on("connection", async (socket) => {
    const screenId = socket.data.screenId;
    await socket.join(`activation:${screenId}`);
    if (isDev) console.log(`[WS /activation] subscribed screen=${screenId}`);
  });

  registerPlayerHandlers(playerNsp);
  registerAdminHandlers(adminNsp);
  webappNsp.use(async (socket, next) => {
    try {
      await authenticateWebappSocket(socket, next);
    } catch (error) {
      console.error("[webapp-ns] auth error:", error);
      return next(new Error("AUTH_ERROR"));
    }
  });
  registerWebappHandlers(webappNsp);

  return io;
}
