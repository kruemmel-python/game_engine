import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

export function buildTrimesh(object3D: THREE.Object3D){
  const positions:number[]=[]; const indices:number[]=[]; let offset=0;
  object3D.updateWorldMatrix(true,true);
  object3D.traverse((obj:any)=>{
    if (obj.isMesh && obj.geometry){
      const g = obj.geometry.clone(); g.applyMatrix4(obj.matrixWorld);
      const pos = g.attributes.position; const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
      for(let i=0;i<pos.count;i++){ positions.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
      for(let i=0;i<idx.length;i++){ indices.push(idx[i]+offset); }
      offset += pos.count;
    }
  });
  return new CANNON.Trimesh(new Float32Array(positions), new Uint32Array(indices));
}

export function buildConvex(object3D: THREE.Object3D){
  const verts: THREE.Vector3[] = [];
  object3D.updateWorldMatrix(true,true);
  object3D.traverse((obj:any)=>{
    if (obj.isMesh && obj.geometry){
      const g = obj.geometry.clone(); g.applyMatrix4(obj.matrixWorld); const pos = g.attributes.position;
      for(let i=0;i<pos.count;i++){ verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
    }
  });
  if (verts.length < 4) return null;
  const hull = new ConvexGeometry(verts);
  const points = []; const faces:number[][] = [];
  const pos = hull.attributes.position; const idx = hull.index ? hull.index.array : [...Array(pos.count).keys()];
  for(let i=0;i<pos.count;i++){ points.push(new CANNON.Vec3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
  for(let i=0;i<idx.length; i+=3){ faces.push([idx[i], idx[i+1], idx[i+2]]); }
  return new (CANNON as any).ConvexPolyhedron({ vertices: points, faces });
}
