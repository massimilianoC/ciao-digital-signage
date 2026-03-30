"use client";

interface ImageRendererProps {
  url: string;
  fitMode?: "cover" | "fit";
  onLoad: () => void;
  onError: () => void;
}

export function ImageRenderer({ url, fitMode, onLoad, onError }: ImageRendererProps) {
  return (
    <img
      src={url}
      alt=""
      onLoad={onLoad}
      onError={onError}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: fitMode === "fit" ? "contain" : "cover",
      }}
    />
  );
}
