import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DeleteScreenButton } from "@/components/cms/DeleteScreenButton";
import { ScreenRuntimePreview } from "@/components/cms/ScreenRuntimePreview";
import { ScreenAccessPanel } from "@/components/cms/ScreenAccessPanel";
import { ScreenMetaForm } from "@/components/cms/ScreenMetaForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { ScreenService } from "@/lib/services/screen.service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ScreenDetailPage({ params }: PageProps) {
  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");
  const { orgId } = authed;

  const { id } = await params;

  await connectDB();
  const service = new ScreenService(orgId);
  const screen = await service.getById(id);

  if (!screen) {
    redirect("/screens");
  }

  const connectivity = deriveScreenConnectivity(screen);
  const isOnline = connectivity.state === "online";
  const statusLabel = `${connectivity.state.toUpperCase()}${connectivity.substate ? ` (${connectivity.substate.toUpperCase()})` : ""}`;
  const playerPreviewUrl = `/player/${id}?token=${encodeURIComponent(screen.screenToken)}&preview=1`;

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{screen.name}</h1>
        <Badge variant={isOnline ? "default" : "secondary"} className={isOnline ? "bg-green-600 text-white" : undefined}>
          {statusLabel}
        </Badge>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <ScreenRuntimePreview
            screenId={id}
            title={`Player preview for ${screen.name}`}
            previewUrl={playerPreviewUrl}
          />
          <a href={playerPreviewUrl} target="_blank" rel="noreferrer">
            <Button variant="outline">Open Player</Button>
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <details className="group" open={false}>
            <summary className="cursor-pointer list-none px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold">Telemetry Prototype</span>
                <span className="text-xs text-muted-foreground group-open:hidden">Closed</span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">Open</span>
              </div>
            </summary>

            <div className="grid gap-3 border-t border-border px-6 pb-6 pt-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Bandwidth</p>
                <p className="text-lg font-semibold">N/A</p>
                <p className="text-xs text-muted-foreground">Prototype mode</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Clock Sync</p>
                <p className="text-lg font-semibold">N/A</p>
                <p className="text-xs text-muted-foreground">Awaiting telemetry feed</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Health Snapshot</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full w-1/3 bg-amber-500" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Prototype indicator only, real diagnostics pending SR-04 backend stream.</p>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <ScreenMetaForm
            screenId={id}
            screen={{
              name: screen.name,
              location: screen.location,
              timezone: screen.timezone,
              disconnectPolicy: screen.disconnectPolicy,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Edit this screen specific timeline and priority rules.</p>
          <Link href={`/schedules/screen/${id}`}>
            <Button variant="outline">Open Screen Timeline</Button>
          </Link>
        </CardContent>
      </Card>

      <ScreenAccessPanel screenId={id} screenName={screen.name} screenToken={screen.screenToken} />

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete this screen and remove all its schedule assignments.
          </p>
          <DeleteScreenButton screenId={id} screenName={screen.name} />
        </CardContent>
      </Card>
    </div>
  );
}
