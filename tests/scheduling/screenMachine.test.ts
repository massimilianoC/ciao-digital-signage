import { beforeEach, describe, expect, it } from "vitest";
import { createActor } from "xstate";

import { ActorRegistry } from "../../lib/scheduling/ActorRegistry";
import { scheduleScreenMachine } from "../../lib/scheduling/screenMachine";

const playingManifest = {
  manifestId: "mf-001",
  screenId: "screen-1",
  resolvedLayer: "screen" as const,
  items: [],
  validFrom: new Date().toISOString(),
  validUntil: null,
};

const overrideManifest = {
  manifestId: "mf-override",
  screenId: "screen-1",
  resolvedLayer: "force_override" as const,
  items: [],
  validFrom: new Date().toISOString(),
  validUntil: null,
};

const noContentManifest = {
  manifestId: "mf-empty",
  screenId: "screen-1",
  resolvedLayer: "no_content" as const,
  items: [],
  validFrom: new Date().toISOString(),
  validUntil: null,
};

describe("scheduleScreenMachine", () => {
  it("starts in idle state", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  it("stores screenId in context", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-abc" },
    }).start();

    expect(actor.getSnapshot().context.screenId).toBe("screen-abc");
    actor.stop();
  });

  it("transitions idle to playing on SCHEDULE_RESOLVED with real content", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });

    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });

  it("stays in idle on SCHEDULE_RESOLVED with no_content manifest", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: noContentManifest });

    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  it("stores manifest in context after SCHEDULE_RESOLVED", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });

    expect(actor.getSnapshot().context.currentManifest).toEqual(playingManifest);
    actor.stop();
  });

  it("transitions idle to forcedOverride on FORCE_OVERRIDE", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "FORCE_OVERRIDE", manifest: overrideManifest });

    expect(actor.getSnapshot().value).toBe("forcedOverride");
    actor.stop();
  });

  it("transitions playing to forcedOverride on FORCE_OVERRIDE", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });
    actor.send({ type: "FORCE_OVERRIDE", manifest: overrideManifest });

    expect(actor.getSnapshot().value).toBe("forcedOverride");
    actor.stop();
  });

  it("transitions forcedOverride to playing on OVERRIDE_CLEARED", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "FORCE_OVERRIDE", manifest: overrideManifest });
    actor.send({ type: "OVERRIDE_CLEARED" });

    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });

  it("transitions playing to reconnecting on PLAYER_DISCONNECTED", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });
    actor.send({ type: "PLAYER_DISCONNECTED" });

    expect(actor.getSnapshot().value).toBe("reconnecting");
    actor.stop();
  });

  it("transitions reconnecting to playing on RECONNECT_COMPLETE", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });
    actor.send({ type: "PLAYER_DISCONNECTED" });
    actor.send({ type: "RECONNECT_COMPLETE" });

    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });

  it("persisted snapshot is serializable and restorable", () => {
    const actor = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
    }).start();

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });
    const snapshot = actor.getPersistedSnapshot();
    actor.stop();

    const restored = createActor(scheduleScreenMachine, {
      input: { screenId: "screen-1" },
      snapshot,
    }).start();

    expect(restored.getSnapshot().value).toBe("playing");
    expect(restored.getSnapshot().context.currentManifest).toEqual(playingManifest);
    restored.stop();
  });
});

describe("ActorRegistry", () => {
  let registry: ActorRegistry;

  beforeEach(() => {
    registry = new ActorRegistry();
  });

  it("creates a new actor for an unknown screenId", () => {
    const actor = registry.getOrCreate("screen-x");

    expect(actor).toBeDefined();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("returns the same actor on repeated calls with the same screenId", () => {
    const a1 = registry.getOrCreate("screen-x");
    const a2 = registry.getOrCreate("screen-x");

    expect(a1).toBe(a2);
  });

  it("returns different actors for different screenIds", () => {
    const a1 = registry.getOrCreate("screen-x");
    const a2 = registry.getOrCreate("screen-y");

    expect(a1).not.toBe(a2);
  });

  it("stop removes the actor from the registry", () => {
    registry.getOrCreate("screen-x");
    registry.stop("screen-x");

    const a2 = registry.getOrCreate("screen-x");
    expect(a2.getSnapshot().value).toBe("idle");
  });

  it("getActor returns undefined for non-existent screenId", () => {
    expect(registry.getActor("non-existent")).toBeUndefined();
  });

  it("getActor returns actor after getOrCreate", () => {
    registry.getOrCreate("screen-x");

    expect(registry.getActor("screen-x")).toBeDefined();
  });

  it("actors in registry are already started", () => {
    const actor = registry.getOrCreate("screen-x");

    actor.send({ type: "SCHEDULE_RESOLVED", manifest: playingManifest });
    expect(actor.getSnapshot().value).toBe("playing");
  });
});
