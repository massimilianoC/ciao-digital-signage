import { assign, createActor, setup, type Actor } from "xstate";

export interface ContentManifest {
  manifestId: string;
  screenId: string;
  resolvedLayer: "global" | "group" | "screen" | "force_override" | "no_content";
  items: unknown[];
  validFrom: string;
  validUntil: string | null;
  [key: string]: unknown;
}

type ScreenContext = {
  screenId: string;
  currentManifest: ContentManifest | null;
};

type ScreenEvent =
  | { type: "SCHEDULE_RESOLVED"; manifest: ContentManifest }
  | { type: "FORCE_OVERRIDE"; manifest: ContentManifest }
  | { type: "OVERRIDE_CLEARED" }
  | { type: "PLAYER_CONNECTED" }
  | { type: "PLAYER_DISCONNECTED" }
  | { type: "RECONNECT_COMPLETE" };

export const scheduleScreenMachine = setup({
  types: {
    context: {} as ScreenContext,
    events: {} as ScreenEvent,
    input: {} as { screenId: string },
  },
  guards: {
    hasContent: ({ event }) =>
      "manifest" in event && event.manifest.resolvedLayer !== "no_content",
  },
}).createMachine({
  id: "scheduleScreen",
  context: ({ input }) => ({
    screenId: input.screenId,
    currentManifest: null,
  }),
  initial: "idle",
  on: {
    FORCE_OVERRIDE: {
      target: ".forcedOverride",
      actions: assign({
        currentManifest: ({ event }) => event.manifest,
      }),
    },
  },
  states: {
    idle: {
      on: {
        SCHEDULE_RESOLVED: [
          {
            target: "playing",
            guard: "hasContent",
            actions: assign({
              currentManifest: ({ event }) => event.manifest,
            }),
          },
        ],
        PLAYER_CONNECTED: {},
      },
    },
    playing: {
      on: {
        SCHEDULE_RESOLVED: {
          actions: assign({
            currentManifest: ({ event }) => event.manifest,
          }),
        },
        PLAYER_DISCONNECTED: {
          target: "reconnecting",
        },
      },
    },
    forcedOverride: {
      on: {
        OVERRIDE_CLEARED: {
          target: "playing",
        },
        PLAYER_DISCONNECTED: {
          target: "reconnecting",
        },
      },
    },
    reconnecting: {
      on: {
        RECONNECT_COMPLETE: {
          target: "playing",
        },
      },
    },
  },
});

export type ScreenActor = Actor<typeof scheduleScreenMachine>;

export function createScreenActor(screenId: string): ScreenActor {
  return createActor(scheduleScreenMachine, {
    input: { screenId },
  }).start();
}

export function restoreScreenActor(
  screenId: string,
  snapshot: ReturnType<ScreenActor["getPersistedSnapshot"]>,
): ScreenActor {
  return createActor(scheduleScreenMachine, {
    input: { screenId },
    snapshot,
  }).start();
}
