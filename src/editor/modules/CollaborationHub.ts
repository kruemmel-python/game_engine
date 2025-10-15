import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import { GameObject as EngineGameObject } from '../../ecs/GameObject';
import type { Editor } from '../Editor';
import type { SceneNode } from './SceneManager';

interface SerializedObject {
  name: string;
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  };
  userData?: Record<string, unknown>;
  children: SerializedObject[];
}

interface SerializedScene {
  version: number;
  objects: SerializedObject[];
}

export class EditorCollaborationHub {
  private channel?: BroadcastChannel;

  constructor(
    private editor: Editor,
    private game: Game,
  ) {}

  connect(channelName: string) {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      console.warn('BroadcastChannel wird nicht unterstützt.');
      return;
    }
    this.channel?.close();
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === 'scene:sync') {
        this.applySerialized(data.payload, { append: false });
      } else if (data?.type === 'scene:selection') {
        this.highlightByName(data.payload?.name);
      }
    };
  }

  disconnect() {
    this.channel?.close();
    this.channel = undefined;
  }

  broadcastScene() {
    const payload = this.serialize();
    this.channel?.postMessage({ type: 'scene:sync', payload });
  }

  broadcastSelection() {
    const selection = this.editor.selected;
    this.channel?.postMessage({
      type: 'scene:selection',
      payload: selection ? { name: selection.name } : null,
    });
  }

  serialize(): SerializedScene {
    const nodes = this.editor.sceneManager?.getHierarchy() ?? [];
    return {
      version: 1,
      objects: nodes.map((node) => this.serializeNode(node)),
    };
  }

  applySerialized(scene: SerializedScene, { append = false } = {}) {
    if (!append) {
      for (const obj of [...this.game.objects]) {
        this.game.remove(obj);
      }
    }
    for (const serialized of scene.objects) {
      const go = this.deserializeObject(serialized);
      this.game.add(go);
    }
    this.editor.events.emit('collaboration:applied', scene);
  }

  saveLocal(slot: string) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = `editor.scene.${slot}`;
    window.localStorage.setItem(key, JSON.stringify(this.serialize()));
    this.editor.events.emit('collaboration:saved', slot);
  }

  loadLocal(slot: string) {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const key = `editor.scene.${slot}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const scene: SerializedScene = JSON.parse(raw);
    this.applySerialized(scene, { append: false });
    return true;
  }

  exportString() {
    return btoa(JSON.stringify(this.serialize()));
  }

  importString(data: string) {
    const decoded = JSON.parse(atob(data));
    this.applySerialized(decoded, { append: false });
  }

  dispose() {
    this.disconnect();
  }

  private serializeNode(node: SceneNode): SerializedObject {
    const { object, children } = node;
    const transform = {
      position: { ...object.object3D.position },
      rotation: {
        x: object.object3D.quaternion.x,
        y: object.object3D.quaternion.y,
        z: object.object3D.quaternion.z,
        w: object.object3D.quaternion.w,
      },
      scale: { ...object.object3D.scale },
    };
    return {
      name: object.name,
      transform,
      userData: object.object3D.userData,
      children: children.map((child) => this.serializeNode(child)),
    };
  }

  private deserializeObject(data: SerializedObject) {
    const go = new EngineGameObject({ name: data.name });
    go.object3D.position.set(
      data.transform.position.x,
      data.transform.position.y,
      data.transform.position.z,
    );
    go.object3D.quaternion.set(
      data.transform.rotation.x,
      data.transform.rotation.y,
      data.transform.rotation.z,
      data.transform.rotation.w,
    );
    go.object3D.scale.set(
      data.transform.scale.x,
      data.transform.scale.y,
      data.transform.scale.z,
    );
    if (data.userData) {
      go.object3D.userData = { ...data.userData };
    }
    for (const child of data.children) {
      const childObj = this.deserializeObject(child);
      go.object3D.add(childObj.object3D);
      this.game.add(childObj);
      this.editor.sceneManager?.setParent(childObj, go);
    }
    return go;
  }

  private highlightByName(name?: string) {
    if (!name) return;
    const match = this.game.objects.find((obj) => obj.name === name);
    if (match) {
      this.editor.select(match);
      this.editor.sceneManager?.focus(match);
    }
  }
}
