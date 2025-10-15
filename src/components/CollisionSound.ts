import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { Component } from '../ecs/Component'; import { AudioComponent } from '../audio/AudioComponent';
export class CollisionSound extends Component {
  url=''; minSpeed=0.5; cooldown=0.1; private last=0; private audio?: AudioComponent; private off?: ()=>void;
  async onAdded(game: Game, owner: GameObject){ super.onAdded(game, owner); this.audio = new AudioComponent({ url:this.url, positional:true, refDistance:4 }); this.owner.addComponent(this.audio); this.off = this.game.events.on('collision', ({ self, raw }: any)=>{ if(self!==this.owner) return; const now=performance.now()/1000; const impact = raw.contact.getImpactVelocityAlongNormal(); if(impact>this.minSpeed && now-this.last>this.cooldown){ this.audio!.play(); this.last=now; } }); }
  onRemoved(){ this.off?.(); }
}
