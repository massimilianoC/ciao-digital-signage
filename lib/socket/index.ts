import type { Server as SocketIOServer } from "socket.io";

declare global {
  var __io: SocketIOServer | undefined;
}

export function getIO(): SocketIOServer {
  if (!global.__io) {
    throw new Error(
      "Socket.IO server not initialized. Call initSocketServer() first."
    );
  }

  return global.__io;
}

export function setIO(io: SocketIOServer): void {
  global.__io = io;
}
