import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';

export interface SceneNode {
  id: string;
  name: string;
  object: GameObject;
  children: SceneNode[];
}

export interface InspectorProperty<T = unknown> {
  target: object;
  path: string[];
  label: string;
  type: 'number' | 'string' | 'boolean' | 'vector3' | 'color' | 'any';
  value: T;
  writable: boolean;
  onChange?: (value: T) => void;
}

export interface InspectorPanelState {
  title: string;
  properties: InspectorProperty[];
}

export interface EditorModule {
  readonly id: string;
  readonly label: string;
  dispose(): void;
}

export interface EditorContext {
  readonly game: Game;
  select(go?: GameObject): void;
  getSelection(): GameObject | undefined;
}
