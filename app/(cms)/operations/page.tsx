import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OverridePanel } from "@/components/cms/OverridePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { PlaylistService } from "@/lib/services/playlist.service";
import { ScheduleService } from "@/lib/services/schedule.service";
import { ScreenService } from "@/lib/services/screen.service";

export default async function OperationsPage() {
  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");

  const { orgId } = authed;

  let screenCount = 0;
  let playlists: Array<{ _id: string; name: string }> = [];
  let activeOverride: { playlistId: string; playlistName: string; expiresAt: string | null } | null = null;

  try {
    await connectDB();
    const [screenDocs, playlistDocs, override] = await Promise.all([
      new ScreenService(orgId).list(),
      new PlaylistService(orgId).list(),
      ScheduleService.getActiveOverride(orgId),
    ]);

    screenCount = screenDocs.length;
    playlists = playlistDocs.map((playlist) => ({ _id: playlist._id.toString(), name: playlist.name }));

    if (override?.isActive) {
      const playlistId = override.playlistId.toString();
      const playlist = playlists.find((item) => item._id === playlistId);
      activeOverride = {
        playlistId,
        playlistName: playlist?.name ?? "Unknown playlist",
        expiresAt: override.expiresAt ? new Date(override.expiresAt).toISOString() : null,
      };
    }
  } catch {
    screenCount = 0;
    playlists = [];
    activeOverride = null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Global operational actions for emergency broadcast and player recovery.
          </p>
        </div>
        <Link href="/screens">
          <Button variant="outline">Back to Screens</Button>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        <OverridePanel
          playlists={playlists}
          screenCount={screenCount}
          initialActiveOverride={activeOverride}
        />

        <Card>
          <CardHeader>
            <CardTitle>Operational notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Use override only for urgent all-screen messaging and clear it as soon as the campaign ends.</p>
            <p>For single-screen launch and recovery links, open the related screen detail from the Screens area.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}