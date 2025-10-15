import { Color, Euler, MathUtils, Vector3 } from 'three';
import type { GameObject } from '../../ecs/GameObject';
import type {
  EditorContext,
  EditorModule,
  InspectorPanelState,
  InspectorProperty,
} from './types';

export class InspectorModule implements EditorModule {
  readonly id = 'inspector';
  readonly label = 'Inspector & Eigenschaften-Management';

  private subscribers = new Set<(panels: InspectorPanelState[]) => void>();
  private lastInspected?: GameObject;

  constructor(private readonly ctx: EditorContext) {}

  dispose(): void {
    this.subscribers.clear();
  }

  inspect(selection?: GameObject) {
    const target = selection ?? this.ctx.getSelection();
    const panels = target ? this.buildPanels(target) : [];
    this.lastInspected = target;
    this.emit(panels);
    return panels;
  }

  subscribe(cb: (panels: InspectorPanelState[]) => void) {
    this.subscribers.add(cb);
    if (this.lastInspected) {
      cb(this.buildPanels(this.lastInspected));
    }
    return () => this.subscribers.delete(cb);
  }

  updateProperty<T>(property: InspectorProperty<T>, value: T) {
    if (!property.writable) return;
    if (property.onChange) {
      property.onChange(value);
    } else if (property.path.length > 0) {
      this.assignValue(property.target, property.path, value);
    }
    property.value = value;
    if (this.lastInspected) {
      this.emit(this.buildPanels(this.lastInspected));
    }
  }

  private buildPanels(go: GameObject): InspectorPanelState[] {
    const panels: InspectorPanelState[] = [];
    panels.push(this.makeTransformPanel(go));
    panels.push({
      title: 'Objekt',
      properties: [
        {
          target: go,
          path: ['name'],
          label: 'Name',
          type: 'string',
          value: go.name,
          writable: true,
        },
      ],
    });

    for (const component of go.components) {
      const ctor = component.constructor as { name?: string };
      const title = ctor.name ?? 'Komponente';
      const props = this.introspect(component);
      panels.push({ title, properties: props });
    }

    return panels;
  }

  private makeTransformPanel(go: GameObject): InspectorPanelState {
    const obj = go.object3D;
    const positionProperty: InspectorProperty<Vector3> = {
      target: obj.position,
      path: [],
      label: 'Position',
      type: 'vector3',
      value: obj.position.clone(),
      writable: true,
      onChange: (value) => obj.position.copy(value),
    };

    const rotationProperty: InspectorProperty<Vector3> = {
      target: obj.rotation,
      path: [],
      label: 'Rotation (Grad)',
      type: 'vector3',
      value: new Vector3(
        MathUtils.radToDeg(obj.rotation.x),
        MathUtils.radToDeg(obj.rotation.y),
        MathUtils.radToDeg(obj.rotation.z),
      ),
      writable: true,
      onChange: (value) => {
        const euler = new Euler(
          MathUtils.degToRad(value.x),
          MathUtils.degToRad(value.y),
          MathUtils.degToRad(value.z),
          obj.rotation.order,
        );
        obj.rotation.copy(euler);
      },
    };

    const scaleProperty: InspectorProperty<Vector3> = {
      target: obj.scale,
      path: [],
      label: 'Skalierung',
      type: 'vector3',
      value: obj.scale.clone(),
      writable: true,
      onChange: (value) => obj.scale.copy(value),
    };

    return {
      title: 'Transform',
      properties: [positionProperty, rotationProperty, scaleProperty],
    };
  }

  private introspect(instance: any): InspectorProperty[] {
    const properties: InspectorProperty[] = [];
    const descriptors = Object.getOwnPropertyDescriptors(instance);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === 'game' || key === 'owner') continue;
      const writable = Boolean(descriptor.writable || descriptor.set);
      const value = (instance as any)[key];
      properties.push({
        target: instance,
        path: [key],
        label: key,
        type: this.detectType(value),
        value,
        writable,
      });
    }
    return properties;
  }

  private detectType(value: unknown): InspectorProperty['type'] {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Vector3) return 'vector3';
    if (value instanceof Color) return 'color';
    return 'any';
  }

  private assignValue(target: any, path: string[], value: unknown) {
    const last = path[path.length - 1];
    const container =
      path.length > 1
        ? path.slice(0, -1).reduce((obj, key) => obj[key], target)
        : target;
    container[last] = value;
  }

  private emit(panels: InspectorPanelState[]) {
    for (const cb of this.subscribers) {
      cb(panels);
    }
  }
}
