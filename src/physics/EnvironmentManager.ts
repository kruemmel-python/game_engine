import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Game } from '../core/Game';

export interface PhysicsConfig {
  gravity: CANNON.Vec3;
  iterations: number;
  allowSleep: boolean;
}

export interface LightingConfig {
  ambient: THREE.ColorRepresentation;
  directional: {
    color: THREE.ColorRepresentation;
    intensity: number;
    position: THREE.Vector3;
  };
}

export interface RenderingConfig {
  exposure: number;
  shadows: boolean;
}

export class EnvironmentManager {
  physics: PhysicsConfig;
  lighting: LightingConfig;
  rendering: RenderingConfig;

  constructor(private readonly game: Game) {
    this.physics = {
      gravity: new CANNON.Vec3(0, -9.81, 0),
      iterations: 10,
      allowSleep: true,
    };
    this.lighting = {
      ambient: 0x404040,
      directional: {
        color: 0xffffff,
        intensity: 1,
        position: new THREE.Vector3(10, 15, 10),
      },
    };
    this.rendering = {
      exposure: 1,
      shadows: true,
    };
  }

  applyPhysics() {
    this.game.world.gravity.copy(this.physics.gravity);
    (this.game.world as any).allowSleep = this.physics.allowSleep;
    (this.game.world.solver as any).iterations = this.physics.iterations;
  }

  applyLighting() {
    const { scene } = this.game;
    let directional = scene.children.find((object) => object.userData?.__engineLight === 'directional') as
      | THREE.DirectionalLight
      | undefined;
    if (!directional) {
      directional = new THREE.DirectionalLight();
      directional.userData.__engineLight = 'directional';
      scene.add(directional);
    }
    directional.color = new THREE.Color(this.lighting.directional.color as THREE.ColorRepresentation);
    directional.intensity = this.lighting.directional.intensity;
    directional.position.copy(this.lighting.directional.position);

    let ambient = scene.children.find((object) => object.userData?.__engineLight === 'ambient') as
      | THREE.HemisphereLight
      | undefined;
    if (!ambient) {
      ambient = new THREE.HemisphereLight();
      ambient.userData.__engineLight = 'ambient';
      scene.add(ambient);
    }
    ambient.color = new THREE.Color(this.lighting.ambient as THREE.ColorRepresentation);
  }

  applyRendering() {
    this.game.renderer.toneMappingExposure = this.rendering.exposure;
    this.game.renderer.shadowMap.enabled = this.rendering.shadows;
  }
}
