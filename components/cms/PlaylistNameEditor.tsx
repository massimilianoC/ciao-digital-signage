"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PlaylistNameEditorProps {
  playlistId: string;
  initialName: string;
}

export function PlaylistNameEditor({ playlistId, initialName }: PlaylistNameEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const nextName = draft.trim();
    if (!nextName || nextName === name || saving) {
      setEditing(false);
      setDraft(name);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      if (!response.ok) {
        throw new Error("Unable to rename playlist");
      }

      setName(nextName);
      setDraft(nextName);
      setEditing(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to rename playlist");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Playlist name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
              if (event.key === "Escape") {
                setDraft(name);
                setEditing(false);
                setError(null);
              }
            }}
            className="h-10 min-w-[240px] text-lg font-semibold"
            disabled={saving}
          />
          <Button size="sm" onClick={() => void submit()} disabled={saving || !draft.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(name);
              setEditing(false);
              setError(null);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{name}</h1>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} aria-label="Rename playlist">
          <PencilLine className="h-4 w-4" />
          Rename
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}