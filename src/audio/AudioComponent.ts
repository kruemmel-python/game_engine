import * as THREE from 'three';
import { Component } from '../ecs/Component';
export class AudioComponent extends Component {
  url: string = '';
  loop=false; autoplay=false; positional=true; refDistance=5;
  sound?: THREE.PositionalAudio|THREE.Audio; _loaded=false;
  constructor(opts: Partial<AudioComponent> = {}){ super(); Object.assign(this, opts); }
  async onAdded(){ 
    const audio = this.positional ? new THREE.PositionalAudio(this.game.listener) : new THREE.Audio(this.game.listener);
    this.sound = audio as any; if (this.positional) (audio as THREE.PositionalAudio).setRefDistance(this.refDistance);
    this.owner.object3D.add(audio as any);
    try {
      const buffer = await new Promise<AudioBuffer>((res,rej)=> this.game.audioLoader.load(this.url, res, undefined, rej));
      (audio as any).setBuffer(buffer); (audio as any).setLoop(this.loop); this._loaded = true; if (this.autoplay) (audio as any).play();
    } catch(e){ console.error('Audio load failed', e); }
  }
  play(){ if (this._loaded) (this.sound as any)?.play(); }
  stop(){ (this.sound as any)?.stop(); }
}
