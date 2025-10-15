import { GameObject } from '../ecs/GameObject';
import type { Game } from '../core/Game';
import { loadGLB } from './gltf';

export interface PrefabData {
  version: 1;
  name: string;
  source?: string|null;
  transform?: { position?: [number,number,number], rotation?: [number,number,number,number], scale?: [number,number,number] };
  components?: { type: string, params?: Record<string, any> }[];
}

export async function exportPrefab(go: GameObject){
  const data: PrefabData = {
    version: 1, name: go.name,
    source: (go.object3D as any).userData?.source || null,
    transform: { position:[go.object3D.position.x,go.object3D.position.y,go.object3D.position.z], rotation:[go.object3D.quaternion.x,go.object3D.quaternion.y,go.object3D.quaternion.z,go.object3D.quaternion.w], scale:[go.object3D.scale.x,go.object3D.scale.y,go.object3D.scale.z] },
    components: go.components.map(c => ({ type: (c as any).constructor?.name || 'Component', params: Object.fromEntries(Object.entries(c).filter(([k,v]) => typeof v!=='function' && !k.startsWith('_') && k!=='game' && k!=='owner')) }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=(go.name||'prefab')+'.prefab.json'; a.click(); URL.revokeObjectURL(url);
}

export async function importPrefab(game: Game, file: File){
  const text = await file.text(); const data = JSON.parse(text) as PrefabData;
  let go: GameObject;
  if (data.source){ const gltf:any = await loadGLB(game, data.source); go = new GameObject({ name: data.name, object3D: gltf.scene }); (gltf.scene as any).userData.source = data.source; }
  else { go = new GameObject({ name: data.name }); }
  const t = data.transform||{}; if (t.position) go.object3D.position.set(...t.position); if (t.rotation) go.object3D.quaternion.set(...t.rotation); if (t.scale) go.object3D.scale.set(...t.scale);
  game.add(go); return go;
}
