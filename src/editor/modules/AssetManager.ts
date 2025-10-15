import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../../core/Game';
import { loadGLB } from '../../assets/gltf';
import type { Editor } from '../Editor';

type AssetType = 'gltf' | 'texture' | 'audio' | string;

interface AssetRecord<T = unknown> {
  type: AssetType;
  url: string;
  asset: T;
  refs: number;
  dispose?: (asset: T) => void;
  metadata?: Record<string, unknown>;
}

interface Loader<T> {
  load(url: string): Promise<T>;
  dispose?: (asset: T) => void;
  metadata?: Record<string, unknown>;
}

export class EditorAssetManager {
  private loaders = new Map<AssetType, Loader<any>>();
  private cache = new Map<string, AssetRecord<any>>();

  constructor(private editor: Editor, private game: Game) {
    this.registerDefaults();
  }

  registerLoader<T>(type: AssetType, loader: Loader<T>) {
    this.loaders.set(type, loader);
    this.editor.events.emit('assets:loaderRegistered', { type });
  }

  async load<T>(type: AssetType, url: string) {
    const key = `${type}:${url}`;
    const existing = this.cache.get(key);
    if (existing) {
      existing.refs += 1;
      this.editor.events.emit('assets:hit', existing);
      return existing.asset as T;
    }

    const loader = this.loaders.get(type);
    if (!loader) {
      throw new Error(`No loader registered for asset type "${type}"`);
    }

    const asset = await loader.load(url);
    const record: AssetRecord<T> = {
      type,
      url,
      asset,
      refs: 1,
      dispose: loader.dispose,
      metadata: loader.metadata,
    };
    this.cache.set(key, record);
    this.editor.events.emit('assets:loaded', record);
    return asset;
  }

  release(type: AssetType, url: string) {
    const key = `${type}:${url}`;
    const record = this.cache.get(key);
    if (!record) return false;
    record.refs -= 1;
    if (record.refs <= 0) {
      record.dispose?.(record.asset);
      this.cache.delete(key);
      this.editor.events.emit('assets:released', record);
    }
    return true;
  }

  get(type: AssetType, url: string) {
    return this.cache.get(`${type}:${url}`)?.asset;
  }

  list() {
    return Array.from(this.cache.values()).map((record) => ({
      type: record.type,
      url: record.url,
      refs: record.refs,
      metadata: record.metadata,
    }));
  }

  createSnapshot() {
    return this.list();
  }

  async hydrateSnapshot(snapshot: Array<{ type: AssetType; url: string }>) {
    for (const entry of snapshot) {
      await this.load(entry.type, entry.url);
    }
  }

  private registerDefaults() {
    const textureLoader = new THREE.TextureLoader();
    this.registerLoader('texture', {
      load: async (url: string) => textureLoader.loadAsync(url),
      dispose: (tex: THREE.Texture) => tex.dispose(),
    });

    this.registerLoader('audio', {
      load: async (url: string) =>
        await new Promise<AudioBuffer>((resolve, reject) => {
          this.game.audioLoader.load(url, resolve, undefined, reject);
        }),
    });

    this.registerLoader('gltf', {
      load: async (url: string) => loadGLB(this.game, url) as Promise<GLTF>,
      dispose: (gltf: GLTF) => {
        if (gltf.scene) {
          gltf.scene.traverse((node: any) => {
            if (node.isMesh) {
              if (node.geometry) node.geometry.dispose();
              if (Array.isArray(node.material)) {
                node.material.forEach((mat: THREE.Material) => mat.dispose());
              } else if (node.material) {
                node.material.dispose();
              }
            }
          });
        }
        if ((gltf as any).parser?.dracoLoader) {
          (gltf as any).parser.dracoLoader.dispose?.();
        }
      },
    });
  }
}
