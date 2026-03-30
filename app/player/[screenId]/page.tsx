"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";

import { PlayerRoot } from "@/components/player/PlayerRoot";

export default function PlayerPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const preview = searchParams.get("preview") === "1";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
        position: "fixed",
        inset: 0,
      }}
      data-testid="player-root"
      data-screen-id={screenId}
    >
      <PlayerRoot screenId={screenId} token={token} previewMode={preview} />
    </div>
  );
}
