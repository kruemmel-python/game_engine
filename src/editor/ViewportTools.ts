import * as THREE from 'three';
import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';

export interface NavigationState {
  speed: number;
  panSpeed: number;
  zoomSpeed: number;
  pivot: THREE.Vector3;
}

export class ViewportTools {
  readonly events = new EventBus();
  readonly navigation: NavigationState;
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly game: Game) {
    this.navigation = {
      speed: 6,
      panSpeed: 0.65,
      zoomSpeed: 1.5,
      pivot: new THREE.Vector3(),
    };
  }

  frameSelection(selection: THREE.Object3D | undefined) {
    if (!selection) return;
    this.game.frameObject(selection);
    this.navigation.pivot.copy(this.game.controls.target);
    this.events.emit('framed', selection);
  }

  focusGrid() {
    this.frameSelection(undefined);
    this.game.controls.target.set(0, 0, 0);
    this.events.emit('grid-focused', undefined);
  }

  pick(point: THREE.Vector2) {
    this.raycaster.setFromCamera(point, this.game.camera);
    const hits = this.raycaster.intersectObjects(this.game.scene.children, true);
    return hits[0];
  }

  fly(delta: THREE.Vector3) {
    const { camera } = this.game;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const right = new THREE.Vector3().copy(direction).cross(camera.up).normalize();
    const up = new THREE.Vector3().copy(camera.up).normalize();

    camera.position.addScaledVector(direction, delta.z * this.navigation.speed);
    camera.position.addScaledVector(right, delta.x * this.navigation.speed);
    camera.position.addScaledVector(up, delta.y * this.navigation.speed);
    this.game.controls.target.addScaledVector(direction, delta.z * this.navigation.speed);
    this.game.controls.target.addScaledVector(right, delta.x * this.navigation.speed);
    this.game.controls.target.addScaledVector(up, delta.y * this.navigation.speed);

    this.events.emit('camera-moved', { position: camera.position.clone(), target: this.game.controls.target.clone() });
  }

  updateNavigation(options: Partial<NavigationState>) {
    Object.assign(this.navigation, options);
    this.events.emit('navigation-updated', this.navigation);
  }
}
