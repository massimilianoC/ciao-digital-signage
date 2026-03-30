import type { Namespace, Socket } from "socket.io";

export function registerAdminHandlers(adminNsp: Namespace): void {
  adminNsp.on("connection", async (socket: Socket) => {
    const orgId = socket.data.orgId as string | undefined;

    if (orgId) {
      await socket.join(`org:${orgId}`);
    }

    console.log(`[/admin] connected: ${socket.id}${orgId ? ` org:${orgId}` : ""}`);

    socket.on("disconnect", (reason) => {
      console.log(`[/admin] disconnected: ${socket.id} (${reason})`);
    });
  });
}
