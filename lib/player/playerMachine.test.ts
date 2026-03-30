import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";

import { playerMachine } from "./playerMachine";
import type { ContentManifest } from "./types";

function createManifest(id: string): ContentManifest {
  return {
    screenId: "screen-1",
    items: [{ id: `item-${id}`, type: "image", url: `/item-${id}.jpg`, durationMs: 5000 }],
    resolvedAt: new Date().toISOString(),
    scheduleId: `schedule-${id}`,
  };
}

describe("playerMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts in parallel initial states", () => {
    const actor = createActor(playerMachine, {}).start();

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "waiting",
    });
    expect(actor.getSnapshot().context.manifest).toBeNull();
    expect(actor.getSnapshot().context.currentItemIndex).toBe(0);
    expect(actor.getSnapshot().context.clockOffset).toBe(0);

    actor.stop();
  });

  it("transitions connectivity: connecting -> connected on WS_CONNECTED", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "WS_CONNECTED", recovered: true });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connected",
      playback: "waiting",
    });

    actor.stop();
  });

  it("transitions connectivity: connected -> reconnecting on WS_DISCONNECTED", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "WS_CONNECTED", recovered: true });
    actor.send({ type: "WS_DISCONNECTED" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "reconnecting",
      playback: "waiting",
    });

    actor.stop();
  });

  it("transitions playback: waiting -> loading on CONTENT_UPDATE, assigns manifest", () => {
    const actor = createActor(playerMachine, {}).start();
    const manifest = createManifest("m1");

    actor.send({ type: "CONTENT_UPDATE", manifest });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "loading",
    });
    expect(actor.getSnapshot().context.manifest).toEqual(manifest);

    actor.stop();
  });

  it("transitions playback: loading -> playing on LOAD_SUCCESS", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    actor.send({ type: "LOAD_SUCCESS" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "playing",
    });

    actor.stop();
  });

  it("transitions playback: loading -> error after 10s timeout", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    vi.advanceTimersByTime(10000);

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "error",
    });

    actor.stop();
  });

  it("transitions playback: error -> waiting after 5s", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    actor.send({ type: "LOAD_ERROR" });
    vi.advanceTimersByTime(5000);

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "waiting",
    });

    actor.stop();
  });

  it("transitions playback: playing -> transitioning on ITEM_TIMER_EXPIRED", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    actor.send({ type: "LOAD_SUCCESS" });
    actor.send({ type: "ITEM_TIMER_EXPIRED" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "transitioning",
    });

    actor.stop();
  });

  it("transitions playback: transitioning -> loading after 300ms", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    actor.send({ type: "LOAD_SUCCESS" });
    actor.send({ type: "ITEM_TIMER_EXPIRED" });
    vi.advanceTimersByTime(300);

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "loading",
    });

    actor.stop();
  });

  it("transitions playback: playing -> playing on FORCE_OVERRIDE, updates manifest", () => {
    const actor = createActor(playerMachine, {}).start();
    const m1 = createManifest("m1");
    const m2 = createManifest("m2");

    actor.send({ type: "CONTENT_UPDATE", manifest: m1 });
    actor.send({ type: "LOAD_SUCCESS" });
    actor.send({ type: "FORCE_OVERRIDE", manifest: m2 });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "playing",
    });
    expect(actor.getSnapshot().context.manifest).toEqual(m2);

    actor.stop();
  });

  it("transitions playback: playing -> noContent on NO_CONTENT", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "CONTENT_UPDATE", manifest: createManifest("m1") });
    actor.send({ type: "LOAD_SUCCESS" });
    actor.send({ type: "NO_CONTENT" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "noContent",
    });

    actor.stop();
  });

  it("transitions playback: waiting -> noContent on NO_CONTENT", () => {
    const actor = createActor(playerMachine, {}).start();

    actor.send({ type: "NO_CONTENT" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "noContent",
    });

    actor.stop();
  });

  it("transitions playback: noContent -> loading on CONTENT_UPDATE", () => {
    const actor = createActor(playerMachine, {}).start();
    const manifest = createManifest("m3");

    actor.send({ type: "NO_CONTENT" });
    actor.send({ type: "CONTENT_UPDATE", manifest });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "connecting",
      playback: "loading",
    });
    expect(actor.getSnapshot().context.manifest).toEqual(manifest);

    actor.stop();
  });

  it("playback continues playing while connectivity is reconnecting", () => {
    const actor = createActor(playerMachine, {}).start();
    const manifest = createManifest("m1");

    actor.send({ type: "WS_CONNECTED", recovered: true });
    actor.send({ type: "CONTENT_UPDATE", manifest });
    actor.send({ type: "LOAD_SUCCESS" });
    actor.send({ type: "WS_DISCONNECTED" });

    expect(actor.getSnapshot().value).toEqual({
      connectivity: "reconnecting",
      playback: "playing",
    });
    expect(actor.getSnapshot().context.manifest).toEqual(manifest);

    actor.stop();
  });

  it("updates clockOffset on CLOCK_SYNC event", () => {
    const actor = createActor(playerMachine, {}).start();
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    actor.send({ type: "CLOCK_SYNC", serverTs: 1_550 });

    expect(actor.getSnapshot().context.clockOffset).toBe(550);

    actor.stop();
  });
});
