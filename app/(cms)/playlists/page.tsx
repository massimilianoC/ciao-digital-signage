import { headers } from "next/headers";

import { PlaylistListManager } from "@/components/cms/PlaylistListManager";
import { NewPlaylistButton } from "@/components/cms/NewPlaylistButton";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { PlaylistService } from "@/lib/services/playlist.service";

interface PlaylistCardData {
  _id: string;
  name: string;
  status: "active" | "suspended";
  itemCount: number;
  updatedAt: string;
}

export default async function PlaylistsPage() {
  let playlists: PlaylistCardData[] = [];

  try {
    const authed = await getSessionAndOrg(await headers());
    const orgId = authed?.orgId;

    if (orgId) {
      await connectDB();
      const service = new PlaylistService(orgId);
      const records = await service.list();
      playlists = records.map((record) => ({
        _id: record._id.toString(),
        name: record.name,
        status: record.status ?? "active",
        itemCount: record.items.length,
        updatedAt: record.updatedAt.toISOString(),
      }));
    }
  } catch {
    playlists = [];
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Playlists</h1>
        <NewPlaylistButton />
      </div>

      <PlaylistListManager playlists={playlists} />
    </div>
  );
}
