import { TextureLoader } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../../core/Game';
import { loadGLB } from '../../assets/gltf';
import type { EditorContext, EditorModule } from './types';

type AssetType = 'gltf' | 'texture' | 'audio' | 'json' | 'custom';

type AssetStatus = 'unloaded' | 'loading' | 'loaded' | 'error';

interface AssetRecord<T = unknown> {
  id: string;
  type: AssetType;
  url: string;
  status: AssetStatus;
  data?: T;
  error?: unknown;
  references: Set<object>;
  metadata: Record<string, unknown>;
}

export class AssetModule implements EditorModule {
  readonly id = 'assets';
  readonly label = 'Asset- und Ressourcenverwaltung';

  private records = new Map<string, AssetRecord>();
  private textureLoader = new TextureLoader();

  constructor(private readonly ctx: EditorContext) {}

  dispose(): void {
    this.records.clear();
  }

  register(id: string, url: string, type: AssetType = 'custom', metadata: Record<string, unknown> = {}) {
    if (this.records.has(id)) {
      Object.assign(this.records.get(id)!.metadata, metadata);
      return this.records.get(id)!;
    }
    const record: AssetRecord = {
      id,
      type,
      url,
      status: 'unloaded',
      references: new Set(),
      metadata,
    };
    this.records.set(id, record);
    return record;
  }

  list() {
    return Array.from(this.records.values());
  }

  get<T = unknown>(id: string): AssetRecord<T> | undefined {
    return this.records.get(id) as AssetRecord<T> | undefined;
  }

  async load<T = unknown>(id: string, requester?: object): Promise<AssetRecord<T>> {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Asset '${id}' ist nicht registriert.`);
    }
    if (record.status === 'loaded') {
      if (requester) record.references.add(requester);
      return record as AssetRecord<T>;
    }
    record.status = 'loading';
    try {
      record.data = (await this.loadByType(record.type, record.url, this.ctx.game)) as T;
      record.status = 'loaded';
      record.error = undefined;
      if (requester) record.references.add(requester);
    } catch (err) {
      record.status = 'error';
      record.error = err;
      throw err;
    }
    return record as AssetRecord<T>;
  }

  release(id: string, requester: object) {
    const record = this.records.get(id);
    if (!record) return;
    record.references.delete(requester);
  }

  unloadUnused() {
    for (const record of this.records.values()) {
      if (record.status === 'loaded' && record.references.size === 0) {
        this.disposeAsset(record);
      }
    }
  }

  summarize() {
    let totalMemory = 0;
    const summary = [] as Array<{ id: string; status: AssetStatus; references: number; type: AssetType }>;
    for (const record of this.records.values()) {
      summary.push({
        id: record.id,
        status: record.status,
        references: record.references.size,
        type: record.type,
      });
      if (record.type === 'texture' && record.data && 'image' in (record.data as any)) {
        const texture = record.data as any;
        const image = texture.image as { width?: number; height?: number };
        if (image?.width && image?.height) {
          totalMemory += image.width * image.height * 4;
        }
      }
    }
    return { summary, estimatedMemory: totalMemory };
  }

  private async loadByType(type: AssetType, url: string, game: Game) {
    switch (type) {
      case 'gltf':
        return (await loadGLB(game, url)) as GLTF;
      case 'texture':
        return await new Promise((resolve, reject) =>
          this.textureLoader.load(url, resolve, undefined, reject),
        );
      case 'audio':
        return await new Promise((resolve, reject) =>
          game.audioLoader.load(url, resolve, undefined, reject),
        );
      case 'json':
        return await (await fetch(url)).json();
      default:
        return await (await fetch(url)).blob();
    }
  }

  private disposeAsset(record: AssetRecord) {
    if (record.type === 'texture' && record.data && 'dispose' in (record.data as any)) {
      (record.data as any).dispose();
    }
    record.data = undefined;
    record.status = 'unloaded';
  }
}
