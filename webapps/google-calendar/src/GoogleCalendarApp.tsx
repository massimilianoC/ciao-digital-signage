"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, MapPin, RefreshCw, TriangleAlert } from "lucide-react";

type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
};

type Payload = {
  title: string;
  refreshSeconds: number;
  timezone: string;
  events: GoogleCalendarEvent[];
  lastSyncAt: string;
};

function formatEventDate(value: string, timezone: string, includeTime: boolean) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function GoogleCalendarApp({ instanceId, token }: { instanceId: string; token: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const load = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
        }
        const response = await fetch(`/api/public/webapps/google-calendar/${instanceId}/events?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Unable to load calendar events");
        }

        const data = (await response.json()) as Payload;
        if (cancelled) {
          return;
        }

        setPayload(data);
        setError(null);
        timer = window.setTimeout(load, Math.max(data.refreshSeconds, 60) * 1000);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load calendar events");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [instanceId, token]);

  return (
    <main
      data-testid="google-calendar-app"
      className="min-h-screen bg-[radial-gradient(circle_at_top,_#17314b,_#071018_60%)] px-6 py-8 text-white"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-200">
              <CalendarDays className="h-5 w-5" />
              <span className="text-sm uppercase tracking-[0.18em]">Google Calendar</span>
            </div>
            <h1 className="text-3xl font-semibold">{payload?.title ?? "Calendar Connector"}</h1>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Sync in corso" : "Sincronizzato"}</span>
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {payload?.lastSyncAt ? `Aggiornato ${new Date(payload.lastSyncAt).toLocaleTimeString("it-IT")}` : "In attesa dati"}
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-3xl border border-red-400/30 bg-red-500/10 px-6 py-10 text-center">
            <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-red-200" />
            <h2 className="text-xl font-semibold">Connessione calendario non disponibile</h2>
            <p className="mt-2 text-sm text-red-100">{error}</p>
          </section>
        ) : null}

        {!error && payload && payload.events.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-slate-200">
            <h2 className="text-xl font-semibold">Nessun evento imminente</h2>
            <p className="mt-2 text-sm">Il calendario è configurato correttamente ma non ci sono eventi nel range corrente.</p>
          </section>
        ) : null}

        {!error && payload?.events?.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            {payload.events.map((event) => (
              <article
                key={event.id}
                data-testid="google-calendar-event"
                className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
                  {formatEventDate(event.start, payload.timezone, !event.isAllDay)}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{event.title}</h2>

                <div className="mt-4 space-y-2 text-sm text-slate-200">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-cyan-200" />
                    <span>
                      {event.isAllDay
                        ? "Tutto il giorno"
                        : `${formatEventDate(event.start, payload.timezone, true)}${event.end ? ` - ${formatEventDate(event.end, payload.timezone, true)}` : ""}`}
                    </span>
                  </div>
                  {event.location ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-cyan-200" />
                      <span>{event.location}</span>
                    </div>
                  ) : null}
                </div>

                {event.description ? <p className="mt-4 line-clamp-4 text-sm text-slate-300">{event.description}</p> : null}
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}