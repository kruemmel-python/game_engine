import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import type { Editor } from '../Editor';

interface HierarchyEntry {
  name: string;
  depth: number;
  position: { x: number; y: number; z: number };
}

export class EditorDebugTools {
  private wireframe = false;
  private recordings: string[] = [];

  constructor(private editor: Editor, private game: Game) {}

  toggleWireframe(force?: boolean) {
    this.wireframe = force ?? !this.wireframe;
    this.game.scene.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of materials) {
        if (mat && 'wireframe' in mat) {
          (mat as THREE.Material & { wireframe?: boolean }).wireframe = this.wireframe;
        }
      }
    });
    this.editor.events.emit('debug:wireframe', this.wireframe);
  }

  dumpHierarchy() {
    const result: HierarchyEntry[] = [];
    const visit = (obj: GameObject, depth: number) => {
      result.push({
        name: obj.name,
        depth,
        position: { ...obj.object3D.position },
      });
      const children = this.editor.sceneManager?.getChildren(obj) ?? [];
      for (const child of children) {
        visit(child, depth + 1);
      }
    };
    for (const node of this.editor.sceneManager?.getHierarchy() ?? []) {
      visit(node.object, 0);
    }
    console.table(result);
    return result;
  }

  logSelectionInfo() {
    const selection = this.editor.selected;
    if (!selection) {
      console.info('Keine Auswahl aktiv');
      return null;
    }
    const info = {
      name: selection.name,
      position: { ...selection.object3D.position },
      rotation: {
        x: selection.object3D.rotation.x,
        y: selection.object3D.rotation.y,
        z: selection.object3D.rotation.z,
      },
      scale: { ...selection.object3D.scale },
      components: selection.components.map((c) => ({
        name: c.constructor.name,
        enabled: c.enabled,
      })),
    };
    console.info('Auswahl', info);
    return info;
  }

  captureFrame(label = 'frame') {
    const canvas = this.game.renderer.domElement;
    const data = canvas.toDataURL('image/png');
    this.recordings.push(data);
    this.editor.events.emit('debug:capture', { label, data });
    return data;
  }

  listCaptures() {
    return [...this.recordings];
  }

  clearCaptures() {
    this.recordings = [];
  }
}
