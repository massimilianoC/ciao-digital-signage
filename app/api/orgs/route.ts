import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { OrgService } from "@/lib/services/org.service";
import { withErrorHandler, logger } from "@/lib/api-utils";

type SessionUserWithRole = {
  role?: string;
};

async function assertSuperAdmin(req: NextRequest): Promise<NextResponse | null> {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as SessionUserWithRole).role;
  if (role !== "super-admin" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authError = await assertSuperAdmin(req);
  if (authError) {
    return authError;
  }

  const organizations = await OrgService.listAll(req.headers);
  return NextResponse.json(organizations);
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const authError = await assertSuperAdmin(req);
  if (authError) {
    return authError;
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await OrgService.create(parsed.data, req.headers);
  logger.info("Organization created", { name: parsed.data.name, slug: parsed.data.slug });
  return NextResponse.json(result, { status: 201 });
});

const patchSchema = z.object({
  orgId: z.string(),
  action: z.enum(["suspend", "reactivate"]),
  quota: z
    .object({
      maxScreens: z.number().int().positive().optional(),
      maxStorageBytes: z.number().int().positive().optional(),
    })
    .optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const authError = await assertSuperAdmin(req);
  if (authError) {
    return authError;
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { orgId, action, quota } = parsed.data;

  if (action === "suspend") {
    await OrgService.suspend(orgId);
  } else {
    await OrgService.reactivate(orgId);
  }

  if (quota) {
    await OrgService.updateQuota(orgId, quota);
  }

  logger.info("Organization updated", { orgId, action });
  return NextResponse.json({ success: true });
});

const deleteSchema = z.object({
  orgId: z.string(),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const authError = await assertSuperAdmin(req);
  if (authError) {
    return authError;
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await OrgService.delete(parsed.data.orgId, req.headers);
  logger.info("Organization deleted", { orgId: parsed.data.orgId });
  return NextResponse.json({ success: true });
});
