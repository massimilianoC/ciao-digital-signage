import { headers } from "next/headers";
import { getSessionAndOrg } from "@/lib/api-utils";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Monitor,
  Image,
  ListMusic,
  Calendar,
  Upload,
  Plus,
  ArrowRight,
} from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { connectDB } from "@/lib/db/connection";
import { deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { ScreenService } from "@/lib/services/screen.service";
import { ContentService } from "@/lib/services/content.service";
import { PlaylistService } from "@/lib/services/playlist.service";
import { ScheduleService } from "@/lib/services/schedule.service";

export default async function DashboardPage() {
  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");
  const { session, orgId } = authed;

  await connectDB();

  const [screens, contents, playlists, schedules] = await Promise.all([
    new ScreenService(orgId).list(),
    new ContentService(orgId).list(),
    new PlaylistService(orgId).list(),
    ScheduleService.listByOrg(orgId),
  ]);

  const screensWithConnectivity = screens.map((screen) => ({
    screen,
    connectivity: deriveScreenConnectivity(screen),
  }));

  const onlineCount = screensWithConnectivity.filter((entry) => entry.connectivity.state === "online").length;
  const offlineCount = screensWithConnectivity.filter((entry) => entry.connectivity.state === "offline").length;
  const pendingCount = screensWithConnectivity.filter((entry) => entry.connectivity.state === "initialize").length;
  const disconnectedCount = screensWithConnectivity.filter((entry) => entry.connectivity.state === "disconnected").length;

  const statusColor: Record<string, string> = {
    online: "bg-green-500",
    disconnected: "bg-orange-500",
    offline: "bg-gray-400",
    initialize: "bg-yellow-500",
  };

  return (
    <main className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {session.user.name} &middot;{" "}
            {(session.user as { role?: string }).role ?? "member"}
          </span>
          <LogoutButton />
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Screens
              </CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{screens.length}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge className="bg-green-100 text-green-800">{onlineCount} online</Badge>
              {disconnectedCount > 0 && (
                <Badge className="bg-orange-100 text-orange-800">{disconnectedCount} disconnected</Badge>
              )}
              <Badge className="bg-muted text-muted-foreground">{offlineCount} offline</Badge>
              {pendingCount > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800">{pendingCount} pending</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Content Items
              </CardTitle>
              <Image className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{contents.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              media files uploaded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Playlists
              </CardTitle>
              <ListMusic className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{playlists.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              content playlists
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Schedules
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{schedules.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              scheduling rules
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Body: Screen Status + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Screen Status Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Screen Status</CardTitle>
              <Link
                href="/screens"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {screens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No screens registered yet.{" "}
                <Link href="/screens/new" className="underline hover:text-foreground">
                  Register one
                </Link>
              </p>
            ) : (
              <div className="divide-y divide-border">
                {screensWithConnectivity.slice(0, 10).map(({ screen, connectivity }) => (
                  <Link
                    key={screen._id.toString()}
                    href={`/screens/${screen._id.toString()}`}
                    className="flex items-center justify-between py-3 hover:bg-accent/50 -mx-4 px-4 rounded transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusColor[connectivity.state] ?? "bg-gray-400"}`}
                      />
                      <span className="text-sm font-medium">{screen.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs capitalize">
                        {connectivity.substate ? `${connectivity.state} (${connectivity.substate})` : connectivity.state}
                      </Badge>
                      <span className="text-xs text-muted-foreground w-28 text-right">
                        {screen.lastSeenAt
                          ? formatDistanceToNow(new Date(screen.lastSeenAt), {
                              addSuffix: true,
                            })
                          : "Never seen"}
                      </span>
                    </div>
                  </Link>
                ))}
                {screens.length > 10 && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    and {screens.length - 10} more…
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/content/upload"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              Upload Content
            </Link>
            <Link
              href="/playlists"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              New Playlist
            </Link>
            <Link
              href="/screens/new"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Monitor className="h-4 w-4 text-muted-foreground" />
              Register Screen
            </Link>
            <Link
              href="/schedules"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Manage Schedules
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
