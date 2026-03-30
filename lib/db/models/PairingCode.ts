import { model, models, Model, Schema, Types } from "mongoose";

export interface IPairingCode {
  _id: Types.ObjectId;
  code?: string;
  pepper?: string;
  screenId: Types.ObjectId;
  orgId?: Types.ObjectId;
  createdAt: Date;
}

const pairingCodeSchema = new Schema<IPairingCode>(
  {
    code: { type: String },
    pepper: { type: String },
    screenId: { type: Schema.Types.ObjectId, required: true },
    orgId: { type: Schema.Types.ObjectId },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

pairingCodeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

const existingPairingCodeModel = models.PairingCode as Model<IPairingCode> | undefined;

export const PairingCodeModel =
  existingPairingCodeModel ?? model<IPairingCode>("PairingCode", pairingCodeSchema);
