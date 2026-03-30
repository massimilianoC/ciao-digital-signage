export function extractSrcFromIframe(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed.includes("<iframe")) return null;
    const match = trimmed.match(/src\s*=\s*['\"]([^'\"]+)['\"]/i);
    return match?.[1] ?? null;
}

export function extractYouTubeVideoId(input: string): string | null {
    const src = extractSrcFromIframe(input);
    const raw = (src ?? input).trim();

    try {
        const u = new URL(raw);
        const host = u.hostname.toLowerCase();

        if (host.includes("youtu.be")) {
            return u.pathname.split("/").filter(Boolean)[0] ?? null;
        }

        if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
            const pathParts = u.pathname.split("/").filter(Boolean);

            if (pathParts[0] === "embed" && pathParts[1]) {
                return pathParts[1];
            }

            if (pathParts[0] === "shorts" && pathParts[1]) {
                return pathParts[1];
            }

            if (pathParts[0] === "live" && pathParts[1]) {
                return pathParts[1];
            }

            const v = u.searchParams.get("v");
            if (v) return v;
        }
    } catch {
        const fallback = raw.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        return fallback?.[1] ?? null;
    }

    return null;
}

export function isYouTubeInput(input: string): boolean {
    const src = extractSrcFromIframe(input);
    const raw = (src ?? input).trim().toLowerCase();
    if (!raw) return false;
    if (raw.includes("youtube.com") || raw.includes("youtu.be") || raw.includes("youtube-nocookie.com")) {
        return true;
    }
    return extractYouTubeVideoId(raw) !== null;
}

export function buildCleanYouTubeEmbedUrl(videoId: string): string {
    const params = new URLSearchParams({
        autoplay: "1",
        mute: "1",
        controls: "0",
        rel: "0",
        iv_load_policy: "3",
        disablekb: "1",
        fs: "0",
        playsinline: "1",
    });

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function normalizeYouTubeInputToEmbed(input: string): string {
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) {
        const src = extractSrcFromIframe(input);
        return (src ?? input).trim();
    }
    return buildCleanYouTubeEmbedUrl(videoId);
}
