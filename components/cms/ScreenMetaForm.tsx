"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScreenMetaFormProps = {
  screenId: string;
  screen: {
    name: string;
    location?: string;
    timezone?: string;
    disconnectPolicy?: "keep_cache" | "show_default";
  };
};

export function ScreenMetaForm({ screenId, screen }: ScreenMetaFormProps) {
  const [name, setName] = useState(screen.name);
  const [location, setLocation] = useState(screen.location ?? "");
  const [timezone, setTimezone] = useState(screen.timezone ?? "UTC");
  const [disconnectPolicy, setDisconnectPolicy] = useState<"keep_cache" | "show_default">(
    screen.disconnectPolicy ?? "keep_cache",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/screens/${screenId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim(),
          timezone: timezone.trim(),
          disconnectPolicy,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to save metadata");
      }

      setMessage("Saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="screen-name">Name</Label>
        <Input id="screen-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="screen-location">Location</Label>
        <Input
          id="screen-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="e.g. Reception"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="screen-timezone">Timezone</Label>
        <Input id="screen-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="screen-disconnect-policy">Disconnect policy</Label>
        <select
          id="screen-disconnect-policy"
          value={disconnectPolicy}
          onChange={(event) => setDisconnectPolicy(event.target.value as "keep_cache" | "show_default")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="keep_cache">Keep playing cached content</option>
          <option value="show_default">Show neutral default screen</option>
        </select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
