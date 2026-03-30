export function getIO() {
  if (!global.__io) {
    throw new Error(
      "Socket.IO server not initialized. Call initSocketServer() first."
    );
  }

  return global.__io;
}

export function setIO(io) {
  global.__io = io;
}
