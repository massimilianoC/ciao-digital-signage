"use client";

import { CiaoLogo } from "@/components/ui/CiaoLogo";

interface OfflineScreenProps {
  compact?: boolean;
}

export function OfflineScreen({ compact = false }: OfflineScreenProps) {
  if (compact) {
    return (
      <div
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(12,12,12,0.82)",
          color: "#f4f4f5",
          padding: "10px 14px",
          boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
          backdropFilter: "blur(4px)",
          zIndex: 20,
        }}
      >
        <span style={{ fontSize: 12, color: "#f59e0b" }}>●</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.1 }}>Connecting...</span>
          <span style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.1 }}>
            Playing cached content
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#080808",
        color: "#ffffff",
      }}
    >
      <CiaoLogo width={260} variant="dark" opacity={0.8} className="mb-8" />
      <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 16 }}>●</div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>Connecting...</div>
      <div style={{ marginTop: 10, color: "#8f8f8f", fontSize: 14 }}>
        Reconnecting to server
      </div>
    </div>
  );
}
