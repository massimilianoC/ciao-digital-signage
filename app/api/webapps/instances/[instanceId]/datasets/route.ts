import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { WebAppInstanceModel } from "@/lib/db/models/WebAppInstance";
import { connectDB } from "@/lib/db/connection";
import { Types } from "mongoose";
import {
    listDatasetBindingsForInstance,
    replaceDatasetBindingsForInstance,
} from "@/lib/sdk/webapp-dataset.service";
import { getWebappDatasetSandboxContract } from "@/lib/sdk/webapp-host.service";

const replaceSchema = z.object({
    bindings: z.array(
        z.object({
            datasetId: z.string().min(1),
            role: z.enum(["primary", "secondary", "fallback", "overlay"]),
            order: z.number().int().nonnegative().optional(),
            required: z.boolean().optional(),
        }),
    ),
});

/**
 * GET /api/webapps/instances/[instanceId]/datasets
 */
export const GET = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ instanceId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { instanceId } = await params;
        const bindings = await listDatasetBindingsForInstance(sess.orgId, instanceId);

        logger.info("Instance dataset bindings listed", {
            instanceId,
            orgId: sess.orgId,
            bindingsCount: bindings.length,
        });

        return NextResponse.json({ bindings });
    },
);

/**
 * PATCH /api/webapps/instances/[instanceId]/datasets
 */
export const PATCH = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ instanceId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => null);
        const parsed = replaceSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const { instanceId } = await params;

        await connectDB();
        if (!Types.ObjectId.isValid(instanceId)) {
            return NextResponse.json({ error: "Instance not found" }, { status: 404 });
        }

        const instance = await WebAppInstanceModel.findOne({
            _id: new Types.ObjectId(instanceId),
            orgId: new Types.ObjectId(sess.orgId),
        }).lean();

        if (!instance) {
            return NextResponse.json({ error: "Instance not found" }, { status: 404 });
        }

        const sandboxContract = getWebappDatasetSandboxContract(instance.appId);
        if (!sandboxContract.dataset.supportsBinding) {
            return NextResponse.json(
                { error: "This webapp does not support generic dataset bindings" },
                { status: 400 },
            );
        }

        await replaceDatasetBindingsForInstance({
            orgId: sess.orgId,
            userId: sess.userId,
            instanceId,
            bindings: parsed.data.bindings,
        });

        logger.info("Instance dataset bindings replaced", {
            instanceId,
            orgId: sess.orgId,
            appId: instance.appId,
            bindingsCount: parsed.data.bindings.length,
        });

        return NextResponse.json({ ok: true });
    },
);
