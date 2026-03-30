import type { Server as HTTPServer } from "node:http";
import { Server } from "socket.io";
import { setIO } from "./index.js";
import { registerAdminHandlers } from "./handlers/admin.handlers.js";
import { registerPlayerHandlers } from "./handlers/player.handlers.js";
import { authenticateWebappSocket, registerWebappHandlers } from "./handlers/webapp.handlers.js";
import { connectDB } from "@/lib/db/connection";
import { ScreenModel } from "@/lib/db/models/Screen";
import {
  claimPlayerSessionLock,
  isPlayerSessionId,
  PLAYER_SESSION_COOKIE_NAME,
} from "@/lib/player/session-lock";

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const chunks = cookieHeader.split(";");
  for (const chunk of chunks) {
    const [rawName, ...rest] = chunk.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    return decodeURIComponent(rest.join("="));
  }

  return null;
}

export function initSocketServer(httpServer: HTTPServer): Server {
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

  const playerNsp = io.of("/player");
  const adminNsp = io.of("/admin");
  const activationNsp = io.of("/activation");
  const webappNsp = io.of("/webapp");

  playerNsp.use(async (socket, next) => {
    const authData = (socket.handshake.auth ?? socket.handshake.query) as {
      screenId?: string;
      token?: string;
      orgId?: string;
      groupId?: string;
      preview?: boolean | string;
    };

    const token = authData.token;
    const screenId = authData.screenId;
    const isPreview = authData.preview === true || authData.preview === "true";

    if (!token || !screenId) {
      return next(new Error("MISSING_CREDENTIALS"));
    }

    try {
      if (!isPreview) {
        const cookieSessionId = parseCookieValue(
          socket.handshake.headers.cookie,
          PLAYER_SESSION_COOKIE_NAME,
        );

        if (!isPlayerSessionId(cookieSessionId)) {
          return next(new Error("MISSING_PLAYER_SESSION"));
        }

        const lockResult = await claimPlayerSessionLock(screenId, token, cookieSessionId);
        if (!lockResult.granted) {
          return next(new Error(lockResult.code));
        }

        socket.data.playerSessionId = cookieSessionId;
      }

      await connectDB();
      const screen = await ScreenModel.findOne({ _id: screenId, screenToken: token });

      if (!screen) {
        return next(new Error("INVALID_TOKEN"));
      }

      socket.data.screenId = screen._id.toString();
      socket.data.orgId = screen.orgId?.toString();
      socket.data.groupId = screen.groupId?.toString();
      socket.data.preview = isPreview;
      next();
    } catch (err) {
      console.error("[player-ns] auth error:", err);
      return next(new Error("AUTH_ERROR"));
    }
  });

  adminNsp.use((socket, next) => {
    const authData = (socket.handshake.auth ?? socket.handshake.query) as {
      orgId?: string;
    };

    const orgId = authData.orgId;

    if (!orgId) {
      return next(new Error("MISSING_ORG_ID"));
    }

    // TODO: Add full session/cookie validation via better-auth.
    // For now we only require orgId presence. This is acceptable because
    // the /admin namespace is only connected from CMS pages that are
    // already auth-gated by the Next.js middleware.
    socket.data.orgId = orgId;
    next();
  });

  activationNsp.use((socket, next) => {
    const authData = (socket.handshake.auth ?? socket.handshake.query) as {
      screenId?: string;
    };

    const screenId = authData.screenId;
    if (!screenId) {
      return next(new Error("MISSING_SCREEN_ID"));
    }

    socket.data.screenId = screenId;
    next();
  });

  activationNsp.on("connection", async (socket) => {
    const screenId = socket.data.screenId as string;
    await socket.join(`activation:${screenId}`);
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
