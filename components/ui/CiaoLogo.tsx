import React from "react";

interface CiaoLogoProps {
  /** Larghezza massima in pixel. Default 280. */
  width?: number;
  /** Variante di sfondo: "dark", "light" o "auto" per seguire il tema CSS. Default "dark". */
  variant?: "dark" | "light" | "auto";
  /** Allineamento. Default "center". */
  align?: "left" | "center" | "right";
  /** Opacità aggiuntiva (0-1). Default 1. */
  opacity?: number;
  /** Classe CSS aggiuntiva per il wrapper. */
  className?: string;
}

/**
 * Logo "Ciao Digital Signage" basato sugli asset `public/ciao_sprite_dark.png`
 * e `public/ciao_sprite_light.png`.
 *
 * Regole di rendering:
 * - Sempre object-contain, mai stretched.
 * - Dimensione controllata tramite `width` e `max-width`: l'altezza è automatica.
 * - `variant="auto"` segue `prefers-color-scheme`, con fallback dark.
 */
export function CiaoLogo({
  width = 280,
  variant = "dark",
  align = "center",
  opacity = 1,
  className = "",
}: CiaoLogoProps) {
  const alignStyle: React.CSSProperties =
    align === "left"
      ? { marginRight: "auto" }
      : align === "right"
        ? { marginLeft: "auto" }
        : { marginLeft: "auto", marginRight: "auto" };

  const imageStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    maxWidth: width,
    height: "auto",
    objectFit: "contain",
  };

  const darkSrc = "/ciao_sprite_dark.png";
  const lightSrc = "/ciao_sprite_light.png";
  const resolvedSrc = variant === "light" ? lightSrc : darkSrc;

  return (
    <div
      className={className}
      style={{ display: "block", ...alignStyle, opacity, lineHeight: 0 }}
    >
      {variant === "auto" ? (
        <picture>
          <source media="(prefers-color-scheme: light)" srcSet={lightSrc} />
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, Next optimization is unnecessary here */}
          <img
            src={darkSrc}
            alt="Ciao Digital Signage"
            style={imageStyle}
            draggable={false}
          />
        </picture>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- static brand asset, Next optimization is unnecessary here */
        <img
          src={resolvedSrc}
          alt="Ciao Digital Signage"
          style={imageStyle}
          draggable={false}
        />
      )}
    </div>
  );
}
