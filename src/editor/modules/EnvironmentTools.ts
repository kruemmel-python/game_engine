import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Editor } from '../Editor';

export class EditorEnvironmentTools {
  private shadowEnabled = this.game.renderer.shadowMap.enabled;
  private autoPauseOnBlur = false;
  private blurHandler = () => {
    if (this.autoPauseOnBlur) {
      this.game.setPaused(true);
    }
  };

  constructor(private editor: Editor, private game: Game) {
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.blurHandler);
    }
  }

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.blurHandler);
    }
  }

  togglePhysics(enabled: boolean) {
    this.game.setPaused(!enabled);
    this.editor.events.emit('environment:physics', enabled);
  }

  setGravity(x: number, y: number, z: number) {
    this.game.world.gravity.set(x, y, z);
    this.editor.events.emit('environment:gravity', { x, y, z });
  }

  setShadowEnabled(enabled: boolean) {
    this.shadowEnabled = enabled;
    this.game.renderer.shadowMap.enabled = enabled;
    this.editor.events.emit('environment:shadows', enabled);
  }

  toggleHelpers(visible: boolean) {
    this.game.setHelpersVisible(visible);
  }

  setHemisphereIntensity(intensity: number) {
    this.game.hemiLight.intensity = intensity;
    this.editor.events.emit('environment:hemi', intensity);
  }

  setDirectionalIntensity(intensity: number) {
    this.game.dirLight.intensity = intensity;
    this.editor.events.emit('environment:dir', intensity);
  }

  setAmbientColor(color: THREE.ColorRepresentation) {
    this.game.hemiLight.color = new THREE.Color(color);
    this.editor.events.emit('environment:ambientColor', this.game.hemiLight.color);
  }

  setEnvironmentMap(texture?: THREE.Texture) {
    this.game.setEnvironmentMap(texture);
  }

  setToneMappingExposure(value: number) {
    this.game.renderer.toneMappingExposure = value;
    this.editor.events.emit('environment:exposure', value);
  }

  setAutoPauseOnBlur(enabled: boolean) {
    this.autoPauseOnBlur = enabled;
  }

  setTimeScale(scale: number) {
    this.game.setTimeScale(scale);
  }
}
