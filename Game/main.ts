import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../src/core/Game';
import { GameObject } from '../src/ecs/GameObject';
import { Component } from '../src/ecs/Component';
import { loadGLB } from '../src/assets/gltf';
import car16Url from '../models/Car_16.glb?url';

const TRACK_WIDTH = 12;
const TRACK_EDGE_MARGIN = 1.1;
const CHECKPOINT_FRACTIONS = [0.12, 0.24, 0.36, 0.5, 0.63, 0.76, 0.89];
const TARGET_CAR_LENGTH = 3.6;
const TRACK_SEARCH_WINDOW = 220;
const MAX_GEAR = 5;
const GEAR_MAX_SPEED_KMH = [55, 95, 145, 200, 250];
const GEAR_ACCEL_MPS2 = [30, 24, 18, 14, 11];
const GEAR_DOWNSHIFT_FACTOR = 0.88;
const HIGHSCORE_STORAGE_KEY = 'car16_highscores_v1';
const MAX_HIGHSCORES = 8;

interface HudElements {
  panel: HTMLElement;
  lap: HTMLElement;
  checkpoint: HTMLElement;
  gear: HTMLElement;
  speed: HTMLElement;
  time: HTMLElement;
  status: HTMLElement;
}

interface MenuElements {
  overlay: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  bestTime: HTMLElement;
  list: HTMLOListElement;
  startButton: HTMLButtonElement;
}

interface TrackData {
  samples: THREE.Vector3[];
  tangents: THREE.Vector3[];
  cumulative: number[];
  totalLength: number;
  halfWidth: number;
  startIndex: number;
  finishIndex: number;
  startYaw: number;
  checkpointIndices: number[];
}

interface TrackProjection {
  index: number;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  lateral: number;
  progress: number;
}

interface CheckpointMarker {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  progress: number;
}

interface RaceEndInfo {
  winner: 'player' | 'ai';
  playerTime: number | null;
  aiTime: number | null;
}

interface CarPrefab {
  template: THREE.Object3D;
  halfExtents: CANNON.Vec3;
  rideHeight: number;
}

interface RacerSpawnData {
  car: GameObject;
  rideHeight: number;
  startPosition: CANNON.Vec3;
  startYaw: number;
}

interface RaceSession {
  player: GameObject;
  ai: GameObject;
  cameraRig: GameObject;
  raceSystem: GameObject;
  playerController: CarController;
  aiController: AIDriver;
}

class CarController extends Component {
  speedKmh = 0;

  private readonly keys = new Set<string>();
  private speed = 0;
  private yaw: number;
  private gear = 1;
  private lastSpeedKmh = 0;
  private lastTrackIndex = 0;
  private projection: TrackProjection;

  constructor(
    private readonly track: TrackData,
    private readonly resetPosition: CANNON.Vec3,
    private readonly rideHeight: number,
    initialYaw: number,
  ) {
    super();
    this.yaw = initialYaw;
    this.projection = {
      index: track.startIndex,
      center: track.samples[track.startIndex],
      tangent: track.tangents[track.startIndex],
      lateral: 0,
      progress: 0,
    };
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.add(key);
    if (key === 'q' && !event.repeat) {
      this.shiftUp();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  override onAdded(game: Game, owner: GameObject): void {
    super.onAdded(game, owner);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
  }

  override onRemoved(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
  }

  progressMeters(): number {
    return this.projection.progress;
  }

  currentGear(): number {
    return this.gear;
  }

  private axisForward(): number {
    const forward = this.keys.has('w') || this.keys.has('arrowup');
    const backward = this.keys.has('s') || this.keys.has('arrowdown');
    return Number(forward) - Number(backward);
  }

  private axisSteer(): number {
    const right = this.keys.has('d') || this.keys.has('arrowright');
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    return Number(right) - Number(left);
  }

  override update(dt: number): void {
    const body = this.owner.body;
    if (!body) return;

    this.projection = projectToTrack(body.position, this.track, this.lastTrackIndex);
    this.lastTrackIndex = this.projection.index;

    const throttle = this.axisForward();
    const steer = -this.axisSteer();
    const onTrack = Math.abs(this.projection.lateral) <= this.track.halfWidth - TRACK_EDGE_MARGIN;
    const braking = this.keys.has(' ');
    const gearIndex = this.gear - 1;
    const gearTopSpeed = GEAR_MAX_SPEED_KMH[gearIndex] / 3.6;

    const accelBase = GEAR_ACCEL_MPS2[gearIndex];
    const accel = onTrack ? accelBase : accelBase * 0.5;
    const reverseAccel = onTrack ? 17 : 8;
    const passiveDrag = onTrack ? 7.5 : 12;
    const brakeDrag = onTrack ? 23 : 32;
    const maxForward = onTrack ? gearTopSpeed : Math.min(gearTopSpeed * 0.6, 22);
    const maxReverse = onTrack ? 13 : 8;

    if (throttle > 0) {
      this.speed += accel * dt;
    } else if (throttle < 0) {
      this.speed -= reverseAccel * dt;
    } else {
      this.speed = dampTowardZero(this.speed, passiveDrag * dt);
    }

    if (braking) {
      this.speed = dampTowardZero(this.speed, brakeDrag * dt);
    }

    this.speed = THREE.MathUtils.clamp(this.speed, -maxReverse, maxForward);
    this.speedKmh = Math.abs(this.speed * 3.6);
    this.autoDownshift(throttle, braking);

    if (Math.abs(this.speed) > 0.15) {
      const speedRatio = THREE.MathUtils.clamp(Math.abs(this.speed) / 32, 0, 1);
      const steerScale = 0.35 + speedRatio * 0.72;
      const steerSign = this.speed >= 0 ? 1 : -1;
      this.yaw += steer * steerScale * steerSign * (onTrack ? 1 : 0.55) * dt;
    }

    const trackYaw = Math.atan2(this.projection.tangent.x, this.projection.tangent.z);
    const trackDelta = normalizeAngle(trackYaw - this.yaw);
    this.yaw += THREE.MathUtils.clamp(trackDelta, -0.4, 0.4) * (onTrack ? 0.14 : 0.08) * dt;

    this.constrainLateral(body);

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);

    body.position.y = this.rideHeight;
    body.quaternion.setFromEuler(0, this.yaw, 0);
    body.angularVelocity.set(0, 0, 0);
    body.velocity.set(forwardX * this.speed, 0, forwardZ * this.speed);

    if (Math.abs(this.projection.lateral) > this.track.halfWidth * 2.5) {
      this.resetToStart(body);
    }

    this.speedKmh = Math.abs(this.speed * 3.6);
    this.lastSpeedKmh = this.speedKmh;
  }

  private constrainLateral(body: CANNON.Body): void {
    const limit = this.track.halfWidth - 0.32;
    if (Math.abs(this.projection.lateral) <= limit) return;

    const tangent = this.projection.tangent;
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const clamped = THREE.MathUtils.clamp(this.projection.lateral, -limit, limit);

    body.position.x = this.projection.center.x + normalX * clamped;
    body.position.z = this.projection.center.z + normalZ * clamped;

    this.speed *= 0.62;
  }

  private resetToStart(body: CANNON.Body): void {
    this.speed = 0;
    this.gear = 1;
    this.lastSpeedKmh = 0;
    this.lastTrackIndex = this.track.startIndex;
    this.yaw = this.track.startYaw;
    body.position.copy(this.resetPosition);
    body.position.y = this.rideHeight;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.setFromEuler(0, this.yaw, 0);
  }

  private shiftUp(): void {
    if (this.gear < MAX_GEAR) {
      this.gear += 1;
    }
  }

  private autoDownshift(throttle: number, braking: boolean): void {
    if (this.gear <= 1) return;

    const slowing = this.speedKmh + 0.2 < this.lastSpeedKmh;
    if (!braking && !slowing && throttle > 0) return;

    while (this.gear > 1) {
      const previousGearTop = GEAR_MAX_SPEED_KMH[this.gear - 2];
      const threshold = previousGearTop * GEAR_DOWNSHIFT_FACTOR;
      if (this.speedKmh <= threshold) {
        this.gear -= 1;
      } else {
        break;
      }
    }
  }
}

class AIDriver extends Component {
  speedKmh = 0;

  private speed = 0;
  private yaw: number;
  private progress: number;

  constructor(
    private readonly track: TrackData,
    private readonly rideHeight: number,
    initialYaw: number,
    private readonly paceFactor: number,
  ) {
    super();
    this.yaw = initialYaw;
    this.progress = this.track.cumulative[this.track.startIndex];
  }

  progressMeters(): number {
    return this.progress;
  }

  override update(dt: number): void {
    const body = this.owner.body;
    if (!body) return;

    const lookAhead = 32 + this.speed * 1.45;
    const targetProgress = Math.min(this.track.totalLength, this.progress + lookAhead);
    const targetIndex = findIndexAtDistance(this.track.cumulative, targetProgress);
    const targetTangent = this.track.tangents[targetIndex];
    const targetYaw = Math.atan2(targetTangent.x, targetTangent.z);
    const yawError = normalizeAngle(targetYaw - this.yaw);

    this.yaw += THREE.MathUtils.clamp(yawError, -1.05, 1.05) * 1.9 * dt;

    const curvaturePenalty = Math.abs(yawError) * 18;
    const maxAiSpeed = 48 * this.paceFactor;
    const targetSpeed = THREE.MathUtils.clamp(maxAiSpeed - curvaturePenalty, 20, maxAiSpeed);
    const blend = 1 - Math.exp(-2.6 * dt);
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, blend);

    this.progress = Math.min(this.track.totalLength, this.progress + this.speed * dt);

    const upperIndex = findIndexAtDistance(this.track.cumulative, this.progress);
    const lowerIndex = Math.max(0, upperIndex - 1);
    const startDist = this.track.cumulative[lowerIndex];
    const endDist = this.track.cumulative[upperIndex];
    const segmentLength = Math.max(0.0001, endDist - startDist);
    const segT = THREE.MathUtils.clamp((this.progress - startDist) / segmentLength, 0, 1);

    const p0 = this.track.samples[lowerIndex];
    const p1 = this.track.samples[upperIndex];
    const centerX = p0.x + (p1.x - p0.x) * segT;
    const centerZ = p0.z + (p1.z - p0.z) * segT;

    const t0 = this.track.tangents[lowerIndex];
    const t1 = this.track.tangents[upperIndex];
    let tangentX = t0.x + (t1.x - t0.x) * segT;
    let tangentZ = t0.z + (t1.z - t0.z) * segT;
    const tangentLen = Math.hypot(tangentX, tangentZ);
    if (tangentLen > 0.000001) {
      tangentX /= tangentLen;
      tangentZ /= tangentLen;
    } else {
      tangentX = t1.x;
      tangentZ = t1.z;
    }

    const poseYaw = Math.atan2(tangentX, tangentZ);
    const poseYawError = normalizeAngle(poseYaw - this.yaw);
    this.yaw += THREE.MathUtils.clamp(poseYawError, -0.6, 0.6) * 1.4 * dt;

    body.position.x = centerX;
    body.position.z = centerZ;
    body.position.y = this.rideHeight;

    body.quaternion.setFromEuler(0, this.yaw, 0);
    body.angularVelocity.set(0, 0, 0);
    body.velocity.set(tangentX * this.speed, 0, tangentZ * this.speed);

    this.speedKmh = this.speed * 3.6;
  }
}

class RaceDirector extends Component {
  private elapsed = 0;
  private nextCheckpoint = 0;
  private finished = false;
  private playerFinished = false;
  private aiFinished = false;
  private playerTime: number | null = null;
  private aiTime: number | null = null;

  constructor(
    private readonly playerController: CarController,
    private readonly aiController: AIDriver,
    private readonly track: TrackData,
    private readonly checkpointMarkers: CheckpointMarker[],
    private readonly hud: HudElements,
    private readonly onRaceEnd: (result: RaceEndInfo) => void,
  ) {
    super();
  }

  override update(dt: number): void {
    const playerProgress = this.playerController.progressMeters();
    const aiProgress = this.aiController.progressMeters();

    if (!this.finished) {
      this.elapsed += dt;

      while (
        this.nextCheckpoint < this.checkpointMarkers.length &&
        playerProgress >= this.checkpointMarkers[this.nextCheckpoint].progress - 2
      ) {
        this.nextCheckpoint += 1;
        setCheckpointHighlight(this.checkpointMarkers, this.nextCheckpoint);
      }

      const finishThreshold = this.track.totalLength - 8;
      if (!this.playerFinished && playerProgress >= finishThreshold) {
        this.playerFinished = true;
        this.playerTime = this.elapsed;
      }
      if (!this.aiFinished && aiProgress >= finishThreshold) {
        this.aiFinished = true;
        this.aiTime = this.elapsed;
      }

      if (this.playerFinished || this.aiFinished) {
        this.finished = true;
        this.playerController.enabled = false;
        this.aiController.enabled = false;

        const playerWins =
          this.playerFinished && (!this.aiFinished || (this.playerTime ?? Number.POSITIVE_INFINITY) <= (this.aiTime ?? Number.POSITIVE_INFINITY));

        if (playerWins) {
          this.hud.status.textContent = `Sieg! Deine Zeit: ${formatTime(this.playerTime ?? 0)}`;
        } else {
          this.hud.status.textContent = `KI gewinnt mit ${formatTime(this.aiTime ?? 0)}`;
        }

        this.onRaceEnd({
          winner: playerWins ? 'player' : 'ai',
          playerTime: this.playerTime,
          aiTime: this.aiTime,
        });
      }
    }

    const kmNow = (THREE.MathUtils.clamp(playerProgress, 0, this.track.totalLength) / 1000).toFixed(2);
    const kmTotal = (this.track.totalLength / 1000).toFixed(2);
    const cpCount = this.checkpointMarkers.length;

    this.hud.lap.textContent = `Strecke: ${kmNow} / ${kmTotal} km`;
    this.hud.checkpoint.textContent = `Checkpoint: ${Math.min(this.nextCheckpoint, cpCount)}/${cpCount}`;
    this.hud.gear.textContent = `Gang: ${this.playerController.currentGear()}/${MAX_GEAR}`;
    this.hud.speed.textContent = `Tempo: ${Math.round(this.playerController.speedKmh)} km/h`;
    this.hud.time.textContent = `Zeit: ${formatTime(this.elapsed)}`;

    if (!this.finished) {
      const leadMeters = playerProgress - aiProgress;
      const leadText = leadMeters >= 0 ? `Du fuehrst +${leadMeters.toFixed(0)}m` : `KI fuehrt +${Math.abs(leadMeters).toFixed(0)}m`;
      this.hud.status.textContent = `${leadText} | Q = Hochschalten`;
      this.hud.status.classList.remove('finished');
    } else {
      this.hud.status.classList.add('finished');
    }
  }
}

class FixedChaseCamera extends Component {
  distance = 8;
  height = 2.7;
  lookHeight = 0.95;
  lookAhead = 3.1;
  positionSharpness = 9;
  lookSharpness = 12;

  private initialized = false;
  private lookTarget = new THREE.Vector3();

  constructor(private readonly target: GameObject) {
    super();
  }

  override onAdded(game: Game, owner: GameObject): void {
    super.onAdded(game, owner);
    this.game.controls.enabled = false;
    this.game.controls.enableDamping = false;
  }

  override update(dt: number): void {
    const body = this.target.body;
    if (!body) return;

    const yaw = yawFromQuaternion(body.quaternion);
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

    const desiredPosition = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
      .addScaledVector(forward, -this.distance)
      .add(new THREE.Vector3(0, this.height, 0));
    const desiredLook = new THREE.Vector3(body.position.x, body.position.y + this.lookHeight, body.position.z)
      .addScaledVector(forward, this.lookAhead);

    const camera = this.game.camera;
    if (!this.initialized) {
      camera.position.copy(desiredPosition);
      this.lookTarget.copy(desiredLook);
      this.initialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-this.positionSharpness * dt);
      const lookAlpha = 1 - Math.exp(-this.lookSharpness * dt);
      camera.position.lerp(desiredPosition, posAlpha);
      this.lookTarget.lerp(desiredLook, lookAlpha);
    }

    this.game.controls.target.copy(this.lookTarget);
    camera.lookAt(this.lookTarget);
  }
}
const app = document.getElementById('app');
if (!app) throw new Error('Missing #app container.');

const hud = getHudElements();
const menu = getMenuElements();
const hint = getHintElement();
const game = new Game(app);

game.camera.near = 0.1;
game.camera.far = 2200;
game.camera.updateProjectionMatrix();

const track = buildTrackData();
const checkpointMarkers = setupTrackEnvironment(game, track);
setCheckpointHighlight(checkpointMarkers, 0);

renderHighscores(menu, loadHighscores());
showMenu(
  menu,
  'Car16 Circuit',
  'Starte ein Rennen, schlage den KI-Gegner und verbessere deine Bestzeit.',
);
updateHudForIdle(hud, track);
hint.style.display = 'none';

let activeRace: RaceSession | null = null;
let startingRace = false;
let carPrefabPromise: Promise<CarPrefab> | null = null;

menu.startButton.addEventListener('click', () => {
  void beginRace();
});

async function beginRace(): Promise<void> {
  if (startingRace) return;
  startingRace = true;
  menu.startButton.disabled = true;
  menu.startButton.textContent = 'Lade Rennen...';

  try {
    clearActiveRace();
    setCheckpointHighlight(checkpointMarkers, 0);
    hideMenu(menu);
    hint.style.display = 'block';
    updateHudForRaceStart(hud, track);

    activeRace = await createRaceSession();
  } catch (err) {
    console.error(err);
    showMenu(
      menu,
      'Fehler beim Starten',
      'Das Rennen konnte nicht geladen werden. Bitte erneut versuchen.',
    );
    hint.style.display = 'none';
    updateHudForIdle(hud, track);
  } finally {
    startingRace = false;
    menu.startButton.disabled = false;
    menu.startButton.textContent = 'Rennen starten';
  }
}

async function createRaceSession(): Promise<RaceSession> {
  const player = await spawnPlayerCar(track);
  const ai = await spawnAICar(track);

  const cameraRig = new GameObject({ name: 'RaceCameraRig' });
  cameraRig.addComponent(new FixedChaseCamera(player.car));
  game.add(cameraRig);

  const raceSystem = new GameObject({ name: 'RaceSystem' });
  raceSystem.addComponent(new RaceDirector(player.controller, ai.controller, track, checkpointMarkers, hud, onRaceEnd));
  game.add(raceSystem);

  return {
    player: player.car,
    ai: ai.car,
    cameraRig,
    raceSystem,
    playerController: player.controller,
    aiController: ai.controller,
  };
}

function onRaceEnd(result: RaceEndInfo): void {
  const playerTimeLabel = result.playerTime != null ? formatTime(result.playerTime) : '--:--.---';
  const aiTimeLabel = result.aiTime != null ? formatTime(result.aiTime) : '--:--.---';

  if (result.winner === 'player' && result.playerTime != null) {
    const updated = recordHighscore(result.playerTime);
    renderHighscores(menu, updated);
    showMenu(
      menu,
      'Sieg!',
      `Du warst schneller als die KI. Deine Zeit: ${playerTimeLabel} | KI: ${aiTimeLabel}`,
    );
  } else {
    renderHighscores(menu, loadHighscores());
    showMenu(
      menu,
      'KI gewinnt',
      `KI-Zeit: ${aiTimeLabel} | Deine Zeit: ${playerTimeLabel}. Versuch es nochmal.`,
    );
  }

  hint.style.display = 'none';
  menu.startButton.textContent = 'Neues Rennen';
}

function clearActiveRace(): void {
  if (!activeRace) return;

  removeGameObject(activeRace.raceSystem);
  removeGameObject(activeRace.cameraRig);
  removeGameObject(activeRace.player);
  removeGameObject(activeRace.ai);

  activeRace = null;
}

function removeGameObject(go: GameObject): void {
  for (const component of go.components) {
    try {
      component.onRemoved();
    } catch (err) {
      console.error(err);
    }
  }

  if (go.body) {
    game.world.removeBody(go.body);
  }

  if (game.objects.includes(go)) {
    game.remove(go);
  }
}

async function spawnPlayerCar(trackData: TrackData): Promise<{ car: GameObject; controller: CarController }> {
  const spawn = await spawnRacerCar(trackData, {
    name: 'PlayerCar',
    distanceOffset: 0,
    lateralOffset: -1.75,
  });

  const controller = new CarController(
    trackData,
    new CANNON.Vec3(spawn.startPosition.x, spawn.rideHeight, spawn.startPosition.z),
    spawn.rideHeight,
    spawn.startYaw,
  );
  spawn.car.addComponent(controller);

  return { car: spawn.car, controller };
}

async function spawnAICar(trackData: TrackData): Promise<{ car: GameObject; controller: AIDriver }> {
  const spawn = await spawnRacerCar(trackData, {
    name: 'AICar',
    distanceOffset: 7,
    lateralOffset: 0,
    tintHex: 0xd64b4b,
    bodyMode: 'kinematic',
  });

  const pace = 0.92 + Math.random() * 0.07;
  const controller = new AIDriver(trackData, spawn.rideHeight, spawn.startYaw, pace);
  spawn.car.addComponent(controller);

  return { car: spawn.car, controller };
}

async function spawnRacerCar(
  trackData: TrackData,
  options: {
    name: string;
    distanceOffset: number;
    lateralOffset: number;
    tintHex?: number;
    bodyMode?: 'dynamic' | 'kinematic';
  },
): Promise<RacerSpawnData> {
  const prefab = await getCarPrefab();
  const pose = getTrackPose(trackData, options.distanceOffset, options.lateralOffset);

  const root = new THREE.Group();
  root.name = `${options.name}Root`;

  const visual = cloneModel(prefab.template);
  if (options.tintHex != null) {
    tintModel(visual, options.tintHex);
  }
  root.add(visual);

  const he = prefab.halfExtents;
  const bodyMode = options.bodyMode ?? 'dynamic';
  const isKinematic = bodyMode === 'kinematic';
  const body = new CANNON.Body({
    mass: isKinematic ? 0 : 120,
    material: game.defaultMat,
    shape: new CANNON.Box(new CANNON.Vec3(he.x, he.y, he.z)),
  });
  if (isKinematic) {
    body.type = CANNON.Body.KINEMATIC;
    body.collisionResponse = false;
  }
  body.position.set(pose.position.x, prefab.rideHeight, pose.position.z);
  body.quaternion.setFromEuler(0, pose.yaw, 0);
  body.angularFactor.set(0, 0, 0);
  body.allowSleep = false;

  const car = new GameObject({ name: options.name, object3D: root, body });
  game.add(car);
  game.world.addBody(body);

  return {
    car,
    rideHeight: prefab.rideHeight,
    startPosition: new CANNON.Vec3(pose.position.x, prefab.rideHeight, pose.position.z),
    startYaw: pose.yaw,
  };
}

async function getCarPrefab(): Promise<CarPrefab> {
  if (!carPrefabPromise) {
    carPrefabPromise = (async () => {
      try {
        const gltf = (await loadGLB(game, car16Url)) as { scene: THREE.Object3D };
        const template = gltf.scene;
        const size = normalizeCarModel(template);
        const halfExtents = new CANNON.Vec3(
          Math.max(0.45, size.x * 0.4),
          Math.max(0.23, size.y * 0.45),
          Math.max(0.85, size.z * 0.44),
        );
        const rideHeight = halfExtents.y + 0.01;
        return { template, halfExtents, rideHeight };
      } catch (err) {
        carPrefabPromise = null;
        throw err;
      }
    })();
  }

  return carPrefabPromise;
}

function cloneModel(template: THREE.Object3D): THREE.Object3D {
  const clone = template.clone(true);
  clone.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      if (Array.isArray(node.material)) {
        node.material = node.material.map((mat) => mat.clone());
      } else {
        node.material = node.material.clone();
      }
    }
  });
  return clone;
}

function tintModel(root: THREE.Object3D, tintHex: number): void {
  const tint = new THREE.Color(tintHex);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        const hsl = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(hsl);
        if (hsl.s > 0.12 && hsl.l > 0.18) {
          mat.color.lerp(tint, 0.58);
        }
      }
    }
  });
}

function getTrackPose(
  trackData: TrackData,
  distanceOffset: number,
  lateralOffset: number,
): { position: CANNON.Vec3; yaw: number } {
  const startDistance = trackData.cumulative[trackData.startIndex] + distanceOffset;
  const pose = sampleTrackPoseAtDistance(trackData, startDistance, lateralOffset);
  return { position: pose.position, yaw: pose.yaw };
}

function sampleTrackPoseAtDistance(
  trackData: TrackData,
  distance: number,
  lateralOffset: number,
): {
  index: number;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  yaw: number;
  position: CANNON.Vec3;
} {
  const clampedDistance = THREE.MathUtils.clamp(distance, 0, trackData.totalLength);
  const upperIndex = findIndexAtDistance(trackData.cumulative, clampedDistance);
  const lowerIndex = Math.max(0, upperIndex - 1);

  const startDist = trackData.cumulative[lowerIndex];
  const endDist = trackData.cumulative[upperIndex];
  const segmentLength = Math.max(0.0001, endDist - startDist);
  const t = THREE.MathUtils.clamp((clampedDistance - startDist) / segmentLength, 0, 1);

  const center = new THREE.Vector3().lerpVectors(
    trackData.samples[lowerIndex],
    trackData.samples[upperIndex],
    t,
  );
  const tangent = new THREE.Vector3()
    .lerpVectors(trackData.tangents[lowerIndex], trackData.tangents[upperIndex], t)
    .normalize();
  if (tangent.lengthSq() < 0.000001) {
    tangent.copy(trackData.tangents[upperIndex]).normalize();
  }

  const normalX = -tangent.z;
  const normalZ = tangent.x;
  const position = new CANNON.Vec3(
    center.x + normalX * lateralOffset,
    0,
    center.z + normalZ * lateralOffset,
  );

  return {
    index: upperIndex,
    center,
    tangent,
    yaw: Math.atan2(tangent.x, tangent.z),
    position,
  };
}
function setupTrackEnvironment(gameInstance: Game, trackData: TrackData): CheckpointMarker[] {
  gameInstance.scene.background = new THREE.Color(0x7aa0c2);
  gameInstance.scene.fog = new THREE.Fog(0x7aa0c2, 240, 2000);

  for (const child of [...gameInstance.scene.children]) {
    const isDefaultGrid = child instanceof THREE.GridHelper;
    const isDefaultShadowGround =
      child instanceof THREE.Mesh &&
      !Array.isArray(child.material) &&
      child.material instanceof THREE.ShadowMaterial;
    if (isDefaultGrid || isDefaultShadowGround) {
      gameInstance.scene.remove(child);
    }
  }

  addGround(gameInstance, trackData);

  const road = new THREE.Mesh(
    createRibbonGeometry(trackData.samples, trackData.tangents, trackData.halfWidth, 0),
    new THREE.MeshStandardMaterial({
      color: 0x262b30,
      roughness: 0.9,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  road.position.y = 0.12;
  road.receiveShadow = true;
  road.renderOrder = 1;
  gameInstance.scene.add(road);

  const innerEdge = new THREE.Mesh(
    createRibbonGeometry(trackData.samples, trackData.tangents, 0.35, -trackData.halfWidth - 0.22),
    new THREE.MeshStandardMaterial({ color: 0xc43a47, roughness: 0.62, metalness: 0.18 }),
  );
  innerEdge.position.y = 0.17;
  innerEdge.receiveShadow = true;
  innerEdge.renderOrder = 2;
  gameInstance.scene.add(innerEdge);

  const outerEdge = new THREE.Mesh(
    createRibbonGeometry(trackData.samples, trackData.tangents, 0.35, trackData.halfWidth + 0.22),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.62, metalness: 0.18 }),
  );
  outerEdge.position.y = 0.17;
  outerEdge.receiveShadow = true;
  outerEdge.renderOrder = 2;
  gameInstance.scene.add(outerEdge);

  addLaneMarking(gameInstance, trackData.samples);

  addCrossLine(
    gameInstance,
    trackData.samples[trackData.startIndex],
    trackData.tangents[trackData.startIndex],
    0x5bc0ff,
  );
  addFinishLine(
    gameInstance,
    trackData.samples[trackData.finishIndex],
    trackData.tangents[trackData.finishIndex],
  );

  const markers = createCheckpointMarkers(gameInstance, trackData);

  const planeBody = new CANNON.Body({ mass: 0, material: gameInstance.defaultMat });
  planeBody.addShape(new CANNON.Plane());
  planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  gameInstance.world.addBody(planeBody);

  return markers;
}

function addGround(gameInstance: Game, trackData: TrackData): void {
  const bounds = new THREE.Box3().setFromPoints(trackData.samples);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x + 1200, size.z + 1200),
    new THREE.MeshStandardMaterial({ color: 0x2b6627, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -2.2, center.z);
  ground.receiveShadow = true;
  ground.renderOrder = 0;
  gameInstance.scene.add(ground);
}

function createRibbonGeometry(
  samples: THREE.Vector3[],
  tangents: THREE.Vector3[],
  halfWidth: number,
  lateralOffset: number,
): THREE.BufferGeometry {
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices = new Uint32Array((count - 1) * 6);

  for (let i = 0; i < count; i++) {
    const p = samples[i];
    const t = tangents[i];
    const normalX = -t.z;
    const normalZ = t.x;

    const leftScale = lateralOffset + halfWidth;
    const rightScale = lateralOffset - halfWidth;

    const lx = p.x + normalX * leftScale;
    const lz = p.z + normalZ * leftScale;
    const rx = p.x + normalX * rightScale;
    const rz = p.z + normalZ * rightScale;

    const pIndex = i * 6;
    positions[pIndex + 0] = lx;
    positions[pIndex + 1] = 0;
    positions[pIndex + 2] = lz;
    positions[pIndex + 3] = rx;
    positions[pIndex + 4] = 0;
    positions[pIndex + 5] = rz;

    const v = i / (count - 1);
    const uvIndex = i * 4;
    uvs[uvIndex + 0] = 0;
    uvs[uvIndex + 1] = v;
    uvs[uvIndex + 2] = 1;
    uvs[uvIndex + 3] = v;
  }

  let idx = 0;
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;

    indices[idx++] = a;
    indices[idx++] = c;
    indices[idx++] = b;
    indices[idx++] = b;
    indices[idx++] = c;
    indices[idx++] = d;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function addLaneMarking(gameInstance: Game, samples: THREE.Vector3[]): void {
  const points = samples.map((p) => new THREE.Vector3(p.x, 0.24, p.z));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 6,
      gapSize: 6,
      transparent: true,
      opacity: 0.72,
    }),
  );
  line.computeLineDistances();
  line.renderOrder = 3;
  gameInstance.scene.add(line);
}

function addCrossLine(
  gameInstance: Game,
  center: THREE.Vector3,
  tangent: THREE.Vector3,
  color: number,
): void {
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH * 0.92, 2.4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
  );
  line.rotation.set(-Math.PI / 2, Math.atan2(normal.x, normal.z), 0);
  line.position.set(center.x, 0.26, center.z);
  line.renderOrder = 4;
  gameInstance.scene.add(line);
}

function addFinishLine(gameInstance: Game, center: THREE.Vector3, tangent: THREE.Vector3): void {
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const yaw = Math.atan2(normal.x, normal.z);

  const stripWidth = TRACK_WIDTH / 8;
  for (let i = 0; i < 8; i++) {
    const offset = -TRACK_WIDTH / 2 + stripWidth * (i + 0.5);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(stripWidth, 2.8),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffffff : 0x131313,
        transparent: true,
        opacity: 0.9,
      }),
    );
    strip.rotation.set(-Math.PI / 2, yaw, 0);
    strip.position.set(center.x + normal.x * offset, 0.27, center.z + normal.z * offset);
    strip.renderOrder = 4;
    gameInstance.scene.add(strip);
  }
}

function createCheckpointMarkers(gameInstance: Game, trackData: TrackData): CheckpointMarker[] {
  return trackData.checkpointIndices.map((idx) => {
    const pos = trackData.samples[idx];
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.16, 10, 28),
      new THREE.MeshStandardMaterial({
        color: 0x4a86ff,
        emissive: 0x102b61,
        roughness: 0.36,
        metalness: 0.08,
      }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.set(pos.x, 0.3, pos.z);
    marker.castShadow = true;
    marker.receiveShadow = true;
    marker.renderOrder = 5;
    gameInstance.scene.add(marker);

    return {
      mesh: marker,
      progress: trackData.cumulative[idx],
    };
  });
}

function setCheckpointHighlight(markers: CheckpointMarker[], activeIndex: number): void {
  markers.forEach((marker, index) => {
    const active = index === activeIndex;
    marker.mesh.material.color.setHex(active ? 0xffd36a : 0x4a86ff);
    marker.mesh.material.emissive.setHex(active ? 0x4c3200 : 0x102b61);
  });
}

function buildTrackData(): TrackData {
  const controlPoints = createRouteControlPoints();
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.28);
  const samples = curve.getPoints(1600).map((p) => new THREE.Vector3(p.x, 0, p.z));

  const tangents: THREE.Vector3[] = [];
  const cumulative: number[] = [0];

  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
    if (tangent.lengthSq() < 0.000001) {
      tangent.set(0, 0, 1);
    }
    tangents.push(tangent);

    if (i > 0) {
      cumulative.push(cumulative[i - 1] + samples[i].distanceTo(samples[i - 1]));
    }
  }

  const totalLength = cumulative[cumulative.length - 1];
  const checkpointIndices = CHECKPOINT_FRACTIONS
    .map((fraction) => findIndexAtDistance(cumulative, totalLength * fraction))
    .filter((value, idx, arr) => idx === 0 || value > arr[idx - 1]);

  const startIndex = 0;
  const finishIndex = samples.length - 1;
  const startYaw = Math.atan2(tangents[startIndex].x, tangents[startIndex].z);

  return {
    samples,
    tangents,
    cumulative,
    totalLength,
    halfWidth: TRACK_WIDTH / 2,
    startIndex,
    finishIndex,
    startYaw,
    checkpointIndices,
  };
}

function createRouteControlPoints(): THREE.Vector3[] {
  const raw: Array<[number, number]> = [
    [0, 0],
    [220, 0],
    [500, 100],
    [780, 290],
    [1060, 440],
    [1360, 510],
    [1660, 450],
    [1940, 260],
    [2220, 20],
    [2500, -190],
    [2780, -290],
    [3060, -260],
    [3340, -120],
    [3620, 90],
    [3900, 290],
    [4180, 430],
    [4460, 500],
    [4740, 430],
    [5020, 260],
    [5300, 30],
    [5580, -180],
    [5860, -300],
    [6140, -260],
    [6420, -80],
    [6700, 160],
    [6980, 320],
  ];

  return raw.map(([x, z]) => new THREE.Vector3(x, 0, z));
}

function findIndexAtDistance(cumulative: number[], target: number): number {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return THREE.MathUtils.clamp(lo, 0, cumulative.length - 1);
}

function projectToTrack(
  position: CANNON.Vec3,
  trackData: TrackData,
  hintIndex: number,
): TrackProjection {
  const count = trackData.samples.length;
  const hint = THREE.MathUtils.clamp(hintIndex, 0, count - 1);

  let bestIndex = hint;
  let bestDistSq = Number.POSITIVE_INFINITY;

  const localFrom = Math.max(0, hint - TRACK_SEARCH_WINDOW);
  const localTo = Math.min(count - 1, hint + TRACK_SEARCH_WINDOW);

  for (let i = localFrom; i <= localTo; i++) {
    const p = trackData.samples[i];
    const dx = position.x - p.x;
    const dz = position.z - p.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }

  if (bestDistSq > (trackData.halfWidth * 7) ** 2) {
    for (let i = 0; i < count; i++) {
      const p = trackData.samples[i];
      const dx = position.x - p.x;
      const dz = position.z - p.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }
  }

  const center = trackData.samples[bestIndex];
  const tangent = trackData.tangents[bestIndex];
  const normalX = -tangent.z;
  const normalZ = tangent.x;

  const dx = position.x - center.x;
  const dz = position.z - center.z;
  const lateral = dx * normalX + dz * normalZ;
  const along = dx * tangent.x + dz * tangent.z;

  const progress = THREE.MathUtils.clamp(
    trackData.cumulative[bestIndex] + along,
    0,
    trackData.totalLength,
  );

  return {
    index: bestIndex,
    center,
    tangent,
    lateral,
    progress,
  };
}

function normalizeCarModel(model: THREE.Object3D): THREE.Vector3 {
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  model.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(model);
  const initialSize = new THREE.Vector3();
  bounds.getSize(initialSize);

  const longest = Math.max(initialSize.x, initialSize.z);
  if (longest === 0) return new THREE.Vector3(2, 1, 4);

  const scale = TARGET_CAR_LENGTH / longest;
  model.scale.multiplyScalar(scale);

  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model);
  const sizeAfterScale = new THREE.Vector3();
  bounds.getSize(sizeAfterScale);

  if (sizeAfterScale.x > sizeAfterScale.z) {
    model.rotation.y = -Math.PI / 2;
  }

  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  bounds.getCenter(center);

  model.position.x -= center.x;
  model.position.y -= center.y;
  model.position.z -= center.z;

  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model);
  const finalSize = new THREE.Vector3();
  bounds.getSize(finalSize);
  return finalSize;
}

function loadHighscores(): number[] {
  try {
    const raw = localStorage.getItem(HIGHSCORE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)
      .slice(0, MAX_HIGHSCORES);
  } catch {
    return [];
  }
}

function saveHighscores(scores: number[]): void {
  localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(scores));
}

function recordHighscore(timeSeconds: number): number[] {
  const scores = loadHighscores();
  scores.push(timeSeconds);
  scores.sort((a, b) => a - b);
  const trimmed = scores.slice(0, MAX_HIGHSCORES);
  saveHighscores(trimmed);
  return trimmed;
}

function renderHighscores(menuUi: MenuElements, scores: number[]): void {
  menuUi.bestTime.textContent = scores.length > 0 ? `Bestzeit: ${formatTime(scores[0])}` : 'Bestzeit: --:--.---';

  menuUi.list.replaceChildren();
  if (scores.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Noch keine Zeiten';
    menuUi.list.appendChild(empty);
    return;
  }

  scores.forEach((value, index) => {
    const item = document.createElement('li');
    item.textContent = `${index + 1}. ${formatTime(value)}`;
    menuUi.list.appendChild(item);
  });
}

function showMenu(menuUi: MenuElements, title: string, subtitle: string): void {
  menuUi.title.textContent = title;
  menuUi.subtitle.textContent = subtitle;
  menuUi.overlay.classList.remove('hidden');
}

function hideMenu(menuUi: MenuElements): void {
  menuUi.overlay.classList.add('hidden');
}

function updateHudForIdle(hudUi: HudElements, trackData: TrackData): void {
  hudUi.lap.textContent = `Strecke: 0.00 / ${(trackData.totalLength / 1000).toFixed(2)} km`;
  hudUi.checkpoint.textContent = 'Checkpoint: 0/0';
  hudUi.gear.textContent = `Gang: 1/${MAX_GEAR}`;
  hudUi.speed.textContent = 'Tempo: 0 km/h';
  hudUi.time.textContent = 'Zeit: 00:00.000';
  hudUi.status.textContent = 'Warte auf Rennstart';
  hudUi.status.classList.remove('finished');
}

function updateHudForRaceStart(hudUi: HudElements, trackData: TrackData): void {
  hudUi.lap.textContent = `Strecke: 0.00 / ${(trackData.totalLength / 1000).toFixed(2)} km`;
  hudUi.checkpoint.textContent = `Checkpoint: 0/${trackData.checkpointIndices.length}`;
  hudUi.gear.textContent = `Gang: 1/${MAX_GEAR}`;
  hudUi.speed.textContent = 'Tempo: 0 km/h';
  hudUi.time.textContent = 'Zeit: 00:00.000';
  hudUi.status.textContent = 'Rennen laeuft';
  hudUi.status.classList.remove('finished');
}

function dampTowardZero(value: number, amount: number): number {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function yawFromQuaternion(quat: CANNON.Quaternion): number {
  const siny = 2 * (quat.w * quat.y + quat.x * quat.z);
  const cosy = 1 - 2 * (quat.y * quat.y + quat.z * quat.z);
  return Math.atan2(siny, cosy);
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  const millis = Math.floor((seconds % 1) * 1000)
    .toString()
    .padStart(3, '0');
  return `${minutes}:${secs}.${millis}`;
}

function getHintElement(): HTMLElement {
  const hintElement = document.getElementById('hint');
  if (!hintElement) throw new Error('Missing #hint element.');
  return hintElement;
}

function getHudElements(): HudElements {
  const panel = document.getElementById('hud');
  const lap = document.getElementById('lap');
  const checkpoint = document.getElementById('checkpoint');
  const gear = document.getElementById('gear');
  const speed = document.getElementById('speed');
  const time = document.getElementById('time');
  const status = document.getElementById('status');

  if (!panel || !lap || !checkpoint || !gear || !speed || !time || !status) {
    throw new Error('HUD elements are missing.');
  }

  return {
    panel,
    lap,
    checkpoint,
    gear,
    speed,
    time,
    status,
  };
}

function getMenuElements(): MenuElements {
  const overlay = document.getElementById('menuOverlay');
  const title = document.getElementById('menuTitle');
  const subtitle = document.getElementById('menuSubtitle');
  const bestTime = document.getElementById('bestTime');
  const list = document.getElementById('highscoreList');
  const startButton = document.getElementById('startRaceBtn');

  if (!overlay || !title || !subtitle || !bestTime || !list || !startButton) {
    throw new Error('Menu elements are missing.');
  }
  if (!(list instanceof HTMLOListElement)) {
    throw new Error('#highscoreList must be an <ol>.');
  }
  if (!(startButton instanceof HTMLButtonElement)) {
    throw new Error('#startRaceBtn must be a <button>.');
  }

  return {
    overlay,
    title,
    subtitle,
    bestTime,
    list,
    startButton,
  };
}
