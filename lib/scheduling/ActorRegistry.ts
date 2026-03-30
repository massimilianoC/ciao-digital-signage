import { createActor } from "xstate";

import { scheduleScreenMachine, type ScreenActor } from "./screenMachine";

export class ActorRegistry {
  private readonly actors = new Map<string, ScreenActor>();

  getOrCreate(screenId: string): ScreenActor {
    const existing = this.actors.get(screenId);
    if (existing) {
      return existing;
    }

    const actor = createActor(scheduleScreenMachine, {
      input: { screenId },
    }).start();

    this.actors.set(screenId, actor);
    return actor;
  }

  getActor(screenId: string): ScreenActor | undefined {
    return this.actors.get(screenId);
  }

  stop(screenId: string): void {
    const actor = this.actors.get(screenId);
    if (!actor) {
      return;
    }

    actor.stop();
    this.actors.delete(screenId);
  }

  stopAll(): void {
    for (const screenId of this.actors.keys()) {
      this.stop(screenId);
    }
  }

  async hydrateAll(screenIds: string[]): Promise<void> {
    for (const screenId of screenIds) {
      this.getOrCreate(screenId);
    }
  }

  get size(): number {
    return this.actors.size;
  }
}

export const actorRegistry = new ActorRegistry();
