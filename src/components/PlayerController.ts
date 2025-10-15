import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { Component } from '../ecs/Component';
import * as THREE from 'three'; import * as CANNON from 'cannon-es';
import { GroundSensor } from './GroundSensor';
export class PlayerController extends Component {
  speed = 8; jumpStrength = 4.5; private wantJump=false; keys = new Set<string>();
  onAdded(game: Game, owner: GameObject){ super.onAdded(game, owner); addEventListener('keydown', (e)=> this.keys.add(e.key.toLowerCase())); addEventListener('keyup', (e)=> this.keys.delete(e.key.toLowerCase())); }
  private axisH(){ return (this.keys.has('d')?1:0) - (this.keys.has('a')?1:0); }
  private axisV(){ return (this.keys.has('w')?1:0) - (this.keys.has('s')?1:0); }
  update(){ const body:any=this.owner.body; if(!body) return; const v=this.axisV(), h=this.axisH(); const fwd=new THREE.Vector3(); this.game.camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize(); const right=new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).negate(); const move=new THREE.Vector3().addScaledVector(fwd,v).addScaledVector(right,h); if(move.lengthSq()>0){ move.normalize(); body.applyForce(new CANNON.Vec3(move.x*this.speed,0,move.z*this.speed), body.position); } if(this.keys.has(' ')) this.wantJump=true; const sensor=this.owner.components.find(c=> c instanceof GroundSensor) as GroundSensor; if(this.wantJump && sensor?.grounded){ body.applyImpulse(new CANNON.Vec3(0,this.jumpStrength,0)); this.wantJump=false; } body.velocity.x*=0.985; body.velocity.z*=0.985; }
  horizontalSpeed(){ const v:any=this.owner.body?.velocity; return Math.hypot(v?.x||0, v?.z||0); }
}
