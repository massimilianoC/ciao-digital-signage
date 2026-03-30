import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SchedulesExplorer } from "@/components/cms/schedule-editor/SchedulesExplorer";
import { getSessionAndOrg } from "@/lib/api-utils";
import { GroupService } from "@/lib/services/group.service";
import { ScreenService } from "@/lib/services/screen.service";

type GroupItem = {
  _id: string;
  name: string;
  screenCount: number;
};

type ScreenItem = {
  _id: string;
  name: string;
  location?: string;
};

export default async function SchedulesPage() {
  const authed = await getSessionAndOrg(await headers());
  if (!authed) redirect("/login");
  const { orgId } = authed;

  let groups: GroupItem[] = [];
  let screens: ScreenItem[] = [];

  try {
    const [groupDocs, screenDocs] = await Promise.all([
      new GroupService(orgId).list(),
      new ScreenService(orgId).list(),
    ]);

    const screenCountByGroup = new Map<string, number>();
    for (const screen of screenDocs) {
      const groupId = screen.groupId?.toString();
      if (!groupId) {
        continue;
      }
      screenCountByGroup.set(groupId, (screenCountByGroup.get(groupId) ?? 0) + 1);
    }

    groups = groupDocs.map((group) => ({
      _id: group._id.toString(),
      name: group.name,
      screenCount: screenCountByGroup.get(group._id.toString()) ?? 0,
    }));

    screens = screenDocs.map((screen) => ({
      _id: screen._id.toString(),
      name: screen.name,
      location: screen.location,
    }));
  } catch {
    groups = [];
    screens = [];
  }

  return (
    <main className="p-6 space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestisci e modifica i contenuti di pianificazione per globale, gruppi e singoli schermi.
        </p>
      </section>

      <SchedulesExplorer groups={groups} screens={screens} />
    </main>
  );
}
