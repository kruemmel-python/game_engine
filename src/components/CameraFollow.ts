import * as THREE from 'three'; import * as CANNON from 'cannon-es'; import { Component } from '../ecs/Component';
export class CameraFollow extends Component {
  target?: any; distance=3.5; height=1.4; yaw=0; pitch=-10*Math.PI/180; sensitivity=0.002; lookAtOffset=new THREE.Vector3(0,1,0); private dragging=false;
  private onDown=(e:MouseEvent)=>{ if(e.button===0||e.button===2) this.dragging=true; };
  private onUp=()=>{ this.dragging=false; };
  private onMove=(e:MouseEvent)=>{ if(!this.dragging) return; this.yaw -= e.movementX*this.sensitivity; this.pitch -= e.movementY*this.sensitivity; this.pitch = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, this.pitch)); };
  private onCtx=(e:MouseEvent)=> e.preventDefault();
  onAdded(){ this.game.controls.enabled=false; const el=this.game.renderer.domElement; el.addEventListener('mousedown', this.onDown); addEventListener('mouseup', this.onUp); addEventListener('mousemove', this.onMove); el.addEventListener('contextmenu', this.onCtx); }
  onRemoved(){ const el=this.game.renderer.domElement; el.removeEventListener('mousedown', this.onDown); removeEventListener('mouseup', this.onUp); removeEventListener('mousemove', this.onMove); el.removeEventListener('contextmenu', this.onCtx); }
  update(dt:number){ if(!this.target) return; const cam=this.game.camera; const t=this.target.object3D.position; const cp=Math.cos(this.pitch), sp=Math.sin(this.pitch), cy=Math.cos(this.yaw), sy=Math.sin(this.yaw); const desired=new THREE.Vector3( this.distance*cp*sy, this.height+this.distance*sp, this.distance*cp*cy ).add(t);
    const from = new CANNON.Vec3(t.x, t.y + this.lookAtOffset.y, t.z); const to = new CANNON.Vec3(desired.x, desired.y, desired.z); const res = new CANNON.RaycastResult(); const hit = this.game.world.raycastClosest(from, to, {skipBackfaces:true}, res);
    const finalPos = desired.clone(); if(hit && res.hasHit){ const n = new THREE.Vector3(res.hitNormalWorld.x, res.hitNormalWorld.y, res.hitNormalWorld.z); const p = res.hitPointWorld; finalPos.set(p.x,p.y,p.z).add(n.multiplyScalar(0.2)); }
    cam.position.lerp(finalPos, 1 - Math.exp(-10*dt)); this.game.controls.target.copy(new THREE.Vector3(t.x,t.y,t.z).add(this.lookAtOffset)); }
}
