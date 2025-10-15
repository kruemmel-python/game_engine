import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import { Component } from '../ecs/Component';

export class CameraFollow extends Component {
  target?: any;
  distance = 3.5;
  height = 1.4;
  yaw = 0;
  pitch = (-10 * Math.PI) / 180;
  sensitivity = 0.002;
  lookAtOffset = new THREE.Vector3(0, 1, 0);
  alignTargetYaw = true;
  active = true;
  private dragging = false;
  private currentTarget?: GameObject;
  private targetYawOffset = 0;
  private targetQuat = new THREE.Quaternion();
  private targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private desiredPos = new THREE.Vector3();
  private offsetVec = new THREE.Vector3();
  private orbitEnabledBefore = true;

  constructor(init: Partial<CameraFollow> = {}) {
    super();
    Object.assign(this, init);
  }

  private onDown = (e: MouseEvent) => {
    if (!this.active) return;
    if (e.button === 0 || e.button === 2) this.dragging = true;
  };
  private onUp = () => {
    this.dragging = false;
  };
  private onMove = (e: MouseEvent) => {
    if (!this.active || !this.dragging) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  };
  private onCtx = (e: MouseEvent) => e.preventDefault();

  onAdded(game: Game, owner: GameObject) {
    super.onAdded(game, owner);
    this.orbitEnabledBefore = this.game.controls.enabled;
    if (this.active) {
      this.game.controls.enabled = false;
    }
    const el = this.game.renderer.domElement;
    el.addEventListener('mousedown', this.onDown);
    addEventListener('mouseup', this.onUp);
    addEventListener('mousemove', this.onMove);
    el.addEventListener('contextmenu', this.onCtx);
  }

  onRemoved() {
    if (this.game && this.active) {
      this.game.controls.enabled = this.orbitEnabledBefore;
    }
    this.dragging = false;
    const el = this.game.renderer.domElement;
    el.removeEventListener('mousedown', this.onDown);
    removeEventListener('mouseup', this.onUp);
    removeEventListener('mousemove', this.onMove);
    el.removeEventListener('contextmenu', this.onCtx);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!this.game) return;
    if (active) {
      this.orbitEnabledBefore = this.game.controls.enabled;
      this.game.controls.enabled = false;
      this.syncTargetYawFromCurrent();
    } else {
      this.game.controls.enabled = this.orbitEnabledBefore;
      this.dragging = false;
    }
  }

  isActive() {
    return this.active;
  }

  private syncTargetYawFromCurrent() {
    if (!this.currentTarget) return;
    this.targetEuler.setFromQuaternion(this.currentTarget.object3D.quaternion, 'YXZ');
    this.targetYawOffset = this.targetEuler.y - this.yaw;
  }

  private ensureTargetCached() {
    const go = this.target as GameObject | undefined;
    if (!go) {
      this.currentTarget = undefined;
      return;
    }
    if (this.currentTarget === go) return;
    this.currentTarget = go;
    this.syncTargetYawFromCurrent();
  }

  update(dt: number) {
    if (!this.active) return;
    this.ensureTargetCached();
    if (!this.currentTarget) return;
    const cam = this.game.camera;
    const t = this.currentTarget.object3D.position;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.desiredPos
      .set(this.distance * cp * sy, this.height + this.distance * sp, this.distance * cp * cy)
      .add(t);

    const from = new CANNON.Vec3(t.x, t.y + this.lookAtOffset.y, t.z);
    const to = new CANNON.Vec3(this.desiredPos.x, this.desiredPos.y, this.desiredPos.z);
    const res = new CANNON.RaycastResult();
    const hit = this.game.world.raycastClosest(from, to, { skipBackfaces: true }, res);
    const finalPos = this.offsetVec.copy(this.desiredPos);
    if (hit && res.hasHit) {
      const n = new THREE.Vector3(res.hitNormalWorld.x, res.hitNormalWorld.y, res.hitNormalWorld.z);
      const p = res.hitPointWorld;
      finalPos.set(p.x, p.y, p.z).add(n.multiplyScalar(0.2));
    }
    cam.position.lerp(finalPos, 1 - Math.exp(-10 * dt));
    this.game.controls.target.copy(new THREE.Vector3(t.x, t.y, t.z).add(this.lookAtOffset));

    if (this.alignTargetYaw && this.currentTarget) {
      const desiredYaw = this.yaw + this.targetYawOffset;
      this.targetEuler.setFromQuaternion(this.currentTarget.object3D.quaternion, 'YXZ');
      this.targetEuler.y = desiredYaw;
      this.targetEuler.x = 0;
      this.targetEuler.z = 0;
      this.targetQuat.setFromEuler(this.targetEuler);
      this.currentTarget.object3D.quaternion.slerp(
        this.targetQuat,
        1 - Math.exp(-14 * dt),
      );
      const body: any = this.currentTarget.body;
      if (body) {
        body.quaternion.set(
          this.currentTarget.object3D.quaternion.x,
          this.currentTarget.object3D.quaternion.y,
          this.currentTarget.object3D.quaternion.z,
          this.currentTarget.object3D.quaternion.w,
        );
        if (body.interpolatedQuaternion) {
          body.interpolatedQuaternion.set(
            body.quaternion.x,
            body.quaternion.y,
            body.quaternion.z,
            body.quaternion.w,
          );
        }
      }
    }
  }
}
