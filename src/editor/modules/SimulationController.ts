import type { Game } from '../../core/Game';
import type { GameObject } from '../../ecs/GameObject';
import type { Editor } from '../Editor';

interface TransformSnapshot {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

type SimulationState = 'stopped' | 'playing' | 'paused';

export class EditorSimulationController {
  private initialTransforms = new Map<GameObject, TransformSnapshot>();
  private state: SimulationState = 'stopped';

  constructor(private editor: Editor, private game: Game) {
    for (const go of game.objects) {
      this.captureInitial(go);
    }
    game.events.on('scene:objectAdded', (go: GameObject) => this.captureInitial(go));
  }

  getState() {
    return this.state;
  }

  play() {
    this.ensureCaptures();
    this.game.setPaused(false);
    this.state = 'playing';
    this.editor.events.emit('simulation:state', this.state);
  }

  pause() {
    this.game.setPaused(true);
    this.state = 'paused';
    this.editor.events.emit('simulation:state', this.state);
  }

  stop({ restore = true } = {}) {
    this.game.setPaused(true);
    this.state = 'stopped';
    if (restore) {
      this.restoreAll();
    }
    this.editor.events.emit('simulation:state', this.state);
  }

  step(dt = this.game.getFixedTimeStep()) {
    const wasPaused = this.game.paused;
    this.game.setPaused(true);
    this.game.stepSimulation(dt);
    this.state = 'paused';
    if (!wasPaused) {
      this.game.setPaused(false);
    }
    this.editor.events.emit('simulation:step', dt);
  }

  resetObject(go: GameObject) {
    const snapshot = this.initialTransforms.get(go);
    if (!snapshot) return false;
    go.object3D.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    go.object3D.quaternion.set(
      snapshot.rotation.x,
      snapshot.rotation.y,
      snapshot.rotation.z,
      snapshot.rotation.w,
    );
    go.object3D.scale.set(snapshot.scale.x, snapshot.scale.y, snapshot.scale.z);
    go.object3D.updateMatrixWorld(true);
    if (go.body) {
      (go.body.position as any).set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      (go.body.quaternion as any).set(
        snapshot.rotation.x,
        snapshot.rotation.y,
        snapshot.rotation.z,
        snapshot.rotation.w,
      );
      (go.body.velocity as any).set(0, 0, 0);
      (go.body.angularVelocity as any).set(0, 0, 0);
    }
    this.editor.events.emit('simulation:resetObject', go);
    return true;
  }

  restoreAll() {
    for (const go of this.initialTransforms.keys()) {
      this.resetObject(go);
    }
    this.editor.events.emit('simulation:restored');
  }

  setPlayFromSelection(go: GameObject) {
    this.editor.select(go);
    this.game.frameObject(go.object3D);
  }

  private ensureCaptures() {
    for (const go of this.game.objects) {
      if (!this.initialTransforms.has(go)) {
        this.captureInitial(go);
      }
    }
  }

  private captureInitial(go: GameObject) {
    this.initialTransforms.set(go, {
      position: { ...go.object3D.position },
      rotation: {
        x: go.object3D.quaternion.x,
        y: go.object3D.quaternion.y,
        z: go.object3D.quaternion.z,
        w: go.object3D.quaternion.w,
      },
      scale: { ...go.object3D.scale },
    });
  }
}
