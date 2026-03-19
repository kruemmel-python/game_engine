import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';

export interface SceneDescriptor {
  id: string;
  name: string;
  rootObjects: string[];
  metadata: Record<string, unknown>;
}

export interface HierarchyNode {
  id: string;
  parent?: string;
  children: string[];
}

export class SceneManager {
  readonly events = new EventBus();
  readonly scenes = new Map<string, SceneDescriptor>();
  readonly hierarchy = new Map<string, HierarchyNode>();
  activeScene?: string;

  constructor(private readonly game: Game) {}

  createScene(name: string, options: { metadata?: Record<string, unknown> } = {}) {
    const id = createId();
    const scene: SceneDescriptor = {
      id,
      name,
      rootObjects: [],
      metadata: options.metadata ?? {},
    };
    this.scenes.set(id, scene);
    if (!this.activeScene) {
      this.activeScene = id;
    }
    this.events.emit('scene-created', scene);
    return scene;
  }

  duplicateScene(sourceId: string, overrides: Partial<SceneDescriptor> = {}) {
    const source = this.scenes.get(sourceId);
    if (!source) throw new Error(`Scene '${sourceId}' does not exist`);
    const clone = this.createScene(overrides.name ?? `${source.name} Copy`, {
      metadata: { ...source.metadata, ...overrides.metadata },
    });
    clone.rootObjects = [...source.rootObjects];
    this.scenes.set(clone.id, clone);
    this.events.emit('scene-duplicated', { source, clone });
    return clone;
  }

  registerObject(go: GameObject, parentId?: string) {
    const id = go.object3D.uuid;
    if (this.hierarchy.has(id)) return;
    const node: HierarchyNode = { id, parent: parentId, children: [] };
    this.hierarchy.set(id, node);
    if (parentId) {
      const parent = this.hierarchy.get(parentId);
      parent?.children.push(id);
    } else if (this.activeScene) {
      const scene = this.scenes.get(this.activeScene);
      if (scene && !scene.rootObjects.includes(id)) {
        scene.rootObjects.push(id);
      }
    }
    this.events.emit('object-registered', { object: go, parentId });
  }

  unregisterObject(go: GameObject) {
    const id = go.object3D.uuid;
    const node = this.hierarchy.get(id);
    if (!node) return;
    if (node.parent) {
      const parent = this.hierarchy.get(node.parent);
      if (parent) {
        parent.children = parent.children.filter((child) => child !== id);
      }
    } else if (this.activeScene) {
      const scene = this.scenes.get(this.activeScene);
      if (scene) {
        scene.rootObjects = scene.rootObjects.filter((child) => child !== id);
      }
    }
    for (const child of node.children) {
      const childNode = this.hierarchy.get(child);
      if (childNode) {
        childNode.parent = undefined;
        if (this.activeScene) {
          const scene = this.scenes.get(this.activeScene);
          if (scene && !scene.rootObjects.includes(child)) {
            scene.rootObjects.push(child);
          }
        }
      }
    }
    this.hierarchy.delete(id);
    this.events.emit('object-unregistered', { object: go });
  }

  setParent(child: GameObject, parent?: GameObject) {
    const childId = child.object3D.uuid;
    const parentId = parent?.object3D.uuid;
    const node = this.hierarchy.get(childId);
    if (!node) return;

    if (node.parent) {
      const oldParent = this.hierarchy.get(node.parent);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((c) => c !== childId);
      }
    }

    node.parent = parentId;

    if (parentId) {
      const newParent = this.hierarchy.get(parentId);
      if (newParent && !newParent.children.includes(childId)) {
        newParent.children.push(childId);
      }
    } else if (this.activeScene) {
      const scene = this.scenes.get(this.activeScene);
      if (scene && !scene.rootObjects.includes(childId)) {
        scene.rootObjects.push(childId);
      }
    }

    this.events.emit('hierarchy-changed', { child, parent });
  }

  listSceneObjects(sceneId: string) {
    const scene = this.scenes.get(sceneId);
    if (!scene) return [];
    return scene.rootObjects.map((id) => this.findById(id)).filter((item): item is GameObject => !!item);
  }

  findById(id: string) {
    return this.game.objects.find((go) => go.object3D.uuid === id);
  }
}

function createId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `scene-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
