"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Maximize2, Save, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ZoneCanvas } from "./ZoneCanvas";
import { ZoneContentPicker } from "./ZoneContentPicker";
import { LayoutImpactPanel } from "./LayoutImpactPanel";
import { PropagationWarningModal } from "./PropagationWarningModal";
import type { CompositeLayoutData, LayoutImpactData, LayoutZone, ZoneContent } from "./types";

type EditorState = "idle" | "dirty" | "saving" | "saved" | "confirming_propagation" | "error";

interface LayoutCompositeEditorProps {
  layoutId?: string;
  initialData?: CompositeLayoutData;
}

export function LayoutCompositeEditor({ layoutId, initialData }: LayoutCompositeEditorProps) {
  const router = useRouter();
  const isNew = !layoutId;

  const [name, setName] = useState(initialData?.name ?? "");
  const [zones, setZones] = useState<LayoutZone[]>(initialData?.zones ?? []);
  const [resolution] = useState(initialData?.resolution ?? { width: 1920, height: 1080 });
  const [backgroundImage, setBackgroundImage] = useState(initialData?.backgroundImage ?? "");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [impact, setImpact] = useState<LayoutImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [showPropagationWarning, setShowPropagationWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [previewDockMode, setPreviewDockMode] = useState<"overlay" | "below">("below");

  const previewStorageKey = `layout-preview-draft:${layoutId ?? "new"}`;
  const previewEmbeddedUrl = useMemo(
    () => `/layouts/preview?draftKey=${encodeURIComponent(previewStorageKey)}&embedded=1`,
    [previewStorageKey],
  );
  const previewKioskUrl = useMemo(
    () => `/layouts/preview?draftKey=${encodeURIComponent(previewStorageKey)}&fullscreen=1&kiosk=1`,
    [previewStorageKey],
  );

  // Mark dirty on any change
  useEffect(() => {
    if (editorState === "saved" || editorState === "idle") {
      // Only mark dirty after the initial mount
    }
  }, [zones, name, editorState]);

  const markDirty = useCallback(() => {
    setEditorState((prev: EditorState) => (prev === "saving" || prev === "confirming_propagation" ? prev : "dirty"));
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      markDirty();
    },
    [markDirty],
  );

  const handleZoneAdd = useCallback(
    (zone: LayoutZone) => {
      setZones((prev: LayoutZone[]) => [...prev, zone]);
      setSelectedZoneId(zone.id);
      markDirty();
    },
    [markDirty],
  );

  const handleZoneMove = useCallback(
    (id: string, x: number, y: number) => {
      setZones((prev: LayoutZone[]) => prev.map((z: LayoutZone) => (z.id === id ? { ...z, x, y } : z)));
      markDirty();
    },
    [markDirty],
  );

  const handleZoneResize = useCallback(
    (id: string, width: number, height: number, x: number, y: number) => {
      setZones((prev: LayoutZone[]) => prev.map((z: LayoutZone) => (z.id === id ? { ...z, width, height, x, y } : z)));
      markDirty();
    },
    [markDirty],
  );

  const handleZoneRemove = useCallback(
    (id: string) => {
      setZones((prev: LayoutZone[]) => prev.filter((z: LayoutZone) => z.id !== id));
      setSelectedZoneId((prev: string | null) => (prev === id ? null : prev));
      markDirty();
    },
    [markDirty],
  );

  const handleZoneLabelChange = useCallback(
    (id: string, label: string) => {
      setZones((prev: LayoutZone[]) => prev.map((z: LayoutZone) => (z.id === id ? { ...z, label } : z)));
      markDirty();
    },
    [markDirty],
  );

  const handleZoneBackgroundImageChange = useCallback(
    (id: string, image: string) => {
      setZones((prev: LayoutZone[]) => prev.map((z: LayoutZone) => (z.id === id ? { ...z, backgroundImage: image || undefined } : z)));
      markDirty();
    },
    [markDirty],
  );

  const handleLayoutBackgroundImageChange = useCallback(
    (value: string) => {
      setBackgroundImage(value);
      markDirty();
    },
    [markDirty],
  );

  const handleZoneStyleChange = useCallback(
    (id: string, patch: Partial<LayoutZone>) => {
      setZones((prev: LayoutZone[]) => prev.map((z: LayoutZone) => (z.id === id ? { ...z, ...patch } : z)));
      markDirty();
    },
    [markDirty],
  );

  const buildPreviewPayload = useCallback(
    () => ({
      name,
      resolution,
      backgroundImage: backgroundImage || undefined,
      zones,
      updatedAt: Date.now(),
    }),
    [backgroundImage, name, resolution, zones],
  );

  const publishPreviewDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(previewStorageKey, JSON.stringify(buildPreviewPayload()));
  }, [buildPreviewPayload, previewStorageKey]);

  const handlePreviewOpen = useCallback(() => {
    publishPreviewDraft();
    router.push(previewKioskUrl);
  }, [previewKioskUrl, publishPreviewDraft, router]);

  const handleDeleteZoneRequest = useCallback((id: string) => {
    setDeleteZoneId(id);
  }, []);

  const handleDeleteZoneConfirm = useCallback(() => {
    if (!deleteZoneId) return;
    setZones((prev: LayoutZone[]) => prev.filter((z: LayoutZone) => z.id !== deleteZoneId));
    setSelectedZoneId((prev: string | null) => (prev === deleteZoneId ? null : prev));
    setDeleteZoneId(null);
    markDirty();
  }, [deleteZoneId, markDirty]);

  const handleDeleteZoneCancel = useCallback(() => {
    setDeleteZoneId(null);
  }, []);

  const handleContentAssign = useCallback(
    (content: ZoneContent) => {
      if (!selectedZoneId) return;
      setZones((prev: LayoutZone[]) =>
        prev.map((z: LayoutZone) => (z.id === selectedZoneId ? { ...z, content } : z)),
      );
      setShowContentPicker(false);
      markDirty();
    },
    [selectedZoneId, markDirty],
  );

  const handleRemoveZoneContent = useCallback(
    (zoneId: string) => {
      setZones((prev: LayoutZone[]) =>
        prev.map((z: LayoutZone) => (z.id === zoneId ? { ...z, content: undefined } : z)),
      );
      markDirty();
    },
    [markDirty],
  );

  const loadImpact = useCallback(async () => {
    if (isNew || !layoutId) {
      setImpact(null);
      setImpactError(null);
      setImpactLoading(false);
      return;
    }

    setImpactLoading(true);
    setImpactError(null);

    try {
      const response = await fetch(`/api/layouts/${layoutId}/impact`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as LayoutImpactData | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Impossibile analizzare l'impatto del layout");
      }
      setImpact(payload as LayoutImpactData);
    } catch (error) {
      setImpact(null);
      setImpactError(error instanceof Error ? error.message : "Impossibile analizzare l'impatto del layout");
    } finally {
      setImpactLoading(false);
    }
  }, [isNew, layoutId]);

  const hasImpact = (impact?.counts.layout ?? 0) > 0 || (impact?.counts.schedule ?? 0) > 0 || (impact?.counts.screen ?? 0) > 0;

  const performSave = useCallback(async () => {
    setEditorState("saving");
    setErrorMessage(null);

    try {
      const payload = { name, resolution, zones, backgroundImage: backgroundImage || undefined };

      let res: Response;
      if (isNew) {
        res = await fetch("/api/layouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/layouts/${layoutId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ? JSON.stringify(json.error) : "Errore durante il salvataggio");
      }

      const saved = (await res.json()) as { _id: string };
      setEditorState("saved");

      if (!isNew) {
        void loadImpact();
      }

      if (isNew) {
        router.replace(`/layouts/${saved._id}`);
      }
    } catch (err) {
      setEditorState("error");
      setErrorMessage(err instanceof Error ? err.message : "Errore sconosciuto");
    }
  }, [backgroundImage, isNew, layoutId, loadImpact, name, resolution, zones, router]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setErrorMessage("Il nome del layout è obbligatorio");
      setEditorState("error");
      return;
    }

    if (!isNew && hasImpact) {
      setPendingAction("save");
      setShowPropagationWarning(true);
      setEditorState("confirming_propagation");
      return;
    }

    await performSave();
  }, [hasImpact, isNew, name, performSave]);

  const handlePropagationConfirm = useCallback(async () => {
    setShowPropagationWarning(false);

    if (pendingAction === "delete") {
      if (!layoutId) return;

      try {
        const res = await fetch(`/api/layouts/${layoutId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Errore durante l'eliminazione");
        router.push("/layouts");
      } catch {
        setErrorMessage("Impossibile eliminare il layout");
        setEditorState("error");
      } finally {
        setPendingAction(null);
      }
      return;
    }

    setPendingAction(null);
    await performSave();
  }, [layoutId, pendingAction, performSave, router]);

  const handlePropagationCancel = useCallback(() => {
    setShowPropagationWarning(false);
    setPendingAction(null);
    if (editorState === "confirming_propagation") {
      setEditorState("dirty");
    }
  }, [editorState]);

  const handleDelete = useCallback(() => {
    if (!layoutId) return;
    setPendingAction("delete");
    setShowPropagationWarning(true);
  }, [layoutId]);

  useEffect(() => {
    void loadImpact();
  }, [loadImpact]);

  useEffect(() => {
    publishPreviewDraft();
  }, [publishPreviewDraft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "g") {
        event.preventDefault();
        setSnapToGrid((prev) => !prev);
      }
      if (key === "[") {
        event.preventDefault();
        setGridSize((prev) => Math.max(1, prev - 1));
      }
      if (key === "]") {
        event.preventDefault();
        setGridSize((prev) => Math.min(50, prev + 1));
      }
      if (key === "p") {
        event.preventDefault();
        handlePreviewOpen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePreviewOpen]);

  const selectedZone = zones.find((z: LayoutZone) => z.id === selectedZoneId) ?? null;

  const saveLabel =
    editorState === "saving"
      ? "Salvataggio..."
      : editorState === "saved"
        ? "Salvato"
        : "Salva";

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Input
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
          placeholder="Nome layout"
          className="h-10 flex-1 rounded-full border-border bg-background px-4 text-sm font-semibold"
        />

        {errorMessage && (
          <span style={{ fontSize: 12, color: "hsl(var(--destructive))" }}>{errorMessage}</span>
        )}

        <span className="text-xs text-muted-foreground">
        {resolution.width}×{resolution.height}
        </span>

        {!isNew && (
          <Button
            type="button"
            onClick={handleDelete}
            variant="outline"
            size="sm"
            className="rounded-full text-destructive"
          >
            <Trash2 size={14} />
            Elimina
          </Button>
        )}

        <Button
          type="button"
          onClick={() => setShowInlinePreview((prev) => !prev)}
          variant={showInlinePreview ? "secondary" : "outline"}
          size="sm"
          className="rounded-full"
        >
          <Eye size={14} />
          {showInlinePreview ? "Preview OFF" : "Preview ON"}
        </Button>

        {showInlinePreview && (
          <Button
            type="button"
            onClick={() => setPreviewDockMode((prev) => (prev === "below" ? "overlay" : "below"))}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            {previewDockMode === "below" ? "Modalita: Sotto" : "Modalita: Overlay"}
          </Button>
        )}

        <Button
          type="button"
          onClick={handlePreviewOpen}
          variant="outline"
          size="sm"
          className="rounded-full shadow-sm"
        >
          <Maximize2 size={14} />
          Full Screen
        </Button>

        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={editorState === "saving" || editorState === "idle" || editorState === "saved"}
          size="sm"
          className="rounded-full px-4"
        >
          {editorState === "saving" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
          {saveLabel}
        </Button>
      </div>

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas area */}
        <div style={{ flex: 1, padding: 16, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 980, display: "grid", gap: 12, gridTemplateColumns: "1fr", alignItems: "start" }}>
            <div style={{ position: "relative" }}>
              <ZoneCanvas
                zones={zones}
                resolution={resolution}
                selectedZoneId={selectedZoneId}
                backgroundImage={backgroundImage || undefined}
                snapToGrid={snapToGrid}
                gridSize={gridSize}
                onZoneAdd={handleZoneAdd}
                onZoneMove={handleZoneMove}
                onZoneResize={handleZoneResize}
                onZoneSelect={setSelectedZoneId}
                onZoneRemove={handleZoneRemove}
              />

              {showInlinePreview && previewDockMode === "overlay" && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: "min(46%, 420px)",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 14,
                    background: "linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.45) 100%)",
                    boxShadow: "0 16px 38px rgba(15,23,42,0.28)",
                    overflow: "hidden",
                    zIndex: 8,
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid hsl(var(--border))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    <span>Preview overlay</span>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-full px-2 text-[11px]" onClick={handlePreviewOpen}>
                      <Maximize2 size={12} />
                      Apri
                    </Button>
                  </div>
                  <iframe
                    title="layout-live-preview-overlay"
                    src={previewEmbeddedUrl}
                    style={{ width: "100%", height: 260, border: "none", display: "block", background: "#020617" }}
                  />
                </div>
              )}
            </div>

            {showInlinePreview && previewDockMode === "below" && (
              <div
                style={{
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 14,
                  background: "linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.45) 100%)",
                  boxShadow: "0 16px 38px rgba(15,23,42,0.18)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid hsl(var(--border))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  <span>Preview sotto il canvas (click per fullscreen)</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 rounded-full px-2 text-[11px]" onClick={handlePreviewOpen}>
                    <Maximize2 size={12} />
                    Apri
                  </Button>
                </div>
                <iframe
                  title="layout-live-preview-below"
                  src={previewEmbeddedUrl}
                  style={{ width: "100%", height: 420, border: "none", display: "block", background: "#020617" }}
                />
              </div>
            )}

            <LayoutImpactPanel
              isNew={isNew}
              impact={impact}
              loading={impactLoading}
              error={impactError}
            />
          </div>
        </div>

        {/* Inspector panel */}
        <div
          style={{
            width: 260,
            borderLeft: "1px solid hsl(var(--border))",
            background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.35) 100%)",
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          <div className="border-b border-border bg-gradient-to-br from-zinc-100/70 to-zinc-300/25 px-4 py-3 dark:from-zinc-800/70 dark:to-zinc-900/40">
            <div className="mb-2 text-xs font-bold tracking-wide text-foreground">Griglia e snapping</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapToGrid(e.target.checked)}
              />
              Snap to grid
            </label>
            <Label className="text-[11px] text-muted-foreground">
              Passo griglia
            </Label>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={gridSize}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGridSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted"
              />
              <Input
                type="number"
                min={1}
                max={50}
                value={gridSize}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGridSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="h-8 w-16 rounded-full border-zinc-400/55 bg-zinc-50/90 px-2 text-xs dark:border-zinc-600 dark:bg-zinc-900/75"
              />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">Shortcut: G toggle snap, [ / ] cambia passo, P apre preview</div>
          </div>

          {selectedZone ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <Settings2 size={14} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Zona selezionata</span>
              </div>

              {/* Zone label / rename */}
              <label style={{ display: "block", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                  Nome zona
                </span>
                <input
                  value={selectedZone.label ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleZoneLabelChange(selectedZone.id, e.target.value)}
                  placeholder="Es. Schermo principale"
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    color: "hsl(var(--foreground))",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {/* Zone background image */}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                  Sfondo zona (URL immagine)
                </span>
                <input
                  value={selectedZone.backgroundImage ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleZoneBackgroundImageChange(selectedZone.id, e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    color: "hsl(var(--foreground))",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                />
                {selectedZone.backgroundImage && (
                  <div
                    style={{
                      marginTop: 4,
                      height: 48,
                      borderRadius: 3,
                      background: `url(${selectedZone.backgroundImage}) center/cover no-repeat hsl(var(--muted))`,
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                )}
              </label>

              <div
                style={{
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 16,
                  padding: 10,
                  marginBottom: 12,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.16)",
                  background: "linear-gradient(160deg, rgba(148,163,184,0.17) 0%, rgba(148,163,184,0.05) 55%, transparent 100%)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Stile sezione</div>

                <label style={{ display: "block", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                    Padding interno (px)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={selectedZone.padding ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleZoneStyleChange(selectedZone.id, { padding: Math.max(0, Number(e.target.value) || 0) })
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                    Border radius (px)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={selectedZone.borderRadius ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleZoneStyleChange(selectedZone.id, { borderRadius: Math.max(0, Number(e.target.value) || 0) })
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                    Border size (px)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={selectedZone.borderSize ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleZoneStyleChange(selectedZone.id, { borderSize: Math.max(0, Number(e.target.value) || 0) })
                    }
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                    Border color
                  </span>
                  <input
                    value={selectedZone.borderColor ?? "#ffffff"}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleZoneStyleChange(selectedZone.id, { borderColor: e.target.value })
                    }
                    placeholder="#ffffff oppure rgba(...)"
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedZone.dropShadow ?? false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleZoneStyleChange(selectedZone.id, { dropShadow: e.target.checked })
                    }
                  />
                  Drop shadow
                </label>
              </div>

              {/* Position info */}
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 12 }}>
                <div>X: {selectedZone.x.toFixed(1)}% Y: {selectedZone.y.toFixed(1)}%</div>
                <div>W: {selectedZone.width.toFixed(1)}% H: {selectedZone.height.toFixed(1)}%</div>
              </div>

              {/* Content */}
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 4 }}>
                  Contenuto
                </span>
                {selectedZone.content ? (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: "hsl(var(--accent))",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 4,
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        [{selectedZone.content.type}] {selectedZone.content.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveZoneContent(selectedZone.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "hsl(var(--muted-foreground))", flexShrink: 0 }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowContentPicker(true)}
                      style={{
                        width: "100%",
                        padding: "5px 0",
                        borderRadius: 4,
                        border: "1px dashed hsl(var(--border))",
                        background: "none",
                        color: "hsl(var(--muted-foreground))",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cambia contenuto
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowContentPicker(true)}
                    style={{
                      width: "100%",
                      padding: "8px 0",
                      borderRadius: 4,
                      border: "1px dashed hsl(var(--border))",
                      background: "none",
                      color: "hsl(var(--muted-foreground))",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    + Assegna contenuto
                  </button>
                )}
              </div>

              {/* Delete zone */}
              <button
                type="button"
                onClick={() => handleDeleteZoneRequest(selectedZone.id)}
                style={{
                  width: "100%",
                  padding: "6px 0",
                  borderRadius: 4,
                  border: "1px solid hsl(var(--destructive))",
                  background: "none",
                  color: "hsl(var(--destructive))",
                  fontSize: 12,
                  cursor: "pointer",
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Trash2 size={12} />
                Elimina zona
              </button>
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 12, textAlign: "center", marginTop: 16, marginBottom: 20 }}>
                Seleziona una zona per modificarla
              </div>

              {/* Layout background image */}
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>
                  Sfondo layout (URL immagine)
                </span>
                <input
                  value={backgroundImage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleLayoutBackgroundImageChange(e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    color: "hsl(var(--foreground))",
                    fontSize: 12,
                    boxSizing: "border-box",
                  }}
                />
                {backgroundImage && (
                  <div
                    style={{
                      marginTop: 4,
                      height: 64,
                      borderRadius: 3,
                      background: `url(${backgroundImage}) center/cover no-repeat hsl(var(--muted))`,
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                )}
              </label>
            </div>
          )}

          {/* Zones list */}
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 6, marginTop: 16 }}>
              Zone ({zones.length})
            </div>
            {zones.map((zone: LayoutZone, idx: number) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedZoneId(zone.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 8px",
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: zone.id === selectedZoneId ? "hsl(var(--primary))" : "rgba(148,163,184,0.3)",
                  background: zone.id === selectedZoneId ? "linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(var(--muted)) 100%)" : "rgba(148,163,184,0.08)",
                  fontSize: 12,
                  cursor: "pointer",
                  marginBottom: 2,
                  color: "hsl(var(--foreground))",
                  boxShadow: zone.id === selectedZoneId ? "0 8px 18px rgba(15,23,42,0.18)" : "none",
                }}
              >
                {zone.label || zone.content?.label || `Zona ${idx + 1}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showContentPicker && (
        <ZoneContentPicker
          currentLayoutId={layoutId}
          onAssign={handleContentAssign}
          onClose={() => setShowContentPicker(false)}
        />
      )}

      {showPropagationWarning && (
        <PropagationWarningModal
          mode={pendingAction === "delete" ? "delete" : "save"}
          impact={impact}
          onConfirm={() => void handlePropagationConfirm()}
          onCancel={handlePropagationCancel}
        />
      )}

      {/* Delete zone confirmation modal */}
      {deleteZoneId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={handleDeleteZoneCancel}
        >
          <div
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              padding: 24,
              width: 320,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Elimina zona</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 20 }}>
              Sei sicuro di voler eliminare questa zona? L&apos;operazione non può essere annullata.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleDeleteZoneCancel}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid hsl(var(--border))",
                  background: "none",
                  color: "hsl(var(--foreground))",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteZoneConfirm}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "hsl(var(--destructive))",
                  color: "hsl(var(--destructive-foreground))",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
