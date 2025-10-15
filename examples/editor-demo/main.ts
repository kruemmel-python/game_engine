import * as THREE from 'three';
import { Game } from '../../src/core/Game';
import { GameObject } from '../../src/ecs/GameObject';
import { PlayerController } from '../../src/components/PlayerController';
import { GroundSensor } from '../../src/components/GroundSensor';
import { AnimationSM } from '../../src/components/AnimationSM';
import { CameraFollow } from '../../src/components/CameraFollow';
import { loadGLB } from '../../src/assets/gltf';
import { Editor } from '../../src/editor/Editor';

const container = document.getElementById('app')!;
const game = new Game(container);

// 🔎 Alle GLBs automatisch finden (unterstützt mehrere bekannte Ordnernamen)
const glbMap = import.meta.glob(
  [
    './models/*.{glb,gltf}',
    './model/*.{glb,gltf}',
    '../../models/*.{glb,gltf}',
  ],
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
) as Record<string, string>;

const urls = Object.values(glbMap);
if (urls.length === 0) {
  console.warn(
    'Keine .glb- oder .gltf-Dateien in bekannten Model-Ordnern gefunden.',
  );
}

// Helper: GLB laden und als GameObject anfügen
async function spawnGLB(
  url: string,
  { dynamic = false, name }: { dynamic?: boolean; name?: string } = {},
) {
  try {
    const gltf: any = await loadGLB(game, url);
    const root = gltf.scene as THREE.Object3D;
    const go = new GameObject({
      name: name ?? url.split('/').pop() ?? 'GLB',
      object3D: root,
    });
    (root as any).userData.source = url;
    game.add(go);
    return { go, root, gltf };
  } catch (e) {
    console.error('GLB load failed:', url, e);
    return null;
  }
}

(async () => {
  if (urls.length === 0) return;

  // 1) Erstes Modell als Player (Steuerung/Kamera/ASM)
  const firstUrl = urls[0];
  const res0 = await spawnGLB(firstUrl, { dynamic: true, name: 'Player' });
  if (res0) {
    const { go, root, gltf } = res0;

    // Komponenten für Player
    go.addComponent(new GroundSensor());
    go.addComponent(new PlayerController());
    go.addComponent(
      new AnimationSM({
        root,
        clips: gltf.animations ?? [],
        footstepUrl:
          'https://cdn.jsdelivr.net/gh/AI-Resources/audio/placeholders/step.wav',
      }),
    );

    // Kamera auf Player ausrichten + Follow
    game.frameObject(root);
    const rig = new GameObject({ name: 'CameraRig' });
    (rig as any).addComponent(new CameraFollow({ target: go }));
    game.add(rig);

    // Editor
    const editor = new Editor(game);
    editor.select(go);
    const charactersFolder = editor.sceneManager.createFolder('Characters', '#4ac0ff');
    editor.sceneManager.assignToFolder(go, charactersFolder.id);
    editor.navigation.saveBookmark('PlayerStart');
    editor.ui.setGridVisible(true);
    editor.ui.setSnapSettings({ translate: 0.25, rotate: 5 });
    editor.environment.setAutoPauseOnBlur(true);
    editor.environment.setHemisphereIntensity(0.65);
    editor.simulation.setPlayFromSelection(go);
    editor.simulation.stop();

    editor.events.on('selection:changed', ({ selection }) => {
      if (selection) {
        editor.sceneManager.focus(selection);
      }
    });

    editor.collaboration.saveLocal('autosave');
    (window as any).game = game;
    (window as any).editor = editor;
  }

  // 2) Weitere Modelle als statische Deko spawnen (leicht versetzt)
  for (let i = 1; i < urls.length; i++) {
    const res = await spawnGLB(urls[i], { dynamic: false });
    if (res) {
      const x = (i % 4) * 3;
      const z = Math.floor(i / 4) * 3;
      res.root.position.set(x, 0, z);
    }
  }
})();
