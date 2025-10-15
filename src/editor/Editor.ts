import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { EditorSceneManager } from './modules/SceneManager';
import { EditorInspector } from './modules/Inspector';
import { EditorAssetManager } from './modules/AssetManager';
import { EditorNavigationTools } from './modules/NavigationTools';
import { EditorEnvironmentTools } from './modules/EnvironmentTools';
import { EditorSimulationController } from './modules/SimulationController';
import { EditorUIComfort } from './modules/UIComfort';
import { EditorDebugTools } from './modules/DebugTools';
import { EditorCollaborationHub } from './modules/CollaborationHub';

export class Editor {
  readonly gizmo: TransformControls;
  selected?: GameObject;
  readonly events = new EventBus();
  readonly sceneManager: EditorSceneManager;
  readonly inspector: EditorInspector;
  readonly assets: EditorAssetManager;
  readonly navigation: EditorNavigationTools;
  readonly environment: EditorEnvironmentTools;
  readonly simulation: EditorSimulationController;
  readonly ui: EditorUIComfort;
  readonly debug: EditorDebugTools;
  readonly collaboration: EditorCollaborationHub;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposeFns: Array<() => void> = [];
  private mode: 'translate' | 'rotate' | 'scale' = 'translate';

  constructor(public game: Game) {
    this.gizmo = new TransformControls(game.camera, game.renderer.domElement);
    this.gizmo.visible = false;
    this.gizmo.setMode(this.mode);
    game.scene.add(this.gizmo);

    this.sceneManager = new EditorSceneManager(this, game);
    this.inspector = new EditorInspector(this, game);
    this.assets = new EditorAssetManager(this, game);
    this.navigation = new EditorNavigationTools(this, game);
    this.environment = new EditorEnvironmentTools(this, game);
    this.simulation = new EditorSimulationController(this, game);
    this.ui = new EditorUIComfort(this, game);
    this.debug = new EditorDebugTools(this, game);
    this.collaboration = new EditorCollaborationHub(this, game);

    this.gizmo.addEventListener('dragging-changed', (event: any) => {
      game.controls.enabled = !event.value;
    });

    const domElement = game.renderer.domElement;

    const pointerHandler = (event: PointerEvent) => this.onPointerDown(event);
    domElement.addEventListener('pointerdown', pointerHandler);
    this.disposeFns.push(() =>
      domElement.removeEventListener('pointerdown', pointerHandler),
    );

    const keyHandler = (event: KeyboardEvent) => this.onKeyDown(event);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', keyHandler);
      this.disposeFns.push(() =>
        window.removeEventListener('keydown', keyHandler),
      );
    }

    this.events.emit('editor:ready', undefined);
  }

  dispose() {
    for (const dispose of this.disposeFns) {
      dispose();
    }
    this.disposeFns = [];
    this.gizmo.dispose();
    this.environment.dispose();
    this.ui.dispose();
    this.collaboration.dispose();
  }

  select(go?: GameObject) {
    this.selected = go;
    if (go) {
      this.gizmo.visible = true;
      this.gizmo.setMode(this.mode);
      this.gizmo.attach(go.object3D);
    } else {
      this.gizmo.visible = false;
      this.gizmo.detach();
    }
    this.events.emit('selection:changed', { selection: go ?? null });
    this.collaboration.broadcastSelection();
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    if (this.gizmo.dragging) return;

    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const intersections = this.raycaster.intersectObjects(
      this.game.scene.children,
      true,
    );

    for (const hit of intersections) {
      if (this.isGizmoObject(hit.object)) {
        return;
      }

      const go = this.findGameObject(hit.object);
      if (go) {
        this.select(go);
        this.events.emit('editor:objectPicked', go);
        return;
      }
    }

    this.select(undefined);
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Delete' && this.selected) {
      const toRemove = this.selected;
      this.select(undefined);
      this.sceneManager.remove(toRemove);
      return;
    }

    switch (event.code) {
      case 'KeyT':
      case 'Digit1':
      case 'Numpad1':
        this.setMode('translate');
        break;
      case 'KeyR':
      case 'Digit2':
      case 'Numpad2':
        this.setMode('rotate');
        break;
      case 'KeyS':
      case 'Digit3':
      case 'Numpad3':
        this.setMode('scale');
        break;
    }
  }

  private setMode(mode: 'translate' | 'rotate' | 'scale') {
    if (this.mode === mode) return;
    this.mode = mode;
    this.gizmo.setMode(mode);
    this.events.emit('gizmo:mode', mode);
  }

  findGameObject(object: THREE.Object3D | null): GameObject | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
      const go = current.userData?.__gameObject as GameObject | undefined;
      if (go) {
        return go;
      }
      current = current.parent ?? null;
    }
    return undefined;
  }

  private isGizmoObject(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === this.gizmo) {
        return true;
      }
      current = current.parent ?? null;
    }
    return false;
  }
}
