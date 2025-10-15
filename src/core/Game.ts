import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import {
  PMREMGenerator,
  UnsignedByteType,
  Color,
  Box3,
  Vector3,
  GridHelper,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
  Texture,
} from 'three';
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
  hemiLight: THREE.HemisphereLight;
  dirLight: THREE.DirectionalLight;
  gridHelper: GridHelper;
  ground: Mesh<PlaneGeometry, ShadowMaterial>;
  timeScale = 1;
  helpersVisible = true;

  private last = performance.now(); private acc = 0; private dtFixed = 1/60;
  paused = false;

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
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x3d3d3d, 0.55);
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.dirLight.position.set(8, 12, 6);
    this.dirLight.target.position.set(0, 0, 0);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 200;
    this.dirLight.shadow.camera.left = -25;
    this.dirLight.shadow.camera.right = 25;
    this.dirLight.shadow.camera.top = 25;
    this.dirLight.shadow.camera.bottom = -25;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Grid & ground
    this.gridHelper = new THREE.GridHelper(100,100);
    (this.gridHelper.material as any).opacity=0.25; (this.gridHelper.material as any).transparent=true;
    this.scene.add(this.gridHelper);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), new THREE.ShadowMaterial({opacity:0.25}));
    this.ground.rotation.x = -Math.PI/2; this.ground.receiveShadow = true; this.scene.add(this.ground);

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
    }
    go.object3D.traverse((node) => {
      node.userData.__gameObject = go;
    });
    go.addedTo(this);
    this.objects.push(go);
    this.scene.add(go.object3D);
    this.events.emit('scene:objectAdded', go);
  }
  remove(go: GameObject){
    const i=this.objects.indexOf(go);
    if(i>=0) this.objects.splice(i,1);
    go.object3D.traverse((node) => {
      if (node.userData.__gameObject === go) delete node.userData.__gameObject;
    });
    this.scene.remove(go.object3D);
    go.game = undefined;
    this.events.emit('scene:objectRemoved', go);
  }

  resize(){ const w = this.container.clientWidth || innerWidth; const h = this.container.clientHeight || innerHeight; this.renderer.setSize(w,h,false); this.camera.aspect = w/h; this.camera.updateProjectionMatrix(); }

  tick(now: number){
    requestAnimationFrame((t)=> this.tick(t));
    if (this.paused){ this.renderer.render(this.scene, this.camera); return; }
    const dtRaw = Math.min(0.05, (now - this.last)/1000); this.last=now;
    const dt = dtRaw * this.timeScale;
    this.acc+=dt;
    while (this.acc >= this.dtFixed){ this.world.step(this.dtFixed); this.acc -= this.dtFixed; }
    for (const o of this.objects) o.update(dt);
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }

  frameObject(obj: THREE.Object3D){
    const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x,size.y,size.z); const dist = maxDim * 1.6 / Math.tan((Math.PI*this.camera.fov)/360);
    const target = new THREE.Vector3(0, Math.max(0.5, size.y*0.5), 0);
    this.camera.position.copy(target.clone().add(new THREE.Vector3(1,0.35,1).normalize().multiplyScalar(dist)));
    this.controls.target.copy(target); this.controls.update();
  }

  setPaused(value: boolean){
    if (this.paused === value) return;
    this.paused = value;
    this.events.emit('game:paused', this.paused);
  }

  togglePaused(){
    this.setPaused(!this.paused);
  }

  setTimeScale(scale: number){
    const next = Math.max(0, scale);
    if (this.timeScale === next) return;
    this.timeScale = next;
    this.events.emit('game:timeScale', this.timeScale);
  }

  getFixedTimeStep(){
    return this.dtFixed;
  }

  setHelpersVisible(visible: boolean){
    this.helpersVisible = visible;
    this.gridHelper.visible = visible;
    this.ground.visible = visible;
    this.events.emit('game:helpersVisible', visible);
  }

  stepSimulation(dt = this.dtFixed){
    const step = Math.max(1e-4, dt);
    this.world.step(step);
    for (const o of this.objects) o.update(step);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.events.emit('game:stepped', step);
  }

  setEnvironmentMap(texture?: Texture){
    this.scene.environment = texture ?? null;
    this.events.emit('game:environment', texture ?? null);
  }
}
