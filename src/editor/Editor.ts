import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';

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

  constructor(public game: Game) {
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

    this.transformHud = this.createTransformHud();
    const loop = () => {
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
        <div class="hint">F: Startwerte wiederherstellen • Entf: Löschen</div>
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
