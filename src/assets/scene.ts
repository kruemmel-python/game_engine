import type { Game } from '../core/Game';
import { GameObject } from '../ecs/GameObject';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildConvex, buildTrimesh } from '../physics/utils';
import { loadGLB } from './gltf';

export interface SceneItem { name?: string; position?: [number,number,number]; rotation?: [number,number,number,number]; scale?: [number,number,number]; dynamic?: boolean; exact?: boolean; source?: string|null; prefab?: string|null; }
export interface SceneJSON { version: 1; items: SceneItem[]; }

export function toSceneJSON(game: Game): SceneJSON {
  const items: SceneItem[] = [];
  for(const o of game.objects){
    if (o.editorOnly) continue;
    if (o.name==='CameraRig') continue;
    const t=o.object3D, mass=(o.body as any)?.mass||0; const exact = (o.body && !(o.body.shapes?.[0] instanceof (CANNON as any).Box));
    items.push({ name:o.name, position:[t.position.x,t.position.y,t.position.z], rotation:[t.quaternion.x,t.quaternion.y,t.quaternion.z,t.quaternion.w], scale:[t.scale.x,t.scale.y,t.scale.z], dynamic: mass>0, exact, source: (t as any).userData?.source||null });
  }
  return { version:1, items };
}

export async function loadScene(game: Game, input: string|SceneJSON){
  const data = typeof input==='string' ? await (await fetch(input)).json() as SceneJSON : input;
  for (const entry of data.items){ await instantiate(game, entry); }
}

export async function instantiate(game: Game, entry: SceneItem){
  if (entry.prefab) throw new Error('Prefab registry not wired in this minimal module');
  if (entry.source){
    const gltf:any = await loadGLB(game, entry.source);
    const root = gltf.scene as THREE.Object3D;
    const body = createBodyFromObject(root, { dynamic: !!entry.dynamic, exact: !!entry.exact });

    if (entry.position) {
      root.position.set(...entry.position);
      body?.position.set(entry.position[0], entry.position[1], entry.position[2]);
      if ((body as any)?.interpolatedPosition) {
        (body as any).interpolatedPosition.set(
          entry.position[0],
          entry.position[1],
          entry.position[2],
        );
      }
    }
    if (entry.rotation) {
      root.quaternion.set(...entry.rotation);
      body?.quaternion.set(
        entry.rotation[0],
        entry.rotation[1],
        entry.rotation[2],
        entry.rotation[3],
      );
      if ((body as any)?.interpolatedQuaternion) {
        (body as any).interpolatedQuaternion.set(
          entry.rotation[0],
          entry.rotation[1],
          entry.rotation[2],
          entry.rotation[3],
        );
      }
    }
    if (entry.scale) root.scale.set(...entry.scale);
    const go = new GameObject({ name: entry.name||entry.source, object3D: root, body }); (root as any).userData.source = entry.source; game.add(go); return go;
  }
  const go = new GameObject({ name: entry.name||'Empty' }); if (entry.position) go.object3D.position.set(...entry.position); if (entry.rotation) go.object3D.quaternion.set(...entry.rotation); if (entry.scale) go.object3D.scale.set(...entry.scale); game.add(go); return go;
}

export function createBodyFromObject(object3D: THREE.Object3D, { dynamic=false, exact=false, mass=3 } = {}){
  let shape: any;
  if (exact){ shape = dynamic ? buildConvex(object3D) : buildTrimesh(object3D); }
  if (!shape){ const box = new THREE.Box3().setFromObject(object3D); const size = new THREE.Vector3(); box.getSize(size); shape = new (CANNON as any).Box(new CANNON.Vec3(size.x/2,size.y/2,size.z/2)); }
  const body = new CANNON.Body({ mass: dynamic? mass: 0, material: new CANNON.Material('default'), shape }); const bbox=new THREE.Box3().setFromObject(object3D); const size=new THREE.Vector3(); bbox.getSize(size); (body as any)._halfHeight = size.y/2; body.position.set(0, Math.max(0.01, size.y/2), 0); return body;
}
