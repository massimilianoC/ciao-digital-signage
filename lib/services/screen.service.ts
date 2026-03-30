import { createHmac, randomUUID } from "node:crypto";
import { Model, Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { GroupModel } from "@/lib/db/models/Group";
import { PairingCodeModel } from "@/lib/db/models/PairingCode";
import { IScreen, ScreenModel } from "@/lib/db/models/Screen";
import { TenantRepository } from "@/lib/services/base/tenant.repository";

type TenantScreen = IScreen & { orgId: Types.ObjectId };

export type PresenceUpdate = {
  status?: "online" | "offline";
  lastSeenAt?: Date;
  currentItemId?: string;
  activePlayerSessionId?: string | null;
  activePlayerSessionLastSeenAt?: Date;
  disconnectEventAt?: Date;
  error?: {
    code?: string | null;
    message?: string | null;
    at?: Date;
  } | null;
};

const PAIRING_CODE_DIGITS = 6;
const PAIRING_STEP_SECONDS = 60;
const PAIRING_SESSION_TTL_SECONDS = 600;
const PAIRING_GLOBAL_SALT = process.env.PAIRING_GLOBAL_SALT ?? "change-me-pairing-global-salt";
const PAIRING_SERVER_SECRET = process.env.BETTER_AUTH_SECRET ?? "change-me-pairing-server-secret";

function getPairingStep(ts: number): number {
  return Math.floor(ts / (PAIRING_STEP_SECONDS * 1000));
}

function getSecondsToNextStep(ts: number): number {
  const elapsed = Math.floor((ts / 1000) % PAIRING_STEP_SECONDS);
  return PAIRING_STEP_SECONDS - elapsed;
}

function generateOtpCode(screenId: string, pepper: string, step: number): string {
  const digest = createHmac("sha256", `${PAIRING_GLOBAL_SALT}:${PAIRING_SERVER_SECRET}`)
    .update(`${screenId}:${pepper}:${step}`)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 10 ** PAIRING_CODE_DIGITS;
  return otp.toString().padStart(PAIRING_CODE_DIGITS, "0");
}

export class ScreenService extends TenantRepository<TenantScreen> {
  constructor(orgId: string | Types.ObjectId) {
    super(ScreenModel as unknown as Model<TenantScreen>, new Types.ObjectId(orgId.toString()));
  }

  async list(): Promise<IScreen[]> {
    return this.find();
  }

  async getById(id: string): Promise<IScreen | null> {
    return this.findOne({ _id: new Types.ObjectId(id) });
  }

  async update(
    id: string,
    data: Partial<Pick<IScreen, "name" | "location" | "timezone" | "operatingMode" | "disconnectPolicy" | "allowMultiSession">> & {
      groupId?: Types.ObjectId | null;
      defaultPlaylistId?: Types.ObjectId | null;
    },
  ): Promise<void> {
    const updateData = { ...data };

    if (updateData.groupId === null) {
      delete updateData.groupId;
      await this.updateOne({ _id: new Types.ObjectId(id) }, { $unset: { groupId: 1 } });
    }

    if (updateData.defaultPlaylistId === null) {
      delete updateData.defaultPlaylistId;
      await this.updateOne(
        { _id: new Types.ObjectId(id) },
        { $unset: { defaultPlaylistId: 1 } },
      );
    }

    if (Object.keys(updateData).length > 0) {
      await this.updateOne({ _id: new Types.ObjectId(id) }, { $set: updateData });
    }
  }

  async remove(id: string): Promise<void> {
    const screenObjectId = new Types.ObjectId(id);
    await GroupModel.updateMany(
      { orgId: this.orgId },
      { $pull: { screenIds: screenObjectId } },
    );
    await this.deleteOne({ _id: screenObjectId });
  }

  static async generatePairingCode(): Promise<{ code: string; screenId: string; expiresInSeconds: number }> {
    const screen = await ScreenModel.create({
      name: "Unnamed Screen",
      timezone: "UTC",
      status: "pending",
      screenToken: randomUUID(),
    });

    const pepper = randomUUID().replace(/-/g, "");
    const now = Date.now();
    const step = getPairingStep(now);
    const code = generateOtpCode(screen._id.toString(), pepper, step);

    await PairingCodeModel.create({
      code,
      pepper,
      screenId: screen._id,
      createdAt: new Date(),
    });

    return {
      code,
      screenId: screen._id.toString(),
      expiresInSeconds: getSecondsToNextStep(now),
    };
  }

  static async getActivationStatus(screenId: string): Promise<
    | { status: "paired"; paired: true; screenId: string; token: string; playerUrl: string }
    | { status: "pending"; paired: false; screenId: string; code: string; expiresInSeconds: number }
    | { status: "expired"; paired: false; screenId: string }
  > {
    const screen = await ScreenModel.findById(screenId).lean();
    if (!screen) {
      throw new Error("SCREEN_NOT_FOUND");
    }

    if (screen.orgId) {
      return {
        status: "paired",
        paired: true,
        screenId,
        token: screen.screenToken,
        playerUrl: `/player/${screenId}?token=${encodeURIComponent(screen.screenToken)}`,
      };
    }

    const pairingSession = await PairingCodeModel.findOne({
      screenId: screen._id,
      createdAt: { $gte: new Date(Date.now() - PAIRING_SESSION_TTL_SECONDS * 1000) },
    }).lean();

    if (!pairingSession) {
      return {
        status: "expired",
        paired: false,
        screenId,
      };
    }

    let pepper = pairingSession.pepper;
    if (!pepper) {
      // Backward compatibility for sessions created before per-session pepper rollout.
      pepper = randomUUID().replace(/-/g, "");
      await PairingCodeModel.updateOne(
        { _id: pairingSession._id },
        { $set: { pepper } },
      );
    }

    const now = Date.now();
    const step = getPairingStep(now);
    const code = generateOtpCode(screenId, pepper, step);

    return {
      status: "pending",
      paired: false,
      screenId,
      code,
      expiresInSeconds: getSecondsToNextStep(now),
    };
  }

  static async claimPairingCode(
    code: string,
    orgId: string,
    name: string,
    timezone: string,
  ): Promise<{ screenId: string; screenToken: string }> {
    const normalizedCode = code.trim();
    const minCreatedAt = new Date(Date.now() - PAIRING_SESSION_TTL_SECONDS * 1000);
    const sessions = await PairingCodeModel.find({ createdAt: { $gte: minCreatedAt } })
      .select({ _id: 1, screenId: 1, pepper: 1 })
      .lean();

    const nowStep = getPairingStep(Date.now());
    const matchedSession = sessions.find((session) => {
      if (!session.pepper) {
        return false;
      }

      const currentCode = generateOtpCode(session.screenId.toString(), session.pepper, nowStep);
      return normalizedCode === currentCode;
    });

    if (!matchedSession) {
      throw new Error("INVALID_CODE");
    }

    const screen = await ScreenModel.findById(matchedSession.screenId).lean();
    if (!screen) {
      throw new Error("SCREEN_NOT_FOUND");
    }

    if (screen.orgId) {
      throw new Error("ALREADY_CLAIMED");
    }

    await ScreenModel.updateOne(
      { _id: matchedSession.screenId },
      {
        $set: {
          orgId: new Types.ObjectId(orgId),
          name,
          timezone,
          status: "offline",
        },
      },
    );

    await PairingCodeModel.deleteOne({ _id: matchedSession._id });

    return {
      screenId: matchedSession.screenId.toString(),
      screenToken: screen.screenToken,
    };
  }
}

export async function updatePresence(screenId: string, data: PresenceUpdate): Promise<void> {
  const setFields: Record<string, unknown> = {};
  const pushFields: Record<string, unknown> = {};

  if (data.status !== undefined) {
    setFields.status = data.status;
  }

  if (data.lastSeenAt !== undefined) {
    setFields.lastSeenAt = data.lastSeenAt;
  }

  if (data.currentItemId !== undefined) {
    setFields.currentItemId = data.currentItemId;
  }

  if (data.activePlayerSessionId !== undefined) {
    setFields.activePlayerSessionId = data.activePlayerSessionId;
  }

  if (data.activePlayerSessionLastSeenAt !== undefined) {
    setFields.activePlayerSessionLastSeenAt = data.activePlayerSessionLastSeenAt;
  }

  if (data.disconnectEventAt) {
    pushFields.disconnectEvents = {
      $each: [data.disconnectEventAt],
      $slice: -200,
    };
  }

  if (data.error !== undefined) {
    if (data.error === null) {
      setFields.lastErrorAt = null;
      setFields.lastErrorCode = null;
      setFields.lastErrorMessage = null;
    } else {
      setFields.lastErrorAt = data.error.at ?? new Date();
      setFields.lastErrorCode = data.error.code ?? null;
      setFields.lastErrorMessage = data.error.message ?? null;
    }
  }

  if (Object.keys(setFields).length === 0 && Object.keys(pushFields).length === 0) {
    return;
  }

  await connectDB();
  const updateDoc: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) {
    updateDoc.$set = setFields;
  }
  if (Object.keys(pushFields).length > 0) {
    updateDoc.$push = pushFields;
  }

  await ScreenModel.findByIdAndUpdate(screenId, updateDoc);
}
