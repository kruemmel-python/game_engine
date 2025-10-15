import { GridHelper, Object3D } from 'three';
import type { Editor } from '../Editor';
import type { EditorContext, EditorModule } from './types';

type CameraMode = 'orbit' | 'inspection';

type GizmoSpace = 'world' | 'local';

export class NavigationModule implements EditorModule {
  readonly id = 'navigation';
  readonly label = 'Navigation, Kamera & Editor-Werkzeuge';

  private cameraMode: CameraMode = 'orbit';
  private gizmoSpace: GizmoSpace = 'world';
  private grid?: GridHelper;

  constructor(
    private readonly ctx: EditorContext,
    private readonly editor: Editor,
  ) {
    this.grid = this.findGrid(ctx.game.scene);
  }

  dispose(): void {}

  frameSelection() {
    const selection = this.ctx.getSelection();
    if (!selection) return;
    this.ctx.game.frameObject(selection.object3D);
  }

  setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    const controls = this.ctx.game.controls;
    if (mode === 'orbit') {
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.enableZoom = true;
    } else {
      controls.enableRotate = false;
      controls.enablePan = true;
      controls.enableZoom = true;
    }
  }

  getCameraMode() {
    return this.cameraMode;
  }

  setCameraSpeed(multiplier: number) {
    const controls = this.ctx.game.controls;
    controls.rotateSpeed = 1.0 * multiplier;
    controls.zoomSpeed = 1.2 * multiplier;
    controls.panSpeed = 0.8 * multiplier;
  }

  toggleGrid(visible?: boolean) {
    if (!this.grid) {
      this.grid = this.findGrid(this.ctx.game.scene);
    }
    if (!this.grid) return;
    if (typeof visible === 'boolean') {
      this.grid.visible = visible;
    } else {
      this.grid.visible = !this.grid.visible;
    }
  }

  setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
    this.editor.setGizmoMode(mode);
  }

  toggleGizmoSpace() {
    this.gizmoSpace = this.gizmoSpace === 'world' ? 'local' : 'world';
    this.editor.gizmo.setSpace(this.gizmoSpace);
  }

  getGizmoSpace() {
    return this.gizmoSpace;
  }

  focusCameraOn(object: Object3D) {
    this.ctx.game.frameObject(object);
  }

  private findGrid(root: Object3D) {
    return root.children.find((child): child is GridHelper => child instanceof GridHelper);
  }
}
