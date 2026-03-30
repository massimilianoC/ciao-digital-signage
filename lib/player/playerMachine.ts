import { assign, setup } from "xstate";

import type { ContentManifest } from "./types";

type PlayerContext = {
  manifest: ContentManifest | null;
  currentItemIndex: number;
  clockOffset: number;
};

type PlayerEvent =
  | { type: "WS_CONNECTED"; recovered: boolean }
  | { type: "WS_DISCONNECTED" }
  | { type: "CONTENT_UPDATE"; manifest: ContentManifest }
  | { type: "FORCE_OVERRIDE"; manifest: ContentManifest }
  | { type: "NO_CONTENT" }
  | { type: "LOAD_SUCCESS" }
  | { type: "LOAD_ERROR" }
  | { type: "ITEM_TIMER_EXPIRED" }
  | { type: "CLOCK_SYNC"; serverTs: number };

export const playerMachine = setup({
  types: {
    context: {} as PlayerContext,
    events: {} as PlayerEvent,
  },
  actions: {
    setManifest: assign({
      manifest: ({ context, event }) =>
        "manifest" in event ? event.manifest : context.manifest,
    }),
    setClockOffset: assign({
      clockOffset: ({ context, event }) =>
        "serverTs" in event ? event.serverTs - Date.now() : context.clockOffset,
    }),
    nextItem: assign({
      currentItemIndex: ({ context }) => {
        const itemCount = context.manifest?.items.length ?? 0;
        if (itemCount <= 0) {
          return 0;
        }

        const loop = context.manifest?.loop ?? true;
        const nextIndex = context.currentItemIndex + 1;

        if (nextIndex >= itemCount) {
          return loop ? 0 : context.currentItemIndex;
        }

        return nextIndex;
      },
    }),
    resetItemIndex: assign({
      currentItemIndex: 0,
    }),
  },
  guards: {
    shouldAdvance: ({ context }) => {
      const itemCount = context.manifest?.items.length ?? 0;
      if (itemCount <= 0) {
        return false;
      }

      const loop = context.manifest?.loop ?? true;
      const isLastItem = context.currentItemIndex >= itemCount - 1;

      if (!isLastItem) {
        return true;
      }

      return loop;
    },
    shouldStopOnLast: ({ context }) => {
      const itemCount = context.manifest?.items.length ?? 0;
      if (itemCount <= 0) {
        return false;
      }

      const loop = context.manifest?.loop ?? true;
      const stopOnLastItem = context.manifest?.stopOnLastItem ?? false;
      const isLastItem = context.currentItemIndex >= itemCount - 1;

      return !loop && stopOnLastItem && isLastItem;
    },
  },
}).createMachine({
  id: "player",
  type: "parallel",
  context: {
    manifest: null,
    currentItemIndex: 0,
    clockOffset: 0,
  },
  on: {
    CLOCK_SYNC: {
      actions: "setClockOffset",
    },
  },
  states: {
    connectivity: {
      initial: "connecting",
      states: {
        connecting: {
          on: {
            WS_CONNECTED: "connected",
          },
        },
        connected: {
          on: {
            WS_DISCONNECTED: "reconnecting",
          },
        },
        reconnecting: {
          on: {
            WS_CONNECTED: "connected",
          },
        },
      },
    },
    playback: {
      initial: "waiting",
      states: {
        waiting: {
          on: {
            CONTENT_UPDATE: {
              target: "loading",
              actions: ["setManifest", "resetItemIndex"],
            },
            NO_CONTENT: "noContent",
          },
        },
        loading: {
          after: {
            10000: "error",
          },
          on: {
            LOAD_SUCCESS: "playing",
            LOAD_ERROR: "error",
          },
        },
        playing: {
          on: {
            ITEM_TIMER_EXPIRED: [
              {
                guard: "shouldAdvance",
                target: "transitioning",
                actions: "nextItem",
              },
              {
                guard: "shouldStopOnLast",
                target: "playing",
                reenter: false,
              },
              {
                target: "noContent",
              },
            ],
            LOAD_ERROR: [
              {
                guard: "shouldAdvance",
                target: "transitioning",
                actions: "nextItem",
              },
              {
                guard: "shouldStopOnLast",
                target: "playing",
                reenter: false,
              },
              {
                target: "error",
              },
            ],
            CONTENT_UPDATE: {
              target: "transitioning",
              actions: ["setManifest", "resetItemIndex"],
            },
            FORCE_OVERRIDE: {
              target: "playing",
              reenter: false,
              actions: ["setManifest", "resetItemIndex"],
            },
            NO_CONTENT: "noContent",
          },
        },
        transitioning: {
          after: {
            300: "loading",
          },
        },
        error: {
          after: {
            5000: "waiting",
          },
        },
        noContent: {
          on: {
            CONTENT_UPDATE: {
              target: "loading",
              actions: ["setManifest", "resetItemIndex"],
            },
          },
        },
      },
    },
  },
});
