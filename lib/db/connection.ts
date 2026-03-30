import mongoose from "mongoose";
import { MongoClient } from "mongodb";

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
}

// ─── Mongoose connection (for app Mongoose models) ───────────────────────────
// Cache on global to survive Next.js hot-reload in dev
declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn: typeof mongoose | undefined;
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
  // eslint-disable-next-line no-var
  var __mongooseConnUri: string | undefined;
}

export async function connectDB(): Promise<typeof mongoose> {
  const requestedUri = getMongoUri();

  // If any module already connected mongoose, reuse that connection.
  // This avoids openUri() crashes when another part of the app initialized
  // mongoose first (common in Next.js dev + hot reload).
  if (mongoose.connection.readyState === 1) {
    global.__mongooseConn = mongoose;
    global.__mongooseConnUri = global.__mongooseConnUri ?? requestedUri;
    return mongoose;
  }

  if (global.__mongooseConnPromise) {
    return global.__mongooseConnPromise;
  }

  global.__mongooseConnUri = requestedUri;
  global.__mongooseConnPromise = mongoose
    .connect(requestedUri, {
      bufferCommands: false,
    })
    .then((conn) => {
      global.__mongooseConn = conn;
      return conn;
    })
    .finally(() => {
      global.__mongooseConnPromise = undefined;
    });

  return global.__mongooseConnPromise;
}

// ─── Native MongoClient (for better-auth adapter) ────────────────────────────
// better-auth requires a raw MongoClient, not a Mongoose connection.
// Use a module-level singleton — MongoClient handles its own connection pool.
export const mongoClient = new MongoClient(getMongoUri());
