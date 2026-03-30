import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { GroupService } from "@/lib/services/group.service";
import { getOrgIdFromSession } from "@/lib/api-utils";

const assignSchema = z.object({
  screenIds: z.array(z.string()),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  await connectDB();

  const service = new GroupService(orgId);

  try {
    await service.assignScreens(id, parsed.data.screenIds);
    return NextResponse.json({ success: true, groupId: id, screenIds: parsed.data.screenIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "GROUP_NOT_FOUND") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    console.error("assignScreens error:", error);
    return NextResponse.json({ error: "Failed to assign screens" }, { status: 500 });
  }
}
