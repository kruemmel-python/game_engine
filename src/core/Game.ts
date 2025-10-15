import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import { PMREMGenerator, UnsignedByteType, Color, Box3, Vector3, Raycaster } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EventBus } from './EventBus';
import { GameObject } from '../ecs/GameObject';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 3000);
  controls: OrbitControls;
  world: CANNON.World;
  defaultMat: CANNON.Material;
  events = new EventBus();
  objects: GameObject[] = [];
  pmrem: PMREMGenerator;
  listener: THREE.AudioListener;
  audioLoader = new THREE.AudioLoader();

  private last = performance.now(); private acc = 0; private dtFixed = 1/60;
  paused = false;

  private cameraCollisionRay = new Raycaster();
  private cameraCollisionPadding = 0.25;
  private cameraCollisionMeshes: THREE.Object3D[] = [];
  private cameraCollisionStatics: THREE.Object3D[] = [];
  private cameraCollisionDirty = true;
  private cameraCollisionDir = new Vector3();
  private cameraCollisionTemp = new Vector3();
  renderScene: () => void;

  constructor(public container: HTMLElement){
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0x0b0c10);
    this.camera.position.set(6,4,7);
    this.listener = new THREE.AudioListener(); this.camera.add(this.listener);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.05; this.controls.screenSpacePanning = true;

    // Physics
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0,-9.81,0) });
    (this.world as any).broadphase = new (CANNON as any).SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.defaultMat = new CANNON.Material('default');
    const contact = new CANNON.ContactMaterial(this.defaultMat, this.defaultMat, { friction: 0.3, restitution: 0.1 });
    this.world.addContactMaterial(contact);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3d3d3d, 0.55);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(8, 12, 6);
    dirLight.target.position.set(0, 0, 0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);

    // Grid & ground
    const grid = new THREE.GridHelper(100,100); (grid.material as any).opacity=0.25; (grid.material as any).transparent=true;
    this.scene.add(grid);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), new THREE.ShadowMaterial({opacity:0.25}));
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; this.scene.add(ground);
    this.cameraCollisionStatics.push(ground);

    this.renderScene = () => { this.renderer.render(this.scene, this.camera); };

    // Env
    this.pmrem = new PMREMGenerator(this.renderer);
    new RGBELoader().setDataType(UnsignedByteType)
      .setPath('https://unpkg.com/@pmndrs/assets@1.0.5/hdr/')
      .load('venice_sunset_1k.hdr', (tex)=>{ const env = this.pmrem.fromEquirectangular(tex).texture; tex.dispose(); this.scene.environment = env; });

    // resize + tick
    addEventListener('resize', ()=> this.resize());
    this.resize(); requestAnimationFrame((t)=> this.tick(t));
  }

  add(go: GameObject){
    if (go.body){
      (go.body as any).__owner = go;
      (go.body as any).addEventListener('collide', (e: any)=> this.events.emit('collision', { self: go, other: (e.body as any).__owner, raw: e }));
      this.world.addBody(go.body);
    }
    go.object3D.traverse((node) => {
      node.userData.__gameObject = go;
    });
    go.addedTo(this);
    this.objects.push(go);
    this.scene.add(go.object3D);
    this.cameraCollisionDirty = true;
  }
  remove(go: GameObject){
    const i=this.objects.indexOf(go);
    if(i>=0) this.objects.splice(i,1);
    if (go.body) {
      this.world.removeBody(go.body);
    }
    go.object3D.traverse((node) => {
      if (node.userData.__gameObject === go) delete node.userData.__gameObject;
    });
    this.scene.remove(go.object3D);
    go.game = undefined;
    this.cameraCollisionDirty = true;
  }

  resize(){ const w = this.container.clientWidth || innerWidth; const h = this.container.clientHeight || innerHeight; this.renderer.setSize(w,h,false); this.camera.aspect = w/h; this.camera.updateProjectionMatrix(); }

  tick(now: number){
    requestAnimationFrame((t)=> this.tick(t));
    if (this.paused){ this.renderScene(); return; }
    const dt = Math.min(0.05, (now - this.last)/1000); this.last=now; this.acc+=dt;
    while (this.acc >= this.dtFixed){ this.world.step(this.dtFixed); this.acc -= this.dtFixed; }
    for (const o of this.objects) o.update(dt);
    this.controls.update();
    this.resolveCameraCollision();
    this.renderScene();
  }

  frameObject(obj: THREE.Object3D){
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const safeDim = Math.max(maxDim, 0.75);
    const dist = (safeDim * 1.6) / Math.tan((Math.PI * this.camera.fov) / 360);
    const offsetDir = new THREE.Vector3(1, 0.35, 1).normalize();

    this.camera.position.copy(center.clone().add(offsetDir.multiplyScalar(dist)));
    this.controls.target.copy(center);
    this.controls.update();
  }

  private updateCameraCollisionMeshes(){
    if (!this.cameraCollisionDirty) return;
    this.cameraCollisionMeshes.length = 0;
    for (const go of this.objects) {
      go.object3D.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.visible) {
          this.cameraCollisionMeshes.push(obj);
        }
      });
    }
    for (const obj of this.cameraCollisionStatics) {
      if ((obj as THREE.Mesh).isMesh && obj.visible) {
        this.cameraCollisionMeshes.push(obj);
      }
    }
    this.cameraCollisionDirty = false;
  }

  private resolveCameraCollision(){
    this.updateCameraCollisionMeshes();
    if (this.cameraCollisionMeshes.length === 0) return;

    const target = this.controls.target;
    const dir = this.cameraCollisionDir.copy(this.camera.position).sub(target);
    const distance = dir.length();
    if (distance <= 0.01) return;

    dir.normalize();
    this.cameraCollisionRay.set(target, dir);
    this.cameraCollisionRay.near = 0;
    this.cameraCollisionRay.far = distance;
    const hits = this.cameraCollisionRay.intersectObjects(this.cameraCollisionMeshes, true);
    if (!hits.length) return;

    const hit = hits[0];
    if (hit.distance >= distance) return;
    const safe = Math.max(hit.distance - this.cameraCollisionPadding, 0.15);
    const newPos = this.cameraCollisionTemp.copy(dir).multiplyScalar(safe).add(target);
    this.camera.position.copy(newPos);
  }
}
