"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Globe, LayoutGrid, List, Monitor, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

interface SchedulesExplorerProps {
  groups: GroupItem[];
  screens: ScreenItem[];
}

type Tab = "all" | "global" | "group" | "screen";
type ViewMode = "grid" | "list";

export function SchedulesExplorer({ groups, screens }: SchedulesExplorerProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(
    () => groups.filter((group) => group.name.toLowerCase().includes(normalizedQuery)),
    [groups, normalizedQuery],
  );

  const filteredScreens = useMemo(
    () =>
      screens.filter((screen) =>
        `${screen.name} ${screen.location ?? ""}`.toLowerCase().includes(normalizedQuery),
      ),
    [screens, normalizedQuery],
  );

  const sectionClass =
    viewMode === "grid"
      ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      : "space-y-2";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter groups and screens..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />

        <div className="ml-auto flex items-center gap-1">
          <Button variant={viewMode === "grid" ? "default" : "outline"} size="sm" onClick={() => setViewMode("grid")}>
            <LayoutGrid className="h-4 w-4" />
            Grid
          </Button>
          <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
            <List className="h-4 w-4" />
            List
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")}>All</Button>
        <Button variant={tab === "global" ? "default" : "outline"} size="sm" onClick={() => setTab("global")}>Global</Button>
        <Button variant={tab === "group" ? "default" : "outline"} size="sm" onClick={() => setTab("group")}>Groups</Button>
        <Button variant={tab === "screen" ? "default" : "outline"} size="sm" onClick={() => setTab("screen")}>Screens</Button>
      </div>

      {(tab === "all" || tab === "global") && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-semibold">Global Schedule</h2>
            </div>
            <Link
              href="/schedules/global/org"
              className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              Edit Timeline <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <p className="p-4 text-sm text-muted-foreground">Default organization-wide schedule layer.</p>
        </section>
      )}

      {(tab === "all" || tab === "group") && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-green-500" />
            <h2 className="text-base font-semibold">Group Schedules</h2>
          </div>

          {filteredGroups.length === 0 ? (
            <p className="pl-7 text-sm text-muted-foreground">No groups match this filter.</p>
          ) : (
            <div className={sectionClass}>
              {filteredGroups.map((group) => (
                <article key={group._id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.screenCount} screen{group.screenCount === 1 ? "" : "s"}</p>
                    </div>
                    <Link href={`/schedules/group/${group._id}`} className="inline-flex items-center rounded-md px-2 py-1 text-sm hover:bg-accent">
                      Edit <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {(tab === "all" || tab === "screen") && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-purple-500" />
            <h2 className="text-base font-semibold">Screen Schedules</h2>
          </div>

          {filteredScreens.length === 0 ? (
            <p className="pl-7 text-sm text-muted-foreground">No screens match this filter.</p>
          ) : (
            <div className={sectionClass}>
              {filteredScreens.map((screen) => (
                <article key={screen._id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{screen.name}</p>
                      {screen.location ? <p className="text-xs text-muted-foreground">{screen.location}</p> : null}
                    </div>
                    <Link href={`/schedules/screen/${screen._id}`} className="inline-flex items-center rounded-md px-2 py-1 text-sm hover:bg-accent">
                      Edit <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}