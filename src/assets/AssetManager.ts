import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';

type LoaderFn<T> = (game: Game, url: string) => Promise<T>;

export interface AssetRecord<T = unknown> {
  url: string;
  data?: T;
  status: 'pending' | 'loaded' | 'error';
  error?: unknown;
  lastAccess: number;
}

export class AssetManager {
  readonly events = new EventBus();
  private loaders = new Map<string, LoaderFn<unknown>>();
  private cache = new Map<string, AssetRecord>();

  constructor(private readonly game: Game) {}

  registerLoader<T>(extension: string, loader: LoaderFn<T>) {
    this.loaders.set(extension.toLowerCase(), loader as LoaderFn<unknown>);
  }

  async load<T>(url: string): Promise<T> {
    const key = this.normalize(url);
    const cached = this.cache.get(key);
    if (cached?.status === 'loaded') {
      cached.lastAccess = performance.now();
      return cached.data as T;
    }

    const record: AssetRecord = cached ?? {
      url,
      status: 'pending',
      lastAccess: performance.now(),
    };
    this.cache.set(key, record);
    this.events.emit('asset-loading', record);

    try {
      const loader = this.resolveLoader(url);
      const data = await loader(this.game, url);
      record.data = data;
      record.status = 'loaded';
      record.lastAccess = performance.now();
      this.events.emit('asset-loaded', record);
      return data as T;
    } catch (error) {
      record.status = 'error';
      record.error = error;
      this.events.emit('asset-error', record);
      throw error;
    }
  }

  unload(url: string) {
    const key = this.normalize(url);
    const record = this.cache.get(key);
    if (!record) return;
    this.cache.delete(key);
    this.events.emit('asset-unloaded', record);
  }

  list() {
    return [...this.cache.values()].sort((a, b) => b.lastAccess - a.lastAccess);
  }

  private resolveLoader(url: string) {
    const extension = url.split('.').pop()?.toLowerCase();
    if (!extension) throw new Error(`Cannot infer loader for ${url}`);
    const loader = this.loaders.get(extension);
    if (!loader) throw new Error(`No loader registered for .${extension}`);
    return loader;
  }

  private normalize(url: string) {
    return new URL(url, globalThis.location?.href ?? 'http://localhost/').toString();
  }
}
