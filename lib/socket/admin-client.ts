import { io, type Socket } from "socket.io-client";

let socketInstance: Socket | null = null;
let connectedOrgId: string | null = null;

export function getAdminSocket(orgId?: string): Socket {
  if (typeof window === "undefined") {
    throw new Error("getAdminSocket() must only be called in browser context");
  }

  if (!socketInstance || (orgId && connectedOrgId !== orgId)) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }

    socketInstance = io("/admin", {
      auth: orgId ? { orgId } : undefined,
      withCredentials: true,
    });

    socketInstance.on("connect_error", (error) => {
      console.warn("[admin-socket] connection error:", error.message);
    });

    connectedOrgId = orgId ?? null;
  }

  return socketInstance;
}

export function disconnectAdminSocket(): void {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
  socketInstance = null;
  connectedOrgId = null;
}
