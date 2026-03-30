import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { GroupManager, type GroupSummary } from "@/components/cms/GroupManager";
import { ScreenStatusGrid, type ScreenCardItem } from "@/components/cms/ScreenStatusGrid";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { connectivityToLegacyStatus, deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { GroupService } from "@/lib/services/group.service";
import { ScreenService } from "@/lib/services/screen.service";

export default async function ScreensPage() {
  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");
  const { orgId } = authed;

  let screens: ScreenCardItem[] = [];
  let groups: GroupSummary[] = [];
  let screenToGroup = new Map<string, string>();

  try {
    await connectDB();

    const screenService = new ScreenService(orgId);
    const [screenDocs, groupDocs] = await Promise.all([
      screenService.list(),
      new GroupService(orgId).list(),
    ]);

    screens = screenDocs.map((screen) => {
      const connectivity = deriveScreenConnectivity(screen);
      return {
        _id: screen._id.toString(),
        name: screen.name,
        location: screen.location,
        timezone: screen.timezone,
        status: connectivityToLegacyStatus(connectivity),
        connectivity,
        lastSeen: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : undefined,
        currentContent: screen.currentItemId ?? undefined,
      };
    });

    const screensByGroup = new Map<string, string[]>();
    for (const screen of screenDocs) {
      const groupId = screen.groupId?.toString();
      if (!groupId) {
        continue;
      }
      screensByGroup.set(groupId, [...(screensByGroup.get(groupId) ?? []), screen._id.toString()]);
      screenToGroup.set(screen._id.toString(), groupId);
    }

    groups = groupDocs.map((group) => ({
      _id: group._id.toString(),
      name: group.name,
      screenIds: screensByGroup.get(group._id.toString()) ?? [],
    }));
  } catch {
    screens = [];
    groups = [];
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Screens</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live status, overrides, and group assignment.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Public player activation URL: <span className="font-mono">/activate</span>
          </p>
        </div>
        <Link href="/screens/new">
          <Button>
            <Plus className="h-4 w-4" />
            Register Screen
          </Button>
        </Link>
      </div>

      <ScreenStatusGrid initialScreens={screens} orgId={orgId} />

      <Separator />

      <GroupManager
        initialGroups={groups}
        availableScreens={screens.map((screen) => ({ _id: screen._id, name: screen.name, groupId: screenToGroup.get(screen._id) }))}
      />
    </div>
  );
}
