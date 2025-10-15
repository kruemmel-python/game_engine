import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import { GameObject } from '../ecs/GameObject';

export interface HierarchyNode {
  object: GameObject;
  children: HierarchyNode[];
}

export class SceneManager {
  readonly events = new EventBus();

  constructor(private game: Game) {
    this.game.events.on('object-added', (go: GameObject) => {
      this.events.emit('created', go);
      this.events.emit('changed', undefined);
    });
    this.game.events.on('object-removed', (go: GameObject) => {
      this.events.emit('removed', go);
      this.events.emit('changed', undefined);
    });
  }

  createEmpty(name = 'Empty', parent?: GameObject) {
    const go = new GameObject({ name });
    this.game.add(go);
    this.setParent(go, parent);
    this.events.emit('changed', undefined);
    this.events.emit('created', go);
    return go;
  }

  duplicate(target: GameObject, options: { parent?: GameObject } = {}) {
    const clone = target.object3D.clone(true);
    const go = new GameObject({
      name: this.findUniqueName(target.name + ' Copy'),
      object3D: clone,
    });
    this.game.add(go);
    this.setParent(go, options.parent ?? targetParent(target));
    go.object3D.position.copy(target.object3D.position);
    go.object3D.quaternion.copy(target.object3D.quaternion);
    go.object3D.scale.copy(target.object3D.scale);
    this.events.emit('changed', undefined);
    this.events.emit('duplicated', { source: target, copy: go });
    return go;
  }

  remove(target: GameObject) {
    if (target.name === 'CameraRig') return;
    this.game.remove(target);
    this.events.emit('changed', undefined);
    this.events.emit('removed', target);
  }

  rename(target: GameObject, name: string) {
    if (!name.trim()) return;
    target.name = this.findUniqueName(name.trim(), target);
    this.events.emit('renamed', target);
    this.events.emit('changed', undefined);
  }

  setParent(child: GameObject, parent?: GameObject) {
    if (parent && child === parent) return;
    const currentParent = child.object3D.parent;
    if (currentParent) currentParent.remove(child.object3D);
    if (parent) {
      parent.object3D.add(child.object3D);
    } else {
      this.game.scene.add(child.object3D);
    }
    this.events.emit('reparented', { child, parent });
    this.events.emit('changed', undefined);
  }

  group(name: string, members: GameObject[]) {
    if (!members.length) return;
    const group = this.createEmpty(name);
    const parent = targetParent(members[0]);
    this.setParent(group, parent ?? undefined);
    for (const member of members) {
      this.setParent(member, group);
    }
    this.events.emit('grouped', { group, members });
    return group;
  }

  unparent(child: GameObject) {
    this.setParent(child, undefined);
  }

  listHierarchy() {
    const roots = this.game.objects.filter((o) => !o.object3D.parent);
    const toNode = (obj: GameObject): HierarchyNode => ({
      object: obj,
      children: obj.object3D.children
        .map((child) => this.game.objects.find((go) => go.object3D === child))
        .filter((childGo): childGo is GameObject => !!childGo)
        .map((childGo) => toNode(childGo)),
    });
    return roots.map(toNode);
  }

  findByName(name: string) {
    return this.game.objects.find((o) => o.name === name);
  }

  private findUniqueName(base: string, current?: GameObject) {
    const trimmed = base || 'GameObject';
    let attempt = trimmed;
    let index = 1;
    while (this.game.objects.some((o) => o !== current && o.name === attempt)) {
      attempt = `${trimmed} ${index++}`;
    }
    return attempt;
  }
}

function targetParent(target: GameObject) {
  const parentObject = target.object3D.parent;
  if (!parentObject) return undefined;
  return parentObject.userData?.__gameObject as GameObject | undefined;
}
