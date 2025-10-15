import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import type { Game } from '../core/Game';

export function makeGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(
    'https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/',
  );
  loader.setDRACOLoader(draco);
  (loader as any).setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export async function loadGLB(game: Game, url: string) {
  return await new Promise((resolve, reject) =>
    makeGLTFLoader().load(
      url,
      resolve,
      // optional progress logging
      (ev) => {
        if (ev.total) {
          const pct = ((ev.loaded / ev.total) * 100).toFixed(1);
          // eslint-disable-next-line no-console
          console.log(`Loading ${url}: ${pct}%`);
        }
      },
      (err) => {
        console.error('GLTFLoader error for', url, err);
        reject(err);
      },
    ),
  );
}
