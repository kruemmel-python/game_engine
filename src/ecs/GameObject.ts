import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { Game } from '../core/Game';
import { Component } from './Component';
export class GameObject {
  name: string;
  object3D: THREE.Object3D;
  body?: CANNON.Body;
  components: Component[] = [];
  game?: Game;
  editorOnly: boolean;
  constructor(opts: {name?:string, object3D?:THREE.Object3D, body?:CANNON.Body, components?: Component[], editorOnly?: boolean} = {}){
    this.name = opts.name ?? 'GameObject';
    this.object3D = opts.object3D ?? new THREE.Object3D();
    this.body = opts.body;
    this.editorOnly = opts.editorOnly ?? false;
    (opts.components ?? []).forEach(c => this.addComponent(c));
  }
  addedTo(game: Game){
    this.game = game;
    this.components.forEach(c => c.onAdded(game, this));
  }
  addComponent(c: Component){
    this.components.push(c);
    if (this.game) {
      c.onAdded(this.game, this);
    }
  }
  removeComponent(c: Component){ const i=this.components.indexOf(c); if(i>=0){ this.components.splice(i,1); c.onRemoved(); } }
  update(dt: number){
    if (this.body){
      const p = (this.body as any).position; const q = (this.body as any).quaternion;
      this.object3D.position.set(p.x,p.y,p.z);
      this.object3D.quaternion.set(q.x,q.y,q.z,q.w);
    }
    for (const comp of this.components) if (comp.enabled) comp.update(dt);
  }
}
