import mongoose, { Schema, Types } from "mongoose";

import type { WebAppId } from "./WebAppInstance";

export type GoogleCalendarMode = "public-ics" | "api-key";
export type QueueMode = "display" | "queue" | "remote" | "waiting-list" | "kiosk";
export type QueueType = "numeric" | "alpha";
export type QueueServiceMode = "reservation" | "round-robin";
export type QueuePlusMode = "display" | "queue" | "remote" | "waiting-list" | "kiosk";
export type QueuePlusServiceMode = "reservation" | "round-robin" | "multigate";
export type WordpressLinkSourceKind = "wordpress-posts" | "wordpress-custom" | "woocommerce-products";
export type WordpressLinkAuthMode = "none" | "basic" | "woo-consumer";
export type WordpressLinkViewMode = "grid" | "list" | "carousel";
export type WordpressLinkAutoScrollMode = "none" | "ticker" | "paged" | "carousel";

export interface QueuePlusAudioSettings {
    enabled: boolean;
    speechMode: "off" | "number" | "message" | "both";
    languages: string[];
    preChime: boolean;
    postChime: boolean;
}

export interface WordpressLinkTaxonomyFilter {
    taxonomy: string;
    termIds: number[];
}

export interface WordpressLinkFieldBindings {
    title: string;
    subtitle?: string;
    description?: string;
    image?: string;
    price?: string;
    chips?: string;
    ctaLabel?: string;
    ctaHref?: string;
}

/** Typed settings for wordpress-link instances */
export interface WordpressLinkSettings {
    sourceKind: WordpressLinkSourceKind;
    authMode: WordpressLinkAuthMode;
    baseUrl: string;
    title: string;
    postType?: string;
    itemsPerPage: number;
    order: "asc" | "desc";
    orderby: string;
    refreshSeconds: number;
    viewMode: WordpressLinkViewMode;
    autoScrollMode: WordpressLinkAutoScrollMode;
    templatePreset: string;
    taxonomyFilters: WordpressLinkTaxonomyFilter[];
    fieldBindings: WordpressLinkFieldBindings;
    theme: {
        accentColor: string;
        cardStyle: "soft" | "outline" | "glass";
        detailPanelMode?: "popup" | "sidebar";
        galleryDescriptionMax?: number;
        galleryChipLimit?: number;
    };
}

/** Typed settings for google-calendar instances */
export interface GoogleCalendarSettings {
    mode: GoogleCalendarMode;
    title?: string;
    catalogSourceId?: string;
    calendarId?: string;
    publicIcsUrl?: string;
    timezone: string;
    refreshSeconds: number;
    maxItems: number;
    accentColor?: string;
}

/** Typed settings for queue instances */
export interface QueueSettings {
    mode: QueueMode;
    datasetId: string;
    queueType: QueueType;
    prefix?: string;
    maxWaiting: number;
    showWaitingCount: boolean;
    accentColor?: string;
    serviceMode: QueueServiceMode;
    bookingEnabled: boolean;
    roundRobinMaxNumber: number;
    kioskDatasetIds?: string[];
    waitingListLimit?: number;
}

export interface QueuePlusSettings {
    mode: QueuePlusMode;
    datasetId: string;
    queueType: QueueType;
    prefix?: string;
    maxWaiting: number;
    showWaitingCount: boolean;
    accentColor?: string;
    serviceMode: QueuePlusServiceMode;
    bookingEnabled: boolean;
    roundRobinMaxNumber: number;
    kioskDatasetIds?: string[];
    waitingListLimit?: number;
    waitingListLayout?: "list" | "grid";
    waitingListDatasetIds?: string[];
    waitingListMergeMode?: "split" | "merged-by-timestamp";
    allowedDatasetIds?: string[];
    allowedDisplayIds?: string[];
    activeDisplayId?: string | null;
    displayBindingMode?: "follow-queue" | "remote-controlled";
    audio?: QueuePlusAudioSettings;
    ticketDeliveryMode?: "print" | "qr" | "both";
    printerProfile?: string;
    enableDigitalTicket?: boolean;
}

export type WebAppSettings = GoogleCalendarSettings | QueueSettings | QueuePlusSettings | WordpressLinkSettings;

export interface IWebAppConfig {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    appId: WebAppId;
    schemaVersion: number;
    settings: WebAppSettings;
    uiProps?: Record<string, unknown>;
    refreshPolicy?: Record<string, unknown>;
    dataAccessMode?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppConfigSchema = new Schema<IWebAppConfig>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        appId: { type: String, enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"], required: true, index: true },
        schemaVersion: { type: Number, default: 1 },
        settings: { type: Schema.Types.Mixed, required: true },
        uiProps: { type: Schema.Types.Mixed },
        refreshPolicy: { type: Schema.Types.Mixed },
        dataAccessMode: { type: String },
    },
    { timestamps: true, collection: "webapp_configs" },
);

WebAppConfigSchema.index({ orgId: 1, appId: 1 });

export const WebAppConfigModel =
    mongoose.models.WebAppConfig ??
    mongoose.model<IWebAppConfig>("WebAppConfig", WebAppConfigSchema);