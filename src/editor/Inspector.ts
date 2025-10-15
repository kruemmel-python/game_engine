import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';

export type PropertyType = 'number' | 'boolean' | 'string' | 'vector3' | 'color';

export interface PropertyDescriptor<T = unknown> {
  key: string;
  label: string;
  type: PropertyType;
  defaultValue: T;
  serialize?: (value: T) => unknown;
  deserialize?: (data: unknown) => T;
}

export type PropertyChangeHandler = (options: {
  object: GameObject;
  key: string;
  value: unknown;
  previous: unknown;
}) => void;

export class InspectorRegistry {
  private descriptors = new Map<string, PropertyDescriptor[]>();
  readonly events = new EventBus();

  register(componentName: string, descriptors: PropertyDescriptor[]) {
    this.descriptors.set(componentName, descriptors);
    this.events.emit('inspector-schema-updated', { componentName, descriptors });
  }

  get(componentName: string) {
    return this.descriptors.get(componentName) ?? [];
  }
}

export class InspectorController {
  private changeHandlers: PropertyChangeHandler[] = [];

  constructor(private readonly game: Game, private readonly registry: InspectorRegistry) {}

  inspect(object?: GameObject) {
    if (!object) return [];
    const components = object.components.map((component) => component.constructor.name);
    return components.flatMap((componentName) =>
      this.registry.get(componentName).map((descriptor) => ({ componentName, descriptor })),
    );
  }

  setProperty(target: GameObject, componentName: string, key: string, value: unknown) {
    const component = target.components.find((comp) => comp.constructor.name === componentName);
    if (!component) throw new Error(`Component ${componentName} not found on ${target.name}`);

    const descriptor = this.registry.get(componentName).find((item) => item.key === key);
    if (!descriptor) throw new Error(`Property ${key} is not registered for ${componentName}`);

    const previous = (component as any)[key];
    (component as any)[key] = value;

    for (const handler of this.changeHandlers) {
      handler({ object: target, key, value, previous });
    }
    this.registry.events.emit('property-updated', { object: target, componentName, key, value, previous });
  }

  addChangeHandler(handler: PropertyChangeHandler) {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index >= 0) this.changeHandlers.splice(index, 1);
    };
  }

  serialize(object: GameObject) {
    const result: Record<string, unknown> = {};
    for (const component of object.components) {
      const componentName = component.constructor.name;
      const descriptors = this.registry.get(componentName);
      const componentData: Record<string, unknown> = {};
      for (const descriptor of descriptors) {
        const rawValue = (component as any)[descriptor.key];
        componentData[descriptor.key] = descriptor.serialize ? descriptor.serialize(rawValue) : rawValue;
      }
      result[componentName] = componentData;
    }
    return result;
  }

  deserialize(object: GameObject, data: Record<string, unknown>) {
    for (const component of object.components) {
      const componentName = component.constructor.name;
      const componentData = data[componentName];
      if (!componentData || typeof componentData !== 'object') continue;

      const descriptors = this.registry.get(componentName);
      for (const descriptor of descriptors) {
        if (!(descriptor.key in (componentData as Record<string, unknown>))) continue;
        const rawValue = (componentData as Record<string, unknown>)[descriptor.key];
        (component as any)[descriptor.key] = descriptor.deserialize ? descriptor.deserialize(rawValue) : rawValue;
      }
    }
  }
}
