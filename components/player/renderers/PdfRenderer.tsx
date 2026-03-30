"use client";

interface PdfRendererProps {
  url: string;
  interactive?: boolean;
  onLoad: () => void;
  onError: () => void;
}

function toPdfViewerUrl(url: string, interactive: boolean): string {
  // Browser PDF viewers generally support these hash hints.
  const hash = interactive
    ? "page=1&zoom=page-fit"
    : "toolbar=0&navpanes=0&scrollbar=0&page=1&zoom=page-fit";

  const [base] = url.split("#");
  return `${base}#${hash}`;
}

export function PdfRenderer({ url, interactive = false, onLoad, onError }: PdfRendererProps) {
  const src = toPdfViewerUrl(url, interactive);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111",
      }}
    >
      <iframe
        src={src}
        title="pdf-content"
        onLoad={onLoad}
        onError={onError}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
}
