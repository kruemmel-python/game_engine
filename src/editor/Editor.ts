import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';

type HandleHooks = {
  onTick?: () => void;
  onObjectChange?: () => void;
};

export class Editor {
  readonly gizmo: TransformControls;
  selected?: GameObject;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposeFns: Array<() => void> = [];
  private mode: 'translate' | 'rotate' | 'scale' = 'translate';
  private originalTransforms = new WeakMap<
    GameObject,
    {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      bodyPosition?: THREE.Vector3;
      bodyQuaternion?: THREE.Quaternion;
    }
  >();
  private transformHud?: HTMLDivElement;
  private hudLoop?: number;
  private hudCache = '';
  private composer?: EffectComposer;
  private outlinePass?: OutlinePass;
  private selectionListeners = new Set<(selection?: GameObject) => void>();
  private restoreRender?: () => void;
  private restoreCameraCollision?: () => void;
  private handleEntries: Array<{ go: GameObject; hooks: HandleHooks }> = [];
  private handleHookMap = new WeakMap<GameObject, HandleHooks>();
  private viewerHandle?: GameObject;
  private viewerHandleData?: { target: THREE.Object3D; line: THREE.Line };
  private viewerHelper?: THREE.CameraHelper;
  private tmpVecA = new THREE.Vector3();
  private tmpVecB = new THREE.Vector3();

  constructor(public game: Game) {
    this.game.setCameraCollisionEnabled(false);
    this.restoreCameraCollision = () => this.game.setCameraCollisionEnabled(true);
    this.gizmo = new TransformControls(game.camera, game.renderer.domElement);
    this.gizmo.visible = false;
    this.gizmo.setMode(this.mode);
    game.scene.add(this.gizmo);

    this.setupOutlinePass();

    this.gizmo.addEventListener('dragging-changed', (event: any) => {
      game.controls.enabled = !event.value;
    });
    this.gizmo.addEventListener('change', () => this.updateTransformHud());
    this.gizmo.addEventListener('objectChange', () => {
      if (!this.selected) return;
      this.syncBodyToObject(this.selected);
      const hooks = this.handleHookMap.get(this.selected);
      hooks?.onObjectChange?.();
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

    this.setupDefaultHandles();

    this.transformHud = this.createTransformHud();
    const loop = () => {
      this.tickHandles();
      this.updateTransformHud();
      this.hudLoop = requestAnimationFrame(loop);
    };
    this.hudLoop = requestAnimationFrame(loop);
  }

  dispose() {
    for (const dispose of this.disposeFns) {
      dispose();
    }
    this.disposeFns = [];
    if (this.restoreRender) {
      this.restoreRender();
      this.restoreRender = undefined;
    }
    if (this.restoreCameraCollision) {
      this.restoreCameraCollision();
      this.restoreCameraCollision = undefined;
    }
    if (this.viewerHandle) {
      this.game.remove(this.viewerHandle);
      this.viewerHandle = undefined;
    }
    if (this.viewerHelper) {
      this.game.scene.remove(this.viewerHelper);
      this.viewerHelper.dispose();
      this.viewerHelper = undefined;
    }
    this.viewerHandleData = undefined;
    this.handleEntries = [];
    this.handleHookMap = new WeakMap();
    this.composer?.dispose();
    this.composer = undefined;
    this.outlinePass = undefined;
    this.selectionListeners.clear();
    if (this.hudLoop !== undefined) {
      cancelAnimationFrame(this.hudLoop);
      this.hudLoop = undefined;
    }
    this.transformHud?.remove();
    this.transformHud = undefined;
  }

  select(go?: GameObject) {
    this.selected = go;
    if (go) {
      this.rememberOriginal(go);
      this.gizmo.visible = true;
      this.gizmo.setMode(this.mode);
      this.gizmo.attach(go.object3D);
    } else {
      this.gizmo.visible = false;
      this.gizmo.detach();
    }
    this.updateOutlineSelection();
    for (const listener of this.selectionListeners) {
      listener(go);
    }
    this.updateTransformHud();
  }

  onSelectionChanged(listener: (selection?: GameObject) => void) {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  getViewerHandle() {
    return this.viewerHandle;
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
      case 'KeyF':
        this.resetSelectedTransform();
        break;
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
  }

  private rememberOriginal(go: GameObject) {
    if (this.originalTransforms.has(go)) return;
    const data = {
      position: go.object3D.position.clone(),
      quaternion: go.object3D.quaternion.clone(),
      scale: go.object3D.scale.clone(),
      bodyPosition: go.body
        ? new THREE.Vector3(go.body.position.x, go.body.position.y, go.body.position.z)
        : undefined,
      bodyQuaternion: go.body
        ? new THREE.Quaternion(
            go.body.quaternion.x,
            go.body.quaternion.y,
            go.body.quaternion.z,
            go.body.quaternion.w,
          )
        : undefined,
    };
    this.originalTransforms.set(go, data);
  }

  private setupDefaultHandles() {
    const { keyLight, fillLight } = this.game.editorHandles;
    if (keyLight) {
      this.registerHandle(keyLight.go, {
        onTick: () => keyLight.helper.update(),
        onObjectChange: () => keyLight.helper.update(),
      });
    }
    if (fillLight) {
      this.registerHandle(fillLight.go, {
        onTick: () => fillLight.helper.update(),
        onObjectChange: () => fillLight.helper.update(),
      });
    }

    this.createViewerCameraHandle();
  }

  private registerHandle(go: GameObject, hooks: HandleHooks) {
    this.handleEntries.push({ go, hooks });
    this.handleHookMap.set(go, hooks);
  }

  private tickHandles() {
    for (const entry of this.handleEntries) {
      entry.hooks.onTick?.();
    }
  }

  private createViewerCameraHandle() {
    if (this.viewerHandle) return;

    const root = new THREE.Object3D();
    root.name = 'Viewer Camera';

    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.45, 18),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      }),
    );
    body.rotation.x = Math.PI / 2;
    body.userData.__editorHelper = true;
    root.add(body);

    const pivot = new THREE.Object3D();
    root.add(pivot);

    const target = new THREE.Object3D();
    target.name = 'Viewer Camera Target';
    pivot.add(target);

    const targetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      }),
    );
    targetMesh.userData.__editorHelper = true;
    target.add(targetMesh);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.userData.__editorHelper = true;
    pivot.add(line);

    const helper = new THREE.CameraHelper(this.game.camera);
    helper.userData.__editorHelper = true;
    this.game.scene.add(helper);
    this.viewerHelper = helper;

    const go = new GameObject({ name: 'Viewer Camera', object3D: root, editorOnly: true });
    this.game.add(go);
    this.viewerHandle = go;
    this.viewerHandleData = { target, line };

    this.registerHandle(go, {
      onTick: () => this.updateViewerHandleFromCamera(),
      onObjectChange: () => this.syncCameraToViewerHandle(),
    });

    this.updateViewerHandleFromCamera(true);
  }

  private updateViewerHandleFromCamera(force = false) {
    if (!this.viewerHandle || !this.viewerHandleData) return;
    if (!force && this.selected === this.viewerHandle && this.gizmo.dragging) return;

    const camera = this.game.camera;
    const target = this.game.controls.target;
    const distance = Math.max(0.5, camera.position.distanceTo(target));

    this.viewerHandle.object3D.position.copy(camera.position);
    this.viewerHandle.object3D.lookAt(target);
    this.viewerHandleData.target.position.set(0, 0, -distance);
    this.updateViewerLine(distance);
    this.viewerHelper?.update();
  }

  private syncCameraToViewerHandle() {
    if (!this.viewerHandle || !this.viewerHandleData) return;

    const worldPos = this.tmpVecA;
    const targetPos = this.tmpVecB;
    this.viewerHandle.object3D.updateMatrixWorld(true);
    this.viewerHandle.object3D.getWorldPosition(worldPos);
    this.viewerHandleData.target.updateMatrixWorld(true);
    this.viewerHandleData.target.getWorldPosition(targetPos);

    this.game.camera.position.copy(worldPos);
    this.game.controls.target.copy(targetPos);
    this.game.controls.update();
    this.game.invalidateCameraCollision();

    this.updateViewerHandleFromCamera(true);
  }

  private updateViewerLine(distance: number) {
    if (!this.viewerHandleData) return;
    const geometry = this.viewerHandleData.line.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(1, 0, 0, -distance);
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  private resetSelectedTransform() {
    const go = this.selected;
    if (!go) return;
    const original = this.originalTransforms.get(go);
    if (!original) return;

    go.object3D.position.copy(original.position);
    go.object3D.quaternion.copy(original.quaternion);
    go.object3D.scale.copy(original.scale);
    go.object3D.updateMatrixWorld(true);

    if (go.body) {
      const targetPos = original.bodyPosition ?? original.position;
      const targetQuat = original.bodyQuaternion ?? original.quaternion;
      go.body.position.set(targetPos.x, targetPos.y, targetPos.z);
      if ((go.body as any).interpolatedPosition) {
        (go.body as any).interpolatedPosition.set(targetPos.x, targetPos.y, targetPos.z);
      }
      go.body.velocity.set(0, 0, 0);
      go.body.angularVelocity.set(0, 0, 0);
      go.body.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
      if ((go.body as any).interpolatedQuaternion) {
        (go.body as any).interpolatedQuaternion.set(
          targetQuat.x,
          targetQuat.y,
          targetQuat.z,
          targetQuat.w,
        );
      }
      this.game.invalidateCameraCollision();
    }

    this.gizmo.attach(go.object3D);
    this.gizmo.updateMatrixWorld(true);
    const hooks = this.handleHookMap.get(go);
    hooks?.onObjectChange?.();
    hooks?.onTick?.();
    this.updateTransformHud(true);
  }

  private syncBodyToObject(go: GameObject) {
    if (!go.body) return;
    const pos = go.object3D.position;
    go.body.position.set(pos.x, pos.y, pos.z);
    if ((go.body as any).interpolatedPosition) {
      (go.body as any).interpolatedPosition.set(pos.x, pos.y, pos.z);
    }
    const quat = go.object3D.quaternion;
    go.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    if ((go.body as any).interpolatedQuaternion) {
      (go.body as any).interpolatedQuaternion.set(
        quat.x,
        quat.y,
        quat.z,
        quat.w,
      );
    }
    go.body.velocity.set(0, 0, 0);
    go.body.angularVelocity.set(0, 0, 0);
    this.game.invalidateCameraCollision();
  }

  private createTransformHud() {
    const hud = document.createElement('div');
    hud.className = 'editor-transform-hud';
    const parent = this.game.container || this.game.renderer.domElement.parentElement;
    (parent ?? document.body).appendChild(hud);
    return hud;
  }

  private setupOutlinePass() {
    const size = new THREE.Vector2();
    this.game.renderer.getSize(size);
    const composer = new EffectComposer(this.game.renderer);
    composer.setSize(size.x, size.y);
    composer.setPixelRatio(this.game.renderer.getPixelRatio());
    const renderPass = new RenderPass(this.game.scene, this.game.camera);
    const outlinePass = new OutlinePass(new THREE.Vector2(size.x, size.y), this.game.scene, this.game.camera);
    outlinePass.edgeStrength = 3.5;
    outlinePass.edgeThickness = 1.0;
    outlinePass.visibleEdgeColor.setRGB(0.3, 0.7, 1.0);
    outlinePass.hiddenEdgeColor.setRGB(0.07, 0.16, 0.3);
    composer.addPass(renderPass);
    composer.addPass(outlinePass);
    const previousRender = this.game.renderScene;
    this.game.renderScene = () => composer.render();
    this.restoreRender = () => {
      this.game.renderScene = previousRender;
    };
    const resize = () => {
      const newSize = new THREE.Vector2();
      this.game.renderer.getSize(newSize);
      composer.setSize(newSize.x, newSize.y);
      outlinePass.setSize(newSize.x, newSize.y);
      composer.setPixelRatio(this.game.renderer.getPixelRatio());
    };
    addEventListener('resize', resize);
    this.disposeFns.push(() => removeEventListener('resize', resize));
    this.composer = composer;
    this.outlinePass = outlinePass;
    this.disposeFns.push(() => {
      outlinePass.selectedObjects = [];
    });
  }

  private updateOutlineSelection() {
    if (!this.outlinePass) return;
    this.outlinePass.selectedObjects = this.selected ? [this.selected.object3D] : [];
  }

  private updateTransformHud(force = false) {
    if (!this.transformHud) return;
    const go = this.selected;
    let content = '';
    if (!go) {
      content = `
        <div class="label">Kein Objekt ausgewählt</div>
        <div class="hint">Klicke auf ein Mesh, um es zu bearbeiten.</div>
      `.trim();
    } else {
      const pos = go.object3D.position;
      const rot = new THREE.Euler().setFromQuaternion(go.object3D.quaternion, 'XYZ');
      const scale = go.object3D.scale;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;
      const fmt = (value: number) => (Math.abs(value) < 1e-3 ? '0.00' : value.toFixed(2));
      const fmtDeg = (value: number) => {
        const deg = toDeg(value);
        return Math.abs(deg) < 1e-2 ? '0.00' : deg.toFixed(2);
      };
      content = `
        <div class="label">${go.name ?? 'GameObject'}</div>
        <pre>
Pos   X ${fmt(pos.x)}  Y ${fmt(pos.y)}  Z ${fmt(pos.z)}
Rot   X ${fmtDeg(rot.x)}°  Y ${fmtDeg(rot.y)}°  Z ${fmtDeg(rot.z)}°
Scale X ${fmt(scale.x)}  Y ${fmt(scale.y)}  Z ${fmt(scale.z)}
        </pre>
        <div class="hint">F: Startwerte wiederherstellen • C: Kamera wechseln • Entf: Löschen</div>
      `.trim();
    }

    if (!force && content === this.hudCache) return;
    this.hudCache = content;
    this.transformHud.innerHTML = content;
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
