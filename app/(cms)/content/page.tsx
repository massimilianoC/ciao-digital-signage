import Link from "next/link";
import { headers } from "next/headers";

import { ContentGrid } from "@/components/cms/ContentGrid";
import { type ContentItem } from "@/components/cms/types";
import { Button } from "@/components/ui/button";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { type IContentItem } from "@/lib/db/models/Content";
import { ContentService } from "@/lib/services/content.service";

function mapContentItem(item: IContentItem): ContentItem {
  const fileUrl = typeof item.config?.fileUrl === "string" ? item.config.fileUrl : undefined;
  const embedUrl = typeof item.config?.url === "string" ? item.config.url : undefined;
  const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
  return {
    _id: item._id.toString(),
    name: item.name,
    alias: item.alias,
    status: item.status ?? "active",
    type: item.type,
    url: fileUrl ?? embedUrl ?? "",
    urlSubtype: typeof item.config?.urlSubtype === "string" ? item.config.urlSubtype : undefined,
    thumbnailUrl: item.thumbnailUrl,
    tags: item.tags,
    folder: item.folder,
    mimeType: typeof item.config?.mimeType === "string" ? item.config.mimeType : undefined,
    fileSizeBytes: typeof item.config?.fileSizeBytes === "number" ? item.config.fileSizeBytes : undefined,
    createdAt: createdAt.toISOString(),
  };
}

export default async function ContentPage() {
  let items: ContentItem[] = [];
  let orgId = "demo";

  try {
    const authed = await getSessionAndOrg(await headers()).catch(() => null);
    orgId = authed?.orgId ?? "demo";

    if (orgId !== "demo") {
      await connectDB();
      const service = new ContentService(orgId);
      const contentItems = await service.list(undefined, undefined, true);
      items = contentItems.map(mapContentItem);
    }
  } catch {
    items = [];
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Content Library</h1>
        <div className="flex items-center gap-2">
          <Link href="/content/google-calendar/new">
            <Button variant="outline">Google Calendar Connector</Button>
          </Link>
          <Link href="/content/wordpress-link/new">
            <Button variant="outline">WordpressLink Connector</Button>
          </Link>
          <Link href="/content/upload">
            <Button>Upload Content</Button>
          </Link>
        </div>
      </div>
      <ContentGrid initialItems={items} orgId={orgId} />
    </div>
  );
}
