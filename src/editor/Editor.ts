import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { SceneManager } from './SceneManager';
import { Inspector } from './Inspector';
import { AssetManager } from '../assets/AssetManager';
import { NavigationToolset } from './NavigationToolset';
import { EnvironmentToolset } from './EnvironmentToolset';
import { SimulationController } from './SimulationController';
import { EditorUI } from './EditorUI';
import { DebugTools } from './DebugTools';
import { CollaborationManager } from './CollaborationManager';

export class Editor {
  readonly gizmo: TransformControls;
  selected?: GameObject;
  readonly sceneManager: SceneManager;
  readonly inspector: Inspector;
  readonly assetManager: AssetManager;
  readonly navigation: NavigationToolset;
  readonly environment: EnvironmentToolset;
  readonly simulation: SimulationController;
  readonly debug: DebugTools;
  readonly collaboration: CollaborationManager;
  readonly ui: EditorUI;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposeFns: Array<() => void> = [];
  private mode: 'translate' | 'rotate' | 'scale' = 'translate';

  constructor(public game: Game) {
    this.gizmo = new TransformControls(game.camera, game.renderer.domElement);
    this.gizmo.visible = false;
    this.gizmo.setMode(this.mode);
    game.scene.add(this.gizmo);

    this.sceneManager = new SceneManager(game);
    this.inspector = new Inspector(game);
    this.assetManager = new AssetManager(game);
    this.simulation = new SimulationController(game);
    this.debug = new DebugTools(game);
    this.navigation = new NavigationToolset(game, this);
    this.environment = new EnvironmentToolset(game);
    this.collaboration = new CollaborationManager(game);
    this.ui = new EditorUI(
      game,
      this.inspector,
      this.simulation,
      this.assetManager,
      this.debug,
      this.collaboration,
      this.sceneManager,
    );

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
    window.addEventListener('keydown', keyHandler);
    this.disposeFns.push(() => window.removeEventListener('keydown', keyHandler));

    this.sceneManager.events.on('removed', (go: GameObject) => {
      if (this.selected === go) {
        this.select(undefined);
      }
    });
  }

  dispose() {
    for (const dispose of this.disposeFns) {
      dispose();
    }
    this.disposeFns = [];
    this.ui.element.remove();
  }

  select(go?: GameObject) {
    this.selected = go;
    this.inspector.inspect(go);
    if (go) {
      this.gizmo.visible = true;
      this.gizmo.setMode(this.mode);
      this.gizmo.attach(go.object3D);
    } else {
      this.gizmo.visible = false;
      this.gizmo.detach();
    }
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
      case 'KeyF':
        this.navigation.focusOnSelection();
        break;
      case 'Space':
        event.preventDefault();
        this.simulation.toggle();
        break;
      case 'KeyG':
        this.environment.showGrid(!this.game.gridHelper.visible);
        break;
      case 'KeyB':
        this.navigation.saveBookmark(`Bookmark ${Date.now()}`);
        break;
    }
  }

  private setMode(mode: 'translate' | 'rotate' | 'scale') {
    if (this.mode === mode) return;
    this.mode = mode;
    this.gizmo.setMode(mode);
  }

  private findGameObject(object: THREE.Object3D | null): GameObject | undefined {
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
