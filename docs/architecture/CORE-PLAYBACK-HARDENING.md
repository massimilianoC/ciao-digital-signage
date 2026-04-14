# Core Playback Hardening Plan

Status: Draft (implementation started)
Owner: Runtime Player
Last updated: 2026-04-13

## Why this document

This plan focuses on one release-critical objective: robust and low-latency playlist playback across video, image, PDF, URL, widget, and composite layout items.

The repository is public and must stay production-grade. This document captures a concrete sequence to improve runtime behavior first, then add optional optimization modules.

## Current baseline (observed)

Strengths:
- Manifest-based player runtime is already in place (resolver + Socket.IO updates).
- Runtime state machine exists with clear connectivity and playback states.
- Video pool exists with two slots.
- Existing E2E suite already validates media smoke and pairing/runtime connectivity.

Gaps:
- Video playback progression was timer-driven; not media-ended-driven.
- Video pool existed but was not used as warm standby for the next video.
- No explicit media readiness strategy by content type (video/image/pdf/webpage/widget).
- Upload pipeline is local filesystem first (`public/uploads`) with image thumbnail generation only.
- No server-side transcode pipeline for videos and no policy-driven asset output profiles.

## Scope alignment with public milestones

This plan maps to public milestones as follows:
- M1 Stability Pass: deterministic playlist progression, reduced transition lag, stronger playback tests.
- M2 Release Candidate: media optimization policies and optional offline/cache strategy.
- M3 Stable: storage-provider abstraction, operational observability, full resilience defaults.

## Phase A (started): Video-first seamless progression

Objective: eliminate avoidable dead time between videos and avoid timer mismatch issues.

Implemented in this iteration:
- Video progression now advances on native video ended event.
- Timer worker is skipped for video-like items (video and url/video).
- Next playlist item warm-up added:
  - next video is preloaded into alternate video-pool slot,
  - next image gets browser prefetch through an Image object.
- E2E test added to verify real transition from a completed video to next item even with a long configured duration.

Files touched:
- components/player/PlayerRoot.tsx
- components/player/ContentRenderer.tsx
- components/player/renderers/VideoRenderer.tsx
- lib/player/videoPool.ts
- e2e/media-player.spec.ts

## Phase B: Unified preload strategy per media type

Objective: define one preloading contract independent from renderer type.

Planned actions:
- Introduce a dedicated preloader module with type-aware adapters:
  - video: pooled warm slot + readyState threshold,
  - image: decode() preflight,
  - pdf: iframe warm load (non-interactive),
  - webpage/widget: DNS/TLS preconnect and iframe mount staging.
- Add playlist-level policy knobs:
  - preloadDepth (1..N),
  - skipWhileLoading (true/false),
  - maxWaitBeforeSkipMs,
  - fallbackPoster/background per item.
- Add telemetry events:
  - item_load_started,
  - item_ready,
  - item_skipped_timeout,
  - transition_duration_ms,
  - first_frame_delay_ms.

## Phase C: Asset optimization and output policies

Objective: reduce startup latency and decoding variability.

Server-side module proposal:
- Add media processing queue with ffmpeg for video normalization:
  - target codecs/profile per platform policy,
  - GOP/keyframe policy for faster start and seek,
  - bitrate ladders only where needed.
- Keep sharp for image derivatives and introduce policy sets:
  - max dimensions,
  - quality tiers,
  - webp/avif fallback strategy.
- Optional PDF optimization pass for heavy files.

Asset policy model (per org or per asset class):
- source allowed formats,
- preferred output format,
- max size and dimensions,
- transcode required vs best-effort,
- caching TTL and purge behavior.

## Phase D: Storage provider abstraction

Objective: support local filesystem and object storage without changing playlist/runtime semantics.

Current status:
- Content upload and delete APIs are local-path based under public/uploads.
- Some connector services read directly from local filesystem paths.

Required changes:
- Create storage provider interface for:
  - put/get/delete,
  - signed URL generation,
  - metadata read,
  - optional streaming read.
- Implement providers:
  - local filesystem (default),
  - S3-compatible object storage.
- Migrate `fileUrl` handling to opaque asset references resolved by provider.
- Keep public URL generation behind provider policy (direct CDN URL vs signed URL).

## Testing strategy (playback-focused)

E2E (Playwright):
- video -> video transition latency budget assertions,
- video -> image, image -> video, pdf -> video transitions,
- skipWhileLoading behavior under artificial slow network,
- loop and stopOnLastItem behavior with mixed media,
- reconnect and cached playback behavior during transient offline.

Frontend/unit:
- media progression decision logic,
- next-item prewarm selector,
- timeout/skip policy reducers,
- state-machine guard coverage for no-content and non-loop last item.

Performance checks:
- capture transition timing percentiles (P50/P95/P99),
- fail CI when above agreed threshold for synthetic fixtures.

## Public quality constraints

- Keep all documentation and comments in English.
- Prefer backward-compatible schema additions.
- Any new playback option must have deterministic defaults.
- New runtime behavior must be observable through logs/metrics.

## Immediate next implementation tasks

1. Add a dedicated playback-preload module with typed adapters.
2. Add API/model fields for preload and skip policy (with safe defaults).
3. Add CI-playable E2E for mixed-media playlists and skip-on-load behavior.
4. Start storage-provider interface extraction from upload/delete and connector file reads.
