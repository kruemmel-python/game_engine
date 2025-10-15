import type * as THREE from 'three';
import { EventBus } from '../core/EventBus';
import type { Game } from '../core/Game';
import type { Editor } from './Editor';

interface CameraBookmark {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export class NavigationToolset {
  readonly events = new EventBus();
  private bookmarks = new Map<string, CameraBookmark>();
  private lastPanSpeed = 1;
  private lastRotateSpeed = 1;

  constructor(private game: Game, private editor: Editor) {
    this.game.controls.addEventListener('change', () => {
      this.events.emit('camera-changed', this.snapshotCamera());
    });
  }

  focusOnSelection() {
    const selected = this.editor.selected?.object3D;
    if (!selected) return;
    this.game.frameObject(selected);
    this.events.emit('focus', selected);
  }

  setNavigationSpeed({ rotate, pan }: { rotate?: number; pan?: number }) {
    if (typeof rotate === 'number') {
      this.game.controls.rotateSpeed = rotate;
      this.lastRotateSpeed = rotate;
    }
    if (typeof pan === 'number') {
      this.game.controls.panSpeed = pan;
      this.lastPanSpeed = pan;
    }
    this.events.emit('navigation-speed', {
      rotate: this.game.controls.rotateSpeed,
      pan: this.game.controls.panSpeed,
    });
  }

  temporarilyBoostSpeed(multiplier = 4) {
    this.game.controls.rotateSpeed = this.lastRotateSpeed * multiplier;
    this.game.controls.panSpeed = this.lastPanSpeed * multiplier;
    this.events.emit('navigation-boost', multiplier);
  }

  restoreSpeed() {
    this.game.controls.rotateSpeed = this.lastRotateSpeed;
    this.game.controls.panSpeed = this.lastPanSpeed;
  }

  saveBookmark(name: string) {
    this.bookmarks.set(name, this.snapshotCamera());
    this.events.emit('bookmark', { name });
  }

  loadBookmark(name: string) {
    const bookmark = this.bookmarks.get(name);
    if (!bookmark) return false;
    this.game.camera.position.copy(bookmark.position);
    this.game.controls.target.copy(bookmark.target);
    this.game.controls.update();
    this.events.emit('bookmark-loaded', { name });
    return true;
  }

  listBookmarks() {
    return Array.from(this.bookmarks.keys());
  }

  private snapshotCamera(): CameraBookmark {
    return {
      position: this.game.camera.position.clone(),
      target: this.game.controls.target.clone(),
    };
  }
}
