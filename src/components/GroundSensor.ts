import { Component } from '../ecs/Component';
import * as CANNON from 'cannon-es';
export class GroundSensor extends Component {
  epsilon = 0.05; grounded=false; normal = new CANNON.Vec3();
  update(){ const body:any=this.owner.body; if(!body) return; const from=body.position.clone(); const to = new CANNON.Vec3(from.x, from.y - ((body._halfHeight||0.5)+this.epsilon), from.z); const res = new CANNON.RaycastResult(); this.grounded=false; this.game.world.raycastClosest(from, to, {skipBackfaces:true}, res); if(res.hasHit){ this.grounded=true; this.normal.copy(res.hitNormalWorld); } }
}
