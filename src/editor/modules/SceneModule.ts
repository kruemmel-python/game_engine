import type { Object3D } from 'three';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { GameObject } from '../../ecs/GameObject';
import type { EditorContext, EditorModule, SceneNode } from './types';

export class SceneModule implements EditorModule {
  readonly id = 'scene';
  readonly label = 'Szenenverwaltung & Objektorganisation';

  private scratchPos = new Vector3();
  private scratchQuat = new Quaternion();
  private scratchScale = new Vector3();
  private scratchMatrix = new Matrix4();

  constructor(private readonly ctx: EditorContext) {}

  dispose(): void {}

  getHierarchy(): SceneNode[] {
    const nodes = new Map<GameObject, SceneNode>();
    for (const go of this.ctx.game.objects) {
      nodes.set(go, {
        id: go.object3D.uuid,
        name: go.name,
        object: go,
        children: [],
      });
    }

    const roots: SceneNode[] = [];
    for (const go of this.ctx.game.objects) {
      const node = nodes.get(go)!;
      const parentGameObject = this.findGameObject(go.object3D.parent);
      if (parentGameObject && nodes.has(parentGameObject)) {
        nodes.get(parentGameObject)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  createEmpty(name: string, parent?: GameObject): GameObject {
    const go = new GameObject({ name });
    this.ctx.game.add(go);
    if (parent) {
      parent.object3D.add(go.object3D);
    }
    return go;
  }

  delete(go: GameObject): void {
    if (this.ctx.getSelection() === go) {
      this.ctx.select(undefined);
    }
    this.ctx.game.remove(go);
  }

  duplicate(source: GameObject, opts: { name?: string } = {}): GameObject {
    source.object3D.updateWorldMatrix(true, false);
    const parent = this.findGameObject(source.object3D.parent);
    const clone = source.object3D.clone(true);
    clone.traverse((child) => {
      child.uuid = this.makeUUID();
    });
    const go = new GameObject({
      name: opts.name ?? `${source.name} Kopie`,
      object3D: clone,
    });
    this.ctx.game.add(go);
    this.reparent(go, parent);

    const matrix = this.scratchMatrix.copy(source.object3D.matrixWorld);
    if (parent) {
      parent.object3D.updateWorldMatrix(true, false);
      const parentInverse = parent.object3D.matrixWorld.clone().invert();
      matrix.multiplyMatrices(parentInverse, matrix);
    }
    matrix.decompose(this.scratchPos, this.scratchQuat, this.scratchScale);
    go.object3D.position.copy(this.scratchPos);
    go.object3D.quaternion.copy(this.scratchQuat);
    go.object3D.scale.copy(this.scratchScale);
    return go;
  }

  reparent(go: GameObject, newParent?: GameObject, index?: number) {
    const parentObj = go.object3D.parent;
    if (parentObj) {
      parentObj.remove(go.object3D);
    }
    if (newParent) {
      newParent.object3D.add(go.object3D);
      if (typeof index === 'number') {
        const children = newParent.object3D.children;
        const currentIndex = children.indexOf(go.object3D);
        if (currentIndex >= 0) {
          children.splice(currentIndex, 1);
        }
        const clamped = Math.max(0, Math.min(index, children.length));
        children.splice(clamped, 0, go.object3D);
      }
    } else {
      this.ctx.game.scene.add(go.object3D);
    }
  }

  private findGameObject(object: Object3D | null | undefined): GameObject | undefined {
    let current: Object3D | null | undefined = object ?? null;
    while (current) {
      const go = current.userData?.__gameObject as GameObject | undefined;
      if (go) {
        return go;
      }
      current = current.parent ?? null;
    }
    return undefined;
  }

  private makeUUID(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `uuid-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
