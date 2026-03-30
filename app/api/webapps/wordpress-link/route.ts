import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import {
    createWordpressLinkConnector,
    prefetchWordpressLinkDataset,
    type WordpressLinkCredentials,
} from "@/lib/services/wordpress-link-connector.service";

const taxonomyFilterSchema = z.object({
    taxonomy: z.string().min(1).max(120),
    termIds: z.array(z.number().int().positive()).max(100),
});

const settingsSchema = z.object({
    sourceKind: z.enum(["wordpress-posts", "wordpress-custom", "woocommerce-products"]),
    authMode: z.enum(["none", "basic", "woo-consumer"]),
    baseUrl: z.url(),
    title: z.string().min(1).max(200),
    postType: z.string().max(120).optional(),
    itemsPerPage: z.number().int().min(1).max(50).default(24),
    order: z.enum(["asc", "desc"]).default("desc"),
    orderby: z.string().min(1).max(64).default("date"),
    refreshSeconds: z.number().int().min(30).max(3600).default(180),
    viewMode: z.enum(["grid", "list", "carousel"]).default("grid"),
    autoScrollMode: z.enum(["none", "ticker", "paged", "carousel"]).default("none"),
    templatePreset: z.string().min(1).max(80).default("catalog-grid-rich"),
    taxonomyFilters: z.array(taxonomyFilterSchema).default([]),
    fieldBindings: z.object({
        title: z.string().min(1).max(120),
        subtitle: z.string().max(120).optional(),
        description: z.string().max(120).optional(),
        image: z.string().max(120).optional(),
        price: z.string().max(120).optional(),
        chips: z.string().max(120).optional(),
        ctaLabel: z.string().max(120).optional(),
        ctaHref: z.string().max(120).optional(),
    }),
    theme: z.object({
        accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).default("#0EA5E9"),
        cardStyle: z.enum(["soft", "outline", "glass"]).default("soft"),
        detailPanelMode: z.enum(["popup", "sidebar"]).default("sidebar"),
        galleryDescriptionMax: z.number().int().min(40).max(240).default(96),
        galleryChipLimit: z.number().int().min(1).max(12).default(6),
    }),
});

const createSchema = z.object({
    name: z.string().min(1).max(200),
    settings: settingsSchema,
    credentials: z
        .object({
            username: z.string().max(120).optional(),
            appPassword: z.string().max(200).optional(),
            consumerKey: z.string().max(200).optional(),
            consumerSecret: z.string().max(200).optional(),
        })
        .optional(),
    defaultDurationMs: z.number().int().min(5000).max(3600000).default(45000),
}).superRefine((value, context) => {
    if (value.settings.authMode === "basic") {
        if (!value.credentials?.username) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", "username"], message: "username richiesto per basic auth" });
        }
        if (!value.credentials?.appPassword) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", "appPassword"], message: "appPassword richiesta per basic auth" });
        }
    }

    if (value.settings.authMode === "woo-consumer") {
        if (!value.credentials?.consumerKey) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", "consumerKey"], message: "consumerKey richiesta" });
        }
        if (!value.credentials?.consumerSecret) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials", "consumerSecret"], message: "consumerSecret richiesta" });
        }
    }

    if (value.settings.sourceKind === "wordpress-custom" && !value.settings.postType) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["settings", "postType"], message: "postType richiesto per wordpress-custom" });
    }
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const payload = parsed.data;

    const aggregate = await createWordpressLinkConnector({
        orgId: sess.orgId,
        userId: sess.userId,
        name: payload.name,
        settings: payload.settings,
        credentials: payload.credentials as WordpressLinkCredentials | undefined,
        defaultDurationMs: payload.defaultDurationMs,
    });

    logger.info("WordpressLink connector created", {
        instanceId: aggregate.instance._id.toString(),
        contentId: aggregate.instance.contentId?.toString() ?? null,
        sourceKind: payload.settings.sourceKind,
    });

    return NextResponse.json(
        {
            instanceId: aggregate.instance._id.toString(),
            contentId: aggregate.instance.contentId?.toString() ?? null,
            contentUrl: `/webapps/wordpress-link/${aggregate.instance._id.toString()}?token=${encodeURIComponent(aggregate.instance.publicToken)}`,
            name: aggregate.instance.name,
            sourceKind: payload.settings.sourceKind,
        },
        { status: 201 },
    );
});

const previewSchema = z.object({
    sourceKind: z.enum(["wordpress-posts", "wordpress-custom", "woocommerce-products"]),
    authMode: z.enum(["none", "basic", "woo-consumer"]),
    baseUrl: z.url(),
    postType: z.string().max(120).optional(),
    itemsPerPage: z.number().int().min(1).max(30).default(12),
    taxonomyFilters: z.array(taxonomyFilterSchema).default([]),
    credentials: z
        .object({
            username: z.string().max(120).optional(),
            appPassword: z.string().max(200).optional(),
            consumerKey: z.string().max(200).optional(),
            consumerSecret: z.string().max(200).optional(),
        })
        .optional(),
}).superRefine((value, context) => {
    if (value.sourceKind === "wordpress-custom" && !value.postType) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["postType"], message: "postType richiesto" });
    }

    if (value.authMode === "basic" && (!value.credentials?.username || !value.credentials?.appPassword)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials"], message: "username/appPassword richiesti per basic auth" });
    }

    if (value.authMode === "woo-consumer" && (!value.credentials?.consumerKey || !value.credentials?.consumerSecret)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials"], message: "consumerKey/consumerSecret richiesti" });
    }
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const data = await prefetchWordpressLinkDataset(parsed.data);

    return NextResponse.json(data);
});
