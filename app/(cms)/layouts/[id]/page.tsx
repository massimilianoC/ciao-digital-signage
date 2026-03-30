import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { LayoutCompositeEditor } from "@/components/cms/layouts/LayoutCompositeEditor";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel, type LayoutZone } from "@/lib/db/models/CompositeLayout";
import type { CompositeLayoutData } from "@/components/cms/layouts/types";

interface LayoutEditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function LayoutEditorPage({ params }: LayoutEditorPageProps) {
  const { id } = await params;

  let initialData: CompositeLayoutData | undefined;

  try {
    const authed = await getSessionAndOrg(await headers());
    const orgId = authed?.orgId;

    if (!orgId) notFound();

    await connectDB();
    const layout = await CompositeLayoutModel.findOne({ _id: id, orgId }).lean();
    if (!layout) notFound();

    initialData = {
      _id: layout._id.toString(),
      name: layout.name,
      resolution: layout.resolution,
      zones: layout.zones.map((z: LayoutZone) => ({
        id: z.id,
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        label: z.label,
        backgroundImage: z.backgroundImage,
        padding: z.padding,
        borderRadius: z.borderRadius,
        borderColor: z.borderColor,
        borderSize: z.borderSize,
        dropShadow: z.dropShadow,
        content: z.content
          ? {
              type: z.content.type,
              refId: z.content.refId.toString(),
              label: z.content.label,
            }
          : undefined,
      })),
      backgroundImage: layout.backgroundImage,
    };
  } catch {
    notFound();
  }

  if (!initialData) notFound();

  // initialData is always defined here (notFound() throws)
  const data = initialData as CompositeLayoutData;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <LayoutCompositeEditor layoutId={data._id} initialData={data} />
    </div>
  );
}
