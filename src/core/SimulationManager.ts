import type { Game } from './Game';
import type { GameObject } from '../ecs/GameObject';

type SystemFn = (game: Game, dt: number) => void;
type GameObjectSystemFn = (game: Game, object: GameObject, dt: number) => void;

export interface SimulationLayer {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  systems: SystemFn[];
  objectSystems: GameObjectSystemFn[];
}

export class SimulationManager {
  readonly layers = new Map<string, SimulationLayer>();

  constructor(private readonly game: Game) {}

  addLayer(id: string, options: { label?: string; order?: number }) {
    if (this.layers.has(id)) throw new Error(`Layer ${id} already exists`);
    const layer: SimulationLayer = {
      id,
      label: options.label ?? id,
      enabled: true,
      order: options.order ?? this.layers.size,
      systems: [],
      objectSystems: [],
    };
    this.layers.set(id, layer);
    return layer;
  }

  addSystem(layerId: string, system: SystemFn) {
    const layer = this.layers.get(layerId) ?? this.addLayer(layerId, {});
    layer.systems.push(system);
  }

  addObjectSystem(layerId: string, system: GameObjectSystemFn) {
    const layer = this.layers.get(layerId) ?? this.addLayer(layerId, {});
    layer.objectSystems.push(system);
  }

  run(dt: number) {
    const ordered = [...this.layers.values()].filter((layer) => layer.enabled).sort((a, b) => a.order - b.order);
    for (const layer of ordered) {
      for (const system of layer.systems) system(this.game, dt);
      for (const object of this.game.objects) {
        for (const system of layer.objectSystems) system(this.game, object, dt);
      }
    }
  }
}
