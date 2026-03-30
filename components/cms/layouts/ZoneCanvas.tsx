"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import type { LayoutZone, Resolution } from "./types";

const MIN_ZONE_SIZE = 5; // percent

interface ZoneCanvasProps {
  zones: LayoutZone[];
  resolution: Resolution;
  selectedZoneId: string | null;
  backgroundImage?: string;
  snapToGrid: boolean;
  gridSize: number;
  onZoneAdd: (zone: LayoutZone) => void;
  onZoneMove: (id: string, x: number, y: number) => void;
  onZoneResize: (id: string, width: number, height: number, x: number, y: number) => void;
  onZoneSelect: (id: string | null) => void;
  onZoneRemove: (id: string) => void;
}

type InteractionMode =
  | { type: "idle" }
  | { type: "adding"; startX: number; startY: number; currentX: number; currentY: number }
  | { type: "moving"; zoneId: string; startMouseX: number; startMouseY: number; startZoneX: number; startZoneY: number }
  | { type: "resizing"; zoneId: string; handle: ResizeHandle; startMouseX: number; startMouseY: number; startZone: LayoutZone };

type ResizeHandle = "se" | "sw" | "ne" | "nw" | "n" | "s" | "e" | "w";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, step: number, enabled: boolean) {
  if (!enabled || step <= 0) return value;
  return Math.round(value / step) * step;
}

function getResizeCursor(handle: ResizeHandle): string {
  const cursors: Record<ResizeHandle, string> = {
    se: "se-resize", sw: "sw-resize", ne: "ne-resize", nw: "nw-resize",
    n: "n-resize", s: "s-resize", e: "e-resize", w: "w-resize",
  };
  return cursors[handle];
}

export function ZoneCanvas({
  zones,
  resolution,
  selectedZoneId,
  backgroundImage,
  snapToGrid,
  gridSize,
  onZoneAdd,
  onZoneMove,
  onZoneResize,
  onZoneSelect,
  onZoneRemove,
}: ZoneCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<InteractionMode>({ type: "idle" });
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;

  const getCanvasRelativePercent = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      return { x, y };
    },
    [],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== canvasRef.current) return;
      e.preventDefault();
      const { x, y } = getCanvasRelativePercent(e.clientX, e.clientY);
      onZoneSelect(null);
      setInteraction({ type: "adding", startX: x, startY: y, currentX: x, currentY: y });
    },
    [getCanvasRelativePercent, onZoneSelect],
  );

  const handleZoneMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, zone: LayoutZone) => {
      e.stopPropagation();
      e.preventDefault();
      onZoneSelect(zone.id);
      setInteraction({
        type: "moving",
        zoneId: zone.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startZoneX: zone.x,
        startZoneY: zone.y,
      });
    },
    [onZoneSelect],
  );

  const handleResizeHandleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, zone: LayoutZone, handle: ResizeHandle) => {
      e.stopPropagation();
      e.preventDefault();
      setInteraction({
        type: "resizing",
        zoneId: zone.id,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startZone: { ...zone },
      });
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const current = interactionRef.current;
      if (current.type === "idle") return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dxPct = ((e.clientX - (current.type === "adding" ? 0 : current.startMouseX)) / rect.width) * 100;
      const dyPct = ((e.clientY - (current.type === "adding" ? 0 : current.startMouseY)) / rect.height) * 100;

      if (current.type === "adding") {
        const { x, y } = getCanvasRelativePercent(e.clientX, e.clientY);
        setInteraction((prev: InteractionMode) =>
          prev.type === "adding" ? { ...prev, currentX: x, currentY: y } : prev,
        );
      } else if (current.type === "moving") {
        const zone = zones.find((z) => z.id === current.zoneId);
        if (!zone) return;
        const effectiveSnap = snapToGrid && !e.shiftKey;
        const snappedX = snap(current.startZoneX + dxPct, gridSize, effectiveSnap);
        const snappedY = snap(current.startZoneY + dyPct, gridSize, effectiveSnap);
        const newX = clamp(snappedX, 0, 100 - zone.width);
        const newY = clamp(snappedY, 0, 100 - zone.height);
        onZoneMove(current.zoneId, newX, newY);
      } else if (current.type === "resizing") {
        const { startZone, handle } = current;
        let { x, y, width, height } = startZone;
        const effectiveSnap = snapToGrid && !e.shiftKey;

        if (handle.includes("e")) {
          width = clamp(
            snap(startZone.width + dxPct, gridSize, effectiveSnap),
            MIN_ZONE_SIZE,
            100 - startZone.x,
          );
        }
        if (handle.includes("s")) {
          height = clamp(
            snap(startZone.height + dyPct, gridSize, effectiveSnap),
            MIN_ZONE_SIZE,
            100 - startZone.y,
          );
        }
        if (handle.includes("w")) {
          const newX = clamp(
            snap(startZone.x + dxPct, gridSize, effectiveSnap),
            0,
            startZone.x + startZone.width - MIN_ZONE_SIZE,
          );
          width = startZone.x + startZone.width - newX;
          x = newX;
        }
        if (handle.includes("n")) {
          const newY = clamp(
            snap(startZone.y + dyPct, gridSize, effectiveSnap),
            0,
            startZone.y + startZone.height - MIN_ZONE_SIZE,
          );
          height = startZone.y + startZone.height - newY;
          y = newY;
        }

        onZoneResize(current.zoneId, width, height, x, y);
      }
    },
    [getCanvasRelativePercent, gridSize, onZoneMove, onZoneResize, snapToGrid, zones],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const current = interactionRef.current;
      if (current.type === "adding") {
        const x1 = Math.min(current.startX, current.currentX);
        const y1 = Math.min(current.startY, current.currentY);
        const w = Math.abs(current.currentX - current.startX);
        const h = Math.abs(current.currentY - current.startY);
        const effectiveSnap = snapToGrid && !e.shiftKey;

        const snappedX = clamp(snap(x1, gridSize, effectiveSnap), 0, 100);
        const snappedY = clamp(snap(y1, gridSize, effectiveSnap), 0, 100);
        const snappedW = effectiveSnap ? clamp(snap(w, gridSize, true), MIN_ZONE_SIZE, 100 - snappedX) : w;
        const snappedH = effectiveSnap ? clamp(snap(h, gridSize, true), MIN_ZONE_SIZE, 100 - snappedY) : h;

        if (snappedW >= MIN_ZONE_SIZE && snappedH >= MIN_ZONE_SIZE) {
          onZoneAdd({
            id: crypto.randomUUID(),
            x: snappedX,
            y: snappedY,
            width: snappedW,
            height: snappedH,
            borderColor: "rgba(255,255,255,0.5)",
            borderSize: 2,
            borderRadius: 0,
            padding: 0,
            dropShadow: false,
          });
        }
      }
      setInteraction({ type: "idle" });
    },
    [gridSize, onZoneAdd, snapToGrid],
  );

  // Build the ghost rect for adding
  let ghostStyle: React.CSSProperties | null = null;
  if (interaction.type === "adding") {
    const x1 = Math.min(interaction.startX, interaction.currentX);
    const y1 = Math.min(interaction.startY, interaction.currentY);
    const w = Math.abs(interaction.currentX - interaction.startX);
    const h = Math.abs(interaction.currentY - interaction.startY);
    ghostStyle = {
      position: "absolute",
      left: `${x1}%`,
      top: `${y1}%`,
      width: `${w}%`,
      height: `${h}%`,
      border: "2px dashed hsl(var(--primary))",
      background: "hsl(var(--primary) / 0.1)",
      pointerEvents: "none",
    };
  }

  const resizeHandles: ResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  const handlePositions: Record<ResizeHandle, React.CSSProperties> = {
    n:  { top: -4, left: "50%", transform: "translateX(-50%)", cursor: "n-resize" },
    s:  { bottom: -4, left: "50%", transform: "translateX(-50%)", cursor: "s-resize" },
    e:  { right: -4, top: "50%", transform: "translateY(-50%)", cursor: "e-resize" },
    w:  { left: -4, top: "50%", transform: "translateY(-50%)", cursor: "w-resize" },
    ne: { top: -4, right: -4, cursor: "ne-resize" },
    nw: { top: -4, left: -4, cursor: "nw-resize" },
    se: { bottom: -4, right: -4, cursor: "se-resize" },
    sw: { bottom: -4, left: -4, cursor: "sw-resize" },
  };

  return (
    <div
      ref={canvasRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${resolution.width} / ${resolution.height}`,
        background: backgroundImage ? `url(${backgroundImage}) center/cover no-repeat #1a1a1a` : "#1a1a1a",
        borderRadius: 4,
        overflow: "hidden",
        cursor: interaction.type === "adding" ? "crosshair" : "default",
        userSelect: "none",
      }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: `${gridSize}% ${gridSize}%`,
          opacity: snapToGrid ? 1 : 0.5,
          pointerEvents: "none",
        }}
      />

      {/* Zones */}
      {zones.map((zone) => {
        const isSelected = zone.id === selectedZoneId;
        return (
          <div
            key={zone.id}
            style={{
              position: "absolute",
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              border: `${zone.borderSize ?? 2}px solid ${isSelected ? "hsl(var(--primary))" : zone.borderColor ?? "rgba(255,255,255,0.5)"}`,
              borderRadius: `${zone.borderRadius ?? 0}px`,
              padding: `${zone.padding ?? 0}px`,
              background: zone.backgroundImage
                ? `url(${zone.backgroundImage}) center/cover no-repeat`
                : isSelected
                  ? "rgba(255,255,255,0.92)"
                  : "rgba(255,255,255,0.82)",
              cursor: "move",
              boxSizing: "border-box",
              boxShadow: zone.dropShadow
                ? "0 8px 24px rgba(0,0,0,0.35)"
                : isSelected
                  ? "0 0 0 1px hsl(var(--primary))"
                  : "none",
            }}
            onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => handleZoneMouseDown(e, zone)}
          >
            {/* Zone label */}
            <div
              style={{
                position: "absolute",
                top: 2,
                left: 4,
                right: 24,
                fontSize: 10,
                color: "rgba(0,0,0,0.65)",
                fontWeight: 600,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                pointerEvents: "none",
                background: zone.backgroundImage ? "rgba(255,255,255,0.7)" : "transparent",
                borderRadius: 2,
                padding: zone.backgroundImage ? "0 2px" : 0,
              }}
            >
              {zone.label || zone.content?.label || `Zona ${zones.indexOf(zone) + 1}`}
            </div>

            {/* Delete button */}
            {isSelected && (
              <button
                type="button"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  background: "hsl(var(--destructive))",
                  color: "hsl(var(--destructive-foreground))",
                  border: "none",
                  borderRadius: 3,
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  onZoneRemove(zone.id);
                }}
              >
                <Trash2 size={10} />
              </button>
            )}

            {/* Content indicator */}
            {zone.content && (
              <div
                style={{
                  position: "absolute",
                  bottom: 2,
                  left: 4,
                  fontSize: 9,
                  color: "rgba(0,0,0,0.5)",
                  background: "rgba(255,255,255,0.6)",
                  borderRadius: 2,
                  padding: "0 3px",
                  pointerEvents: "none",
                }}
              >
                [{zone.content.type}] {zone.content.label}
              </div>
            )}

            {/* Resize handles (only when selected) */}
            {isSelected &&
              resizeHandles.map((handle) => (
                <div
                  key={handle}
                  style={{
                    position: "absolute",
                    width: 8,
                    height: 8,
                    background: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--background))",
                    borderRadius: 2,
                    ...handlePositions[handle],
                  }}
                  onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => handleResizeHandleMouseDown(e, zone, handle)}
                />
              ))}
          </div>
        );
      })}

      {/* Ghost rect while adding */}
      {ghostStyle && <div style={ghostStyle} />}

      {/* Hint */}
      {zones.length === 0 && interaction.type === "idle" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            pointerEvents: "none",
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          Trascina sul canvas per aggiungere una zona (Shift = snap off)
        </div>
      )}
    </div>
  );
}
