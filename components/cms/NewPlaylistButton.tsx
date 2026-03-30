"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function NewPlaylistButton() {
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const createPlaylist = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `New Playlist ${new Date().toLocaleTimeString()}` }),
      });

      if (!response.ok) {
        return;
      }

      const playlist = (await response.json()) as { _id?: string };
      if (playlist._id) {
        router.push(`/playlists/${playlist._id}`);
      } else {
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Button onClick={createPlaylist} disabled={creating}>
      {creating ? "Creating..." : "New Playlist"}
    </Button>
  );
}
