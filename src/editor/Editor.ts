import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Game } from '../core/Game';
import { GameObject } from '../ecs/GameObject';

export class Editor {
  gizmo: TransformControls;
  selected?: GameObject;
  constructor(public game: Game){ this.gizmo = new TransformControls(game.camera, game.renderer.domElement); this.gizmo.visible=false; game.scene.add(this.gizmo); this.gizmo.addEventListener('dragging-changed', (e:any)=>{ game.controls.enabled = !e.value; }); }
  select(go?: GameObject){ this.selected = go; if(go){ this.gizmo.visible = true; this.gizmo.attach(go.object3D); } else { this.gizmo.visible = false; this.gizmo.detach(); } }
}
