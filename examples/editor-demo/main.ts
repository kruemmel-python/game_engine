import * as THREE from 'three';
import { Game } from '../../src/core/Game';
import { GameObject } from '../../src/ecs/GameObject';
import { PlayerController } from '../../src/components/PlayerController';
import { GroundSensor } from '../../src/components/GroundSensor';
import { AnimationSM } from '../../src/components/AnimationSM';
import { CameraFollow } from '../../src/components/CameraFollow';
import { loadGLB } from '../../src/assets/gltf';
import { Editor } from '../../src/editor/Editor';
import { toSceneJSON, loadScene as loadSceneData } from '../../src/assets/scene';
import type { SceneJSON } from '../../src/assets/scene';
import { mountDebugUI } from '../../src/ui/DebugUI';

const container = document.getElementById('app')!;
const game = new Game(container);
const editor = new Editor(game);
let cameraRig: GameObject | undefined;

(window as any).game = game;
(window as any).editor = editor;

setupScenePanel(game, editor);
void mountDebugUI(game, { getCameraRig: () => cameraRig, editor });

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
    cameraRig = rig;
    game.add(rig);

    // Editor
    editor.select(go);
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

function setupScenePanel(game: Game, editor: Editor) {
  const styleId = 'editor-scene-panel-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    .editor-scene-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 40;
      display: grid;
      gap: 8px;
      max-width: 320px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(17, 24, 39, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #e5e7eb;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      box-shadow: 0 18px 30px rgba(0, 0, 0, 0.35);
    }
    .editor-scene-panel h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .editor-scene-panel .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .editor-scene-panel button {
      flex: 1 1 auto;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(59, 130, 246, 0.16);
      color: inherit;
      cursor: pointer;
      transition: filter 0.15s ease;
    }
    .editor-scene-panel button:hover {
      filter: brightness(1.1);
    }
    .editor-scene-panel textarea {
      width: 100%;
      min-height: 120px;
      resize: vertical;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      padding: 8px 10px;
      background: rgba(15, 23, 42, 0.9);
      color: #f8fafc;
      font-family: 'JetBrains Mono', Consolas, 'SFMono-Regular', monospace;
      font-size: 12px;
    }
    .editor-scene-panel input[type="text"] {
      flex: 1 1 160px;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.9);
      color: #f8fafc;
    }
    .editor-scene-panel .status {
      font-size: 12px;
      opacity: 0.9;
    }
    .editor-scene-panel .status[data-state="error"] {
      color: #fca5a5;
    }
    .editor-scene-panel small {
      font-size: 11px;
      opacity: 0.75;
      line-height: 1.4;
    }
    .editor-scene-panel__close {
      position: absolute;
      top: 6px;
      right: 6px;
      border: none;
      background: rgba(15, 23, 42, 0.65);
      color: inherit;
      border-radius: 999px;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
    }
    .editor-scene-panel__close:hover {
      background: rgba(30, 41, 59, 0.85);
    }
    .editor-toggle-stack {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 45;
      pointer-events: none;
    }
    .editor-toggle-button {
      pointer-events: auto;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(30, 64, 175, 0.75);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: filter 0.15s ease;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
    }
    .editor-toggle-button:hover {
      filter: brightness(1.1);
    }
    .editor-toggle-button[data-role="debug"] {
      background: rgba(6, 95, 70, 0.75);
    }
    .editor-toggle-button[data-role="scene"] {
      background: rgba(30, 64, 175, 0.75);
    }
    .editor-scene-panel[data-hidden="true"] {
      display: none;
    }
  `;
    document.head.appendChild(style);
  }

  const panel = document.createElement('div');
  panel.className = 'editor-scene-panel';
  panel.dataset.hidden = 'false';

  const ensureToggleStack = () => {
    let stack = document.querySelector<HTMLDivElement>('.editor-toggle-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'editor-toggle-stack';
      document.body.appendChild(stack);
    }
    return stack;
  };

  const toggleStack = ensureToggleStack();
  const showButton = document.createElement('button');
  showButton.type = 'button';
  showButton.className = 'editor-toggle-button';
  showButton.dataset.role = 'scene';
  showButton.textContent = 'Szene';
  showButton.style.display = 'none';
  toggleStack.appendChild(showButton);

  const setVisible = (visible: boolean) => {
    panel.dataset.hidden = visible ? 'false' : 'true';
    showButton.style.display = visible ? 'none' : 'inline-flex';
  };

  const title = document.createElement('h2');
  title.textContent = 'Szene speichern / laden';
  panel.appendChild(title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'editor-scene-panel__close';
  closeButton.setAttribute('aria-label', 'Szene-Panel ausblenden');
  closeButton.textContent = '×';
  panel.appendChild(closeButton);

  const exportRow = document.createElement('div');
  exportRow.className = 'row';

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'JSON exportieren';
  exportRow.appendChild(exportBtn);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Kopieren';
  exportRow.appendChild(copyBtn);

  panel.appendChild(exportRow);

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Exportierte Szene erscheint hier …';
  panel.appendChild(textarea);

  const loadRow = document.createElement('div');
  loadRow.className = 'row';

  const loadBtn = document.createElement('button');
  loadBtn.textContent = 'Aus Text laden';
  loadRow.appendChild(loadBtn);

  const fileBtn = document.createElement('button');
  fileBtn.textContent = 'JSON-Datei wählen';
  loadRow.appendChild(fileBtn);

  panel.appendChild(loadRow);

  const urlRow = document.createElement('div');
  urlRow.className = 'row';

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'Scene-JSON URL (optional)';
  urlRow.appendChild(urlInput);

  const urlBtn = document.createElement('button');
  urlBtn.textContent = 'URL laden';
  urlRow.appendChild(urlBtn);

  panel.appendChild(urlRow);

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'Bereit.';
  panel.appendChild(status);

  const hint = document.createElement('small');
  hint.textContent = 'Tipp: Die exportierte Datei kannst du unter examples/editor-demo/scene.json ablegen oder per loadScene(game, data) im Spiel laden.';
  panel.appendChild(hint);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  panel.appendChild(fileInput);

  document.body.appendChild(panel);

  let busy = false;

  closeButton.addEventListener('click', () => setVisible(false));
  showButton.addEventListener('click', () => setVisible(true));
  setVisible(true);

  const setStatus = (message: string, state: 'ok' | 'error' = 'ok') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const downloadScene = (json: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearScene = () => {
    editor.select(undefined);
    const toRemove = [...game.objects];
    for (const go of toRemove) {
      game.remove(go);
    }
  };

  const focusFirstObject = () => {
    const first = game.objects.find((obj) => obj.name !== 'CameraRig') ?? game.objects[0];
    if (first) {
      game.frameObject(first.object3D);
      editor.select(first);
    } else {
      editor.select(undefined);
    }
  };

  const applyScene = async (data: SceneJSON) => {
    busy = true;
    setStatus('Szene wird geladen …');
    try {
      clearScene();
      await loadSceneData(game, data);
      focusFirstObject();
      setStatus('Szene geladen.');
    } catch (err) {
      console.error('Scene load failed', err);
      setStatus('Fehler beim Laden der Szene.', 'error');
    } finally {
      busy = false;
    }
  };

  exportBtn.addEventListener('click', () => {
    const json = JSON.stringify(toSceneJSON(game), null, 2);
    textarea.value = json;
    downloadScene(json);
    setStatus('Szene exportiert (Download gestartet).');
  });

  copyBtn.addEventListener('click', async () => {
    if (!textarea.value.trim()) {
      setStatus('Kein Szeneninhalt zum Kopieren.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(textarea.value);
      setStatus('JSON in Zwischenablage kopiert.');
    } catch (err) {
      console.warn('Clipboard copy failed', err);
      setStatus('Zwischenablage nicht verfügbar.', 'error');
    }
  });

  loadBtn.addEventListener('click', async () => {
    if (busy) return;
    if (!textarea.value.trim()) {
      setStatus('Kein JSON zum Laden vorhanden.', 'error');
      return;
    }
    try {
      const data = JSON.parse(textarea.value) as SceneJSON;
      await applyScene(data);
    } catch (err) {
      console.error('Invalid scene JSON', err);
      setStatus('JSON konnte nicht geparst werden.', 'error');
    }
  });

  fileBtn.addEventListener('click', () => {
    if (busy) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async (event) => {
    if (busy) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      textarea.value = text;
      const data = JSON.parse(text) as SceneJSON;
      await applyScene(data);
    } catch (err) {
      console.error('Scene file load failed', err);
      setStatus('Datei konnte nicht geladen werden.', 'error');
    } finally {
      target.value = '';
    }
  });

  urlBtn.addEventListener('click', async () => {
    if (busy) return;
    const url = urlInput.value.trim();
    if (!url) {
      setStatus('Bitte eine URL angeben.', 'error');
      return;
    }
    try {
      setStatus('Lade Szene von URL …');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as SceneJSON;
      textarea.value = JSON.stringify(data, null, 2);
      await applyScene(data);
    } catch (err) {
      console.error('Scene fetch failed', err);
      setStatus('Szene konnte nicht geladen werden.', 'error');
    }
  });
}
