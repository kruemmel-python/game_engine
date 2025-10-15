import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import type { Editor } from '../Editor';

type AxisPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

interface Bookmark {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export class EditorNavigationTools {
  private bookmarks = new Map<string, Bookmark>();
  private speedMultiplier = 1;

  constructor(private editor: Editor, private game: Game) {}

  saveBookmark(name: string) {
    this.bookmarks.set(name, {
      position: this.game.camera.position.clone(),
      target: this.game.controls.target.clone(),
      fov: this.game.camera.fov,
    });
    this.editor.events.emit('navigation:bookmarkSaved', { name });
  }

  loadBookmark(name: string) {
    const bookmark = this.bookmarks.get(name);
    if (!bookmark) return false;
    this.game.camera.position.copy(bookmark.position);
    this.game.camera.fov = bookmark.fov;
    this.game.camera.updateProjectionMatrix();
    this.game.controls.target.copy(bookmark.target);
    this.game.controls.update();
    this.editor.events.emit('navigation:bookmarkLoaded', { name });
    return true;
  }

  deleteBookmark(name: string) {
    const removed = this.bookmarks.delete(name);
    if (removed) {
      this.editor.events.emit('navigation:bookmarkDeleted', { name });
    }
    return removed;
  }

  listBookmarks() {
    return Array.from(this.bookmarks.keys());
  }

  setCameraSpeed(multiplier: number) {
    this.speedMultiplier = Math.max(0.05, multiplier);
    const controls: any = this.game.controls;
    controls.panSpeed = 1.0 * this.speedMultiplier;
    controls.rotateSpeed = 1.0 * this.speedMultiplier;
    controls.zoomSpeed = 1.0 * this.speedMultiplier;
    this.editor.events.emit('navigation:speedChanged', this.speedMultiplier);
  }

  focus(go?: GameObject) {
    const target = go ?? this.editor.selected;
    if (!target) return false;
    this.game.frameObject(target.object3D);
    return true;
  }

  viewAxis(preset: AxisPreset, distance = 10) {
    const dir = new THREE.Vector3();
    switch (preset) {
      case 'front':
        dir.set(0, 0, 1);
        break;
      case 'back':
        dir.set(0, 0, -1);
        break;
      case 'left':
        dir.set(-1, 0, 0);
        break;
      case 'right':
        dir.set(1, 0, 0);
        break;
      case 'top':
        dir.set(0, 1, 0);
        break;
      case 'bottom':
        dir.set(0, -1, 0);
        break;
    }

    const pivot = this.editor.selected?.object3D.position ?? new THREE.Vector3();
    const pos = pivot.clone().add(dir.normalize().multiplyScalar(distance));
    this.game.camera.position.copy(pos);
    this.game.controls.target.copy(pivot);
    this.game.controls.update();
    this.editor.events.emit('navigation:viewAxis', { preset, distance });
  }

  frameWorldOrigin(distance = 15) {
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    const pos = target.clone().add(dir.multiplyScalar(distance));
    this.game.camera.position.copy(pos);
    this.game.controls.target.copy(target);
    this.game.controls.update();
    this.editor.events.emit('navigation:frameOrigin', distance);
  }

  dolly(amount: number) {
    const dir = new THREE.Vector3();
    dir.subVectors(this.game.camera.position, this.game.controls.target).normalize();
    this.game.camera.position.addScaledVector(dir, amount * this.speedMultiplier);
    this.game.controls.update();
    this.editor.events.emit('navigation:dolly', amount);
  }
}
