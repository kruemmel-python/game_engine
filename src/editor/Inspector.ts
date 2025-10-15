import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';

export interface InspectorProperty {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'vector3' | 'quaternion';
  value: unknown;
}

export class Inspector {
  readonly events = new EventBus();
  private selected?: GameObject;

  constructor(private game: Game) {}

  inspect(gameObject?: GameObject) {
    this.selected = gameObject;
    this.events.emit('selected', gameObject ?? null);
  }

  getSelection() {
    return this.selected;
  }

  getProperties(): InspectorProperty[] {
    const target = this.selected;
    if (!target) return [];
    const props: InspectorProperty[] = [];
    props.push({ path: 'name', label: 'Name', type: 'string', value: target.name });
    props.push({
      path: 'position',
      label: 'Position',
      type: 'vector3',
      value: target.object3D.position.clone(),
    });
    props.push({
      path: 'rotation',
      label: 'Rotation',
      type: 'quaternion',
      value: target.object3D.quaternion.clone(),
    });
    props.push({
      path: 'scale',
      label: 'Scale',
      type: 'vector3',
      value: target.object3D.scale.clone(),
    });
    props.push({
      path: 'visible',
      label: 'Visible',
      type: 'boolean',
      value: target.object3D.visible,
    });
    if (target.body) {
      const body: any = target.body;
      props.push({ path: 'body.mass', label: 'Mass', type: 'number', value: body.mass });
      props.push({
        path: 'body.linearDamping',
        label: 'Linear Damping',
        type: 'number',
        value: body.linearDamping,
      });
      props.push({
        path: 'body.angularDamping',
        label: 'Angular Damping',
        type: 'number',
        value: body.angularDamping,
      });
    }
    props.push({
      path: 'components',
      label: 'Components',
      type: 'string',
      value: target.components.map((c) => c.constructor.name).join(', '),
    });
    return props;
  }

  setProperty(path: string, value: unknown) {
    const target = this.selected;
    if (!target) return;
    switch (path) {
      case 'name':
        if (typeof value === 'string') {
          target.name = value;
          this.events.emit('changed', { path, value });
        }
        break;
      case 'visible':
        if (typeof value === 'boolean') {
          target.object3D.visible = value;
          this.events.emit('changed', { path, value });
        }
        break;
      case 'position':
        this.applyVector(target.object3D.position, value);
        break;
      case 'rotation':
        this.applyQuaternion(target.object3D.quaternion, value);
        break;
      case 'scale':
        this.applyVector(target.object3D.scale, value);
        break;
      default:
        if (path.startsWith('position.')) {
          this.applyVectorComponent(target.object3D.position, path, value);
        } else if (path.startsWith('rotation.')) {
          this.applyQuaternionComponent(target.object3D.quaternion, path, value);
        } else if (path.startsWith('scale.')) {
          this.applyVectorComponent(target.object3D.scale, path, value);
        } else if (path.startsWith('body.') && target.body) {
          this.applyBodyProperty(target, path.slice(5), value);
        }
    }
  }

  private applyVector(target: { set: (x: number, y: number, z: number) => void }, value: unknown) {
    if (value && typeof value === 'object') {
      const v = value as any;
      if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
        target.set(v.x, v.y, v.z);
        this.events.emit('changed', { path: 'vector', value });
      }
    }
  }

  private applyQuaternion(target: { set: (x: number, y: number, z: number, w: number) => void }, value: unknown) {
    if (value && typeof value === 'object') {
      const v = value as any;
      if (
        typeof v.x === 'number' &&
        typeof v.y === 'number' &&
        typeof v.z === 'number' &&
        typeof v.w === 'number'
      ) {
        target.set(v.x, v.y, v.z, v.w);
        this.events.emit('changed', { path: 'quaternion', value });
      }
    }
  }

  private applyVectorComponent(target: any, path: string, value: unknown) {
    const axis = path.split('.')[1];
    if (!axis) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    target[axis] = num;
    this.events.emit('changed', { path, value: num });
  }

  private applyQuaternionComponent(target: any, path: string, value: unknown) {
    const axis = path.split('.')[1];
    if (!axis) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    target[axis] = num;
    this.events.emit('changed', { path, value: num });
  }

  private applyBodyProperty(target: GameObject, property: string, value: unknown) {
    const body: any = target.body;
    if (!body) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    switch (property) {
      case 'mass':
        body.mass = value;
        body.updateMassProperties?.();
        break;
      case 'linearDamping':
        body.linearDamping = value;
        break;
      case 'angularDamping':
        body.angularDamping = value;
        break;
      default:
        body[property] = value;
    }
    this.events.emit('changed', { path: `body.${property}`, value });
  }
}
