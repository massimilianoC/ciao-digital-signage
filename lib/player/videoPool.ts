export const VIDEO_POOL_SIZE = 2;

export class VideoPool {
  private slots: HTMLVideoElement[] = [];

  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    const mountNode = document.getElementById("player-mount");
    if (!mountNode) {
      throw new Error("VideoPool: #player-mount not found");
    }

    for (let index = 0; index < VIDEO_POOL_SIZE; index += 1) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;";
      video.style.display = "none";
      mountNode.appendChild(video);
      this.slots.push(video);
    }

    this.initialized = true;
  }

  private assertReady(): void {
    if (!this.initialized) {
      throw new Error("VideoPool: call init() before using slots");
    }
  }

  private getRequiredSlot(slotIndex: number): HTMLVideoElement {
    this.assertReady();

    const slot = this.slots[slotIndex];
    if (!slot) {
      throw new Error(`VideoPool: slot ${slotIndex} does not exist`);
    }

    return slot;
  }

  private normalizeSrc(src: string): string {
    try {
      return new URL(src, window.location.href).href;
    } catch {
      return src;
    }
  }

  prepare(slotIndex: number, src: string): HTMLVideoElement {
    const slot = this.getRequiredSlot(slotIndex);
    const nextSrc = this.normalizeSrc(src);
    const currentSrc = this.normalizeSrc(slot.getAttribute("src") || "");

    if (currentSrc !== nextSrc) {
      slot.src = nextSrc;
      slot.load();
    } else if (slot.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      // Same source but media pipeline was reset: explicitly reload.
      slot.load();
    }

    slot.style.display = "none";
    return slot;
  }

  assign(slotIndex: number, src: string): HTMLVideoElement {
    const slot = this.prepare(slotIndex, src);
    slot.style.display = "block";
    return slot;
  }

  release(slotIndex: number): void {
    if (!this.initialized) {
      return;
    }

    const slot = this.slots[slotIndex];
    if (!slot) {
      return;
    }

    slot.pause();
    slot.removeAttribute("src");
    slot.load();
    slot.style.display = "none";
  }

  destroy(): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      this.release(index);
      this.slots[index].remove();
    }

    this.slots = [];
    this.initialized = false;
  }

  getSlot(slotIndex: number): HTMLVideoElement | undefined {
    return this.slots[slotIndex];
  }
}

export const videoPool = new VideoPool();
