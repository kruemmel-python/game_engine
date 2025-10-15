import * as THREE from 'three';
import type { Vector3Like } from 'three';
import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import type { Component } from '../../ecs/Component';
import type { Editor } from '../Editor';

export interface TransformUpdate {
  position?: Partial<Vector3Like>;
  rotation?: Partial<{ x: number; y: number; z: number }>;
  scale?: Partial<Vector3Like>;
}

export class EditorInspector {
  private current?: GameObject;

  constructor(private editor: Editor, private game: Game) {
    this.editor.events.on('selection:changed', ({ selection }) => {
      this.current = selection ?? undefined;
    });
  }

  inspect(go?: GameObject) {
    this.current = go;
    this.editor.events.emit('inspector:changed', { selection: go ?? null });
  }

  get selection() {
    return this.current;
  }

  setTransform(update: TransformUpdate, go = this.current) {
    if (!go) return false;
    const { position, rotation, scale } = update;
    if (position) {
      go.object3D.position.set(
        position.x ?? go.object3D.position.x,
        position.y ?? go.object3D.position.y,
        position.z ?? go.object3D.position.z,
      );
      if (go.body) {
        const { x, y, z } = go.object3D.position;
        (go.body.position as any).set(x, y, z);
      }
    }
    if (rotation) {
      go.object3D.rotation.set(
        rotation.x ?? go.object3D.rotation.x,
        rotation.y ?? go.object3D.rotation.y,
        rotation.z ?? go.object3D.rotation.z,
      );
      if (go.body) {
        const q = new THREE.Quaternion().setFromEuler(go.object3D.rotation);
        (go.body.quaternion as any).set(q.x, q.y, q.z, q.w);
      }
    }
    if (scale) {
      go.object3D.scale.set(
        scale.x ?? go.object3D.scale.x,
        scale.y ?? go.object3D.scale.y,
        scale.z ?? go.object3D.scale.z,
      );
    }

    go.object3D.updateMatrixWorld(true);
    this.editor.events.emit('inspector:transform', { object: go, update });
    return true;
  }

  setPosition(position: Vector3Like, go = this.current) {
    return this.setTransform({ position }, go);
  }

  setRotation(rotation: { x: number; y: number; z: number }, go = this.current) {
    return this.setTransform({ rotation }, go);
  }

  setScale(scale: Vector3Like, go = this.current) {
    return this.setTransform({ scale }, go);
  }

  listComponents(go = this.current) {
    return go?.components ?? [];
  }

  findComponent<T extends Component>(
    ctor: new (...args: any[]) => T,
    go = this.current,
  ) {
    return go?.components.find((comp): comp is T => comp instanceof ctor);
  }

  setComponentProperty<T extends Component>(
    ctor: new (...args: any[]) => T,
    property: keyof T,
    value: T[keyof T],
    go = this.current,
  ) {
    const component = this.findComponent(ctor, go);
    if (!component) return false;
    (component as any)[property] = value;
    this.editor.events.emit('inspector:componentProperty', {
      object: go,
      component,
      property,
      value,
    });
    return true;
  }

  toggleComponent<T extends Component>(
    ctor: new (...args: any[]) => T,
    enabled: boolean,
    go = this.current,
  ) {
    const component = this.findComponent(ctor, go);
    if (!component) return false;
    component.enabled = enabled;
    this.editor.events.emit('inspector:componentToggled', {
      object: go,
      component,
      enabled,
    });
    return true;
  }

  serialize(go = this.current) {
    if (!go) return null;
    return {
      name: go.name,
      position: go.object3D.position.clone(),
      rotation: go.object3D.rotation.clone(),
      scale: go.object3D.scale.clone(),
      components: go.components.map((c) => ({
        name: c.constructor.name,
        enabled: c.enabled,
      })),
    };
  }
}
