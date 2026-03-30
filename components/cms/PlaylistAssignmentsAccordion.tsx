"use client";

import { Badge } from "@/components/ui/badge";

interface PlaylistAssignment {
  id?: string;
  scope: "org" | "group" | "screen";
  scopeId: string;
  name: string;
}

interface PlaylistPlayer {
  id: string;
  name: string;
  status: "online" | "offline" | "pending";
  lastSeenAt?: string | null;
}

interface PlaylistAssignmentsAccordionProps {
  assignments: PlaylistAssignment[];
  players: PlaylistPlayer[];
}

const scopeLabel: Record<PlaylistAssignment["scope"], string> = {
  org: "Global",
  group: "Group",
  screen: "Screen",
};

export function PlaylistAssignmentsAccordion({ assignments, players }: PlaylistAssignmentsAccordionProps) {
  const onlinePlayers = players.filter((player) => player.status === "online");

  return (
    <details className="rounded-lg border border-border bg-card p-4" open>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Where this playlist is playing</p>
            <p className="text-xs text-muted-foreground">Assignments and currently active players</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Assignments: {assignments.length}</Badge>
            <Badge variant="outline">Players online: {onlinePlayers.length}</Badge>
          </div>
        </div>
      </summary>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active assignments</p>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active schedule/default assignment found for this playlist.</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div key={assignment.id ?? `${assignment.scope}-${assignment.scopeId}-${assignment.name}`} className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{assignment.name}</p>
                    <Badge variant="secondary">{scopeLabel[assignment.scope]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</p>
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">No related players found.</p>
          ) : (
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <Badge variant={player.status === "online" ? "default" : "secondary"}>
                      {player.status}
                    </Badge>
                  </div>
                  {player.lastSeenAt ? (
                    <p className="text-xs text-muted-foreground">Last seen: {new Date(player.lastSeenAt).toLocaleString()}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}