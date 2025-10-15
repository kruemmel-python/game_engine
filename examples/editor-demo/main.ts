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
let cameraMode: 'player' | 'viewer' = 'player';
let cameraToggleButton: HTMLButtonElement | undefined;

(window as any).game = game;
(window as any).editor = editor;

setupScenePanel(game, editor);
setupOutlinerPanel(game, editor, { getCameraRig: () => cameraRig });
cameraToggleButton = createCameraToggleButton();
applyCameraMode();
void mountDebugUI(game, { getCameraRig: () => cameraRig, editor }).then(() =>
  applyCameraMode(),
);

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
    applyCameraMode();

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
      position: relative;
      z-index: 1;
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
    .editor-toggle-button[data-role="camera"] {
      background: rgba(14, 165, 233, 0.75);
    }
    .editor-toggle-button[data-role="outliner"] {
      background: rgba(59, 130, 246, 0.75);
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

  const dock = ensurePanelDock();
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

  dock.appendChild(panel);

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
    cameraRig = undefined;
    applyCameraMode();
    const toRemove = game.objects.filter((go) => !go.editorOnly);
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

function setupOutlinerPanel(
  game: Game,
  editor: Editor,
  options: { getCameraRig?: () => GameObject | undefined } = {},
) {
  const styleId = 'editor-outliner-panel-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .editor-outliner-panel {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 220px;
        max-width: 260px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(17, 24, 39, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e5e7eb;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        box-shadow: 0 18px 30px rgba(0, 0, 0, 0.35);
      }
      .editor-outliner-panel[data-hidden="true"] {
        display: none;
      }
      .editor-outliner-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .editor-outliner-panel h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .editor-outliner-panel__close {
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
      .editor-outliner-panel__close:hover {
        background: rgba(30, 41, 59, 0.85);
      }
      .editor-outliner-groups {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .editor-outliner-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .editor-outliner-section h3 {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #93c5fd;
      }
      .editor-outliner-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .editor-outliner-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: rgba(30, 41, 59, 0.62);
        color: inherit;
        cursor: pointer;
        transition: background 0.15s ease, border 0.15s ease;
      }
      .editor-outliner-item .icon {
        font-size: 14px;
        width: 16px;
        text-align: center;
      }
      .editor-outliner-item:hover {
        background: rgba(59, 130, 246, 0.18);
        border-color: rgba(59, 130, 246, 0.45);
      }
      .editor-outliner-item[data-selected="true"] {
        background: rgba(59, 130, 246, 0.32);
        border-color: rgba(96, 165, 250, 0.85);
      }
      .editor-outliner-empty {
        font-size: 11px;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);
  }

  const dock = ensurePanelDock();
  const toggleStack = ensureToggleStack();

  const panel = document.createElement('div');
  panel.className = 'editor-outliner-panel';
  panel.dataset.hidden = 'false';
  dock.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'editor-outliner-panel__header';
  panel.appendChild(header);

  const title = document.createElement('h2');
  title.textContent = 'Objekte';
  header.appendChild(title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'editor-outliner-panel__close';
  closeButton.setAttribute('aria-label', 'Objekt-Panel ausblenden');
  closeButton.textContent = '×';
  header.appendChild(closeButton);

  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'editor-outliner-groups';
  panel.appendChild(groupsContainer);

  const showButton = document.createElement('button');
  showButton.type = 'button';
  showButton.className = 'editor-toggle-button';
  showButton.dataset.role = 'outliner';
  showButton.textContent = 'Objekte';
  showButton.style.display = 'none';
  toggleStack.appendChild(showButton);

  const setVisible = (visible: boolean) => {
    panel.dataset.hidden = visible ? 'false' : 'true';
    showButton.style.display = visible ? 'none' : 'inline-flex';
  };

  closeButton.addEventListener('click', () => setVisible(false));
  showButton.addEventListener('click', () => setVisible(true));
  setVisible(true);

  type GroupKey = 'players' | 'cameras' | 'lights' | 'objects';
  type OutlinerEntry = { go: GameObject; label: string; icon: string };

  const groupMeta: Record<GroupKey, { title: string; empty: string }> = {
    players: { title: 'Spieler', empty: 'Keine Spieler gefunden.' },
    cameras: { title: 'Kameras', empty: 'Keine Kameras verfügbar.' },
    lights: { title: 'Beleuchtung', empty: 'Keine Lichter verfügbar.' },
    objects: { title: 'Objekte', empty: 'Weitere Objekte erscheinen hier.' },
  };

  const itemElements = new Map<GameObject, HTMLButtonElement>();

  const buildEntries = () => {
    const groups: Record<GroupKey, OutlinerEntry[]> = {
      players: [],
      cameras: [],
      lights: [],
      objects: [],
    };
    const used = new Set<GameObject>();

    const push = (
      go: GameObject | undefined,
      label: string,
      group: GroupKey,
      icon: string,
    ) => {
      if (!go) return;
      if (group !== 'objects' && used.has(go)) return;
      groups[group].push({ go, label, icon });
      used.add(go);
    };

    for (const go of game.objects) {
      if (go.editorOnly) continue;
      if (/player/i.test(go.name)) {
        push(go, go.name, 'players', '🚶');
      }
    }

    const rig = options.getCameraRig?.();
    if (rig) {
      push(rig, 'Player Kamera', 'cameras', '🎥');
    }

    const viewer = editor.getViewerHandle();
    if (viewer) {
      push(viewer, viewer.name || 'Viewer Kamera', 'cameras', '🎥');
    }

    const keyLight = game.editorHandles.keyLight?.go;
    if (keyLight) {
      push(keyLight, keyLight.name || 'Key Light', 'lights', '💡');
    }
    const fillLight = game.editorHandles.fillLight?.go;
    if (fillLight) {
      push(fillLight, fillLight.name || 'Fill Light', 'lights', '💡');
    }

    for (const go of game.objects) {
      if (go.editorOnly) continue;
      if (used.has(go)) continue;
      if (go.name === 'CameraRig') continue;
      const label = go.name || 'Objekt';
      groups.objects.push({ go, label, icon: '🧱' });
    }

    (Object.keys(groups) as GroupKey[]).forEach((key) => {
      groups[key].sort((a, b) => a.label.localeCompare(b.label, 'de'));
    });

    return groups;
  };

  const updateSelectionHighlight = () => {
    for (const [go, element] of itemElements) {
      element.dataset.selected = editor.selected === go ? 'true' : 'false';
    }
  };

  const render = () => {
    const groups = buildEntries();
    itemElements.clear();
    groupsContainer.innerHTML = '';

    (Object.keys(groupMeta) as GroupKey[]).forEach((key) => {
      const section = document.createElement('section');
      section.className = 'editor-outliner-section';

      const heading = document.createElement('h3');
      heading.textContent = groupMeta[key].title;
      section.appendChild(heading);

      const entries = groups[key];
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'editor-outliner-empty';
        empty.textContent = groupMeta[key].empty;
        section.appendChild(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'editor-outliner-list';
        for (const entry of entries) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'editor-outliner-item';
          button.innerHTML = `
            <span class="icon">${entry.icon}</span>
            <span class="label">${entry.label}</span>
          `;
          button.addEventListener('click', () => editor.select(entry.go));
          list.appendChild(button);
          itemElements.set(entry.go, button);
        }
        section.appendChild(list);
      }

      groupsContainer.appendChild(section);
    });

    updateSelectionHighlight();
  };

  editor.onSelectionChanged(() => updateSelectionHighlight());
  game.events.on('object-added', () => render());
  game.events.on('object-removed', () => render());

  render();
}

function ensureToggleStack() {
  let stack = document.querySelector<HTMLDivElement>('.editor-toggle-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'editor-toggle-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function ensurePanelDock() {
  let dock = document.querySelector<HTMLDivElement>('.editor-panel-dock');
  if (!dock) {
    const styleId = 'editor-panel-dock-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .editor-panel-dock {
          position: fixed;
          top: 16px;
          right: 16px;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 12px;
          z-index: 44;
          pointer-events: none;
          max-width: min(100vw - 32px, 960px);
        }
        .editor-panel-dock > * {
          pointer-events: auto;
        }
      `;
      document.head.appendChild(style);
    }
    dock = document.createElement('div');
    dock.className = 'editor-panel-dock';
    document.body.appendChild(dock);
  }
  return dock;
}

function createCameraToggleButton() {
  const stack = ensureToggleStack();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-toggle-button';
  button.dataset.role = 'camera';
  button.addEventListener('click', () => toggleCameraMode());
  stack.appendChild(button);
  return button;
}

function refreshCameraToggleButton(hasFollow: boolean) {
  if (!cameraToggleButton) return;
  const isPlayer = cameraMode === 'player';
  cameraToggleButton.disabled = !hasFollow;
  cameraToggleButton.textContent = isPlayer ? 'Kamera: Player' : 'Kamera: Viewer';
  cameraToggleButton.title = hasFollow
    ? isPlayer
      ? 'Zur Viewer-Kamera wechseln (C)'
      : 'Zur Player-Kamera wechseln (C)'
    : 'Keine Follow-Kamera verfügbar.';
}

function getCameraFollow() {
  const rig = cameraRig;
  if (!rig) return undefined;
  return rig.components.find((comp): comp is CameraFollow => comp instanceof CameraFollow);
}

function alignOrbitTarget(follow: CameraFollow) {
  const target = follow.target as GameObject | undefined;
  if (!target) return;
  const pos = target.object3D.position;
  game.controls.target.copy(pos);
  game.controls.update();
}

function applyCameraMode() {
  const follow = getCameraFollow();
  const hasFollow = !!follow;
  if (follow) {
    if (cameraMode === 'player') {
      follow.setActive(true);
    } else {
      follow.setActive(false);
      alignOrbitTarget(follow);
    }
  }
  refreshCameraToggleButton(hasFollow);
  window.dispatchEvent(
    new CustomEvent('editor-camera-mode-changed', {
      detail: { mode: cameraMode, hasFollow },
    }),
  );
}

function setCameraMode(mode: 'player' | 'viewer') {
  if (cameraMode === mode) {
    applyCameraMode();
    return;
  }
  cameraMode = mode;
  applyCameraMode();
}

function toggleCameraMode() {
  setCameraMode(cameraMode === 'player' ? 'viewer' : 'player');
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT'
  );
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyC' || event.repeat) return;
  if (isEditableTarget(event.target)) return;
  toggleCameraMode();
});

window.addEventListener('editor-request-camera-mode', (event) => {
  const detail = (event as CustomEvent<{ mode?: 'player' | 'viewer' }>).detail;
  if (!detail?.mode) return;
  setCameraMode(detail.mode);
});
