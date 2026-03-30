"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScreenAccessPanelProps {
  screenId: string;
  screenName: string;
  screenToken: string;
}

export function ScreenAccessPanel({ screenId, screenName, screenToken }: ScreenAccessPanelProps) {
  const [copied, setCopied] = useState<"player" | "activate" | null>(null);
  const playerUrl = `/player/${screenId}?token=${encodeURIComponent(screenToken)}`;
  const activationUrl = `/activate`;

  const copyValue = async (value: string, kind: "player" | "activate") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Player access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quick start and recovery links for {screenName}. Use the player URL for a paired device or the
          activation page to open a new browser session for onboarding.
        </p>

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct player URL</p>
          <p className="break-all font-mono text-xs">{playerUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyValue(playerUrl, "player")}>
              {copied === "player" ? "Copied" : "Copy Player Link"}
            </Button>
            <a href={playerUrl} target="_blank" rel="noreferrer">
              <Button size="sm">Open Player</Button>
            </a>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activation page</p>
          <p className="break-all font-mono text-xs">{activationUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyValue(activationUrl, "activate")}>
              {copied === "activate" ? "Copied" : "Copy Activation Link"}
            </Button>
            <a href={activationUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">Open Activation</Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}