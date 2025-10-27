import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';

export class SimulationController {
  readonly events = new EventBus();
  private playing = true;

  constructor(private game: Game) {}

  isPlaying() {
    return this.playing;
  }

  play() {
    this.playing = true;
    this.game.paused = false;
    this.events.emit('state', { playing: true });
  }

  pause() {
    this.playing = false;
    this.game.paused = true;
    this.events.emit('state', { playing: false });
  }

  toggle() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  step() {
    if (this.playing) return;
    this.game.stepSimulation(this.game.fixedDelta * this.game.timeScale);
    this.events.emit('step', undefined);
  }

  setTimeScale(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this.game.timeScale = value;
    this.events.emit('timeScale', value);
  }

  getTimeScale() {
    return this.game.timeScale;
  }
}
