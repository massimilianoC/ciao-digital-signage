"use client";

import { AlertTriangle, X } from "lucide-react";

import type { LayoutImpactData } from "./types";

interface PropagationWarningModalProps {
  mode: "save" | "delete";
  impact: LayoutImpactData | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PropagationWarningModal({
  mode,
  impact,
  onConfirm,
  onCancel,
}: PropagationWarningModalProps) {
  const screenCount = impact?.counts.screen ?? 0;
  const scheduleCount = impact?.counts.schedule ?? 0;
  const nestedLayoutCount = impact?.counts.layout ?? 0;
  const title = mode === "delete" ? "Eliminazione con impatto runtime" : "Salvataggio con propagazione runtime";
  const confirmLabel = mode === "delete" ? "Elimina e aggiorna i player" : "Salva e aggiorna i player";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          width: "min(420px, 92vw)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <AlertTriangle size={20} style={{ color: "hsl(var(--warning, 38 92% 50%))", marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
              {title}
            </div>
            <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", margin: 0 }}>
              Questo layout coinvolge <strong>{screenCount} {screenCount === 1 ? "monitor attivo" : "monitor attivi"}</strong>,{" "}
              <strong>{scheduleCount} {scheduleCount === 1 ? "schedule attiva" : "schedule attive"}</strong> e{" "}
              <strong>{nestedLayoutCount} {nestedLayoutCount === 1 ? "layout annidato" : "layout annidati"}</strong>.
              {mode === "delete"
                ? " La rimozione aggiornera immediatamente i player e pulira i riferimenti diretti al layout eliminato."
                : " Il salvataggio forzera il refresh dei player che stanno mostrando il layout interessato."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid hsl(var(--border))",
              background: "none",
              fontSize: 13,
              cursor: "pointer",
              color: "hsl(var(--foreground))",
            }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
