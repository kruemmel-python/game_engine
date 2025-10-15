import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';

export interface DebugStats {
  fps: number;
  frameTime: number;
  objects: number;
  bodies: number;
  timeScale: number;
  collisions: number;
}

export class DebugTools {
  readonly events = new EventBus();
  private stats: DebugStats = {
    fps: 0,
    frameTime: 0,
    objects: 0,
    bodies: 0,
    timeScale: 1,
    collisions: 0,
  };
  private frames = 0;
  private lastSample = performance.now();
  private collisionsThisSecond = 0;

  constructor(private game: Game) {
    this.game.events.on('tick', (payload: any) => this.onTick(payload));
    this.game.events.on('collision', () => this.onCollision());
  }

  getStats(): DebugStats {
    return { ...this.stats };
  }

  private onTick(payload: { dtReal: number; dt: number; timeScale: number }) {
    this.frames += 1;
    const now = performance.now();
    if (now - this.lastSample >= 500) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.lastSample));
      this.frames = 0;
      this.lastSample = now;
    }
    this.stats.frameTime = payload.dtReal * 1000;
    this.stats.objects = this.game.objects.length;
    this.stats.bodies = this.game.world.bodies.length;
    this.stats.timeScale = payload.timeScale;
    this.stats.collisions = this.collisionsThisSecond;
    this.collisionsThisSecond = 0;
    this.events.emit('stats', this.getStats());
  }

  private onCollision() {
    this.collisionsThisSecond += 1;
  }
}
