"use client";

import { CiaoLogo } from "@/components/ui/CiaoLogo";

interface NoContentScreenProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
}

export function NoContentScreen({
  title = "Ciao",
  subtitle = "Digital Signage Player",
  badgeText = "Nessuna pianificazione attiva",
}: NoContentScreenProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 20% 20%, #252525 0%, #171717 45%, #101010 100%)",
        color: "#e8e8e8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(130deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 35%, rgba(255,255,255,0.03))",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "min(60vw, 680px)",
          aspectRatio: "16 / 6",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(1px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "3rem 2rem",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div>
          <CiaoLogo width={360} variant="dark" />
          <div
            style={{
              marginTop: 14,
              fontSize: "clamp(0.75rem, 1.4vw, 1rem)",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 26,
          right: 26,
          borderRadius: 999,
          background: "rgba(35,35,35,0.9)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#f1f1f1",
          padding: "0.7rem 1rem",
          fontSize: "0.82rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {badgeText}
      </div>
    </div>
  );
}
