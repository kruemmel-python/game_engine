import * as THREE from 'three';
import type { Game } from '../core/Game';
import { loadGLB } from './gltf';

export type AssetDescriptor = {
  type: 'texture' | 'audio' | 'model';
  url: string;
  name?: string;
};

export class AssetManager {
  private textures = new Map<string, THREE.Texture>();
  private audioBuffers = new Map<string, AudioBuffer>();
  private models = new Map<string, any>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(private game: Game) {}

  has(url: string) {
    return (
      this.textures.has(url) ||
      this.audioBuffers.has(url) ||
      this.models.has(url) ||
      this.pending.has(url)
    );
  }

  async loadTexture(url: string) {
    if (this.textures.has(url)) return this.textures.get(url)!;
    const loader = new THREE.TextureLoader();
    const promise = loader.loadAsync(url).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, tex);
      this.pending.delete(url);
      return tex;
    });
    this.pending.set(url, promise);
    return promise;
  }

  async loadAudio(url: string) {
    if (this.audioBuffers.has(url)) return this.audioBuffers.get(url)!;
    const promise = this.game.audioLoader.loadAsync(url).then((buffer) => {
      this.audioBuffers.set(url, buffer);
      this.pending.delete(url);
      return buffer;
    });
    this.pending.set(url, promise);
    return promise;
  }

  async loadModel(url: string) {
    if (this.models.has(url)) return this.models.get(url);
    const promise = loadGLB(this.game, url).then((result) => {
      this.models.set(url, result);
      this.pending.delete(url);
      return result;
    });
    this.pending.set(url, promise);
    return promise;
  }

  async preload(assets: AssetDescriptor[]) {
    const jobs = assets.map((asset) => {
      switch (asset.type) {
        case 'texture':
          return this.loadTexture(asset.url);
        case 'audio':
          return this.loadAudio(asset.url);
        case 'model':
        default:
          return this.loadModel(asset.url);
      }
    });
    await Promise.all(jobs);
  }

  getLoadingProgress() {
    const pending = this.pending.size;
    const total = pending + this.textures.size + this.audioBuffers.size + this.models.size;
    return total === 0 ? 1 : 1 - pending / total;
  }

  clearCache() {
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
    this.audioBuffers.clear();
    this.models.clear();
    this.pending.clear();
  }
}
