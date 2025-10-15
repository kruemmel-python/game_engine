import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import { toSceneJSON, type SceneJSON } from '../assets/scene';

const STORAGE_KEY = 'game-engine-collaboration';

export class CollaborationManager {
  readonly events = new EventBus();

  constructor(private game: Game) {}

  saveSnapshot(name: string) {
    const snapshot = toSceneJSON(this.game);
    const data = this.readAll();
    data[name] = snapshot;
    this.writeAll(data);
    this.events.emit('saved', { name, snapshot });
  }

  loadSnapshot(name: string): SceneJSON | undefined {
    const data = this.readAll();
    const snapshot = data[name];
    if (!snapshot) return undefined;
    this.events.emit('loaded', { name, snapshot });
    return snapshot;
  }

  deleteSnapshot(name: string) {
    const data = this.readAll();
    delete data[name];
    this.writeAll(data);
    this.events.emit('deleted', name);
  }

  listSnapshots() {
    return Object.keys(this.readAll());
  }

  exportSnapshot(name: string) {
    const snapshot = this.loadSnapshot(name);
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.events.emit('exported', name);
  }

  importSnapshot(name: string, data: SceneJSON) {
    const store = this.readAll();
    store[name] = data;
    this.writeAll(store);
    this.events.emit('imported', { name, snapshot: data });
  }

  private readAll(): Record<string, SceneJSON> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, SceneJSON>) : {};
    } catch (err) {
      console.warn('CollaborationManager failed to read storage', err);
      return {};
    }
  }

  private writeAll(data: Record<string, SceneJSON>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('CollaborationManager failed to write storage', err);
    }
  }
}
