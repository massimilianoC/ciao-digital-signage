"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SourceType = "ics-url" | "ics-upload" | "google-private";

type CalendarSource = {
  id: string;
  name: string;
  type: SourceType;
  status: "active" | "disabled";
  timezone: string;
  refreshSeconds: number;
  icsUrl?: string;
  assetContentId?: string;
  lastValidatedAt?: string;
  lastError?: string;
};

export function GoogleCalendarSourcesManager() {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<SourceType>("ics-url");
  const [icsUrl, setIcsUrl] = useState("");
  const [assetContentId, setAssetContentId] = useState("");
  const [timezone, setTimezone] = useState("Europe/Rome");
  const [refreshSeconds, setRefreshSeconds] = useState(300);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/webapps/google-calendar/sources", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Impossibile caricare le sorgenti");
      }

      const payload = (await response.json()) as { sources?: CalendarSource[] };
      setSources(payload.sources ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile caricare le sorgenti");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/webapps/google-calendar/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          timezone,
          refreshSeconds,
          icsUrl: type === "ics-url" ? icsUrl : undefined,
          assetContentId: type === "ics-upload" ? assetContentId : undefined,
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
        throw new Error("Creazione sorgente fallita");
      }

      setName("");
      setIcsUrl("");
      setAssetContentId("");
      setMessage("Sorgente creata correttamente");
      await loadSources();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Creazione sorgente fallita");
    } finally {
      setCreating(false);
    }
  };

  const handleValidate = async (sourceId: string) => {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/webapps/google-calendar/sources/${sourceId}/validate`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as { valid?: boolean; error?: string; eventCount?: number } | null;
      if (!response.ok || !payload?.valid) {
        throw new Error(payload?.error ?? "Validazione fallita");
      }

      setMessage(`Validazione completata: ${payload.eventCount ?? 0} eventi trovati`);
      await loadSources();
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : "Validazione fallita");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Nuova sorgente calendario</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="source-name">Nome sorgente</Label>
            <Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Calendario eventi HQ" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-type">Tipo</Label>
            <select
              id="source-type"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as SourceType)}
            >
              <option value="ics-url">ICS URL</option>
              <option value="ics-upload">ICS Upload Asset</option>
              <option value="google-private">Google Private (OAuth)</option>
            </select>
          </div>
        </div>

        {type === "ics-url" ? (
          <div className="mt-4 space-y-1">
            <Label htmlFor="ics-url">ICS URL</Label>
            <Input id="ics-url" value={icsUrl} onChange={(event) => setIcsUrl(event.target.value)} placeholder="https://.../calendar.ics" />
          </div>
        ) : null}

        {type === "ics-upload" ? (
          <div className="mt-4 space-y-1">
            <Label htmlFor="asset-id">Asset content ID</Label>
            <Input id="asset-id" value={assetContentId} onChange={(event) => setAssetContentId(event.target.value)} placeholder="Mongo content id del file ICS" />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="refresh-seconds">Refresh (sec)</Label>
            <Input id="refresh-seconds" type="number" min={60} max={3600} value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value) || 300)} />
          </div>
        </div>

        <div className="mt-4">
          <Button type="button" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? "Creazione..." : "Crea sorgente"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Sorgenti disponibili</h2>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">Caricamento...</p> : null}

        {!loading && sources.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nessuna sorgente configurata.</p>
        ) : null}

        {!loading && sources.length > 0 ? (
          <div className="mt-4 space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{source.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.type} · {source.status} · refresh {source.refreshSeconds}s
                    </p>
                    {source.lastValidatedAt ? (
                      <p className="text-xs text-muted-foreground">Validato: {new Date(source.lastValidatedAt).toLocaleString("it-IT")}</p>
                    ) : null}
                    {source.lastError ? <p className="text-xs text-destructive">Errore: {source.lastError}</p> : null}
                  </div>
                  <Button type="button" variant="outline" onClick={() => void handleValidate(source.id)}>
                    Valida
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
