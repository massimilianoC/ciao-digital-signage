import mongoose, { Schema, Types } from "mongoose";

export interface IWebAppSecretRef {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    instanceId: Types.ObjectId;
    provider: "google-calendar-api-key" | "wordpress-basic-auth" | "woocommerce-consumer";
    secretKey: string;
    tokenPolicy?: string;
    rotationPolicy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppSecretRefSchema = new Schema<IWebAppSecretRef>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        instanceId: { type: Schema.Types.ObjectId, required: true, index: true },
        provider: { type: String, enum: ["google-calendar-api-key", "wordpress-basic-auth", "woocommerce-consumer"], required: true },
        secretKey: { type: String, required: true },
        tokenPolicy: { type: String },
        rotationPolicy: { type: String },
    },
    { timestamps: true, collection: "webapp_secrets_refs" },
);

WebAppSecretRefSchema.index({ orgId: 1, instanceId: 1 }, { unique: true });

export const WebAppSecretRefModel =
    mongoose.models.WebAppSecretRef ??
    mongoose.model<IWebAppSecretRef>("WebAppSecretRef", WebAppSecretRefSchema);