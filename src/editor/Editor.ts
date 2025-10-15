import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { SceneModule } from './modules/SceneModule';
import { InspectorModule } from './modules/InspectorModule';
import { AssetModule } from './modules/AssetModule';
import { NavigationModule } from './modules/NavigationModule';
import { RenderingModule } from './modules/RenderingModule';
import { GameplayModule } from './modules/GameplayModule';
import { UIComfortModule } from './modules/UIComfortModule';
import { DebugModule } from './modules/DebugModule';
import { CollaborationModule } from './modules/CollaborationModule';
import type { EditorContext, EditorModule } from './modules/types';

export class Editor {
  readonly gizmo: TransformControls;
  selected?: GameObject;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposeFns: Array<() => void> = [];
  private gizmoMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private context: EditorContext;

  readonly features = {
    scene: undefined as unknown as SceneModule,
    inspector: undefined as unknown as InspectorModule,
    assets: undefined as unknown as AssetModule,
    navigation: undefined as unknown as NavigationModule,
    rendering: undefined as unknown as RenderingModule,
    gameplay: undefined as unknown as GameplayModule,
    ui: undefined as unknown as UIComfortModule,
    debug: undefined as unknown as DebugModule,
    collaboration: undefined as unknown as CollaborationModule,
  };

  constructor(public game: Game) {
    this.gizmo = new TransformControls(game.camera, game.renderer.domElement);
    this.gizmo.visible = false;
    this.gizmo.setMode(this.gizmoMode);
    game.scene.add(this.gizmo);

    this.gizmo.addEventListener('dragging-changed', (event: any) => {
      game.controls.enabled = !event.value;
    });

    this.context = {
      game,
      select: (go?: GameObject) => this.select(go),
      getSelection: () => this.selected,
    };

    this.features.scene = new SceneModule(this.context);
    this.features.inspector = new InspectorModule(this.context);
    this.features.assets = new AssetModule(this.context);
    this.features.navigation = new NavigationModule(this.context, this);
    this.features.rendering = new RenderingModule(this.context);
    this.features.gameplay = new GameplayModule(this.context);
    this.features.ui = new UIComfortModule();
    this.features.debug = new DebugModule(this.context);
    this.features.collaboration = new CollaborationModule(this.context);

    this.features.ui.registerPanel('scene', 'Szene');
    this.features.ui.registerPanel('inspector', 'Inspector');
    this.features.ui.registerPanel('assets', 'Assets');
    this.features.ui.registerPanel('debug', 'Debug');

    const domElement = game.renderer.domElement;

    const pointerHandler = (event: PointerEvent) => this.onPointerDown(event);
    domElement.addEventListener('pointerdown', pointerHandler);
    this.disposeFns.push(() =>
      domElement.removeEventListener('pointerdown', pointerHandler),
    );

    const keyHandler = (event: KeyboardEvent) => this.onKeyDown(event);
    window.addEventListener('keydown', keyHandler);
    this.disposeFns.push(() => window.removeEventListener('keydown', keyHandler));
  }

  select(go?: GameObject) {
    this.selected = go;
    if (go) {
      this.gizmo.visible = true;
      this.gizmo.setMode(this.gizmoMode);
      this.gizmo.attach(go.object3D);
      this.features.inspector.inspect(go);
      this.features.ui.pushStatus(`Ausgewählt: ${go.name}`);
    } else {
      this.gizmo.visible = false;
      this.gizmo.detach();
      this.features.inspector.inspect(undefined);
    }
  }

  setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
    if (this.gizmoMode === mode) return;
    this.gizmoMode = mode;
    this.gizmo.setMode(mode);
  }

  getGizmoMode() {
    return this.gizmoMode;
  }

  getModules(): EditorModule[] {
    return Object.values(this.features);
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
      this.game.remove(toRemove);
      return;
    }

    switch (event.code) {
      case 'KeyT':
      case 'Digit1':
      case 'Numpad1':
        this.setGizmoMode('translate');
        break;
      case 'KeyR':
      case 'Digit2':
      case 'Numpad2':
        this.setGizmoMode('rotate');
        break;
      case 'KeyS':
      case 'Digit3':
      case 'Numpad3':
        this.setGizmoMode('scale');
        break;
      case 'KeyF':
        this.features.navigation.frameSelection();
        break;
      case 'KeyP':
        this.features.gameplay.togglePlay();
        break;
      case 'KeyG':
        this.features.navigation.toggleGrid();
        break;
    }
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

  dispose() {
    for (const dispose of this.disposeFns) {
      dispose();
    }
    this.disposeFns = [];
    this.features.scene.dispose();
    this.features.inspector.dispose();
    this.features.assets.dispose();
    this.features.navigation.dispose();
    this.features.rendering.dispose();
    this.features.gameplay.dispose();
    this.features.ui.dispose();
    this.features.debug.dispose();
    this.features.collaboration.dispose();
  }
}
