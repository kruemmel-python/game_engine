import * as THREE from 'three';
import type { Game } from '../core/Game';
import { EventBus } from '../core/EventBus';

export interface FogSettings {
  color: number | string;
  near: number;
  far: number;
}

export class EnvironmentToolset {
  readonly events = new EventBus();

  constructor(private game: Game) {}

  setGravity(x: number, y: number, z: number) {
    this.game.world.gravity.set(x, y, z);
    this.events.emit('gravity', { x, y, z });
  }

  togglePhysicsDebug(enabled: boolean) {
    this.game.events.emit('physics-debug', enabled);
  }

  setShadowQuality(size: 512 | 1024 | 2048 | 4096) {
    const light = this.game.directionalLight;
    light.shadow.mapSize.set(size, size);
    light.shadow.needsUpdate = true;
    this.events.emit('shadow-quality', size);
  }

  setExposure(value: number) {
    this.game.renderer.toneMappingExposure = value;
    this.events.emit('exposure', value);
  }

  setAmbientIntensity(intensity: number) {
    this.game.hemisphereLight.intensity = intensity;
    this.events.emit('ambient', intensity);
  }

  setDirectionalColor(color: THREE.ColorRepresentation) {
    this.game.directionalLight.color = new THREE.Color(color);
    this.events.emit('directional-color', color);
  }

  configureFog(settings?: FogSettings) {
    if (!settings) {
      this.game.scene.fog = null;
      this.events.emit('fog', null);
      return;
    }
    const fog = new THREE.Fog(settings.color as any, settings.near, settings.far);
    this.game.scene.fog = fog;
    this.events.emit('fog', settings);
  }

  showGrid(visible: boolean) {
    this.game.gridHelper.visible = visible;
    this.events.emit('grid', visible);
  }
}
