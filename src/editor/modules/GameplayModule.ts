import type { EditorContext, EditorModule } from './types';

type SimulationState = 'stopped' | 'playing' | 'paused';

export class GameplayModule implements EditorModule {
  readonly id = 'gameplay';
  readonly label = 'Gameplay & Simulation';

  private state: SimulationState = 'stopped';
  private timeScale = 1;
  private stepListeners = new Set<(dt: number) => void>();

  constructor(private readonly ctx: EditorContext) {}

  dispose(): void {
    this.stop();
    this.stepListeners.clear();
  }

  play() {
    this.state = 'playing';
    this.ctx.game.paused = false;
  }

  pause() {
    if (this.state === 'stopped') return;
    this.state = 'paused';
    this.ctx.game.paused = true;
  }

  stop() {
    this.state = 'stopped';
    this.ctx.game.paused = true;
  }

  togglePlay() {
    if (this.state === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  stepOnce(dt = 1 / 60) {
    this.ctx.game.world.step(dt * this.timeScale);
    for (const listener of this.stepListeners) listener(dt * this.timeScale);
  }

  setTimeScale(scale: number) {
    this.timeScale = Math.max(0.01, scale);
  }

  getTimeScale() {
    return this.timeScale;
  }

  getState() {
    return this.state;
  }

  onStep(callback: (dt: number) => void) {
    this.stepListeners.add(callback);
    return () => this.stepListeners.delete(callback);
  }
}
