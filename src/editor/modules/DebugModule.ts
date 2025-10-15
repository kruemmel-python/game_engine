import type { EditorContext, EditorModule } from './types';

type LogLevel = 'info' | 'warn' | 'error';

interface DebugEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: unknown;
}

export class DebugModule implements EditorModule {
  readonly id = 'debug';
  readonly label = 'Debugging, Analyse & Tools';

  private logs: DebugEntry[] = [];
  private profiling = false;
  private profileSamples: number[] = [];
  private unsubscribeCollision?: () => void;

  constructor(private readonly ctx: EditorContext) {
    this.unsubscribeCollision = this.ctx.game.events.on('collision', (payload: any) => {
      this.addLog('info', 'Collision', payload);
    });
  }

  dispose(): void {
    this.logs = [];
    this.profileSamples = [];
    this.profiling = false;
    this.unsubscribeCollision?.();
  }

  addLog(level: LogLevel, message: string, context?: unknown) {
    const timestamp =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.logs.push({ timestamp, level, message, context });
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  listLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  startProfiling() {
    if (this.profiling) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.addLog('warn', 'Profiling nicht verfügbar (kein requestAnimationFrame).');
      return;
    }
    this.profiling = true;
    this.profileSamples = [];
    const frame = (time: number) => {
      if (!this.profiling) return;
      this.profileSamples.push(time);
      if (this.profileSamples.length > 120) {
        this.profileSamples.shift();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stopProfiling() {
    this.profiling = false;
  }

  getAverageFrameTime() {
    if (this.profileSamples.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < this.profileSamples.length; i++) {
      total += this.profileSamples[i] - this.profileSamples[i - 1];
    }
    return total / (this.profileSamples.length - 1);
  }

  exportDiagnostics() {
    return {
      logs: this.listLogs(),
      averageFrameTime: this.getAverageFrameTime(),
      objectCount: this.ctx.game.objects.length,
      physicsBodies: this.ctx.game.world.bodies.length,
    };
  }
}
