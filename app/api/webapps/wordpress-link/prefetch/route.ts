import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { prefetchWordpressLinkDataset } from "@/lib/services/wordpress-link-connector.service";

const schema = z.object({
    sourceKind: z.enum(["wordpress-posts", "wordpress-custom", "woocommerce-products"]),
    authMode: z.enum(["none", "basic", "woo-consumer"]),
    baseUrl: z.url(),
    sampleUrl: z.url().optional(),
    postType: z.string().max(120).optional(),
    itemsPerPage: z.number().int().min(1).max(30).default(12),
    taxonomyFilters: z
        .array(
            z.object({
                taxonomy: z.string().min(1).max(120),
                termIds: z.array(z.number().int().positive()).max(100),
            }),
        )
        .default([]),
    credentials: z
        .object({
            username: z.string().max(120).optional(),
            appPassword: z.string().max(200).optional(),
            consumerKey: z.string().max(200).optional(),
            consumerSecret: z.string().max(200).optional(),
        })
        .optional(),
}).superRefine((value, context) => {
    if (value.authMode === "basic" && (!value.credentials?.username || !value.credentials?.appPassword)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials"], message: "username/appPassword richiesti" });
    }

    if (value.authMode === "woo-consumer" && (!value.credentials?.consumerKey || !value.credentials?.consumerSecret)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentials"], message: "consumerKey/consumerSecret richiesti" });
    }
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const result = await prefetchWordpressLinkDataset(parsed.data);
    return NextResponse.json(result);
});
