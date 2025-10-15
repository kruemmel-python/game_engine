import type { Game } from '../core/Game';
import type { GameObject } from './GameObject';
export abstract class Component {
  enabled = true;
  game!: Game;
  owner!: GameObject;
  onAdded(game: Game, owner: GameObject) { this.game = game; this.owner = owner; }
  onRemoved() {}
  update(dt: number) {}
}
