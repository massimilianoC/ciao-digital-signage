"use client";

import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface GroupSummary {
  _id: string;
  name: string;
  screenIds: string[];
}

interface ScreenSummary {
  _id: string;
  name: string;
  groupId?: string;
}

interface GroupManagerProps {
  initialGroups: GroupSummary[];
  availableScreens: ScreenSummary[];
}

export function GroupManager({ initialGroups, availableScreens }: GroupManagerProps) {
  const [groups, setGroups] = useState<GroupSummary[]>(initialGroups);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null);
  const [groupName, setGroupName] = useState("");
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{ screenId: string; fromGroupName: string } | null>(null);

  const availableScreenMap = useMemo(() => {
    const map = new Map<string, ScreenSummary>();
    for (const screen of availableScreens) {
      map.set(screen._id, screen);
    }
    return map;
  }, [availableScreens]);

  const openCreate = () => {
    setEditingGroup(null);
    setGroupName("");
    setSelectedScreenIds([]);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (group: GroupSummary) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setSelectedScreenIds(group.screenIds);
    setError(null);
    setDialogOpen(true);
  };

  const toggleScreen = (screenId: string) => {
    if (selectedScreenIds.includes(screenId)) {
      setSelectedScreenIds((prev) => prev.filter((id) => id !== screenId));
      return;
    }
    const screen = availableScreenMap.get(screenId);
    if (screen?.groupId && screen.groupId !== editingGroup?._id) {
      const fromGroup = groups.find((g) => g._id === screen.groupId);
      setMoveConfirm({ screenId, fromGroupName: fromGroup?.name ?? "another group" });
      return;
    }
    setSelectedScreenIds((prev) => [...prev, screenId]);
  };

  const confirmMove = () => {
    if (moveConfirm) {
      setSelectedScreenIds((prev) => [...prev, moveConfirm.screenId]);
      setMoveConfirm(null);
    }
  };

  const saveGroup = async () => {
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingGroup) {
        const response = await fetch(`/api/groups/${editingGroup._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: groupName.trim(), screenIds: selectedScreenIds }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Failed to update group");
        }

        setGroups((prev) =>
          prev.map((group) =>
            group._id === editingGroup._id
              ? {
                  ...group,
                  name: groupName.trim(),
                  screenIds: selectedScreenIds,
                }
              : {
                  ...group,
                  screenIds: group.screenIds.filter((id) => !selectedScreenIds.includes(id)),
                },
          ),
        );
      } else {
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: groupName.trim(), screenIds: selectedScreenIds }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Failed to create group");
        }

        const payload = (await response.json()) as { _id: string; name: string; screenIds?: string[] };
        setGroups((prev) => [
          ...prev.map((group) => ({
            ...group,
            screenIds: group.screenIds.filter((id) => !selectedScreenIds.includes(id)),
          })),
          {
            _id: payload._id,
            name: payload.name,
            screenIds: payload.screenIds ?? selectedScreenIds,
          },
        ]);
      }

      setDialogOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save group");
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    const shouldDelete = window.confirm("Delete this group? Assigned screens will remain available.");
    if (!shouldDelete) {
      return;
    }

    const response = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Failed to delete group");
      return;
    }

    setGroups((prev) => prev.filter((group) => group._id !== groupId));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Screen Groups</h2>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="pl-7 text-sm text-muted-foreground">
          No groups yet. Create one to manage schedules at group level.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const memberScreens = group.screenIds
              .map((screenId) => availableScreenMap.get(screenId))
              .filter((screen): screen is ScreenSummary => Boolean(screen));

            return (
              <Card key={group._id}>
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{group.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {memberScreens.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No screens assigned</span>
                      ) : (
                        memberScreens.map((screen) => (
                          <Badge key={screen._id} variant="outline" className="text-xs">
                            {screen.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(group)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteGroup(group._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(moveConfirm)} onOpenChange={(open) => { if (!open) setMoveConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move Screen</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            This screen is already in{" "}
            <span className="font-medium text-foreground">{moveConfirm?.fromGroupName}</span>.
            Do you want to move it to this group?
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmMove}>
              Move Screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "New Group"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="e.g. Ground Floor"
                autoFocus
              />
            </div>

            {availableScreens.length > 0 ? (
              <div className="space-y-2">
                <Label>Assign Screens</Label>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {availableScreens.map((screen) => (
                    <label
                      key={screen._id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScreenIds.includes(screen._id)}
                        onChange={() => toggleScreen(screen._id)}
                      />
                      <span className="text-sm">{screen.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveGroup} disabled={saving}>
              {saving ? "Saving..." : "Save Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
