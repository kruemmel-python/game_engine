import { toSceneJSON } from '../../assets/scene';
import type { EditorContext, EditorModule } from './types';

interface Snapshot {
  id: string;
  label: string;
  created: number;
  payload: unknown;
}

export class CollaborationModule implements EditorModule {
  readonly id = 'collaboration';
  readonly label = 'Kollaboration & Daten';

  private snapshots: Snapshot[] = [];

  constructor(private readonly ctx: EditorContext) {}

  dispose(): void {
    this.snapshots = [];
  }

  exportScene() {
    return JSON.stringify(toSceneJSON(this.ctx.game), null, 2);
  }

  createSnapshot(label: string) {
    const id = this.makeId();
    const payload = toSceneJSON(this.ctx.game);
    const snapshot: Snapshot = { id, label, created: Date.now(), payload };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 20) {
      this.snapshots.shift();
    }
    return snapshot;
  }

  listSnapshots() {
    return [...this.snapshots];
  }

  removeSnapshot(id: string) {
    const index = this.snapshots.findIndex((snap) => snap.id === id);
    if (index >= 0) {
      this.snapshots.splice(index, 1);
    }
  }

  async shareSnapshot(id: string, endpoint: string) {
    const snapshot = this.snapshots.find((snap) => snap.id === id);
    if (!snapshot) throw new Error('Snapshot nicht gefunden');
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  }

  private makeId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `snapshot-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
