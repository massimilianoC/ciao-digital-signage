"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Globe, ImageIcon, Link, Upload, Video, Youtube } from "lucide-react";
import { useDropzone } from "react-dropzone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isYouTubeInput, normalizeYouTubeInputToEmbed } from "@/lib/utils/youtube-embed";

type UrlSubtype = "youtube" | "video" | "image" | "pdf" | "webpage";

interface UploadedContentItem {
  _id: string;
  name: string;
  type: "image" | "video" | "url" | "widget";
  thumbnailUrl?: string;
  createdAt?: string;
  config?: {
    fileUrl?: string;
    url?: string;
    urlSubtype?: UrlSubtype;
  };
}

interface UploadItem {
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
  serverUrl?: string;
  error?: string;
}

interface UrlImportState {
  url: string;
  youtubeEmbedInput: string;
  name: string;
  subtype: UrlSubtype;
  durationSec: number;
  status: "idle" | "submitting" | "done" | "error";
  error?: string;
}

interface DropUploaderProps {
  onUploadComplete?: (item: UploadedContentItem) => void;
  onUrlSaved?: (item: UploadedContentItem) => void;
}

const URL_SUBTYPE_LABELS: Record<UrlSubtype, string> = {
  youtube: "YouTube",
  video: "Video MP4",
  image: "Immagine",
  pdf: "PDF",
  webpage: "Pagina web",
};

const URL_SUBTYPE_ICONS: Record<UrlSubtype, React.ReactNode> = {
  youtube: <Youtube className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  image: <ImageIcon className="h-3.5 w-3.5" />,
  pdf: <FileText className="h-3.5 w-3.5" />,
  webpage: <Globe className="h-3.5 w-3.5" />,
};

function detectUrlSubtype(rawUrl: string): UrlSubtype {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase().split("?")[0];
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (/\.(mp4|webm|mov|avi|mkv)$/.test(path)) return "video";
    if (/\.(pdf)$/.test(path)) return "pdf";
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(path)) return "image";
  } catch {
    // not a valid URL yet
  }
  return "webpage";
}

function suggestName(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      return `YouTube – ${u.hostname.includes("youtu.be") ? u.pathname.slice(1) : (u.searchParams.get("v") ?? "video")}`;
    }
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
    return u.hostname;
  } catch {
    return "";
  }
}

const SUBTYPES: UrlSubtype[] = ["youtube", "video", "image", "pdf", "webpage"];

export function DropUploader({ onUploadComplete, onUrlSaved }: DropUploaderProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [urlSuccessMessage, setUrlSuccessMessage] = useState<string | null>(null);
  const [urlForm, setUrlForm] = useState<UrlImportState>({
    url: "",
    youtubeEmbedInput: "",
    name: "",
    subtype: "webpage",
    durationSec: 10,
    status: "idle",
  });
  const prevUrl = useRef("");

  useEffect(() => {
    return () => {
      for (const upload of uploads) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    };
  }, [uploads]);

  // Auto-detect subtype and suggest name when URL changes
  useEffect(() => {
    if (urlForm.url === prevUrl.current) return;
    prevUrl.current = urlForm.url;
    if (!urlForm.url.trim()) return;
    const forcedYoutube = isYouTubeInput(urlForm.url);
    const normalized = forcedYoutube ? normalizeYouTubeInputToEmbed(urlForm.url) : urlForm.url;
    const detected = forcedYoutube ? "youtube" : detectUrlSubtype(normalized);
    const suggested = suggestName(normalized);
    setUrlForm((f) => ({
      ...f,
      url: normalized,
      subtype: detected,
      name: f.name || suggested,
    }));
  }, [urlForm.url]);

  const uploadFile = useCallback(async (item: UploadItem) => {
    setUploads((prev) => prev.map((u) => (u.file === item.file ? { ...u, status: "uploading" } : u)));

    try {
      const formData = new FormData();
      formData.append("file", item.file);

      const response = await fetch("/api/content/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as UploadedContentItem;

      setUploads((prev) =>
        prev.map((u) =>
          u.file === item.file
            ? { ...u, status: "done", serverUrl: data.thumbnailUrl ?? data.config?.fileUrl }
            : u,
        ),
      );
      onUploadComplete?.(data);
    } catch (error) {
      setUploads((prev) =>
        prev.map((u) =>
          u.file === item.file
            ? { ...u, status: "error", error: error instanceof Error ? error.message : "Upload failed" }
            : u,
        ),
      );
    }
  }, [onUploadComplete]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newItems = acceptedFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending" as const,
      }));

      setUploads((prev) => [...prev, ...newItems]);
      newItems.forEach((item) => {
        void uploadFile(item);
      });
    },
    [uploadFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      "video/mp4": [],
      "video/webm": [],
      "application/pdf": [".pdf"],
    },
    maxSize: 500 * 1024 * 1024,
    onDrop,
  });

  const handleUrlSubmit = useCallback(async () => {
    const rawInput = urlForm.subtype === "youtube"
      ? (urlForm.youtubeEmbedInput.trim() || urlForm.url.trim())
      : urlForm.url.trim();
    const forcedYoutube = isYouTubeInput(rawInput);
    const effectiveSubtype: UrlSubtype = forcedYoutube ? "youtube" : urlForm.subtype;
    const url = effectiveSubtype === "youtube" ? normalizeYouTubeInputToEmbed(rawInput) : rawInput;
    const name = urlForm.name.trim() || suggestName(url) || url;
    if (!url) return;

    setUrlForm((f) => ({ ...f, status: "submitting", error: undefined }));
    setUrlSuccessMessage(null);

    try {
      const response = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "url",
          name,
          defaultDurationMs: urlForm.durationSec * 1000,
          config: {
            url,
            urlSubtype: effectiveSubtype,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = (await response.json()) as UploadedContentItem;
      onUploadComplete?.(data);
      onUrlSaved?.(data);
      setUrlSuccessMessage(`Contenuto URL salvato correttamente: ${data.name}`);
      setUrlForm({
        url: "",
        youtubeEmbedInput: "",
        name: "",
        subtype: "webpage",
        durationSec: 10,
        status: "done",
      });
      setTimeout(() => setUrlForm((f) => ({ ...f, status: "idle" })), 2000);
    } catch (error) {
      setUrlForm((f) => ({
        ...f,
        status: "error",
        error: error instanceof Error ? error.message : "Errore durante il salvataggio",
      }));
    }
  }, [urlForm, onUploadComplete, onUrlSaved]);

  return (
    <div className="space-y-4">
      {/* File drop area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-foreground bg-accent text-accent-foreground"
            : "border-muted-foreground/30 hover:border-foreground/50 hover:bg-muted/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        {isDragActive ? (
          <p className="font-medium">Rilascia i file qui...</p>
        ) : (
          <div>
            <p className="font-medium">Trascina file qui</p>
            <p className="text-sm text-muted-foreground mt-1">oppure clicca per sfogliare</p>
            <p className="text-xs text-muted-foreground mt-2">JPEG, PNG, WebP, GIF, MP4, WebM, PDF – max 500 MB</p>
          </div>
        )}
      </div>

      {/* File upload queue */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Upload in corso</h3>
          {uploads.map((item) => (
            <div key={`${item.file.name}-${item.previewUrl}`} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
              <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                {item.file.type.startsWith("image/") ? (
                  <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                ) : (
                  <Video className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                {item.error && <p className="text-xs text-destructive mt-1 truncate">{item.error}</p>}
              </div>
              <div className="shrink-0">
                {item.status === "uploading" && <Badge variant="secondary">Caricamento...</Badge>}
                {item.status === "done" && <CheckCircle className="h-5 w-5 text-green-500" />}
                {item.status === "error" && (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs">Errore</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* URL import panel */}
      <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
        {urlSuccessMessage && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-900 text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>{urlSuccessMessage}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Aggiungi contenuto da URL</span>
        </div>

        <div className="space-y-1">
          <Label htmlFor="url-input" className="text-xs text-muted-foreground">URL</Label>
          <Input
            id="url-input"
            placeholder="https://…  (YouTube, MP4, immagine, sito web)"
            value={urlForm.url}
            onChange={(e) => {
              setUrlSuccessMessage(null);
              setUrlForm((f) => ({ ...f, url: e.target.value, status: "idle", error: undefined }));
            }}
            className="text-sm"
          />
        </div>

        {urlForm.subtype === "youtube" && (
          <div className="space-y-1">
            <Label htmlFor="youtube-embed-input" className="text-xs text-muted-foreground">Codice embed YouTube (opzionale)</Label>
            <Input
              id="youtube-embed-input"
              placeholder="Incolla qui il codice <iframe ...> oppure il link /embed/..."
              value={urlForm.youtubeEmbedInput}
              onChange={(e) =>
                {
                  setUrlSuccessMessage(null);
                  setUrlForm((f) => ({
                    ...f,
                    youtubeEmbedInput: e.target.value,
                    status: "idle",
                    error: undefined,
                  }));
                }
              }
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supporta link condividi <span className="font-mono">youtu.be/...</span>, link <span className="font-mono">youtube.com/watch?v=...</span> e codice <span className="font-mono">iframe</span> embed.
            </p>
            <p className="text-xs text-muted-foreground">
              I link YouTube vengono convertiti automaticamente in URL <span className="font-mono">/embed/</span> con parametri standard puliti.
            </p>
          </div>
        )}

        {/* Subtype selector */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo di contenuto</Label>
          <div className="flex flex-wrap gap-1.5">
            {SUBTYPES.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => {
                  setUrlSuccessMessage(null);
                  setUrlForm((f) => ({ ...f, subtype: sub }));
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  urlForm.subtype === sub
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {URL_SUBTYPE_ICONS[sub]}
                {URL_SUBTYPE_LABELS[sub]}
              </button>
            ))}
          </div>
          {urlForm.subtype === "webpage" && (
            <p className="text-xs text-muted-foreground">
              Visualizzato in iframe. Interattivo solo se è l&apos;unico contenuto nella playlist.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="url-name" className="text-xs text-muted-foreground">Nome</Label>
            <Input
              id="url-name"
              placeholder="Nome del contenuto"
              value={urlForm.name}
              onChange={(e) => {
                setUrlSuccessMessage(null);
                setUrlForm((f) => ({ ...f, name: e.target.value }));
              }}
              className="text-sm"
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="url-duration" className="text-xs text-muted-foreground">Durata (s)</Label>
            <Input
              id="url-duration"
              type="number"
              min={1}
              max={3600}
              value={urlForm.durationSec}
              onChange={(e) =>
                {
                  setUrlSuccessMessage(null);
                  setUrlForm((f) => ({ ...f, durationSec: Math.max(1, Number(e.target.value) || 10) }));
                }
              }
              className="text-sm"
            />
          </div>
        </div>

        {urlForm.error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {urlForm.error}
          </p>
        )}

        <Button
          size="sm"
          disabled={!urlForm.url.trim() || urlForm.status === "submitting"}
          onClick={() => void handleUrlSubmit()}
          className="w-full"
        >
          {urlForm.status === "submitting" ? (
            "Salvataggio..."
          ) : urlForm.status === "done" ? (
            <><CheckCircle className="h-4 w-4 mr-1.5" /> Aggiunto!</>
          ) : (
            <><Link className="h-4 w-4 mr-1.5" /> Aggiungi URL</>
          )}
        </Button>
      </div>
    </div>
  );
}


