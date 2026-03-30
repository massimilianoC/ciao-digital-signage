export function registerAdminHandlers(adminNsp) {
    adminNsp.on("connection", async (socket) => {
        const orgId = socket.data.orgId;

        if (orgId) {
            await socket.join(`org:${orgId}`);
        }

        console.log(`[/admin] connected: ${socket.id}${orgId ? ` org:${orgId}` : ""}`);

        socket.on("disconnect", (reason) => {
            console.log(`[/admin] disconnected: ${socket.id} (${reason})`);
        });
    });
}
