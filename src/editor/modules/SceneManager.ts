import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import { GameObject as EngineGameObject } from '../../ecs/GameObject';
import type { Editor } from '../Editor';

export interface SceneNode {
  object: GameObject;
  children: SceneNode[];
  folders: string[];
}

export interface SceneFolder {
  id: string;
  name: string;
  color?: string;
  objects: Set<GameObject>;
}

export interface DuplicateOptions {
  name?: string;
  offset?: { x?: number; y?: number; z?: number };
  parent?: GameObject;
}

function makeUuid() {
  const g = typeof crypto !== 'undefined' ? crypto : undefined;
  if (g && 'randomUUID' in g) {
    return g.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export class EditorSceneManager {
  private parent = new Map<GameObject, GameObject | undefined>();
  private children = new Map<GameObject, Set<GameObject>>();
  private folders = new Map<string, SceneFolder>();
  private tracked = new Set<GameObject>();

  constructor(private editor: Editor, private game: Game) {
    for (const go of game.objects) {
      this.track(go);
    }

    game.events.on('scene:objectAdded', (go: GameObject) => this.track(go));
    game.events.on('scene:objectRemoved', (go: GameObject) => this.untrack(go));
  }

  createEmpty(name = 'Empty', parent?: GameObject) {
    const go = new EngineGameObject({ name });
    this.game.add(go);
    if (parent) {
      this.setParent(go, parent);
    }
    this.editor.events.emit('scene:created', go);
    return go;
  }

  duplicate(source: GameObject, opts: DuplicateOptions = {}) {
    const clone = source.object3D.clone(true);
    clone.traverse((node) => {
      if (node.userData?.__gameObject) {
        delete node.userData.__gameObject;
      }
    });
    const name =
      opts.name ?? `${source.name} (${(Math.random() * 1000) | 0})`;
    const go = new EngineGameObject({ name, object3D: clone });
    this.game.add(go);
    if (opts.parent) {
      this.setParent(go, opts.parent);
    } else {
      const parent = this.parent.get(source);
      if (parent) {
        this.setParent(go, parent);
      }
    }

    const offset = opts.offset ?? {};
    if (offset.x || offset.y || offset.z) {
      go.object3D.position.add({
        x: offset.x ?? 0,
        y: offset.y ?? 0,
        z: offset.z ?? 0,
      });
    } else {
      go.object3D.position.addScalar(0.5);
    }

    for (const [id, folder] of this.folders.entries()) {
      if (folder.objects.has(source)) {
        folder.objects.add(go);
        this.editor.events.emit('scene:folderAssigned', { folderId: id, object: go });
      }
    }

    this.editor.events.emit('scene:duplicated', { source, clone: go });
    return go;
  }

  remove(go: GameObject, { cascade = true } = {}) {
    const children = this.children.get(go);
    if (cascade && children) {
      for (const child of Array.from(children)) {
        this.remove(child, { cascade: true });
      }
    } else if (children) {
      for (const child of Array.from(children)) {
        this.setParent(child, undefined);
      }
    }
    this.game.remove(go);
    for (const folder of this.folders.values()) {
      folder.objects.delete(go);
    }
    this.editor.events.emit('scene:removed', go);
  }

  rename(go: GameObject, name: string) {
    const prev = go.name;
    go.name = name;
    this.editor.events.emit('scene:renamed', { object: go, from: prev, to: name });
  }

  setParent(child: GameObject, parent?: GameObject) {
    const previous = this.parent.get(child);
    if (previous === parent) return;

    if (previous) {
      const set = this.children.get(previous);
      set?.delete(child);
    }

    this.parent.set(child, parent);

    if (parent) {
      const set = this.children.get(parent) ?? new Set<GameObject>();
      set.add(child);
      this.children.set(parent, set);
      parent.object3D.add(child.object3D);
    } else {
      this.game.scene.add(child.object3D);
    }

    this.editor.events.emit('scene:reparented', { child, parent });
  }

  getParent(go: GameObject) {
    return this.parent.get(go);
  }

  getChildren(go: GameObject) {
    return Array.from(this.children.get(go) ?? []);
  }

  getHierarchy(): SceneNode[] {
    const nodes: SceneNode[] = [];
    for (const go of this.game.objects) {
      if (!this.tracked.has(go)) continue;
      if (!this.parent.get(go)) {
        nodes.push(this.buildNode(go));
      }
    }
    return nodes;
  }

  private buildNode(go: GameObject): SceneNode {
    const folders: string[] = [];
    for (const folder of this.folders.values()) {
      if (folder.objects.has(go)) {
        folders.push(folder.id);
      }
    }

    return {
      object: go,
      folders,
      children: this.getChildren(go).map((child) => this.buildNode(child)),
    };
  }

  createFolder(name: string, color?: string) {
    const id = makeUuid();
    const folder: SceneFolder = { id, name, color, objects: new Set() };
    this.folders.set(id, folder);
    this.editor.events.emit('scene:folderCreated', folder);
    return folder;
  }

  renameFolder(id: string, name: string) {
    const folder = this.folders.get(id);
    if (!folder) return false;
    const prev = folder.name;
    folder.name = name;
    this.editor.events.emit('scene:folderRenamed', { folder, from: prev, to: name });
    return true;
  }

  deleteFolder(id: string) {
    const folder = this.folders.get(id);
    if (!folder) return false;
    this.folders.delete(id);
    this.editor.events.emit('scene:folderDeleted', folder);
    return true;
  }

  assignToFolder(go: GameObject, folderId: string) {
    const folder = this.folders.get(folderId);
    if (!folder) return false;
    folder.objects.add(go);
    this.editor.events.emit('scene:folderAssigned', { folderId, object: go });
    return true;
  }

  unassignFromFolder(go: GameObject, folderId: string) {
    const folder = this.folders.get(folderId);
    if (!folder) return false;
    const deleted = folder.objects.delete(go);
    if (deleted) {
      this.editor.events.emit('scene:folderUnassigned', { folderId, object: go });
    }
    return deleted;
  }

  listFolders() {
    return Array.from(this.folders.values()).map((folder) => ({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      size: folder.objects.size,
    }));
  }

  focus(go?: GameObject) {
    const target = go ?? this.editor.selected;
    if (!target) return false;
    this.game.frameObject(target.object3D);
    this.editor.events.emit('scene:focused', target);
    return true;
  }

  private track(go: GameObject) {
    if (this.tracked.has(go)) return;
    this.tracked.add(go);
    if (!this.parent.has(go)) {
      this.parent.set(go, undefined);
    }
    if (!this.children.has(go)) {
      this.children.set(go, new Set());
    }
  }

  private untrack(go: GameObject) {
    if (!this.tracked.delete(go)) return;
    const parent = this.parent.get(go);
    if (parent) {
      this.children.get(parent)?.delete(go);
    }
    this.parent.delete(go);
    const children = this.children.get(go);
    if (children) {
      for (const child of children) {
        this.parent.set(child, undefined);
        this.game.scene.add(child.object3D);
      }
      this.children.delete(go);
    }
  }
}
