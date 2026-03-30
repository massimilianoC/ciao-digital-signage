type WorkerInboundMessage =
  | {
      type: "START";
      itemId: string;
      durationMs: number;
    }
  | {
      type: "CANCEL";
    };

let activeTimerId: ReturnType<typeof setTimeout> | null = null;

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === "START") {
    if (activeTimerId !== null) {
      clearTimeout(activeTimerId);
    }

    activeTimerId = setTimeout(() => {
      self.postMessage({ type: "EXPIRED", itemId: message.itemId });
      activeTimerId = null;
    }, message.durationMs);
    return;
  }

  if (activeTimerId !== null) {
    clearTimeout(activeTimerId);
    activeTimerId = null;
  }
});
