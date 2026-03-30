"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "public-ics" | "api-key";

type CalendarSource = {
  id: string;
  name: string;
  type: "ics-url" | "ics-upload" | "google-private";
  status: "active" | "disabled";
};

export function GoogleCalendarConnectorForm() {
  const [mode, setMode] = useState<Mode>("public-ics");
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [name, setName] = useState("Google Calendar Connector");
  const [title, setTitle] = useState("Google Calendar");
  const [publicIcsUrl, setPublicIcsUrl] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [timezone, setTimezone] = useState("Europe/Rome");
  const [refreshSeconds, setRefreshSeconds] = useState(300);
  const [maxItems, setMaxItems] = useState(10);
  const [defaultDurationSeconds, setDefaultDurationSeconds] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ instanceId: string; contentId: string | null; contentUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSources = async () => {
      try {
        const response = await fetch("/api/webapps/google-calendar/sources", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { sources?: CalendarSource[] };
        if (!cancelled) {
          setSources((payload.sources ?? []).filter((source) => source.status === "active"));
        }
      } catch {
        // Keep form usable in manual mode even if source catalog is unavailable.
      }
    };

    void loadSources();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/webapps/google-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          title,
          mode,
          sourceId: selectedSourceId || undefined,
          publicIcsUrl: mode === "public-ics" ? publicIcsUrl : undefined,
          calendarId: mode === "api-key" ? calendarId : undefined,
          apiKey: mode === "api-key" ? apiKey : undefined,
          timezone,
          refreshSeconds,
          maxItems,
          defaultDurationMs: defaultDurationSeconds * 1000,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string | { fieldErrors?: Record<string, string[]> } } | null;
        if (typeof body?.error === "string") {
          throw new Error(body.error);
        }
        if (body?.error && typeof body.error === "object" && body.error.fieldErrors) {
          throw new Error(Object.values(body.error.fieldErrors).flat().join(" "));
        }
        throw new Error("Unable to create connector");
      }

      const result = (await response.json()) as { instanceId: string; contentId: string | null; contentUrl: string };
      setSuccess(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create connector");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Google Calendar Connector</h2>
        <p className="text-sm text-muted-foreground">
          Crea un contenuto web interattivo assegnabile a playlist o scheduling standard.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="connector-name">Nome contenuto</Label>
          <Input id="connector-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="connector-title">Titolo UI</Label>
          <Input id="connector-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catalog-source">Sorgente calendario (tenant)</Label>
        <select
          id="catalog-source"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedSourceId}
          onChange={(event) => setSelectedSourceId(event.target.value)}
        >
          <option value="">Manuale (configurazione diretta)</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name} - {source.type}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Le sorgenti catalogo sono isolate per organizzazione e non appaiono nella content library generale.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Modalità sorgente</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={mode === "public-ics" ? "default" : "outline"} onClick={() => setMode("public-ics")} disabled={Boolean(selectedSourceId)}>
            Public ICS path
          </Button>
          <Button type="button" variant={mode === "api-key" ? "default" : "outline"} onClick={() => setMode("api-key")} disabled={Boolean(selectedSourceId)}>
            Google API key
          </Button>
        </div>
      </div>

      {!selectedSourceId && mode === "public-ics" ? (
        <div className="space-y-1">
          <Label htmlFor="public-ics-url">Public ICS URL</Label>
          <Input
            id="public-ics-url"
            placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
            value={publicIcsUrl}
            onChange={(event) => setPublicIcsUrl(event.target.value)}
          />
        </div>
      ) : null}

      {!selectedSourceId && mode === "api-key" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="calendar-id">Google Calendar ID</Label>
            <Input id="calendar-id" placeholder="example@group.calendar.google.com" value={calendarId} onChange={(event) => setCalendarId(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="api-key">Google API key</Label>
            <Input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="refresh-seconds">Refresh (sec)</Label>
          <Input id="refresh-seconds" type="number" min={60} max={3600} value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value) || 300)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="max-items">Max eventi</Label>
          <Input id="max-items" type="number" min={1} max={50} value={maxItems} onChange={(event) => setMaxItems(Number(event.target.value) || 10)} />
        </div>
      </div>

      <div className="space-y-1 max-w-56">
        <Label htmlFor="duration">Durata asset (sec)</Label>
        <Input id="duration" type="number" min={5} max={3600} value={defaultDurationSeconds} onChange={(event) => setDefaultDurationSeconds(Number(event.target.value) || 60)} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {success ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-medium text-emerald-50">Connector creato correttamente.</p>
          <p className="mt-1 text-emerald-100">Content ID: {success.contentId ?? "n/a"}</p>
          <p className="mt-1 break-all text-emerald-100">URL player: {success.contentUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/content">
              <Button type="button" variant="outline">Vai alla libreria</Button>
            </Link>
            <Link href={success.contentId ? `/content?media=${success.contentId}` : "/content"}>
              <Button type="button">Apri contenuto creato</Button>
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? "Creazione..." : "Crea connector"}
        </Button>
        <Link href="/content">
          <Button type="button" variant="outline">Annulla</Button>
        </Link>
      </div>
    </div>
  );
}