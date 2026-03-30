"use client";

import type { LayoutImpactData } from "./types";

interface LayoutImpactPanelProps {
  isNew: boolean;
  impact: LayoutImpactData | null;
  loading: boolean;
  error: string | null;
}

const LAYER_LABEL: Record<NonNullable<LayoutImpactData["screens"][number]["effectiveLayer"]>, string> = {
  global: "Globale",
  group: "Gruppo",
  screen: "Monitor",
  force_override: "Override",
  no_content: "Vuoto",
};

const STATUS_LABEL: Record<LayoutImpactData["screens"][number]["status"], string> = {
  online: "online",
  offline: "offline",
  pending: "pending",
};

function scopeLabel(scope: LayoutImpactData["schedules"][number]["scope"]): string {
  if (scope === "org") return "Globale";
  if (scope === "group") return "Gruppo";
  return "Monitor";
}

export function LayoutImpactPanel({ isNew, impact, loading, error }: LayoutImpactPanelProps) {
  return (
    <section className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Utilizzo e impatto runtime</h2>
          <p className="text-xs text-muted-foreground">
            Mostra dove questo layout viene riutilizzato e quali player visualizzano ora un layout che dipende da questa bozza.
          </p>
        </div>
        {impact ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-background px-3 py-1">Layout annidati: {impact.counts.layout}</span>
            <span className="rounded-full border border-border bg-background px-3 py-1">Schedule attive: {impact.counts.schedule}</span>
            <span className="rounded-full border border-border bg-background px-3 py-1">Monitor in play: {impact.counts.screen}</span>
          </div>
        ) : null}
      </div>

      {isNew ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          Salva il layout almeno una volta per vedere utilizzo, monitor attivi e conferme di propagazione.
        </p>
      ) : null}

      {!isNew && loading ? <p className="mt-4 text-sm text-muted-foreground">Analisi impatto in corso...</p> : null}
      {!isNew && error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {!isNew && !loading && !error && impact ? (
        <div className="mt-4 space-y-3">
          <details className="rounded-2xl border border-border bg-background" open>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
              Layout annidati ({impact.nestedLayouts.length})
            </summary>
            <div className="border-t border-border px-4 py-3">
              {impact.nestedLayouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun altro layout usa questo layout come zona annidata.</p>
              ) : (
                <div className="space-y-2">
                  {impact.nestedLayouts.map((layout) => (
                    <div key={layout.id} className="rounded-2xl border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{layout.name}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {layout.direct ? "Diretto" : "Indiretto"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Aggiornato: {new Date(layout.updatedAt).toLocaleString()}</p>
                        <a href={layout.href} className="text-xs font-medium text-primary hover:underline">
                          Apri layout
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className="rounded-2xl border border-border bg-background" open>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
              Schedule attive ({impact.schedules.length})
            </summary>
            <div className="border-t border-border px-4 py-3">
              {impact.schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna schedule attiva punta a questo layout o a un layout che lo incorpora.</p>
              ) : (
                <div className="space-y-2">
                  {impact.schedules.map((schedule) => (
                    <div key={schedule.id} className="rounded-2xl border border-border bg-card px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{schedule.name}</p>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full border border-border px-2 py-0.5">{scopeLabel(schedule.scope)}</span>
                          <span className="rounded-full border border-border px-2 py-0.5">{schedule.direct ? "Layout diretto" : `Via ${schedule.layoutName}`}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Aggiornata: {new Date(schedule.updatedAt).toLocaleString()}</p>
                        <a href={schedule.href} className="text-xs font-medium text-primary hover:underline">
                          Apri schedule
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className="rounded-2xl border border-border bg-background" open>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
              Monitor che stanno mostrando il layout ({impact.screens.length})
            </summary>
            <div className="border-t border-border px-4 py-3">
              {impact.screens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun player sta visualizzando ora questo layout o un layout che lo include.</p>
              ) : (
                <div className="grid gap-2 lg:grid-cols-2">
                  {impact.screens.map((screen) => (
                    <div key={screen.id} className="rounded-2xl border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{screen.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {screen.location?.trim() || "Posizione non impostata"}
                            {screen.groupName ? ` · Gruppo ${screen.groupName}` : ""}
                          </p>
                        </div>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {STATUS_LABEL[screen.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border px-2 py-0.5">Layer {LAYER_LABEL[screen.effectiveLayer]}</span>
                        {screen.sourceLayoutName ? (
                          <span className="rounded-full border border-border px-2 py-0.5">Layout {screen.sourceLayoutName}</span>
                        ) : null}
                        {screen.sourceScheduleName ? (
                          <span className="rounded-full border border-border px-2 py-0.5">Regola {screen.sourceScheduleName}</span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Ultimo heartbeat: {screen.lastSeenAt ? new Date(screen.lastSeenAt).toLocaleString() : "n.d."}
                        </p>
                        <a href={screen.href} className="text-xs font-medium text-primary hover:underline">
                          Apri monitor
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}