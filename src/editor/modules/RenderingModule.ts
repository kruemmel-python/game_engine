import { Color, Mesh, Object3D } from 'three';
import type { EditorContext, EditorModule } from './types';

type LightingPreset = 'studio' | 'sunset' | 'night';

type RenderFlag = 'wireframe' | 'shadows' | 'postfx';

export class RenderingModule implements EditorModule {
  readonly id = 'rendering';
  readonly label = 'Physik, Licht & Rendering';

  private lightCache: Object3D[] = [];
  private flags: Record<RenderFlag, boolean> = {
    wireframe: false,
    shadows: true,
    postfx: true,
  };

  constructor(private readonly ctx: EditorContext) {
    this.cacheLights();
  }

  dispose(): void {
    this.lightCache = [];
  }

  setPhysicsPaused(paused: boolean) {
    this.ctx.game.paused = paused;
  }

  stepPhysics(time = 1 / 60) {
    const game = this.ctx.game;
    game.world.step(time);
    for (const object of game.objects) {
      object.update(time);
    }
    game.renderer.render(game.scene, game.camera);
  }

  applyLightingPreset(preset: LightingPreset) {
    const ambient = this.findLight('HemisphereLight');
    const key = this.findLight('DirectionalLight');
    switch (preset) {
      case 'studio':
        if (ambient) (ambient as any).intensity = 0.6;
        if (key) (key as any).intensity = 1.3;
        break;
      case 'sunset':
        if (ambient) {
          (ambient as any).intensity = 0.45;
          (ambient as any).color = new Color('#f6d365');
        }
        if (key) {
          (key as any).intensity = 1.0;
          (key as any).color = new Color('#fda085');
        }
        break;
      case 'night':
        if (ambient) {
          (ambient as any).intensity = 0.2;
          (ambient as any).color = new Color('#6a85b6');
        }
        if (key) {
          (key as any).intensity = 0.4;
          (key as any).color = new Color('#bac8e0');
        }
        break;
    }
  }

  setRenderFlag(flag: RenderFlag, value: boolean) {
    this.flags[flag] = value;
    switch (flag) {
      case 'wireframe':
        this.toggleWireframe(value);
        break;
      case 'shadows':
        this.ctx.game.renderer.shadowMap.enabled = value;
        this.toggleShadows(value);
        break;
      case 'postfx':
        this.ctx.game.renderer.toneMappingExposure = value ? 1 : 0.8;
        break;
    }
  }

  getRenderFlag(flag: RenderFlag) {
    return this.flags[flag];
  }

  private cacheLights() {
    this.lightCache = [];
    this.ctx.game.scene.traverse((obj) => {
      if ((obj as any).isLight) this.lightCache.push(obj);
    });
  }

  private findLight(type: string) {
    return this.lightCache.find((light) => (light as any).type === type);
  }

  private toggleWireframe(enabled: boolean) {
    this.ctx.game.scene.traverse((obj) => {
      if (obj instanceof Mesh && Array.isArray((obj.material as any))) {
        for (const mat of obj.material as any[]) {
          if ('wireframe' in mat) mat.wireframe = enabled;
        }
      } else if (obj instanceof Mesh) {
        const mat = obj.material as any;
        if (mat && 'wireframe' in mat) mat.wireframe = enabled;
      }
    });
  }

  private toggleShadows(enabled: boolean) {
    this.ctx.game.scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = enabled;
        obj.receiveShadow = enabled;
      }
    });
  }
}
