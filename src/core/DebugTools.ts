import type { Game } from './Game';

export interface DebugProbe {
  label: string;
  value: () => number;
}

export interface ProfilerEntry {
  label: string;
  duration: number;
  timestamp: number;
}

export class DebugTools {
  private probes: DebugProbe[] = [];
  private profiler: ProfilerEntry[] = [];

  constructor(private readonly game: Game) {}

  addProbe(label: string, value: () => number) {
    this.probes.push({ label, value });
  }

  measure<T>(label: string, fn: () => T) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    this.profiler.push({ label, duration, timestamp: performance.now() });
    return result;
  }

  captureSnapshot() {
    const objects = this.game.objects.length;
    const bodies = (this.game.world.bodies ?? []).length;
    return {
      timestamp: performance.now(),
      objects,
      bodies,
      rendererInfo: this.game.renderer.info,
    };
  }

  readProbes() {
    return this.probes.map((probe) => ({ label: probe.label, value: probe.value() }));
  }

  readProfiler() {
    return [...this.profiler];
  }

  clearProfiler() {
    this.profiler = [];
  }
}
