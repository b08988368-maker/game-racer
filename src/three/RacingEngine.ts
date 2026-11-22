import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { musicEngine } from '../audio/musicEngine';
import { soundEngine } from '../audio/soundEngine';
import { BLACKLIST_RIVALS, CARS, computeEffectiveStats, TRACKS } from '../data/gameData';
import {
  BlacklistRival,
  CameraMode,
  CarSpec,
  CinematicPhase,
  EnvironmentId,
  GarageCameraPreset,
  GarageCarConfig,
  MinimapBlip,
  MissionChecklistItem,
  MissionDefinition,
  PursuitState,
  RaceMode,
  RaceResult,
  RaceTelemetry,
  TrackDifficulty,
  TrackId,
} from '../types/game';
import { buildCarMesh, CarVisualHandles } from './carBuilder';
import { createContactShadowTexture } from './textures';
import { buildGarageShowroom, buildTrack, BuiltTrack } from './trackBuilder';

interface RacerEntity {
  id: string;
  name: string;
  isPlayer: boolean;
  spec: CarSpec;
  visual: CarVisualHandles;
  pos: THREE.Vector3;
  heading: number;
  slopePitch: number;
  bankRoll: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  pitch: number;
  roll: number;
  airHeight: number;
  verticalVel: number;
  airTimeTotal: number;
  shuntCooldown: number;
  copSlowdownTimer: number;
  activeShortcutId: number | null;
  reachedShortcutCore: boolean;
  shortcutPassCooldown: number;
  trackIdx: number;
  progress: number;
  lap: number;
  totalProgress: number;
  laneTarget: number;
  aiSkill: number;
  finished: boolean;
  knockedOut: boolean;
  finishTimeMs: number;
  speedTrapTotalKmh: number;
  speedTrapHits: number;
  trapCooldowns: number[];
}

interface CopEntity {
  id: number;
  targetId: string;
  visual: CarVisualHandles;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  trackIdx: number;
  wrecked: boolean;
  wreckTimer: number;
  isRoadblock: boolean;
  roadblockBreached?: boolean;
  isRhino: boolean;
  isHeadOn?: boolean;
  patrolling?: boolean;
  aiHitCooldown?: number;
  flashPhase: number;
}

interface SpikeStripEntity {
  pos: THREE.Vector3;
  mesh: THREE.Mesh;
  hit: boolean;
  trackIdx: number;
}

interface TrafficEntity {
  id: number;
  visual: CarVisualHandles;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  trackIdx: number;
  laneOffset: number;
  isTruck: boolean;
  knockLatVel: number;
  nearMissCooldown: number;
  hitCooldown: number;
}

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  size: number;
  color: THREE.Color;
}

interface SpeedStreak {
  active: boolean;
  pos: THREE.Vector3;
  heading: number;
  age: number;
  maxAge: number;
}

export interface RaceStartParams {
  mode: RaceMode;
  trackId: TrackId;
  environment?: EnvironmentId;
  patrolsEnabled?: boolean;
  playerSpec: CarSpec;
  playerConfig: GarageCarConfig;
  rival?: BlacklistRival;
  mission?: MissionDefinition;
}

export interface RacingEngineCallbacks {
  onTelemetry: (t: RaceTelemetry) => void;
  onRaceComplete: (result: RaceResult) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const ROAD_SURFACE_OFFSET = 0.0402;

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: RacingEngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private composerRt: THREE.WebGLRenderTarget | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomEnabled = true;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raceEnvMaps: Record<Exclude<EnvironmentId, 'auto'>, THREE.Texture>;
  private garageEnvMap: THREE.Texture;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private garageMainLight: THREE.PointLight;
  private garageRimLight: THREE.PointLight;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;
  private shadowTexture: THREE.Texture;

  private track: BuiltTrack | null = null;
  private garageShowroom: { group: THREE.Group; dispose: () => void } | null = null;
  private garageCar: CarVisualHandles | null = null;
  private skyCanvas: HTMLCanvasElement | null = null;
  private skyCtx: CanvasRenderingContext2D | null = null;
  private skyTex: THREE.CanvasTexture | null = null;
  private skyDomeMesh: THREE.Mesh | null = null;
  private heliGroup: THREE.Group | null = null;
  private heliMainRotor: THREE.Object3D | null = null;
  private heliTailRotor: THREE.Object3D | null = null;
  private heliBeam: THREE.Mesh | null = null;
  private spikeGeo: THREE.BoxGeometry;
  private spikeMat: THREE.MeshStandardMaterial;
  private rainMesh: THREE.InstancedMesh;
  private rainCount = 220;
  private rainDrops: { x: number; y: number; z: number; speed: number }[] = [];

  private mode: 'garage' | 'race' = 'garage';
  private paused = false;
  private disposed = false;

  private clock = new THREE.Clock();
  private frameId = 0;
  private garageOrbitAngle = 0.62;
  private garageDragActive = false;
  private garageLastPointerX = 0;
  private garageCameraPreset: GarageCameraPreset = 'orbit';
  private garageCamDist = 6.2;
  private garageCamHeight = 1.95;
  private garageCamLookY = 0.72;

  private raceParams: RaceStartParams | null = null;
  private racers: RacerEntity[] = [];
  private cops: CopEntity[] = [];
  private spikeStrips: SpikeStripEntity[] = [];
  private traffic: TrafficEntity[] = [];
  private player: RacerEntity | null = null;
  private cameraMode: CameraMode = 'chase_far';
  private aeLookEnabled = true;
  private lookLeft = false;
  private lookRight = false;
  private lookBack = false;
  private lookYawOffset = 0;
  private camHeading = 0;
  private camPos = new THREE.Vector3(0, 4, 10);
  private camLook = new THREE.Vector3(0, 1, 0);
  private camShake = 0;

  private introTimer = 0;
  private introDuration = 2.7;
  private countdownTimer = 3.2;
  private lastCountdownInt = 4;
  private outroActive = false;
  private outroTimer = 0;
  private outroOutcome: 'win' | 'busted' | 'loss' | null = null;
  private raceElapsedMs = 0;
  private currentLapStartMs = 0;
  private bestLapMs = 0;
  private nitrous = 100;
  private speedbreaker = 100;
  private isSpeedbreaker = false;
  private isDrifting = false;
  private driftHoldSec = 0;
  private driftTimeTotalSec = 0;
  private airTimeTotalSec = 0;
  private smashablesHit = 0;
  private driftBoostTimer = 0;
  private isSlipstreaming = false;
  private spikedTimer = 0;
  private playerOnCurb = false;
  private playerNearBarrier = false;
  private currentWallScrape = 0;
  private speedTrapFlashTimer = 0;
  private gridRevRpm = 0.22;
  private steerInputSmooth = 0;
  private lastPlayerGear = 0;
  private backfireTimer = -0.5;
  private tollboothTimeLeftMs = 0;
  private tollboothCheckpoint = 0;
  private tollboothTotal = 8;
  private pursuitState: PursuitState = 'none';
  private heatLevel = 1;
  private evadeProgress = 0;
  private bustProgress = 0;
  private sessionBounty = 0;
  private copsTakedowns = 0;
  private nearMissCount = 0;
  private nearMissCombo = 0;
  private nearMissComboTimer = 0;
  private speedTrapBestKmh = 0;
  private shortcutsTaken = 0;
  private activeEnvironment: Exclude<EnvironmentId, 'auto'> = 'golden_dusk';
  private activeMusicTrackName = 'Nine Thou Overdrive';
  private patrolsEnabled = true;
  private highestHeat = 1;
  private nextRoadblockCooldown = 12;
  private copSpawnTimer = 3.2;
  private radioDispatch: string | null = null;
  private radioExpiresAt = 0;
  private calloutId = 0;
  private callout: { text: string; tone: 'amber' | 'cyan' | 'red' | 'emerald'; expiresAt: number; id: number } | null = null;
  private lastTelemetryEmit = 0;

  // 60 FPS adaptive tuner & zero-GC scratch
  private currentPixelRatio = 1;
  private perfFrameAccumMs = 0;
  private perfFrameSamples = 0;
  private currentFps = 60;
  private fpsFrameCount = 0;
  private fpsAccumSec = 0;
  private sortedRacersScratch: RacerEntity[] = [];

  public input = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    nitrous: false,
    speedbreaker: false,
  };

  // Particle Pool
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particleCount = 180;

  // Skidmark Pool
  private skidMesh: THREE.InstancedMesh;
  private skidCount = 260;
  private skidCursor = 0;
  private skidAccum = 0;

  // 3D Speed Streak Pool
  private speedStreaks: SpeedStreak[] = [];
  private speedStreakMesh: THREE.InstancedMesh;
  private speedStreakCount = 56;
  private streakSpawnAccum = 0;

  constructor(container: HTMLElement, callbacks: RacingEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const initW = container.clientWidth || window.innerWidth;
    const initH = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.currentPixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(initW, initH);

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2B2118');
    this.scene.fog = new THREE.FogExp2('#2B2118', 0.00058);

    this.camera = new THREE.PerspectiveCamera(48, initW / initH, 0.3, 4800);

    // Per-Biome PMREM Environment Maps (authentic PS2 Most Wanted sky/wet/neon car reflections)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.raceEnvMaps = {
      golden_dusk: this.createBiomeEnvMap(pmrem, '#102036', '#D9772B', '#FBBF64', '#14100C', 'rgba(255,248,220,1)'),
      midnight_neon: this.createBiomeEnvMap(pmrem, '#040711', '#1B2D4F', '#38BDF8', '#06080E', 'rgba(186,230,253,0.95)'),
      overcast_rain: this.createBiomeEnvMap(pmrem, '#121922', '#475569', '#94A3B8', '#0F172A', 'rgba(226,232,240,0.85)'),
      noon_clear: this.createBiomeEnvMap(pmrem, '#1D4ED8', '#60A5FA', '#EFF6FF', '#1E293B', 'rgba(255,253,235,1)'),
      dawn_mist: this.createBiomeEnvMap(pmrem, '#0F2429', '#34D399', '#FDE68A', '#0E1716', 'rgba(254,243,199,0.95)'),
      crimson_foundry: this.createBiomeEnvMap(pmrem, '#140B10', '#C2410C', '#FB7185', '#120A0C', 'rgba(253,186,116,1)'),
    };
    this.garageEnvMap = this.createGarageEnvMap(pmrem);
    pmrem.dispose();

    this.spikeGeo = new THREE.BoxGeometry(8.2, 0.14, 0.56);
    this.spikeMat = new THREE.MeshStandardMaterial({
      color: '#FACC15',
      emissive: '#D97706',
      emissiveIntensity: 1.1,
      roughness: 0.3,
      metalness: 0.85,
    });

    this.scene.environment = this.garageEnvMap;
    this.scene.environmentIntensity = 0.88;

    this.buildSkyDome();

    this.hemiLight = new THREE.HemisphereLight('#94BCEB', '#3E2B1E', 0.88);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#FFE0A6', 2.45);
    this.sunLight.position.set(65, 58, -45);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    const d = 50;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight('#7DD3FC', 0.65);
    this.rimLight.position.set(-40, 25, -60);
    this.scene.add(this.rimLight);

    // Falling rain streak instanced pool (enabled during overcast_rain environment)
    const rainGeo = new THREE.BoxGeometry(0.025, 1.35, 0.025);
    const rainMat = new THREE.MeshBasicMaterial({
      color: '#BAE6FD',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    for (let i = 0; i < this.rainCount; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 76,
        y: Math.random() * 24,
        z: (Math.random() - 0.5) * 76,
        speed: 32 + Math.random() * 14,
      });
    }
    this.scene.add(this.rainMesh);

    this.garageMainLight = new THREE.PointLight('#FFF3D6', 92, 38, 1.5);
    this.garageMainLight.position.set(1.5, 6.8, 3.2);
    this.scene.add(this.garageMainLight);

    this.garageRimLight = new THREE.PointLight('#7DD3FC', 42, 30, 1.5);
    this.garageRimLight.position.set(-5.2, 2.8, -4.5);
    this.scene.add(this.garageRimLight);

    this.shadowTexture = createContactShadowTexture();

    // 3D RPD Police Helicopter + Spotlight Cone (Heat 4+)
    const heliGroup = new THREE.Group();
    const hDarkMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.42, metalness: 0.65 });
    const hWhiteMat = new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.35, metalness: 0.35 });
    const hGlassMat = new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.12, metalness: 0.9 });
    const hFuse = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.45, 5.4), hDarkMat);
    const hDoors = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.9, 2.2), hWhiteMat);
    const hGlass = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.95, 1.6), hGlassMat);
    hGlass.position.set(0, 0.18, 2.35);
    const hBoom = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 4.8), hDarkMat);
    hBoom.position.set(0, 0.25, -4.6);
    const hSkidGeo = new THREE.BoxGeometry(0.14, 0.14, 4.4);
    const skidL = new THREE.Mesh(hSkidGeo, hWhiteMat);
    skidL.position.set(-1.15, -1.05, 0.3);
    const skidR = new THREE.Mesh(hSkidGeo, hWhiteMat);
    skidR.position.set(1.15, -1.05, 0.3);

    const mainRotorGroup = new THREE.Group();
    mainRotorGroup.position.set(0, 0.95, 0);
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.08, 0.42), hWhiteMat);
    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 11.5), hWhiteMat);
    mainRotorGroup.add(bladeA, bladeB);

    const tailRotorGroup = new THREE.Group();
    tailRotorGroup.position.set(0.35, 0.35, -6.8);
    const tBladeA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.22), hWhiteMat);
    const tBladeB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 2.2), hWhiteMat);
    tailRotorGroup.add(tBladeA, tBladeB);

    const beamGeo = new THREE.ConeGeometry(8.8, 46, 20, 1, true);
    beamGeo.translate(0, -23, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#FEF9C3',
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heliBeam = new THREE.Mesh(beamGeo, beamMat);
    this.heliBeam.position.set(0, -0.8, 1.5);

    heliGroup.add(hFuse, hDoors, hGlass, hBoom, skidL, skidR, mainRotorGroup, tailRotorGroup, this.heliBeam);
    heliGroup.position.set(0, 44, 0);
    heliGroup.visible = false;
    this.heliGroup = heliGroup;
    this.heliMainRotor = mainRotorGroup;
    this.heliTailRotor = tailRotorGroup;
    this.scene.add(heliGroup);

    // Particle Pool
    const pGeo = new THREE.IcosahedronGeometry(0.32, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.particleCount);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 1,
        size: 1,
        color: new THREE.Color('#FFFFFF'),
      });
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _color.set('#FFFFFF'));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Skidmark Pool
    const skidGeo = new THREE.PlaneGeometry(0.36, 1.35);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: '#090A0D',
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, this.skidCount);
    this.skidMesh.frustumCulled = false;
    for (let i = 0; i < this.skidCount; i++) {
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.skidMesh);

    // 3D Peripheral Speed Streaks
    const streakGeo = new THREE.BoxGeometry(0.036, 0.036, 3.4);
    const streakMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.speedStreakMesh = new THREE.InstancedMesh(streakGeo, streakMat, this.speedStreakCount);
    this.speedStreakMesh.frustumCulled = false;
    for (let i = 0; i < this.speedStreakCount; i++) {
      this.speedStreaks.push({
        active: false,
        pos: new THREE.Vector3(),
        heading: 0,
        age: 0,
        maxAge: 0.25,
      });
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.speedStreakMesh.setMatrixAt(i, _dummy.matrix);
      this.speedStreakMesh.setColorAt(i, _color.set('#FEF3C7'));
    }
    this.speedStreakMesh.instanceMatrix.needsUpdate = true;
    if (this.speedStreakMesh.instanceColor) this.speedStreakMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.speedStreakMesh);

    // 3D Safe House Garage Bay
    this.garageShowroom = buildGarageShowroom(this.maxAnisotropy);
    this.scene.add(this.garageShowroom.group);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    if (!this.isSoftwareGl) {
      this.composerRt = new THREE.WebGLRenderTarget(initW, initH, {
        type: THREE.HalfFloatType,
      });
      this.composer = new EffectComposer(this.renderer, this.composerRt);
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.composer.setSize(initW, initH);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(initW, initH), 0.36, 0.38, 0.86);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.clock.start();
    this.tick();
  }

  private createBiomeEnvMap(
    pmrem: THREE.PMREMGenerator,
    topHex: string,
    midHex: string,
    horizonHex: string,
    groundHex: string,
    sunCoreRgba: string,
  ): THREE.Texture {
    const envScene = new THREE.Scene();
    const domeGeo = new THREE.SphereGeometry(50, 24, 16);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, topHex);
    grad.addColorStop(0.35, midHex);
    grad.addColorStop(0.50, horizonHex);
    grad.addColorStop(0.60, groundHex);
    grad.addColorStop(1.0, groundHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    const sGrad = ctx.createRadialGradient(180, 62, 2, 180, 62, 34);
    sGrad.addColorStop(0, sunCoreRgba);
    sGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)');
    sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sGrad;
    ctx.fillRect(140, 22, 80, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const domeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    envScene.add(dome);
    const rt = pmrem.fromScene(envScene, 0.04);
    domeGeo.dispose();
    domeMat.dispose();
    tex.dispose();
    return rt.texture;
  }

  private createGarageEnvMap(pmrem: THREE.PMREMGenerator): THREE.Texture {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#0E1117');
    const stripGeo = new THREE.BoxGeometry(12, 0.4, 1.4);
    const warmMat = new THREE.MeshBasicMaterial({ color: '#FDE68A' });
    const coolMat = new THREE.MeshBasicMaterial({ color: '#BAE6FD' });
    [-6, 0, 6].forEach((z, idx) => {
      const m = new THREE.Mesh(stripGeo, idx === 1 ? warmMat : coolMat);
      m.position.set(0, 8, z);
      envScene.add(m);
    });
    const sideStripGeo = new THREE.BoxGeometry(0.4, 1.6, 14);
    const sideL = new THREE.Mesh(sideStripGeo, warmMat);
    sideL.position.set(-12, 3.2, 0);
    const sideR = new THREE.Mesh(sideStripGeo, coolMat);
    sideR.position.set(12, 3.2, 0);
    envScene.add(sideL, sideR);

    const rt = pmrem.fromScene(envScene, 0.05);
    stripGeo.dispose();
    sideStripGeo.dispose();
    warmMat.dispose();
    coolMat.dispose();
    return rt.texture;
  }

  private buildSkyDome() {
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 1024;
    this.skyCanvas.height = 512;
    this.skyCtx = this.skyCanvas.getContext('2d');

    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyGeo = new THREE.SphereGeometry(3800, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false });
    this.skyDomeMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyDomeMesh.rotation.y = -0.68;
    this.scene.add(this.skyDomeMesh);
    this.redrawSkyDome('golden_dusk');
  }

  private redrawSkyDome(env: Exclude<EnvironmentId, 'auto'>) {
    if (!this.skyCtx || !this.skyTex) return;
    const ctx = this.skyCtx;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);

    if (env === 'midnight_neon') {
      grad.addColorStop(0.0, '#040711');
      grad.addColorStop(0.32, '#0B162C');
      grad.addColorStop(0.47, '#1B2D4F');
      grad.addColorStop(0.51, '#31456E');
      grad.addColorStop(0.60, '#0D1322');
      grad.addColorStop(1.0, '#07090F');
    } else if (env === 'overcast_rain') {
      grad.addColorStop(0.0, '#121922');
      grad.addColorStop(0.30, '#273444');
      grad.addColorStop(0.48, '#475569');
      grad.addColorStop(0.54, '#334155');
      grad.addColorStop(1.0, '#111827');
    } else if (env === 'noon_clear') {
      grad.addColorStop(0.0, '#1D4ED8');
      grad.addColorStop(0.28, '#3B82F6');
      grad.addColorStop(0.47, '#93C5FD');
      grad.addColorStop(0.51, '#DBEAFE');
      grad.addColorStop(0.58, '#475569');
      grad.addColorStop(1.0, '#1E293B');
    } else if (env === 'dawn_mist') {
      grad.addColorStop(0.0, '#0F2429');
      grad.addColorStop(0.28, '#1E4347');
      grad.addColorStop(0.46, '#6EE7B7');
      grad.addColorStop(0.51, '#FDE68A');
      grad.addColorStop(0.58, '#233330');
      grad.addColorStop(1.0, '#0E1716');
    } else if (env === 'crimson_foundry') {
      grad.addColorStop(0.0, '#140B10');
      grad.addColorStop(0.28, '#3B1822');
      grad.addColorStop(0.46, '#C2410C');
      grad.addColorStop(0.51, '#FB7185');
      grad.addColorStop(0.58, '#2C161A');
      grad.addColorStop(1.0, '#120A0C');
    } else {
      grad.addColorStop(0.0, '#0B1626');
      grad.addColorStop(0.26, '#273D56');
      grad.addColorStop(0.43, '#B76829');
      grad.addColorStop(0.495, '#F6A94E');
      grad.addColorStop(0.54, '#563C29');
      grad.addColorStop(0.74, '#241B14');
      grad.addColorStop(1.0, '#17120E');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    if (env === 'midnight_neon') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      for (let i = 0; i < 90; i++) {
        const sx = (i * 197 + 43) % 1024;
        const sy = (i * 89 + 17) % 210;
        const sr = (i % 3 === 0 ? 1.5 : 0.9);
        ctx.fillRect(sx, sy, sr, sr);
      }
      const moonGlow = ctx.createRadialGradient(720, 148, 6, 720, 148, 120);
      moonGlow.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
      moonGlow.addColorStop(0.25, 'rgba(125, 211, 252, 0.35)');
      moonGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(580, 28, 280, 260);
    } else if (env !== 'overcast_rain') {
      const sunX = 720;
      const sunY = env === 'noon_clear' ? 140 : 236;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 210);
      sunGlow.addColorStop(0.0, 'rgba(255, 250, 230, 0.96)');
      sunGlow.addColorStop(0.16, env === 'crimson_foundry' ? 'rgba(251, 146, 60, 0.72)' : 'rgba(253, 210, 118, 0.72)');
      sunGlow.addColorStop(0.45, 'rgba(234, 138, 48, 0.25)');
      sunGlow.addColorStop(1.0, 'rgba(234, 138, 48, 0.0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(sunX - 220, sunY - 220, 440, 440);
    }

    for (let i = 0; i < (env === 'overcast_rain' ? 68 : 40); i++) {
      const cx = ((i * 157) % 980) + 22;
      const cy = 96 + ((i * 53) % 136);
      const cw = 70 + (i % 5) * 38;
      const ch = 7 + (i % 4) * 4;
      const cGrad = ctx.createLinearGradient(cx, cy - ch, cx, cy + ch);
      if (env === 'overcast_rain') {
        cGrad.addColorStop(0, 'rgba(15, 23, 42, 0.52)');
        cGrad.addColorStop(1, 'rgba(100, 116, 139, 0.34)');
      } else if (env === 'noon_clear') {
        cGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        cGrad.addColorStop(1, 'rgba(219, 234, 254, 0.25)');
      } else {
        cGrad.addColorStop(0, 'rgba(42, 34, 38, 0.34)');
        cGrad.addColorStop(1, 'rgba(249, 173, 92, 0.26)');
      }
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = env === 'noon_clear' ? '#24303C' : env === 'midnight_neon' ? '#070B14' : '#1B1613';
    ctx.beginPath();
    ctx.moveTo(0, 260);
    for (let x = 0; x <= 1024; x += 16) {
      const ridge = Math.sin(x * 0.015) * 6 + Math.cos(x * 0.041) * 4;
      const cityCluster = x > 140 && x < 340 && x % 32 === 0 ? 12 + ((x * 7) % 14) : 0;
      ctx.lineTo(x, 255 - Math.max(0, ridge) - cityCluster);
    }
    ctx.lineTo(1024, 268);
    ctx.lineTo(0, 268);
    ctx.closePath();
    ctx.fill();

    this.skyTex.needsUpdate = true;
  }

  private applyRaceEnvironment(env: Exclude<EnvironmentId, 'auto'>) {
    this.activeEnvironment = env;
    this.scene.environment = this.raceEnvMaps[env];
    this.redrawSkyDome(env);
    if (this.skyDomeMesh) this.skyDomeMesh.visible = true;

    const presets: Record<
      Exclude<EnvironmentId, 'auto'>,
      {
        bg: string;
        fog: string;
        fogDensity: number;
        hemiSky: string;
        hemiGround: string;
        hemiInt: number;
        sunColor: string;
        sunInt: number;
        rimColor: string;
        rimInt: number;
        envInt: number;
        exposure: number;
      }
    > = {
      golden_dusk: {
        bg: '#2B2118',
        fog: '#2B2118',
        fogDensity: 0.00044,
        hemiSky: '#94BCEB',
        hemiGround: '#3E2B1E',
        hemiInt: 0.96,
        sunColor: '#FFE0A6',
        sunInt: 2.75,
        rimColor: '#7DD3FC',
        rimInt: 0.72,
        envInt: 1.05,
        exposure: 1.16,
      },
      midnight_neon: {
        bg: '#090F1E',
        fog: '#090F1E',
        fogDensity: 0.00050,
        hemiSky: '#60A5FA',
        hemiGround: '#0F172A',
        hemiInt: 0.84,
        sunColor: '#93C5FD',
        sunInt: 1.68,
        rimColor: '#38BDF8',
        rimInt: 1.12,
        envInt: 1.12,
        exposure: 1.20,
      },
      overcast_rain: {
        bg: '#1A2430',
        fog: '#1A2430',
        fogDensity: 0.00058,
        hemiSky: '#94A3B8',
        hemiGround: '#1E293B',
        hemiInt: 1.02,
        sunColor: '#CBD5E1',
        sunInt: 1.85,
        rimColor: '#60A5FA',
        rimInt: 0.78,
        envInt: 1.14,
        exposure: 1.14,
      },
      noon_clear: {
        bg: '#6BA4DB',
        fog: '#89B8E6',
        fogDensity: 0.00032,
        hemiSky: '#BAE6FD',
        hemiGround: '#3F4E3A',
        hemiInt: 1.12,
        sunColor: '#FFFBEB',
        sunInt: 2.95,
        rimColor: '#E0F2FE',
        rimInt: 0.60,
        envInt: 1.02,
        exposure: 1.12,
      },
      dawn_mist: {
        bg: '#1A2929',
        fog: '#243836',
        fogDensity: 0.00058,
        hemiSky: '#99F6E4',
        hemiGround: '#1F2925',
        hemiInt: 1.0,
        sunColor: '#FDE68A',
        sunInt: 2.25,
        rimColor: '#6EE7B7',
        rimInt: 0.74,
        envInt: 1.04,
        exposure: 1.15,
      },
      crimson_foundry: {
        bg: '#261317',
        fog: '#2B151A',
        fogDensity: 0.00054,
        hemiSky: '#FDA4AF',
        hemiGround: '#241415',
        hemiInt: 0.92,
        sunColor: '#FDBA74',
        sunInt: 2.48,
        rimColor: '#FB7185',
        rimInt: 0.82,
        envInt: 1.06,
        exposure: 1.18,
      },
    };

    const p = presets[env];
    this.scene.background = new THREE.Color(p.bg);
    this.scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    this.hemiLight.color.set(p.hemiSky);
    this.hemiLight.groundColor.set(p.hemiGround);
    this.hemiLight.intensity = p.hemiInt;
    this.sunLight.color.set(p.sunColor);
    this.sunLight.intensity = p.sunInt;
    this.rimLight.color.set(p.rimColor);
    this.rimLight.intensity = p.rimInt;
    this.scene.environmentIntensity = p.envInt;
    this.renderer.toneMappingExposure = p.exposure;
    this.rainMesh.visible = env === 'overcast_rain';
  }

  public showGarageCar(spec: CarSpec, config: GarageCarConfig) {
    this.clearRaceEntities();
    this.clearSpeedStreaks();
    this.mode = 'garage';
    this.paused = false;
    this.introTimer = 0;
    this.outroActive = false;
    this.outroOutcome = null;
    soundEngine.stopRaceLoops();
    if (this.heliGroup) this.heliGroup.visible = false;
    this.rainMesh.visible = false;
    if (this.skyDomeMesh) this.skyDomeMesh.visible = false;

    this.scene.background = new THREE.Color('#0D0E12');
    this.scene.fog = new THREE.FogExp2('#0D0E12', 0.015);
    this.scene.environment = this.garageEnvMap;
    this.scene.environmentIntensity = 0.88;
    this.hemiLight.color.set('#94BCEB');
    this.hemiLight.groundColor.set('#222630');
    this.hemiLight.intensity = 0.72;
    this.sunLight.color.set('#FFE6B8');
    this.sunLight.intensity = 1.85;

    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }

    if (this.garageShowroom) {
      this.garageShowroom.group.visible = true;
    }
    this.garageMainLight.visible = true;
    this.garageRimLight.visible = true;

    if (this.garageCar) {
      this.scene.remove(this.garageCar.root);
      this.garageCar.dispose();
      this.garageCar = null;
    }

    this.garageCar = buildCarMesh({
      spec,
      paintHex: config.paintHex,
      livery: config.livery,
      rimStyle: config.rimStyle,
      shadowTexture: this.shadowTexture,
      maxAnisotropy: this.maxAnisotropy,
      isSoftwareGl: this.isSoftwareGl,
    });
    this.garageCar.root.position.set(0, 0.032, 0);
    this.scene.add(this.garageCar.root);

    this.sunLight.position.set(12, 16, 12);
    this.sunLight.target.position.set(0, 0.7, 0);
    this.camera.fov = 44;
    this.camera.updateProjectionMatrix();
  }

  public startRace(params: RaceStartParams) {
    this.clearRaceEntities();
    this.resetInput();
    if (this.garageCar) {
      this.scene.remove(this.garageCar.root);
      this.garageCar.dispose();
      this.garageCar = null;
    }
    if (this.garageShowroom) {
      this.garageShowroom.group.visible = false;
    }
    this.garageMainLight.visible = false;
    this.garageRimLight.visible = false;
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }

    const trackMeta = TRACKS.find((t) => t.id === params.trackId);
    const resolvedEnv: Exclude<EnvironmentId, 'auto'> =
      params.environment && params.environment !== 'auto'
        ? params.environment
        : params.mission
          ? params.mission.environment
          : params.mode === 'blacklist' && params.rival
            ? params.rival.environment
            : (trackMeta?.defaultEnv ?? 'golden_dusk');
    this.applyRaceEnvironment(resolvedEnv);

    const isPursuitMission = params.mission?.type === 'pursuit_milestone';
    this.patrolsEnabled =
      params.mode === 'pursuit' || params.mode === 'freeroam' || isPursuitMission
        ? true
        : (params.patrolsEnabled ?? true);
    this.shortcutsTaken = 0;

    for (let i = 0; i < this.skidCount; i++) {
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;

    this.raceParams = params;
    this.mode = 'race';
    this.paused = false;
    this.outroActive = false;
    this.outroTimer = 0;
    this.outroOutcome = null;
    this.track = buildTrack(params.trackId, this.maxAnisotropy, resolvedEnv);
    this.scene.add(this.track.group);

    this.introDuration = 2.7;
    this.introTimer = params.mode === 'freeroam' ? 0 : this.introDuration;
    this.countdownTimer = params.mode === 'freeroam' ? 0 : 3.2;
    this.lastCountdownInt = 4;
    this.raceElapsedMs = 0;
    this.currentLapStartMs = 0;
    this.bestLapMs = 0;
    this.nitrous = 100;
    this.speedbreaker = 100;
    this.isSpeedbreaker = false;
    this.isDrifting = false;
    this.driftHoldSec = 0;
    this.driftTimeTotalSec = 0;
    this.airTimeTotalSec = 0;
    this.smashablesHit = 0;
    this.driftBoostTimer = 0;
    this.isSlipstreaming = false;
    this.spikedTimer = 0;
    this.playerOnCurb = false;
    this.playerNearBarrier = false;
    this.currentWallScrape = 0;
    this.speedTrapFlashTimer = 0;
    this.steerInputSmooth = 0;
    this.lastPlayerGear = 0;
    this.backfireTimer = -0.5;
    this.tollboothTimeLeftMs =
      params.mode === 'tollbooth'
        ? params.mission?.difficulty === 'Expert'
          ? 28500
          : 31000
        : 0;
    this.tollboothCheckpoint = 0;
    this.tollboothTotal = 8;
    this.sessionBounty = 0;
    this.copsTakedowns = 0;
    this.nearMissCount = 0;
    this.nearMissCombo = 0;
    this.nearMissComboTimer = 0;
    this.speedTrapBestKmh = 0;
    this.evadeProgress = 0;
    this.bustProgress = 0;
    this.nextRoadblockCooldown = 11;
    this.copSpawnTimer = 2.8;
    this.radioDispatch = null;
    this.perfFrameAccumMs = 0;
    this.perfFrameSamples = 0;

    this.activeMusicTrackName = musicEngine.getTrackTitle(params.trackId);
    soundEngine.setCarStyle(params.playerSpec.bodyStyle);
    musicEngine.startTrack(params.trackId);
    this.activeMusicTrackName = musicEngine.getCurrentTrackLabel();

    this.updateTollboothBeacons();

    if (params.mode === 'pursuit') {
      this.pursuitState = 'pursuit';
      this.heatLevel = Math.max(1, params.mission?.minHeat ? Math.min(2, params.mission.minHeat) : 1);
      this.highestHeat = this.heatLevel;
      this.pushCallout(
        params.mission
          ? `${params.mission.title.toUpperCase()} — HIT MILESTONES & EVADE`
          : `HEAT LEVEL ${this.heatLevel} — OUTRUN ROCKPORT PD`,
        'red',
      );
      this.pushRadio('Dispatch: All units, suspect sighted! Box them in and authorize spike strips.');
    } else if (params.mode === 'freeroam') {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      this.pushCallout('FREE ROAM — HIT RAMPS, SPEED TRAPS OR PROVOKE PD', 'amber');
    } else if (params.mode === 'tollbooth') {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      this.pushCallout('TOLLBOOTH TRIAL — CLEAR ALL 8 GATES ON TIGHT SPLITS', 'cyan');
    } else if (params.mode === 'speedtrap') {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      const targetTxt = params.mission?.targetSpeedtrapKmh
        ? `BEAT PACK & HIT ${params.mission.targetSpeedtrapKmh} KM/H TOTAL`
        : 'HIGHEST CUMULATIVE RADAR SPEED WINS';
      this.pushCallout(`SPEEDTRAP SHOWDOWN — ${targetTxt}`, 'cyan');
    } else {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      if (params.mode === 'blacklist' && params.rival) {
        this.pushCallout(`BLACKLIST #${params.rival.rank} DUEL VS ${params.rival.alias}`, 'amber');
        this.pushRadio(`${params.rival.alias}: "${params.rival.quote}"`);
      } else if (params.mode === 'sprint') {
        this.pushCallout(
          params.mission ? `${params.mission.title.toUpperCase()} — 1-LAP SPRINT` : 'ROCKPORT 1-LAP SPRINT — BEAT THE PACK',
          'amber',
        );
      } else if (params.mode === 'knockout') {
        this.pushCallout('LAP KNOCKOUT — LAST PLACE ELIMINATED EACH LAP', 'red');
      } else {
        this.pushCallout(
          params.mission ? `${params.mission.title.toUpperCase()} — TAKE P1` : 'ROCKPORT CIRCUIT — BEAT THE PACK',
          'amber',
        );
      }
    }

    const totalLaps = this.getTotalLaps();
    const raceDiff = this.getRaceDifficulty();
    const isPackRace =
      params.mode === 'circuit' ||
      params.mode === 'sprint' ||
      params.mode === 'knockout' ||
      params.mode === 'speedtrap';
    // Start player P3 (middle row) on Easy/Medium for a clean launch view; P4 back row on Hard/Expert
    const playerBackRow = raceDiff === 'Hard' || raceDiff === 'Expert';
    const startSampleIdx = isPackRace
      ? this.track.samples.length - (playerBackRow ? 12 : 10)
      : this.track.samples.length - 8;
    const gridStart = this.track.samples[startSampleIdx];
    const startHeading = Math.atan2(-gridStart.tangent.x, -gridStart.tangent.z);
    this.camHeading = startHeading;

    const playerVisual = buildCarMesh({
      spec: params.playerSpec,
      paintHex: params.playerConfig.paintHex,
      livery: params.playerConfig.livery,
      rimStyle: params.playerConfig.rimStyle,
      shadowTexture: this.shadowTexture,
      maxAnisotropy: this.maxAnisotropy,
      isSoftwareGl: this.isSoftwareGl,
      isPlayer: true,
    });
    const laneGridX = Math.min(3.1, this.track.roadHalfWidth * 0.28);
    const playerLane = isPackRace ? (playerBackRow ? laneGridX : -laneGridX) : -laneGridX;
    const playerStartPos = gridStart.point.clone().addScaledVector(gridStart.right, playerLane);
    playerStartPos.y += ROAD_SURFACE_OFFSET + playerLane * Math.sin(gridStart.bankAngle);
    playerVisual.root.position.copy(playerStartPos);
    playerVisual.root.rotation.y = startHeading;
    this.scene.add(playerVisual.root);

    this.player = {
      id: 'player',
      name: 'YOU',
      isPlayer: true,
      spec: params.playerSpec,
      visual: playerVisual,
      pos: playerStartPos,
      heading: startHeading,
      slopePitch: gridStart.slopePitch,
      bankRoll: gridStart.bankAngle,
      forwardSpeed: 0,
      lateralSpeed: 0,
      steerAngle: 0,
      pitch: 0,
      roll: 0,
      airHeight: 0,
      verticalVel: 0,
      airTimeTotal: 0,
      shuntCooldown: 0,
      copSlowdownTimer: 0,
      activeShortcutId: null,
      reachedShortcutCore: false,
      shortcutPassCooldown: 0,
      trackIdx: startSampleIdx,
      progress: gridStart.progress,
      lap: 0,
      totalProgress: gridStart.progress - 1,
      laneTarget: -laneGridX,
      aiSkill: 1,
      finished: false,
      knockedOut: false,
      finishTimeMs: 0,
      speedTrapTotalKmh: 0,
      speedTrapHits: 0,
      trapCooldowns: this.track.speedTraps.map(() => 0),
    };
    this.racers.push(this.player);

    if (params.mode === 'blacklist' && params.rival) {
      const rivalSpec = CARS.find((c) => c.id === params.rival!.carId) ?? CARS[1];
      const rivalVisual = buildCarMesh({
        spec: rivalSpec,
        paintHex: params.rival.paintHex,
        livery: params.rival.livery,
        rimStyle: 'black',
        shadowTexture: this.shadowTexture,
        maxAnisotropy: this.maxAnisotropy,
        isSoftwareGl: this.isSoftwareGl,
      });
      const rPos = gridStart.point.clone().addScaledVector(gridStart.right, laneGridX);
      rPos.y += ROAD_SURFACE_OFFSET + laneGridX * Math.sin(gridStart.bankAngle);
      rivalVisual.root.position.copy(rPos);
      rivalVisual.root.rotation.y = startHeading;
      this.scene.add(rivalVisual.root);

      this.racers.push({
        id: 'rival_boss',
        name: params.rival.alias,
        isPlayer: false,
        spec: rivalSpec,
        visual: rivalVisual,
        pos: rPos,
        heading: startHeading,
        slopePitch: gridStart.slopePitch,
        bankRoll: gridStart.bankAngle,
        forwardSpeed: 0,
        lateralSpeed: 0,
        steerAngle: 0,
        pitch: 0,
        roll: 0,
        airHeight: 0,
        verticalVel: 0,
        airTimeTotal: 0,
        shuntCooldown: 0,
        copSlowdownTimer: 0,
        activeShortcutId: null,
        reachedShortcutCore: false,
        shortcutPassCooldown: 0,
        trackIdx: startSampleIdx,
        progress: gridStart.progress,
        lap: 0,
        totalProgress: gridStart.progress - 1 + 0.001,
        laneTarget: laneGridX,
        aiSkill: Math.max(0.90, params.rival.aiSkill),
        finished: false,
        knockedOut: false,
        finishTimeMs: 0,
        speedTrapTotalKmh: 0,
        speedTrapHits: 0,
        trapCooldowns: this.track.speedTraps.map(() => 0),
      });
    } else if (
      params.mode === 'circuit' ||
      params.mode === 'sprint' ||
      params.mode === 'knockout' ||
      params.mode === 'speedtrap'
    ) {
      const defaultBoost = raceDiff === 'Easy' ? 0 : raceDiff === 'Medium' ? 1 : raceDiff === 'Hard' ? 2 : 3;
      const aiTierBoost = params.mission?.aiTierBoost ?? defaultBoost;
      const startPoolIdx = Math.min(7, aiTierBoost * 2);
      const aiPool = BLACKLIST_RIVALS.slice(startPoolIdx, startPoolIdx + 3);
      const offsets = playerBackRow
        ? [
            { idx: this.track.samples.length - 8, lane: -laneGridX },
            { idx: this.track.samples.length - 8, lane: laneGridX },
            { idx: this.track.samples.length - 12, lane: -laneGridX },
          ]
        : [
            { idx: this.track.samples.length - 7, lane: -laneGridX },
            { idx: this.track.samples.length - 7, lane: laneGridX },
            { idx: this.track.samples.length - 12, lane: laneGridX },
          ];
      const diffSkillBase =
        raceDiff === 'Easy' ? 0.90 : raceDiff === 'Medium' ? 0.94 : raceDiff === 'Hard' ? 0.98 : 1.01;
      aiPool.forEach((r, i) => {
        const s = this.track!.samples[offsets[i].idx];
        const aiSpec = CARS.find((c) => c.id === r.carId) ?? CARS[0];
        const aiVisual = buildCarMesh({
          spec: aiSpec,
          paintHex: r.paintHex,
          livery: r.livery,
          rimStyle: 'chrome',
          shadowTexture: this.shadowTexture,
          maxAnisotropy: this.maxAnisotropy,
          isSoftwareGl: this.isSoftwareGl,
        });
        const aPos = s.point.clone().addScaledVector(s.right, offsets[i].lane);
        aPos.y += ROAD_SURFACE_OFFSET + offsets[i].lane * Math.sin(s.bankAngle);
        const aHead = Math.atan2(-s.tangent.x, -s.tangent.z);
        aiVisual.root.position.copy(aPos);
        aiVisual.root.rotation.y = aHead;
        this.scene.add(aiVisual.root);

        this.racers.push({
          id: `ai_${i}`,
          name: r.alias,
          isPlayer: false,
          spec: aiSpec,
          visual: aiVisual,
          pos: aPos,
          heading: aHead,
          slopePitch: s.slopePitch,
          bankRoll: s.bankAngle,
          forwardSpeed: 0,
          lateralSpeed: 0,
          steerAngle: 0,
          pitch: 0,
          roll: 0,
          airHeight: 0,
          verticalVel: 0,
          airTimeTotal: 0,
          shuntCooldown: 0,
          copSlowdownTimer: 0,
          activeShortcutId: null,
          reachedShortcutCore: false,
          shortcutPassCooldown: 0,
          trackIdx: offsets[i].idx,
          progress: s.progress,
          lap: 0,
          totalProgress: s.progress - 1,
          laneTarget: offsets[i].lane,
          aiSkill: Math.min(1.06, diffSkillBase + i * 0.02 + aiTierBoost * 0.015),
          finished: false,
          knockedOut: false,
          finishTimeMs: 0,
          speedTrapTotalKmh: 0,
          speedTrapHits: 0,
          trapCooldowns: this.track!.speedTraps.map(() => 0),
        });
      });
    }

    const trafficCount = params.mode === 'freeroam' ? 16 : params.mode === 'pursuit' ? 12 : raceDiff === 'Easy' ? 7 : 10;
    this.spawnCivilianTraffic(trafficCount);

    if (params.mode === 'pursuit') {
      this.spawnPoliceCruiser(this.track.samples.length - 14, -laneGridX, false, false);
      this.spawnPoliceCruiser(52, laneGridX, false, false);
      if (this.heatLevel >= 2) {
        this.spawnPoliceCruiser(this.track.samples.length + 75, 0, false, false);
      }
    } else if (this.patrolsEnabled && params.mode !== 'tollbooth') {
      this.spawnPoliceCruiser(32, laneGridX * 1.1, false, false, false, true);
      this.spawnPoliceCruiser(88, -laneGridX * 1.1, false, false, false, true);
      this.spawnPoliceCruiser(148, laneGridX * 0.85, false, false, false, true);
    }

    this.camPos.copy(playerStartPos).addScaledVector(gridStart.tangent, -5.8).add(new THREE.Vector3(0, 2.25, 0));
    this.camLook.copy(playerStartPos).addScaledVector(gridStart.tangent, 22).add(new THREE.Vector3(0, 1.05, 0));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();

    this.emitTelemetry(totalLaps, true);
  }

  private updateTollboothBeacons() {
    if (!this.track) return;
    const isToll = this.raceParams?.mode === 'tollbooth';
    const nextIdx = this.tollboothCheckpoint % 4;
    this.track.tollbooths.forEach((gate, i) => {
      if (!isToll) {
        gate.beaconMat.color.set('#38BDF8');
        gate.beaconMat.emissive.set('#0EA5E9');
        gate.beaconMat.emissiveIntensity = 1.4;
      } else if (i === nextIdx) {
        gate.beaconMat.color.set('#FDE047');
        gate.beaconMat.emissive.set('#F59E0B');
        gate.beaconMat.emissiveIntensity = 4.6;
      } else {
        gate.beaconMat.color.set('#1E293B');
        gate.beaconMat.emissive.set('#0F172A');
        gate.beaconMat.emissiveIntensity = 0.4;
      }
    });
  }

  private spawnCivilianTraffic(count: number) {
    if (!this.track) return;
    const trafficColors = ['#94A3B8', '#334155', '#E2E8F0', '#78350F', '#1E3A8A', '#065F46'];
    const totalSamples = this.track.samples.length;

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + 0.5) / count) * totalSamples * 0.92 + 26) % totalSamples;
      const s = this.track.samples[idx];
      const lanes = [-7.6, -2.9, 2.9, 7.6];
      const laneOffset = lanes[i % lanes.length];
      const isTruck = i % 4 === 0;
      const spec = CARS[isTruck ? 1 : 0];
      const visual = buildCarMesh({
        spec,
        paintHex: trafficColors[i % trafficColors.length],
        livery: 'clean',
        rimStyle: 'chrome',
        shadowTexture: this.shadowTexture,
        maxAnisotropy: this.maxAnisotropy,
        isSoftwareGl: this.isSoftwareGl,
        isTraffic: true,
        isTrafficTruck: isTruck,
      });

      const pos = s.point.clone().addScaledVector(s.right, laneOffset);
      pos.y += ROAD_SURFACE_OFFSET + laneOffset * Math.sin(s.bankAngle);
      const heading = Math.atan2(-s.tangent.x, -s.tangent.z);
      visual.root.position.copy(pos);
      visual.root.rotation.y = heading;
      this.scene.add(visual.root);

      this.traffic.push({
        id: i,
        visual,
        pos,
        heading,
        speed: isTruck ? 15 : 20,
        trackIdx: idx,
        laneOffset,
        isTruck,
        knockLatVel: 0,
        nearMissCooldown: 0,
        hitCooldown: 0,
      });
    }
  }

  private spawnPoliceCruiser(
    trackIdx: number,
    laneOffset: number,
    isRoadblock: boolean,
    isRhino: boolean,
    isHeadOn = false,
    patrolling = false,
  ) {
    if (!this.track) return;
    const copSpec = isRhino
      ? { ...CARS[2], dimensions: { width: 2.25, height: 1.72, length: 4.9, wheelRadius: 0.44 } }
      : CARS[1];

    const visual = buildCarMesh({
      spec: copSpec,
      paintHex: '#0F172A',
      livery: 'clean',
      rimStyle: 'black',
      shadowTexture: this.shadowTexture,
      maxAnisotropy: this.maxAnisotropy,
      isSoftwareGl: this.isSoftwareGl,
      isPolice: !isRhino,
      isRhino,
    });
    const idx = ((trackIdx % this.track.samples.length) + this.track.samples.length) % this.track.samples.length;
    const s = this.track.samples[idx];
    const maxLat = Math.max(4.5, this.track.roadHalfWidth - 1.4);
    const clampedLat = THREE.MathUtils.clamp(laneOffset, -maxLat, maxLat);
    const pos = s.point.clone().addScaledVector(s.right, clampedLat);
    pos.y += ROAD_SURFACE_OFFSET + clampedLat * Math.sin(s.bankAngle);
    const heading =
      Math.atan2(-s.tangent.x, -s.tangent.z) + (isRoadblock ? Math.PI / 2 : isHeadOn ? Math.PI : 0);

    visual.root.position.copy(pos);
    visual.root.rotation.y = heading;
    this.scene.add(visual.root);

    this.cops.push({
      id: Math.floor(Math.random() * 100000),
      targetId: 'player',
      visual,
      pos,
      heading,
      speed: isRoadblock ? 0 : patrolling ? 28 : isHeadOn ? 50 : 38,
      trackIdx: idx,
      wrecked: false,
      wreckTimer: 0,
      isRoadblock,
      isRhino,
      isHeadOn,
      patrolling,
      aiHitCooldown: 0,
      flashPhase: Math.random() * 6,
    });
  }

  private spawnSpikeStrip(trackIdx: number) {
    if (!this.track) return;
    const idx = ((trackIdx % this.track.samples.length) + this.track.samples.length) % this.track.samples.length;
    const s = this.track.samples[idx];
    const mesh = new THREE.Mesh(this.spikeGeo, this.spikeMat);
    const pos = s.point.clone();
    pos.y += ROAD_SURFACE_OFFSET + 0.06;
    mesh.position.copy(pos);
    mesh.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
    this.scene.add(mesh);
    this.spikeStrips.push({ pos, mesh, hit: false, trackIdx: idx });
  }

  private clearRaceEntities() {
    this.racers.forEach((r) => {
      this.scene.remove(r.visual.root);
      r.visual.dispose();
    });
    this.racers = [];
    this.player = null;

    this.cops.forEach((c) => {
      this.scene.remove(c.visual.root);
      c.visual.dispose();
    });
    this.cops = [];

    this.spikeStrips.forEach((sp) => {
      this.scene.remove(sp.mesh);
    });
    this.spikeStrips = [];

    this.traffic.forEach((t) => {
      this.scene.remove(t.visual.root);
      t.visual.dispose();
    });
    this.traffic = [];
    this.clearSpeedStreaks();
    soundEngine.stopRaceLoops();
  }

  private clearSpeedStreaks() {
    for (let i = 0; i < this.speedStreakCount; i++) {
      this.speedStreaks[i].active = false;
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.speedStreakMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.speedStreakMesh.instanceMatrix.needsUpdate = true;
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    musicEngine.setPaused(paused);
    if (paused) {
      this.resetInput();
      soundEngine.stopRaceLoops();
    }
  }

  public setGarageCameraPreset(preset: GarageCameraPreset) {
    this.garageCameraPreset = preset;
    if (preset === 'front') this.garageOrbitAngle = 0.28;
    else if (preset === 'side') this.garageOrbitAngle = Math.PI * 0.5;
    else if (preset === 'rear') this.garageOrbitAngle = Math.PI + 0.34;
  }

  public skipIntro() {
    if (this.mode === 'race' && this.introTimer > 0 && !this.outroActive) {
      this.introTimer = 0;
      if (this.player) {
        const p = this.player;
        const fwdX = -Math.sin(p.heading);
        const fwdZ = -Math.cos(p.heading);
        this.camPos.set(p.pos.x - fwdX * 6.35, p.pos.y + 2.55, p.pos.z - fwdZ * 6.35);
        this.camLook.set(p.pos.x + fwdX * 22, p.pos.y + 1.18, p.pos.z + fwdZ * 22);
      }
      soundEngine.triggerCountdownTick(false);
    }
  }

  public finishFreeroamEarly() {
    if (this.mode === 'race' && this.raceParams?.mode === 'freeroam' && !this.outroActive) {
      this.completeRace(false);
    }
  }

  public cycleCameraMode() {
    const order: CameraMode[] = ['chase_far', 'chase_close', 'hood', 'bumper'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.pushCallout(
      this.cameraMode === 'chase_far'
        ? 'CAMERA: CHASE FAR'
        : this.cameraMode === 'chase_close'
          ? 'CAMERA: CHASE CLOSE'
          : this.cameraMode === 'hood'
            ? 'CAMERA: HOOD CAM'
            : 'CAMERA: BUMPER CAM',
      'cyan',
    );
  }

  public setAeLookEnabled(enabled: boolean) {
    this.aeLookEnabled = enabled;
    this.input.left = false;
    this.input.right = false;
    this.lookLeft = false;
    this.lookRight = false;
    this.lookBack = false;
    this.lookYawOffset = 0;
  }

  public getAeLookEnabled(): boolean {
    return this.aeLookEnabled;
  }

  public skipMusicTrack(): string {
    const label = musicEngine.nextTrack();
    this.activeMusicTrackName = label;
    this.pushCallout(`EA TRAX: ${label.toUpperCase()}`, 'cyan');
    return label;
  }

  public selectMusicTrack(index: number): string {
    const label = musicEngine.selectTrack(index);
    this.activeMusicTrackName = label;
    return label;
  }

  public resetPlayerToTrack() {
    if (!this.track || !this.player || this.mode !== 'race' || this.countdownTimer > 0) return;
    const p = this.player;
    const info = this.track.getClosestTrackInfo(p.pos.x, p.pos.z, p.trackIdx);
    p.activeShortcutId = null;
    p.reachedShortcutCore = false;
    p.trackIdx = info.sample.index;
    p.pos.copy(info.sample.point);
    p.pos.y = info.sample.point.y + ROAD_SURFACE_OFFSET;
    p.heading = Math.atan2(-info.sample.tangent.x, -info.sample.tangent.z);
    p.lateralSpeed = 0;
    p.forwardSpeed = Math.min(Math.max(0, p.forwardSpeed), 18);
    p.airHeight = 0;
    p.verticalVel = 0;
    p.visual.root.position.copy(p.pos);
    this.pushCallout('CAR RESET TO ROAD', 'amber');
  }

  private pushCallout(text: string, tone: 'amber' | 'cyan' | 'red' | 'emerald') {
    this.calloutId++;
    this.callout = { text, tone, expiresAt: performance.now() + 2600, id: this.calloutId };
  }

  private pushRadio(text: string) {
    this.radioDispatch = text;
    this.radioExpiresAt = performance.now() + 4800;
    soundEngine.triggerRadioSquelch();
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, colorHex: string, size: number, maxAge: number) {
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        p.vel.copy(vel);
        p.age = 0;
        p.maxAge = maxAge;
        p.size = size;
        p.color.set(colorHex);
        return;
      }
    }
  }

  private placeSkidmark(x: number, y: number, z: number, heading: number) {
    _dummy.position.set(x, y + 0.015, z);
    _dummy.rotation.set(0, heading, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    this.skidMesh.setMatrixAt(this.skidCursor, _dummy.matrix);
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = (this.skidCursor + 1) % this.skidCount;
  }

  private tick = () => {
    if (this.disposed) return;

    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    this.fpsFrameCount++;
    this.fpsAccumSec += rawDelta;
    if (this.fpsAccumSec >= 0.5) {
      this.currentFps = Math.max(1, Math.round(this.fpsFrameCount / this.fpsAccumSec));
      this.fpsFrameCount = 0;
      this.fpsAccumSec = 0;
    }

    if (!this.isSoftwareGl && this.mode === 'race' && !this.paused && rawDelta > 0) {
      this.perfFrameAccumMs += rawDelta * 1000;
      this.perfFrameSamples++;
      if (this.perfFrameSamples >= 45) {
        const avgMs = this.perfFrameAccumMs / this.perfFrameSamples;
        this.perfFrameAccumMs = 0;
        this.perfFrameSamples = 0;
        if (avgMs > 20.5) {
          if (this.currentPixelRatio > 1.0) {
            this.currentPixelRatio = Math.max(1.0, Number((this.currentPixelRatio - 0.25).toFixed(2)));
            this.renderer.setPixelRatio(this.currentPixelRatio);
            this.composer?.setPixelRatio(this.currentPixelRatio);
          } else if (this.renderer.shadowMap.enabled) {
            this.renderer.shadowMap.enabled = false;
            this.sunLight.castShadow = false;
          } else if (this.bloomEnabled) {
            this.bloomEnabled = false;
          }
        }
      }
    }

    if (this.mode === 'garage') {
      this.updateGarage(rawDelta);
    } else if (this.mode === 'race' && !this.paused && this.player && this.track) {
      this.updateRace(rawDelta);
    }

    if (this.composer && this.bloomEnabled && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateGarage(dt: number) {
    let targetDist = 6.2;
    let targetHeight = 1.95;
    let targetLookY = 0.72;

    if (this.garageCameraPreset === 'orbit') {
      if (!this.garageDragActive) {
        this.garageOrbitAngle += dt * 0.28;
      }
    } else if (this.garageCameraPreset === 'front') {
      targetDist = 5.05;
      targetHeight = 1.48;
      targetLookY = 0.65;
    } else if (this.garageCameraPreset === 'side') {
      targetDist = 5.75;
      targetHeight = 1.55;
      targetLookY = 0.68;
    } else if (this.garageCameraPreset === 'rear') {
      targetDist = 5.1;
      targetHeight = 1.68;
      targetLookY = 0.72;
    }

    this.garageCamDist = THREE.MathUtils.damp(this.garageCamDist, targetDist, 6.5, dt);
    this.garageCamHeight = THREE.MathUtils.damp(this.garageCamHeight, targetHeight, 6.5, dt);
    this.garageCamLookY = THREE.MathUtils.damp(this.garageCamLookY, targetLookY, 6.5, dt);

    const targetX = Math.sin(this.garageOrbitAngle) * this.garageCamDist;
    const targetZ = Math.cos(this.garageOrbitAngle) * this.garageCamDist;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetX, 7.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.garageCamHeight, 7.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetZ, 7.5, dt);
    this.camera.lookAt(0, this.garageCamLookY, 0);
  }

  private updateRace(rawDt: number) {
    if (!this.player || !this.track || !this.raceParams) return;

    const nowSec = performance.now() * 0.001;
    const countdownActiveInt = this.introTimer <= 0 && this.countdownTimer > 0 ? Math.ceil(this.countdownTimer) : 0;
    this.track.updateAnimations(nowSec, countdownActiveInt, this.introTimer > 0);

    // 1. Slow-motion animated Outro Cinematic (Win / Busted / Defeat)
    if (this.outroActive) {
      this.outroTimer += rawDt;
      const slowScale = this.outroOutcome === 'busted' ? 0.14 : 0.40;
      const slowDt = rawDt * slowScale;
      const p = this.player;

      if (this.outroOutcome !== 'busted') {
        p.forwardSpeed *= 1 - slowDt * 0.35;
        const fwdX = -Math.sin(p.heading);
        const fwdZ = -Math.cos(p.heading);
        p.pos.x += fwdX * p.forwardSpeed * slowDt;
        p.pos.z += fwdZ * p.forwardSpeed * slowDt;
        const pInfo = this.track.getClosestTrackInfo(p.pos.x, p.pos.z, p.trackIdx);
        p.trackIdx = pInfo.sample.index;
        p.pos.y = pInfo.elevationY + ROAD_SURFACE_OFFSET;
        const roadYaw = Math.atan2(-pInfo.sample.tangent.x, -pInfo.sample.tangent.z);
        let hDiff = roadYaw - p.heading;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        p.heading += hDiff * Math.min(1, slowDt * 3.5);
        p.visual.root.position.copy(p.pos);
        p.visual.root.rotation.set(pInfo.slopePitch, p.heading, -pInfo.bankAngle, 'YXZ');
        const spin = (p.forwardSpeed * slowDt) / 0.36;
        p.visual.wheelSpinners.forEach((w) => (w.rotation.x -= spin));
        if (this.outroOutcome === 'win' && Math.random() < 0.55) {
          _v1.set(p.pos.x + (Math.random() - 0.5) * 3.6, p.pos.y + 1.2 + Math.random() * 1.4, p.pos.z + (Math.random() - 0.5) * 3.6);
          _v2.set((Math.random() - 0.5) * 7, 3.8 + Math.random() * 3.2, (Math.random() - 0.5) * 7);
          this.spawnParticle(_v1, _v2, Math.random() > 0.45 ? '#F59E0B' : '#38BDF8', 0.72, 0.55);
        }
      }

      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        if (!r.isPlayer && !r.knockedOut) this.updateAiRacer(r, slowDt);
      }
      for (let ci = 0; ci < this.cops.length; ci++) {
        const cop = this.cops[ci];
        cop.flashPhase += rawDt * 12;
        const alt = Math.sin(cop.flashPhase) > 0;
        if (cop.visual.lightbarRed && cop.visual.lightbarBlue) {
          cop.visual.lightbarRed.emissiveIntensity = alt ? 3.8 : 0.25;
          cop.visual.lightbarBlue.emissiveIntensity = alt ? 0.25 : 3.8;
        }
        if (cop.visual.lightbarHaloRed && cop.visual.lightbarHaloBlue) {
          cop.visual.lightbarHaloRed.visible = alt;
          cop.visual.lightbarHaloBlue.visible = !alt;
        }
      }

      const orbitAngle = p.heading + 0.8 + this.outroTimer * 0.52;
      const orbitDist = this.outroOutcome === 'busted' ? 6.2 : 5.4;
      const camX = p.pos.x + Math.sin(orbitAngle) * orbitDist;
      const camZ = p.pos.z + Math.cos(orbitAngle) * orbitDist;
      const camY = p.pos.y + (this.outroOutcome === 'busted' ? 2.4 : 1.75);
      this.camera.position.lerp(_v1.set(camX, camY, camZ), Math.min(1, rawDt * 5.2));
      this.camera.lookAt(p.pos.x, p.pos.y + 0.85, p.pos.z);
      if (Math.abs(this.camera.fov - 50) > 0.2) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 50, 5, rawDt);
        this.camera.updateProjectionMatrix();
      }
      this.sunLight.position.set(p.pos.x + 65, p.pos.y + 58, p.pos.z - 45);
      this.sunLight.target.position.copy(p.pos);
      if (this.skyDomeMesh) this.skyDomeMesh.position.set(p.pos.x, p.pos.y * 0.2, p.pos.z);
      this.updateParticles(rawDt);
      this.updateRain(rawDt);
      this.emitTelemetry(this.getTotalLaps(), false);
      return;
    }

    // 2. Sweeping 3D Intro Starting-Grid Flyover Cinematic
    if (this.introTimer > 0) {
      this.introTimer = Math.max(0, this.introTimer - rawDt);
      const t = THREE.MathUtils.clamp(1 - this.introTimer / this.introDuration, 0, 1);
      const ease = t * t * (3 - 2 * t);
      const p = this.player;
      const fwdX = -Math.sin(p.heading);
      const fwdZ = -Math.cos(p.heading);
      const rightX = Math.cos(p.heading);
      const rightZ = -Math.sin(p.heading);

      const angle = THREE.MathUtils.lerp(-Math.PI * 0.82, 0.08, ease);
      const radius = THREE.MathUtils.lerp(13.5, 6.45, ease);
      const height = THREE.MathUtils.lerp(4.4, 2.55, ease);
      const cx = p.pos.x - (fwdX * Math.cos(angle) - rightX * Math.sin(angle)) * radius;
      const cz = p.pos.z - (fwdZ * Math.cos(angle) - rightZ * Math.sin(angle)) * radius;

      this.camera.position.set(cx, p.pos.y + height, cz);
      this.camera.lookAt(
        p.pos.x + fwdX * THREE.MathUtils.lerp(2.5, 22, ease),
        p.pos.y + THREE.MathUtils.lerp(1.1, 1.18, ease),
        p.pos.z + fwdZ * THREE.MathUtils.lerp(2.5, 22, ease),
      );
      const targetFov = THREE.MathUtils.lerp(52, 64, ease);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
      }
      this.camPos.copy(this.camera.position);

      this.gridRevRpm = THREE.MathUtils.damp(this.gridRevRpm, this.input.throttle ? 0.84 : 0.24, 6, rawDt);
      soundEngine.update({
        active: true,
        rpm: this.gridRevRpm,
        throttle: this.input.throttle,
        gear: 0,
        speedKmh: 0,
        nosActive: false,
        driftSlip: 0,
        copProximity: 0,
        onCurb: false,
        airborne: false,
        inTunnel: false,
        timeScale: 1.0,
      });

      this.sunLight.position.set(p.pos.x + 65, p.pos.y + 58, p.pos.z - 45);
      this.sunLight.target.position.copy(p.pos);
      if (this.skyDomeMesh) this.skyDomeMesh.position.set(p.pos.x, p.pos.y * 0.2, p.pos.z);
      this.updateRain(rawDt);
      this.emitTelemetry(this.getTotalLaps(), false);
      return;
    }

    if (this.countdownTimer > 0) {
      this.countdownTimer -= rawDt;
      const cInt = Math.ceil(this.countdownTimer);
      if (cInt < this.lastCountdownInt && cInt >= 1 && cInt <= 3) {
        this.lastCountdownInt = cInt;
        soundEngine.triggerCountdownTick(false);
      }
      this.gridRevRpm = THREE.MathUtils.damp(
        this.gridRevRpm,
        this.input.throttle ? 0.88 : 0.2,
        this.input.throttle ? 9.5 : 5.5,
        rawDt,
      );
      soundEngine.update({
        active: true,
        rpm: this.gridRevRpm,
        throttle: this.input.throttle,
        gear: 0,
        speedKmh: 0,
        nosActive: false,
        driftSlip: 0,
        copProximity: 0,
        onCurb: false,
        airborne: false,
        inTunnel: false,
        timeScale: 1.0,
      });
      if (this.countdownTimer <= 0) {
        soundEngine.triggerCountdownTick(true);
        if (this.input.throttle) {
          this.player.forwardSpeed = 12.5;
          this.driftBoostTimer = 0.85;
          this.pushCallout('PERFECT LAUNCH! GO!', 'emerald');
        } else {
          this.pushCallout('GO!', 'emerald');
        }
      }
      this.updateCamera(rawDt);
      this.updateParticles(rawDt);
      this.emitTelemetry(this.getTotalLaps(), false);
      return;
    }

    const wantsBreaker = this.input.speedbreaker && this.speedbreaker > 4 && this.player.forwardSpeed > 10;
    if (wantsBreaker !== this.isSpeedbreaker) {
      soundEngine.triggerSpeedbreaker(wantsBreaker);
    }
    this.isSpeedbreaker = wantsBreaker;
    const timeScale = this.isSpeedbreaker ? 0.42 : 1.0;
    const dt = rawDt * timeScale;

    if (this.isSpeedbreaker) {
      this.speedbreaker = Math.max(0, this.speedbreaker - rawDt * 22);
    } else {
      this.speedbreaker = Math.min(100, this.speedbreaker + rawDt * 7.5);
    }

    if (this.nearMissComboTimer > 0) {
      this.nearMissComboTimer = Math.max(0, this.nearMissComboTimer - rawDt);
      if (this.nearMissComboTimer === 0) this.nearMissCombo = 0;
    }
    if (this.speedTrapFlashTimer > 0) {
      this.speedTrapFlashTimer = Math.max(0, this.speedTrapFlashTimer - rawDt);
    }

    this.raceElapsedMs += dt * 1000;

    // Tollbooth Countdown Clock
    if (this.raceParams.mode === 'tollbooth') {
      this.tollboothTimeLeftMs = Math.max(0, this.tollboothTimeLeftMs - dt * 1000);
      if (this.tollboothTimeLeftMs <= 0) {
        this.completeRace(false, false, true);
        return;
      }
    }

    this.updatePlayerPhysics(dt, rawDt);
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.shuntCooldown > 0) r.shuntCooldown = Math.max(0, r.shuntCooldown - dt);
      if (r.copSlowdownTimer > 0) r.copSlowdownTimer = Math.max(0, r.copSlowdownTimer - dt);
      if (r.shortcutPassCooldown > 0) r.shortcutPassCooldown = Math.max(0, r.shortcutPassCooldown - dt);
      for (let t = 0; t < r.trapCooldowns.length; t++) {
        if (r.trapCooldowns[t] > 0) r.trapCooldowns[t] = Math.max(0, r.trapCooldowns[t] - dt);
      }
      if (!r.isPlayer && !r.knockedOut) this.updateAiRacer(r, dt);
    }
    this.updateCivilianTraffic(dt);
    this.resolveCarCollisions();
    this.updateTrackInteractions(dt);
    this.updatePolicePursuit(dt, rawDt);
    this.enforcePostCollisionBarrierSafety();

    if (this.heliGroup) {
      if (this.pursuitState === 'pursuit' && this.heatLevel >= 4) {
        this.heliGroup.visible = true;
        const tNow = performance.now() * 0.0022;
        const hx = this.player.pos.x + Math.sin(tNow) * 14;
        const hz = this.player.pos.z + Math.cos(tNow) * 14;
        this.heliGroup.position.set(hx, this.player.pos.y + 42, hz);
        this.heliGroup.rotation.y = Math.atan2(this.player.pos.x - hx, this.player.pos.z - hz);
        this.heliGroup.rotation.x = 0.14;
        if (this.heliMainRotor) this.heliMainRotor.rotation.y += rawDt * 24;
        if (this.heliTailRotor) this.heliTailRotor.rotation.x += rawDt * 32;
        if (this.heliBeam) {
          this.heliBeam.rotation.z = Math.sin(tNow * 1.4) * 0.16;
          this.heliBeam.rotation.x = Math.cos(tNow * 1.1) * 0.16;
        }
      } else {
        this.heliGroup.visible = false;
      }
    }

    this.sunLight.position.set(this.player.pos.x + 65, this.player.pos.y + 58, this.player.pos.z - 45);
    this.sunLight.target.position.copy(this.player.pos);
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(this.player.pos.x, this.player.pos.y * 0.2, this.player.pos.z);
    }

    this.updateCamera(rawDt);
    this.updateParticles(dt);
    this.updateRain(rawDt);
    this.updateSpeedStreaks(
      rawDt,
      (this.input.nitrous && this.nitrous > 1 && this.input.throttle) || this.driftBoostTimer > 0,
    );

    if (this.raceParams.mode === 'knockout') {
      const activeRacers = this.racers.filter((r) => !r.knockedOut);
      if (activeRacers.length === 4 && activeRacers.filter((r) => r.lap >= 2).length >= 3) {
        activeRacers.sort((a, b) => b.totalProgress - a.totalProgress);
        const loser = activeRacers[activeRacers.length - 1];
        loser.knockedOut = true;
        loser.visual.root.visible = false;
        if (loser.isPlayer) {
          this.completeRace(false, true);
          return;
        }
        this.pushCallout(`KNOCKOUT! ${loser.name} ELIMINATED · 3 RACERS LEFT`, 'red');
        soundEngine.triggerBeep(true);
      } else if (activeRacers.length === 3 && activeRacers.filter((r) => r.lap >= 3).length >= 2) {
        activeRacers.sort((a, b) => b.totalProgress - a.totalProgress);
        const loser = activeRacers[activeRacers.length - 1];
        loser.knockedOut = true;
        loser.visual.root.visible = false;
        if (loser.isPlayer) {
          this.completeRace(false, true);
          return;
        }
        this.pushCallout(`KNOCKOUT! ${loser.name} ELIMINATED · FINAL DUEL!`, 'amber');
        soundEngine.triggerBeep(true);
      }
    }

    const totalLaps = this.getTotalLaps();
    if (
      this.raceParams.mode !== 'pursuit' &&
      this.raceParams.mode !== 'freeroam' &&
      this.raceParams.mode !== 'tollbooth' &&
      this.player.lap > totalLaps &&
      !this.player.finished
    ) {
      this.player.finished = true;
      this.player.finishTimeMs = this.raceElapsedMs;
      this.completeRace(false);
      return;
    }

    this.emitTelemetry(totalLaps, false);
  }

  private getRaceDifficulty(): TrackDifficulty {
    if (!this.raceParams) return 'Medium';
    if (this.raceParams.mission?.difficulty) return this.raceParams.mission.difficulty;
    return TRACKS.find((t) => t.id === this.raceParams!.trackId)?.difficulty ?? 'Medium';
  }

  private getTotalLaps(): number {
    if (!this.raceParams) return 3;
    if (this.raceParams.mode === 'pursuit' || this.raceParams.mode === 'freeroam') return 99;
    if (this.raceParams.mode === 'tollbooth') return 2;
    if (this.raceParams.mode === 'sprint') return 1;
    if (this.raceParams.mode === 'speedtrap') return this.raceParams.mission?.laps ?? 1;
    if (this.raceParams.mode === 'knockout') return 3;
    if (this.raceParams.mode === 'blacklist' && this.raceParams.rival) return this.raceParams.rival.laps;
    if (this.raceParams.mission?.laps) return this.raceParams.mission.laps;
    return TRACKS.find((t) => t.id === this.raceParams!.trackId)?.defaultLaps ?? 3;
  }

  private computeGearAndRpm(forwardSpeed: number, throttle: boolean): { gear: number; rpm: number } {
    const speedKmh = Math.abs(forwardSpeed) * 3.6;
    if (forwardSpeed < -0.5) {
      return {
        gear: -1,
        rpm: THREE.MathUtils.clamp((speedKmh / 72) * 0.72 + 0.22, 0.2, 0.95),
      };
    }
    if (speedKmh < 2.5) {
      return { gear: 0, rpm: throttle ? 0.52 : 0.16 };
    }
    const gearThresholds = [0, 56, 108, 162, 218, 276, 390];
    let gear = 1;
    for (let g = 1; g <= 6; g++) {
      if (speedKmh <= gearThresholds[g] || g === 6) {
        gear = g;
        break;
      }
    }
    const low = gearThresholds[gear - 1];
    const high = gearThresholds[gear];
    const ratio = THREE.MathUtils.clamp((speedKmh - low) / Math.max(1, high - low), 0, 1);
    return {
      gear,
      rpm: THREE.MathUtils.clamp(0.32 + ratio * 0.65, 0.24, 0.97),
    };
  }

  private updatePlayerPhysics(dt: number, rawDt: number) {
    const p = this.player!;
    const cfg = this.raceParams!.playerConfig;
    const stats = computeEffectiveStats(p.spec, cfg);

    const baseMaxMs = stats.topSpeedKmh / 3.6;
    const nosActive = this.input.nitrous && this.nitrous > 1 && this.input.throttle;
    if (this.driftBoostTimer > 0) {
      this.driftBoostTimer = Math.max(0, this.driftBoostTimer - rawDt);
    }
    const boostFlare = nosActive || this.driftBoostTimer > 0;

    // Aerodynamic Slipstream check
    const pFwdX = -Math.sin(p.heading);
    const pFwdZ = -Math.cos(p.heading);
    let drafting = false;
    if (p.forwardSpeed > 32 && this.input.throttle) {
      for (let i = 0; i < this.racers.length && !drafting; i++) {
        const other = this.racers[i];
        if (other.isPlayer) continue;
        const dx = other.pos.x - p.pos.x;
        const dz = other.pos.z - p.pos.z;
        const fwdDist = dx * pFwdX + dz * pFwdZ;
        if (fwdDist > 5 && fwdDist < 38) {
          const latDist = Math.abs(dx * -pFwdZ + dz * pFwdX);
          if (latDist < 3.4) drafting = true;
        }
      }
      for (let i = 0; i < this.traffic.length && !drafting; i++) {
        const tr = this.traffic[i];
        const dx = tr.pos.x - p.pos.x;
        const dz = tr.pos.z - p.pos.z;
        const fwdDist = dx * pFwdX + dz * pFwdZ;
        if (fwdDist > 5 && fwdDist < 34) {
          const latDist = Math.abs(dx * -pFwdZ + dz * pFwdX);
          if (latDist < 3.2) drafting = true;
        }
      }
    }
    this.isSlipstreaming = drafting;

    if (this.spikedTimer > 0) {
      this.spikedTimer = Math.max(0, this.spikedTimer - rawDt);
      if (Math.abs(p.forwardSpeed) > 12 && Math.random() < 0.45) {
        _v1.set(p.pos.x + (Math.random() - 0.5) * 1.3, p.pos.y + 0.14, p.pos.z + (Math.random() - 0.5) * 1.3);
        _v2.set((Math.random() - 0.5) * 5, 2.2, (Math.random() - 0.5) * 5);
        this.spawnParticle(_v1, _v2, '#F59E0B', 0.42, 0.25);
      }
    }

    const spikeCapMs = this.spikedTimer > 0 ? 145 / 3.6 : Infinity;
    const maxForwardMs = Math.min(
      spikeCapMs,
      nosActive
        ? baseMaxMs * 1.18
        : this.driftBoostTimer > 0
          ? baseMaxMs * 1.1
          : drafting
            ? baseMaxMs * 1.06
            : baseMaxMs,
    );

    const launchAccel = 4.2 + (stats.accel / 100) * 9.5;
    const speedNorm = Math.min(1.18, Math.max(0, p.forwardSpeed) / baseMaxMs);
    const torqueCurve = Math.max(0.55, 1.0 - 0.30 * Math.min(1, speedNorm));
    const driveAccel =
      launchAccel *
      torqueCurve *
      (nosActive ? 1.44 : this.driftBoostTimer > 0 ? 1.28 : 1.0) *
      (drafting ? 1.1 : 1.0);
    const aeroCoeff = (launchAccel * 0.56) / (baseMaxMs * baseMaxMs);
    const rollingDrag = 0.45;
    const currentDrag =
      aeroCoeff * p.forwardSpeed * Math.abs(p.forwardSpeed) + rollingDrag * Math.sign(p.forwardSpeed);

    if (boostFlare) {
      if (nosActive) {
        this.nitrous = Math.max(0, this.nitrous - rawDt * (22 - cfg.nitrousLevel * 2.2));
      }
      p.visual.nosFlames.forEach((f) => {
        f.visible = true;
        f.scale.set(1.0 + Math.random() * 0.22, 1.0 + Math.random() * 0.22, 0.85 + Math.random() * 0.95);
      });
      p.visual.nosCores.forEach((c) => {
        c.visible = true;
        c.scale.set(1.0 + Math.random() * 0.15, 1.0 + Math.random() * 0.15, 0.75 + Math.random() * 0.7);
      });
      p.visual.nosHalos.forEach((h) => {
        h.visible = true;
        const pulse = 0.95 + Math.random() * 0.5;
        h.scale.setScalar(pulse);
        (h.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.random() * 0.35;
      });
      const sinH = Math.sin(p.heading);
      const cosH = Math.cos(p.heading);
      const rightX = cosH;
      const rightZ = -sinH;
      const sparkCount = nosActive ? 2 : 1;
      for (let sp = 0; sp < sparkCount; sp++) {
        const pipeSign = sp === 0 ? -0.38 : 0.38;
        _v1.set(
          p.pos.x + sinH * 2.35 + rightX * pipeSign,
          p.pos.y + 0.36 + (Math.random() - 0.5) * 0.1,
          p.pos.z + cosH * 2.35 + rightZ * pipeSign,
        );
        _v2.set(sinH * 11 + (Math.random() - 0.5) * 2.0, 0.35 + Math.random() * 0.4, cosH * 11 + (Math.random() - 0.5) * 2.0);
        this.spawnParticle(_v1, _v2, nosActive ? (sp === 0 ? '#38BDF8' : '#E0F2FE') : '#F59E0B', 0.72, 0.26);
      }
    } else {
      p.visual.nosFlames.forEach((f) => (f.visible = false));
      p.visual.nosCores.forEach((c) => (c.visible = false));
      p.visual.nosHalos.forEach((h) => (h.visible = false));
      const passiveRecharge = 3.2 + cfg.nitrousLevel * 1.0 + (drafting ? 7.5 : 0);
      this.nitrous = Math.min(100, this.nitrous + rawDt * passiveRecharge);
    }

    const airborne = p.airHeight > 0.12;

    if (!airborne) {
      if (this.input.throttle) {
        if (p.forwardSpeed < 0) {
          p.forwardSpeed += 28 * dt;
        } else {
          p.forwardSpeed += (driveAccel - currentDrag) * dt;
        }
      } else if (this.input.brake) {
        if (p.forwardSpeed > 1.2) {
          p.forwardSpeed -= (30 + currentDrag) * dt;
        } else {
          p.forwardSpeed -= 14 * dt;
        }
      } else {
        p.forwardSpeed -= (Math.sign(p.forwardSpeed) * 2.2 + currentDrag) * dt;
        if (Math.abs(p.forwardSpeed) < 0.25) p.forwardSpeed = 0;
      }
    }

    p.forwardSpeed = THREE.MathUtils.clamp(p.forwardSpeed, -20, maxForwardMs);

    const rawSteerInput = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const steerRate = Math.abs(rawSteerInput) > 0.05 ? 11.5 : 18.0;
    this.steerInputSmooth = THREE.MathUtils.damp(this.steerInputSmooth, rawSteerInput, steerRate, rawDt);
    const steerInput = this.steerInputSmooth;

    const absSpeed = Math.abs(p.forwardSpeed);
    const spikeWobble = this.spikedTimer > 0 ? Math.sin(performance.now() * 0.018) * 0.06 : 0;
    const targetWheelAngle = steerInput * 0.50 + spikeWobble;
    p.steerAngle = THREE.MathUtils.damp(p.steerAngle, targetWheelAngle, 16, rawDt);

    const speedRatio = Math.min(1, absSpeed / 8.5);
    // Speed-dependent steering authority with planted high-speed tire bite
    const speedTurnScale = THREE.MathUtils.lerp(1.0, 0.48, Math.min(1, absSpeed / 95));
    const handlingFactor = (2.25 + (stats.handling / 100) * 1.22) * (this.spikedTimer > 0 ? 0.80 : 1.0);
    const breakerBoost = this.isSpeedbreaker ? 1.65 : 1.0;
    const brakeDriftTap = !airborne && this.input.brake && Math.abs(rawSteerInput) > 0.1 && absSpeed > 24;
    const handbrakeTurn = this.input.handbrake ? 1.42 : brakeDriftTap ? 1.26 : 1.0;
    const turnDir = p.forwardSpeed >= -0.2 ? 1 : -1;
    const gripScale = airborne ? 0.18 : 1.0;

    const angularVel =
      targetWheelAngle * speedRatio * speedTurnScale * handlingFactor * breakerBoost * handbrakeTurn * turnDir * gripScale;
    p.heading += angularVel * dt;

    // Gentle tire scrub on extreme flat-out cornering above 215 km/h without hovercraft slip
    const highSpeedUndersteer =
      !airborne && absSpeed > 60 && Math.abs(rawSteerInput) > 0.65 && !this.isSpeedbreaker && !this.input.handbrake && !this.input.brake;
    if (highSpeedUndersteer) {
      p.lateralSpeed += angularVel * p.forwardSpeed * 0.04 * dt;
      p.forwardSpeed *= 1 - Math.min(0.08, 0.07 * dt);
    }

    const counterSteering = rawSteerInput * p.lateralSpeed < -0.15;
    const baseGrip = this.input.handbrake
      ? 4.8
      : brakeDriftTap
        ? 6.6
        : (22.5 + (stats.handling / 100) * 5.0) * (Math.abs(rawSteerInput) < 0.1 ? 1.4 : 1.0);
    const driftGrip = baseGrip * (this.isSpeedbreaker ? 1.9 : 1.0) * (counterSteering ? 1.7 : 1.0);
    const lateralInject = this.input.handbrake ? 0.34 : brakeDriftTap ? 0.24 : 0.045;
    if (!airborne) {
      p.lateralSpeed += angularVel * p.forwardSpeed * lateralInject * dt;
      p.lateralSpeed = THREE.MathUtils.damp(p.lateralSpeed, 0, driftGrip, dt);
      if (Math.abs(p.lateralSpeed) > 3.8 && this.input.handbrake) {
        p.forwardSpeed *= 1 - Math.min(0.20, 0.16 * dt);
      }
    }

    const launchWheelspin =
      !airborne && this.input.throttle && Math.abs(p.forwardSpeed) < 17 && !nosActive
        ? THREE.MathUtils.clamp(1 - Math.abs(p.forwardSpeed) / 17, 0, 1) * 0.85
        : 0;
    if (launchWheelspin > 0.25) {
      this.skidAccum += rawDt;
      if (this.skidAccum > 0.05) {
        this.skidAccum = 0;
        const sinH = Math.sin(p.heading);
        const cosH = Math.cos(p.heading);
        const rx = cosH * 0.85;
        const rz = -sinH * 0.85;
        this.placeSkidmark(p.pos.x + sinH * 1.4 - rx, p.pos.y, p.pos.z + cosH * 1.4 - rz, p.heading);
        this.placeSkidmark(p.pos.x + sinH * 1.4 + rx, p.pos.y, p.pos.z + cosH * 1.4 + rz, p.heading);
      }
      if (Math.random() < 0.72) {
        _v1.set(p.pos.x + (Math.random() - 0.5) * 1.4, p.pos.y + 0.16, p.pos.z + (Math.random() - 0.5) * 1.4);
        _v2.set((Math.random() - 0.5) * 1.8, 1.5, (Math.random() - 0.5) * 1.8);
        this.spawnParticle(_v1, _v2, '#94A3B8', 0.9, 0.52);
      }
    }

    const driftSlip = airborne ? 0 : Math.min(1, Math.abs(p.lateralSpeed) / 7.8);
    const wasDrifting = this.isDrifting;
    this.isDrifting = !airborne && driftSlip > 0.24 && Math.abs(p.forwardSpeed) > 14;

    if (this.isDrifting) {
      this.driftHoldSec += rawDt;
      this.driftTimeTotalSec += rawDt;
      this.nitrous = Math.min(100, this.nitrous + rawDt * 14 * driftSlip);
      this.speedbreaker = Math.min(100, this.speedbreaker + rawDt * 11 * driftSlip);
      this.skidAccum += rawDt;
      if (this.skidAccum > 0.04) {
        this.skidAccum = 0;
        const sinH = Math.sin(p.heading);
        const cosH = Math.cos(p.heading);
        const rx = cosH * 0.85;
        const rz = -sinH * 0.85;
        this.placeSkidmark(p.pos.x + sinH * 1.4 - rx, p.pos.y, p.pos.z + cosH * 1.4 - rz, p.heading);
        this.placeSkidmark(p.pos.x + sinH * 1.4 + rx, p.pos.y, p.pos.z + cosH * 1.4 + rz, p.heading);
      }
      if (Math.random() < 0.65) {
        _v1.set(p.pos.x + (Math.random() - 0.5) * 1.4, p.pos.y + 0.16, p.pos.z + (Math.random() - 0.5) * 1.4);
        _v2.set((Math.random() - 0.5) * 2.2, 1.3, (Math.random() - 0.5) * 2.2);
        this.spawnParticle(_v1, _v2, '#CBD5E1', 0.95, 0.55);
      }
    } else {
      if (wasDrifting && this.driftHoldSec >= 0.55 && p.forwardSpeed > 20 && this.input.throttle) {
        this.driftBoostTimer = 1.25;
        p.forwardSpeed = Math.min(maxForwardMs, p.forwardSpeed + 7.2);
        const driftCash = Math.round(this.driftHoldSec * 280);
        if (driftCash >= 150) {
          this.sessionBounty += driftCash;
          this.pushCallout(`DRIFT EXIT BOOST! +$${driftCash.toLocaleString()} BOUNTY`, 'amber');
        } else {
          this.pushCallout('DRIFT EXIT BOOST!', 'amber');
        }
      }
      this.driftHoldSec = 0;
    }

    const fwdX = -Math.sin(p.heading);
    const fwdZ = -Math.cos(p.heading);
    const rightX = Math.cos(p.heading);
    const rightZ = -Math.sin(p.heading);

    p.pos.x += (fwdX * p.forwardSpeed + rightX * p.lateralSpeed) * dt;
    p.pos.z += (fwdZ * p.forwardSpeed + rightZ * p.lateralSpeed) * dt;

    this.currentWallScrape = THREE.MathUtils.damp(this.currentWallScrape, 0, 14, rawDt);
    this.constrainToTrackAndUpdateLap(p, dt, true);

    const airPitch = p.airHeight > 0.12 ? THREE.MathUtils.clamp(p.verticalVel * 0.011, -0.11, 0.13) : 0;
    const targetPitch =
      (this.input.brake && p.forwardSpeed > 2 ? -0.024 : this.input.throttle ? 0.008 : 0) * (nosActive ? 1.25 : 1) +
      airPitch;
    const targetRoll = -steerInput * Math.min(1, Math.abs(p.forwardSpeed) / 28) * 0.044;
    const visualSlipYaw = airborne
      ? 0
      : THREE.MathUtils.clamp((p.lateralSpeed / Math.max(14, Math.abs(p.forwardSpeed))) * 0.28, -0.15, 0.15);
    p.pitch = THREE.MathUtils.damp(p.pitch, targetPitch, 11, rawDt);
    p.roll = THREE.MathUtils.damp(p.roll, targetRoll, 11, rawDt);

    // Subtle speed-sensitive aerodynamic downforce plants the chassis onto the pavement
    const downforceSink = airborne ? 0 : Math.min(0.036, (absSpeed / 85) * 0.036);
    p.visual.root.position.copy(p.pos);
    p.visual.root.rotation.set(p.slopePitch, p.heading, -p.bankRoll, 'YXZ');
    p.visual.bodyGroup.position.y = -downforceSink;
    p.visual.bodyGroup.rotation.x = p.pitch;
    p.visual.bodyGroup.rotation.y = THREE.MathUtils.damp(p.visual.bodyGroup.rotation.y, visualSlipYaw, 12, rawDt);
    p.visual.bodyGroup.rotation.z = p.roll;
    p.visual.wheelFrontLeft.rotation.y = p.steerAngle * 0.85;
    p.visual.wheelFrontRight.rotation.y = p.steerAngle * 0.85;

    const wheelSpinDelta = (p.forwardSpeed * dt) / p.spec.dimensions.wheelRadius;
    p.visual.wheelSpinners.forEach((w) => {
      w.rotation.x -= wheelSpinDelta;
    });

    const { gear, rpm } = this.computeGearAndRpm(p.forwardSpeed, this.input.throttle);
    this.backfireTimer = Math.max(-0.5, this.backfireTimer - rawDt);
    if (
      (gear > this.lastPlayerGear && gear > 1) ||
      (!this.input.throttle && rpm > 0.72 && p.forwardSpeed > 20 && this.backfireTimer <= -0.35)
    ) {
      this.backfireTimer = 0.16;
    }
    this.lastPlayerGear = gear;
    const showBackfire = this.backfireTimer > 0 && !boostFlare;
    p.visual.backfireFlames.forEach((f) => {
      f.visible = showBackfire;
      if (showBackfire) {
        const s = 0.75 + Math.random() * 0.7;
        f.scale.set(0.95, 0.95, s);
      }
    });

    const braking = this.input.brake || this.input.handbrake;
    p.visual.brakeLightMat.emissiveIntensity = braking ? 4.8 : 1.1;
    p.visual.reverseLightMat.emissiveIntensity = gear === -1 ? 3.5 : 0.15;
    p.visual.brakeGlows.forEach((bg) => {
      const m = bg.material as THREE.MeshBasicMaterial;
      m.opacity = braking ? 0.72 : 0.22;
      bg.scale.setScalar(braking ? 1.35 : 0.9);
    });

    let copProx = 0;
    for (let i = 0; i < this.cops.length; i++) {
      const c = this.cops[i];
      if (!c.wrecked) {
        const d = c.pos.distanceTo(p.pos);
        copProx = Math.max(copProx, Math.max(0, 1 - d / 110));
      }
    }

    const inTunnel = this.track
      ? this.track.tunnelRanges.some((tr) => p.trackIdx >= tr.startIdx && p.trackIdx <= tr.endIdx)
      : false;

    soundEngine.update({
      active: true,
      rpm,
      throttle: this.input.throttle,
      gear,
      speedKmh: Math.abs(p.forwardSpeed) * 3.6,
      nosActive,
      driftSlip,
      copProximity: copProx,
      onCurb: this.playerOnCurb,
      airborne: p.airHeight > 0.15,
      inTunnel,
      drafting: this.isSlipstreaming,
      nearBarrier: this.playerNearBarrier,
      wallScrape: this.currentWallScrape,
      wheelspin: launchWheelspin,
      timeScale: this.isSpeedbreaker ? 0.42 : 1.0,
    });
  }

  private updateAiRacer(ai: RacerEntity, dt: number) {
    if (!this.track || !this.player || !this.raceParams) return;
    const samples = this.track.samples;
    const nSamples = samples.length;

    // Smart shortcut routing for competitive Blacklist bosses & pro AI
    let usingShortcutGuide = false;
    if (ai.activeShortcutId !== null) {
      const scHit = this.track.queryShortcut(ai.pos.x, ai.pos.z, ai.activeShortcutId);
      if (scHit && scHit.shortcut.id === ai.activeShortcutId) {
        const lookIdx = Math.min(scHit.shortcut.points.length - 1, scHit.ptIndex + 5);
        _v1.copy(scHit.shortcut.points[lookIdx]);
        usingShortcutGuide = true;
      }
    }

    if (!usingShortcutGuide) {
      let aimingForShortcut = false;
      if (ai.aiSkill >= 0.84 && this.track.shortcuts.length > 0 && ai.activeShortcutId === null) {
        for (let i = 0; i < this.track.shortcuts.length; i++) {
          const sc = this.track.shortcuts[i];
          const ahead = (sc.entryCutStartIdx - ai.trackIdx + nSamples) % nSamples;
          if (ahead <= 20) {
            ai.laneTarget = sc.side * (this.track.roadHalfWidth + 1.25);
            aimingForShortcut = true;
            break;
          }
        }
      }
      if (!aimingForShortcut && Math.abs(ai.laneTarget) > this.track.roadHalfWidth - 1.2) {
        ai.laneTarget = Math.sign(ai.laneTarget) * (this.track.roadHalfWidth * 0.42);
      }

      // Dynamic overtaking across traffic
      const aiFwdX = -Math.sin(ai.heading);
      const aiFwdZ = -Math.cos(ai.heading);
      for (let i = 0; i < this.traffic.length; i++) {
        const tr = this.traffic[i];
        const tdx = tr.pos.x - ai.pos.x;
        const tdz = tr.pos.z - ai.pos.z;
        const fwdDist = tdx * aiFwdX + tdz * aiFwdZ;
        if (fwdDist > 3 && fwdDist < 34) {
          if (Math.abs(tr.laneOffset - ai.laneTarget) < 3.4) {
            const safeLane = Math.max(2.6, this.track.roadHalfWidth * 0.4);
            ai.laneTarget = tr.laneOffset >= 0 ? -safeLane : safeLane;
            break;
          }
        }
      }

      const targetSampleIdx = (ai.trackIdx + 10) % nSamples;
      const targetSample = samples[targetSampleIdx];
      _v1.copy(targetSample.point).addScaledVector(targetSample.right, ai.laneTarget);
    }

    const dx = _v1.x - ai.pos.x;
    const dz = _v1.z - ai.pos.z;
    const desiredHeading = Math.atan2(-dx, -dz);

    let angleDiff = desiredHeading - ai.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    ai.heading += THREE.MathUtils.clamp(angleDiff * 5.4, -3.1, 3.1) * dt;

    const playerStats = computeEffectiveStats(this.player.spec, this.raceParams.playerConfig);
    const raceDiff = this.getRaceDifficulty();
    const defaultBoost = raceDiff === 'Easy' ? 0 : raceDiff === 'Medium' ? 1 : raceDiff === 'Hard' ? 2 : 3;
    const aiTierBoost = this.raceParams.mission?.aiTierBoost ?? defaultBoost;
    const diffPaceMult =
      raceDiff === 'Easy' ? 0.95 : raceDiff === 'Medium' ? 0.99 : raceDiff === 'Hard' ? 1.03 : 1.06;
    const bossRank = this.raceParams.rival?.rank ?? 5;
    const bossDiffMult = bossRank >= 8 ? 0.96 : bossRank >= 5 ? 0.99 : 1.03;

    const basePaceKmh =
      this.raceParams.mode === 'blacklist'
        ? Math.max(ai.spec.baseTopSpeedKmh * bossDiffMult, playerStats.topSpeedKmh * bossDiffMult)
        : Math.max(ai.spec.baseTopSpeedKmh * diffPaceMult, playerStats.topSpeedKmh * diffPaceMult);

    const gap = this.player.totalProgress - ai.totalProgress;
    const minRubber = raceDiff === 'Easy' ? 0.89 : raceDiff === 'Medium' ? 0.93 : raceDiff === 'Hard' ? 0.96 : 0.98;
    const maxRubber = raceDiff === 'Easy' ? 1.07 : raceDiff === 'Medium' ? 1.12 : raceDiff === 'Hard' ? 1.16 : 1.20;
    const rubberBand = THREE.MathUtils.clamp(1 + gap * 1.15, minRubber, maxRubber);
    const cornerSlowdown = 1 - Math.min(0.22, Math.abs(angleDiff) * 0.34);
    const copDrag = ai.copSlowdownTimer > 0 ? 0.72 : 1.0;

    const aiBoosting =
      (raceDiff === 'Easy' ? gap > 0.06 : gap > 0.025) && Math.abs(angleDiff) < 0.14 && ai.forwardSpeed > 26;
    const nosScale = aiBoosting ? (raceDiff === 'Easy' ? 1.07 : 1.12) : 1.0;
    const targetSpeed = (basePaceKmh / 3.6) * ai.aiSkill * rubberBand * cornerSlowdown * copDrag * nosScale;

    ai.visual.nosFlames.forEach((f) => {
      f.visible = aiBoosting;
      if (aiBoosting) {
        f.scale.set(1.0 + Math.random() * 0.18, 1.0 + Math.random() * 0.18, 0.8 + Math.random() * 0.85);
      }
    });
    ai.visual.nosCores.forEach((c) => {
      c.visible = aiBoosting;
      if (aiBoosting) {
        c.scale.set(1.0, 1.0, 0.7 + Math.random() * 0.65);
      }
    });
    ai.visual.nosHalos.forEach((h) => {
      h.visible = aiBoosting;
      if (aiBoosting) {
        h.scale.setScalar(0.95 + Math.random() * 0.4);
      }
    });

    const diffAccelMult =
      raceDiff === 'Easy' ? 0.89 : raceDiff === 'Medium' ? 0.95 : raceDiff === 'Hard' ? 1.02 : 1.08;
    const aiMaxAccel = (4.6 + (playerStats.accel / 100) * 7.8 + aiTierBoost * 0.45) * diffAccelMult * ai.aiSkill;
    if (ai.forwardSpeed < targetSpeed) {
      const speedNorm = Math.min(1, Math.max(0, ai.forwardSpeed) / Math.max(10, targetSpeed));
      const accelNow = aiMaxAccel * (1 - 0.35 * speedNorm);
      ai.forwardSpeed = Math.min(targetSpeed, ai.forwardSpeed + accelNow * dt);
    } else {
      ai.forwardSpeed = Math.max(targetSpeed, ai.forwardSpeed - 24 * dt);
    }

    ai.pos.x += -Math.sin(ai.heading) * ai.forwardSpeed * dt;
    ai.pos.z += -Math.cos(ai.heading) * ai.forwardSpeed * dt;

    this.constrainToTrackAndUpdateLap(ai, dt, false);

    ai.visual.root.position.copy(ai.pos);
    ai.visual.root.rotation.set(ai.slopePitch, ai.heading, -ai.bankRoll, 'YXZ');
    const spin = (ai.forwardSpeed * dt) / ai.spec.dimensions.wheelRadius;
    ai.visual.wheelSpinners.forEach((w) => (w.rotation.x -= spin));
  }

  private updateCivilianTraffic(dt: number) {
    if (!this.track || !this.player) return;
    const samples = this.track.samples;

    for (const t of this.traffic) {
      if (t.nearMissCooldown > 0) t.nearMissCooldown -= dt;
      if (t.hitCooldown > 0) t.hitCooldown -= dt;

      const targetIdx = (t.trackIdx + 6) % samples.length;
      const targetS = samples[targetIdx];
      _v1.copy(targetS.point).addScaledVector(targetS.right, t.laneOffset);
      const desiredHeading = Math.atan2(-(_v1.x - t.pos.x), -(_v1.z - t.pos.z));
      let diff = desiredHeading - t.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      t.heading += THREE.MathUtils.clamp(diff * 3.5, -1.8, 1.8) * dt;

      const tFwdX = -Math.sin(t.heading);
      const tFwdZ = -Math.cos(t.heading);
      const tRightX = Math.cos(t.heading);
      const tRightZ = -Math.sin(t.heading);

      t.pos.x += (tFwdX * t.speed + tRightX * t.knockLatVel) * dt;
      t.pos.z += (tFwdZ * t.speed + tRightZ * t.knockLatVel) * dt;
      t.knockLatVel = THREE.MathUtils.damp(t.knockLatVel, 0, 5.5, dt);
      const baseCruise = t.isTruck ? 15 : 20;
      t.speed = THREE.MathUtils.damp(t.speed, baseCruise, 1.6, dt);

      const info = this.track.getClosestTrackInfo(t.pos.x, t.pos.z, t.trackIdx);
      t.trackIdx = info.sample.index;
      t.pos.y = info.elevationY + ROAD_SURFACE_OFFSET;
      const maxTrafficLat = this.track.roadHalfWidth - 1.6;
      if (Math.abs(info.lateralOffset) > maxTrafficLat) {
        const tSign = Math.sign(info.lateralOffset);
        const tEx = Math.abs(info.lateralOffset) - maxTrafficLat;
        t.pos.x -= info.sample.right.x * tSign * tEx;
        t.pos.z -= info.sample.right.z * tSign * tEx;
        t.knockLatVel *= -0.35;
      }

      t.visual.root.position.copy(t.pos);
      t.visual.root.rotation.set(info.slopePitch, t.heading, -info.bankAngle, 'YXZ');
      const spin = (t.speed * dt) / 0.35;
      t.visual.wheelSpinners.forEach((w) => (w.rotation.x -= spin));

      // Check 2-circle / 3-circle (truck) collisions against BOTH Player AND AI Opponents
      const tCircles = t.isTruck ? [-1.85, 0, 1.85] : [-1.15, 1.15];
      const tRadius = t.isTruck ? 1.25 : 1.05;
      const rRadius = 1.05;
      const minDist = tRadius + rRadius;
      const minDistSq = minDist * minDist;

      for (let rIdx = 0; rIdx < this.racers.length; rIdx++) {
        const r = this.racers[rIdx];
        if (r.knockedOut || r.airHeight >= 1.25) continue;
        // Quick broad-phase check
        const bdx = r.pos.x - t.pos.x;
        const bdz = r.pos.z - t.pos.z;
        if (bdx * bdx + bdz * bdz > 6.8 * 6.8) continue;

        const rFwdX = -Math.sin(r.heading);
        const rFwdZ = -Math.cos(r.heading);
        const rRightX = Math.cos(r.heading);
        const rRightZ = -Math.sin(r.heading);

        let hitNx = 0;
        let hitNz = 0;
        let maxPen = 0;
        for (let rc = -1; rc <= 1; rc += 2) {
          const rx = r.pos.x + rFwdX * rc * 1.15;
          const rz = r.pos.z + rFwdZ * rc * 1.15;
          for (let tc = 0; tc < tCircles.length; tc++) {
            const tx = t.pos.x + tFwdX * tCircles[tc];
            const tz = t.pos.z + tFwdZ * tCircles[tc];
            const dx = rx - tx;
            const dz = rz - tz;
            const dSq = dx * dx + dz * dz;
            if (dSq < minDistSq && dSq > 0.0004) {
              const d = Math.sqrt(dSq);
              const pen = minDist - d;
              if (pen > maxPen) {
                maxPen = pen;
                hitNx = dx / d;
                hitNz = dz / d;
              }
            }
          }
        }

        if (maxPen > 0) {
          const pushFrac = t.isTruck ? 0.72 : 0.56;
          r.pos.x += hitNx * maxPen * pushFrac;
          r.pos.z += hitNz * maxPen * pushFrac;
          t.pos.x -= hitNx * maxPen * (1 - pushFrac);
          t.pos.z -= hitNz * maxPen * (1 - pushFrac);

          const rVx = rFwdX * r.forwardSpeed + rRightX * r.lateralSpeed;
          const rVz = rFwdZ * r.forwardSpeed + rRightZ * r.lateralSpeed;
          const tVx = tFwdX * t.speed + tRightX * t.knockLatVel;
          const tVz = tFwdZ * t.speed + tRightZ * t.knockLatVel;
          const relVn = (rVx - tVx) * hitNx + (rVz - tVz) * hitNz;

          if (relVn < 0) {
            const massScale = t.isTruck ? 0.85 : 0.65;
            const jImp = -(1 + 0.34) * relVn * massScale;
            const newRVx = rVx + hitNx * jImp;
            const newRVz = rVz + hitNz * jImp;
            const newFwd = newRVx * rFwdX + newRVz * rFwdZ;
            const newLat = newRVx * rRightX + newRVz * rRightZ;
            const directPenalty = t.isTruck ? 0.46 : 0.62;
            r.forwardSpeed = Math.min(r.forwardSpeed * (Math.abs(newFwd) < Math.abs(r.forwardSpeed) ? 1 : directPenalty), newFwd);
            if (Math.abs(r.forwardSpeed) > 16 && relVn < -10) {
              r.forwardSpeed *= directPenalty;
            }
            r.lateralSpeed = THREE.MathUtils.clamp(newLat, -14, 14);
            const steerKick = hitNx * rRightX + hitNz * rRightZ;
            r.heading += THREE.MathUtils.clamp(-steerKick * 0.14, -0.22, 0.22);

            // Knock traffic car forward & sideways
            t.speed = Math.max(8, t.speed + Math.max(0, -relVn) * 0.45);
            t.knockLatVel = THREE.MathUtils.clamp(t.knockLatVel - (hitNx * tRightX + hitNz * tRightZ) * 9.5, -12, 12);
            t.laneOffset = THREE.MathUtils.clamp(t.laneOffset + (t.laneOffset >= 0 ? -1.8 : 1.8), -8.2, 8.2);

            if (t.hitCooldown <= 0) {
              t.hitCooldown = 0.65;
              if (r.isPlayer) {
                this.camShake = Math.max(this.camShake, t.isTruck ? 0.42 : 0.28);
                soundEngine.triggerImpact(t.isTruck ? 0.85 : 0.62);
              }
              if (r.isPlayer || r.pos.distanceToSquared(this.player.pos) < 110 * 110) {
                for (let k = 0; k < 6; k++) {
                  _v2.set((Math.random() - 0.5) * 11, 3 + Math.random() * 3.5, (Math.random() - 0.5) * 11);
                  this.spawnParticle(t.pos, _v2, '#F59E0B', 0.55, 0.35);
                }
              }
            }
          }
        }
      }

      const dist = t.pos.distanceTo(this.player.pos);
      const playerKmh = Math.abs(this.player.forwardSpeed) * 3.6;
      if (dist >= 2.8 && dist < 5.6 && playerKmh > 120 && t.nearMissCooldown <= 0) {
        t.nearMissCooldown = 4.0;
        this.nearMissCount++;
        this.nearMissCombo = Math.min(5, this.nearMissCombo + 1);
        this.nearMissComboTimer = 6.5;
        const reward = 350 * this.nearMissCombo;
        this.sessionBounty += reward;
        this.nitrous = Math.min(100, this.nitrous + 10);
        this.pushCallout(
          this.nearMissCombo > 1
            ? `NEAR MISS x${this.nearMissCombo}! +$${reward.toLocaleString()} BOUNTY · NOS +10%`
            : `NEAR MISS! +$${reward.toLocaleString()} BOUNTY · NOS +10%`,
          'cyan',
        );
        soundEngine.triggerBeep(true);
      }
    }
  }

  private constrainToTrackAndUpdateLap(r: RacerEntity, dt: number, isPlayer: boolean) {
    if (!this.track) return;
    const info = this.track.getClosestTrackInfo(r.pos.x, r.pos.z, r.trackIdx);
    const prevProgress = r.progress;
    // Do NOT overwrite trackIdx while locked inside a shortcut corridor (shortcut block keeps monotonic trackIdx)
    if (r.activeShortcutId === null) {
      r.trackIdx = info.sample.index;
      r.progress = info.sample.progress;
    }

    let groundHeight = info.elevationY + ROAD_SURFACE_OFFSET;

    // Stunt Jump Ramp collision & launch height
    for (let i = 0; i < this.track.ramps.length; i++) {
      const ramp = this.track.ramps[i];
      const rx = r.pos.x - ramp.position.x;
      const rz = r.pos.z - ramp.position.z;
      const along = rx * ramp.tangent.x + rz * ramp.tangent.z;
      const lat = rx * ramp.right.x + rz * ramp.right.z;

      if (along >= 0 && along <= ramp.length + 0.5 && Math.abs(lat) <= ramp.halfWidth + 0.55) {
        const rampY = THREE.MathUtils.clamp(along / ramp.length, 0, 1) * ramp.height;
        if (r.airHeight <= rampY + 0.45) {
          groundHeight += rampY;
          if (along >= ramp.length - 1.1 && r.forwardSpeed > 24 && r.verticalVel <= 0.5) {
            r.airHeight = rampY;
            r.verticalVel = r.forwardSpeed * Math.sin(ramp.launchAngle) * 0.88 + 0.8;
            if (isPlayer) {
              soundEngine.triggerBeep(false);
            }
          }
        }
      }
    }

    // Weighty arcade gravity integration so cars feel planted instead of floaty
    if (r.airHeight > 0 || r.verticalVel > 0) {
      r.verticalVel -= 34.0 * dt;
      r.airHeight += r.verticalVel * dt;
      r.airTimeTotal += dt;
      if (isPlayer) this.airTimeTotalSec += dt;
      if (r.airHeight <= 0) {
        if (isPlayer) {
          if (r.airTimeTotal > 0.25) {
            r.pitch = -0.032;
          }
          if (r.airTimeTotal > 0.45) {
            soundEngine.triggerLandingThump();
            this.camShake = Math.max(this.camShake, 0.22);
            const airBonus = 500 + Math.round(r.airTimeTotal * 900);
            this.sessionBounty += airBonus;
            this.nitrous = Math.min(100, this.nitrous + 15);
            this.pushCallout(`AIR TIME ${r.airTimeTotal.toFixed(1)}S · +$${airBonus.toLocaleString()} BOUNTY`, 'cyan');
            for (let k = 0; k < 6; k++) {
              _v2.set((Math.random() - 0.5) * 8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 8);
              this.spawnParticle(r.pos, _v2, '#F59E0B', 0.65, 0.35);
            }
          }
        }
        r.airHeight = 0;
        r.verticalVel = 0;
        r.airTimeTotal = 0;
      }
    }

    const nSamples = this.track.samples.length;
    const rampOffset = Math.max(0, groundHeight - (info.elevationY + ROAD_SURFACE_OFFSET));
    const scHit =
      r.activeShortcutId !== null
        ? this.track.queryShortcut(r.pos.x, r.pos.z, r.activeShortcutId)
        : this.track.queryShortcut(r.pos.x, r.pos.z);

    // Determine active shortcut corridor cleanly:
    // - If already inside a shortcut, stay locked to it until emerging onto the main road.
    // - If not yet inside a shortcut, enter seamlessly only when crossing onto the shortcut mouth shoulder.
    const scLockLimitSq = scHit ? (scHit.shortcut.halfWidth + 4.8) * (scHit.shortcut.halfWidth + 4.8) : 0;
    const canContinueShortcut = Boolean(
      r.activeShortcutId !== null &&
        scHit &&
        scHit.shortcut.id === r.activeShortcutId &&
        scHit.distanceSq < scLockLimitSq,
    );
    const canEnterShortcut = Boolean(
      r.activeShortcutId === null &&
        scHit &&
        scHit.frac >= 0.005 &&
        scHit.frac <= scHit.shortcut.innerStartFrac + 0.05 &&
        info.lateralOffset * scHit.shortcut.side > this.track.roadHalfWidth - 1.0 &&
        Math.abs(scHit.lateral) <= scHit.shortcut.halfWidth - 0.35 &&
        r.forwardSpeed > -4.0,
    );

    if ((canContinueShortcut || canEnterShortcut) && scHit) {
      const sc = scHit.shortcut;
      if (r.activeShortcutId === null) {
        r.reachedShortcutCore = false;
      }
      r.activeShortcutId = sc.id;
      if (scHit.frac >= sc.innerStartFrac + 0.06 && scHit.frac <= sc.innerEndFrac - 0.03) {
        r.reachedShortcutCore = true;
      }

      // Smoothly blend elevation, pitch, and banking across entry/exit merge throats (zero height pops)
      let mergeBlend = 1;
      if (scHit.frac < sc.innerStartFrac && sc.innerStartFrac > 0.01) {
        mergeBlend = THREE.MathUtils.clamp(scHit.frac / sc.innerStartFrac, 0, 1);
      } else if (scHit.frac > sc.innerEndFrac && sc.innerEndFrac < 0.99) {
        mergeBlend = THREE.MathUtils.clamp((1 - scHit.frac) / (1 - sc.innerEndFrac), 0, 1);
      }
      const blendedElev = THREE.MathUtils.lerp(info.elevationY, scHit.elevationY, mergeBlend);
      groundHeight = blendedElev + ROAD_SURFACE_OFFSET + rampOffset;
      r.pos.y = Math.max(groundHeight, groundHeight + Math.max(0, r.airHeight));
      r.slopePitch = THREE.MathUtils.damp(
        r.slopePitch,
        THREE.MathUtils.lerp(info.slopePitch, scHit.slopePitch, mergeBlend),
        10,
        dt,
      );
      r.bankRoll = THREE.MathUtils.damp(r.bankRoll, THREE.MathUtils.lerp(info.bankAngle, 0, mergeBlend), 10, dt);

      // Smash through breakable shortcut barricade planks
      for (let pk = 0; pk < sc.planks.length; pk++) {
        const plank = sc.planks[pk];
        if (!plank.smashed && r.pos.distanceToSquared(plank.mesh.position) < 3.4 * 3.4) {
          plank.smashed = true;
          plank.respawnTimer = 16;
          plank.vel.set(
            -Math.sin(r.heading) * Math.abs(r.forwardSpeed) * 0.72 + (Math.random() - 0.5) * 9,
            5.5 + Math.random() * 4,
            -Math.cos(r.heading) * Math.abs(r.forwardSpeed) * 0.72 + (Math.random() - 0.5) * 9,
          );
          plank.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
          if (isPlayer) {
            soundEngine.triggerWoodSmash();
            for (let s = 0; s < 5; s++) {
              _v2.set((Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8);
              this.spawnParticle(plank.mesh.position, _v2, '#F59E0B', 0.5, 0.35);
            }
          }
        }
      }

      if (isPlayer) {
        this.playerOnCurb = false;
        this.playerNearBarrier = Math.abs(scHit.lateral) > sc.halfWidth - 2.6;
      }

      // Watertight shortcut barriers synchronized 1:1 with trackBuilder innerStartFrac..innerEndFrac:
      // - Outer barrier side ALWAYS clamps across 0..1 so vehicles never fall off.
      // - Inner wall clamps ONLY along the solid concrete divider span (innerStartFrac..innerEndFrac).
      const maxScLat = sc.halfWidth - 1.05;
      const outerSide = sc.side;
      const inClosedMid = scHit.frac >= sc.innerStartFrac && scHit.frac <= sc.innerEndFrac;
      const hitOuterWall = scHit.lateral * outerSide > maxScLat;
      const hitInnerWall = inClosedMid && scHit.lateral * outerSide < -maxScLat;

      if (hitOuterWall || hitInnerWall) {
        const sSign = hitOuterWall ? outerSide : -outerSide;
        const rawPen = (hitOuterWall ? scHit.lateral * outerSide : -scHit.lateral * outerSide) - maxScLat;
        const sEx = Math.min(Math.max(0, rawPen), 3.6);
        const scRightX = -scHit.tangent.z;
        const scRightZ = scHit.tangent.x;
        r.pos.x -= scRightX * sSign * sEx;
        r.pos.z -= scRightZ * sSign * sEx;

        // Smooth wall-sliding physics: cancel outward normal velocity instead of yanking steering on rails
        const fwdX = -Math.sin(r.heading);
        const fwdZ = -Math.cos(r.heading);
        const rgtX = Math.cos(r.heading);
        const rgtZ = -Math.sin(r.heading);
        const vx = fwdX * r.forwardSpeed + rgtX * r.lateralSpeed;
        const vz = fwdZ * r.forwardSpeed + rgtZ * r.lateralSpeed;
        const wallNx = scRightX * sSign;
        const wallNz = scRightZ * sSign;
        const vn = vx * wallNx + vz * wallNz;

        if (vn > 0) {
          const nvx = vx - wallNx * vn;
          const nvz = vz - wallNz * vn;
          const impactSeverity = Math.min(1, vn / Math.max(12, Math.hypot(vx, vz)));
          const wallScrub = impactSeverity > 0.36 ? 0.78 : impactSeverity > 0.16 ? 0.91 : 0.992;
          r.forwardSpeed = (nvx * fwdX + nvz * fwdZ) * wallScrub;
          r.lateralSpeed = (nvx * rgtX + nvz * rgtZ) * 0.45;

          const scHead = Math.atan2(-scHit.tangent.x, -scHit.tangent.z);
          let hDiff = scHead - r.heading;
          while (hDiff > Math.PI) hDiff -= Math.PI * 2;
          while (hDiff < -Math.PI) hDiff += Math.PI * 2;
          if (Math.sin(hDiff) * sSign > 0) {
            r.heading += hDiff * Math.min(0.4, (0.3 + impactSeverity * 0.65) * dt * 7.0);
          }

          if (isPlayer && Math.abs(r.forwardSpeed) > 16) {
            this.currentWallScrape = Math.max(
              this.currentWallScrape,
              THREE.MathUtils.clamp((Math.abs(r.forwardSpeed) - 14) / 45, 0.25, 1.0),
            );
            if (Math.random() < 0.65) {
              _v1.set(r.pos.x + wallNx * 0.95, r.pos.y + 0.45, r.pos.z + wallNz * 0.95);
              _v2.set((Math.random() - 0.5) * 6, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 6);
              this.spawnParticle(_v1, _v2, '#FBBF24', 0.36, 0.24);
            }
            if (Math.abs(r.forwardSpeed) > 20 && impactSeverity > 0.20) {
              soundEngine.triggerImpact(Math.min(0.65, 0.24 + impactSeverity * 0.55));
            }
          }
        }
      }

      // Never sink below shortcut road surface
      r.pos.y = Math.max(groundHeight, r.pos.y);

      // Keep trackIdx & progress continuously synchronized along bypassed main-track span
      const scStartIdx = sc.startIdx;
      const scEndIdx = sc.endIdx;
      const spanIdx = scEndIdx >= scStartIdx ? scEndIdx - scStartIdx : scEndIdx + nSamples - scStartIdx;
      r.trackIdx = (scStartIdx + Math.round(spanIdx * scHit.frac)) % nSamples;
      const startProg = this.track.samples[scStartIdx]?.progress ?? prevProgress;
      const endProg = this.track.samples[scEndIdx]?.progress ?? prevProgress;
      const spanProg = endProg >= startProg ? endProg - startProg : endProg + 1 - startProg;
      r.progress = (startProg + spanProg * scHit.frac) % 1;
      r.totalProgress = r.lap - 1 + r.progress;

      // Seamless merge back onto main track with ZERO position snap
      const insideMainBarriers = Math.abs(info.lateralOffset) <= this.track.barrierHalfWidth - 1.15;
      const mergedAtExit =
        insideMainBarriers &&
        scHit.frac > sc.innerEndFrac &&
        (scHit.frac >= 0.985 || info.lateralOffset * sc.side < this.track.roadHalfWidth - 0.7);
      const abortedAtEntry =
        scHit.frac < sc.innerStartFrac && info.lateralOffset * sc.side < this.track.roadHalfWidth - 1.35;

      if (mergedAtExit) {
        if (isPlayer && r.reachedShortcutCore && r.shortcutPassCooldown <= 0) {
          r.shortcutPassCooldown = 8.0;
          this.shortcutsTaken++;
          this.nitrous = Math.min(100, this.nitrous + 25);
          this.sessionBounty += 1500;
          this.pushCallout(`SHORTCUT: ${sc.label.toUpperCase()}! +$1,500 · NOS +25%`, 'emerald');
          soundEngine.triggerBeep(true);
        }
        r.activeShortcutId = null;
        r.reachedShortcutCore = false;
        const exitInfo = this.track.getClosestTrackInfo(r.pos.x, r.pos.z, sc.endIdx);
        r.trackIdx = exitInfo.sample.index;
        r.progress = exitInfo.sample.progress;
        r.totalProgress = r.lap - 1 + r.progress;
      } else if (abortedAtEntry) {
        r.activeShortcutId = null;
        r.reachedShortcutCore = false;
        const entryInfo = this.track.getClosestTrackInfo(r.pos.x, r.pos.z, sc.startIdx);
        r.trackIdx = entryInfo.sample.index;
        r.progress = entryInfo.sample.progress;
        r.totalProgress = r.lap - 1 + r.progress;
      }
      return;
    }

    if (r.activeShortcutId !== null) {
      r.activeShortcutId = null;
      r.reachedShortcutCore = false;
      const reSync = this.track.getClosestTrackInfo(r.pos.x, r.pos.z, r.trackIdx);
      r.trackIdx = reSync.sample.index;
      r.progress = reSync.sample.progress;
    }

    r.pos.y = Math.max(groundHeight, groundHeight + Math.max(0, r.airHeight));
    r.slopePitch = THREE.MathUtils.damp(r.slopePitch, info.slopePitch, 10, dt);
    r.bankRoll = THREE.MathUtils.damp(r.bankRoll, info.bankAngle, 10, dt);

    if (isPlayer) {
      this.playerOnCurb = Math.abs(info.lateralOffset) > this.track.roadHalfWidth - 0.55;
      this.playerNearBarrier = Math.abs(info.lateralOffset) > this.track.barrierHalfWidth - 3.6;
    }

    // Tollbooth Checkpoint progression check
    if (isPlayer && this.raceParams?.mode === 'tollbooth' && this.tollboothCheckpoint < this.tollboothTotal) {
      const targetGate = this.track.tollbooths[this.tollboothCheckpoint % 4];
      if (r.pos.distanceToSquared(targetGate.position) < 16 * 16) {
        this.tollboothCheckpoint++;
        this.sessionBounty += 1200;
        this.nitrous = Math.min(100, this.nitrous + 25);
        soundEngine.triggerLapComplete(this.tollboothCheckpoint === this.tollboothTotal - 1);
        if (this.tollboothCheckpoint >= this.tollboothTotal) {
          this.completeRace(false);
          return;
        }
        const splitBonusMs = this.raceParams.mission?.difficulty === 'Expert' ? 20000 : 21500;
        this.tollboothTimeLeftMs += splitBonusMs;
        this.updateTollboothBeacons();
        this.pushCallout(
          `GATE ${this.tollboothCheckpoint}/${this.tollboothTotal} CLEARED · +${(splitBonusMs / 1000).toFixed(1)}S · NOS +25%`,
          'emerald',
        );
      }
    }

    const delta = r.progress - prevProgress;
    if (delta < -0.5) {
      r.lap++;
      if (isPlayer) {
        const lapMs = this.raceElapsedMs - this.currentLapStartMs;
        if (r.lap > 1 && this.currentLapStartMs > 0 && lapMs > 5000 && (this.bestLapMs === 0 || lapMs < this.bestLapMs)) {
          this.bestLapMs = lapMs;
        }
        this.currentLapStartMs = this.raceElapsedMs;
        const totalLaps = this.getTotalLaps();
        if (
          this.raceParams?.mode !== 'pursuit' &&
          this.raceParams?.mode !== 'freeroam' &&
          this.raceParams?.mode !== 'tollbooth'
        ) {
          if (r.lap === totalLaps) {
            this.pushCallout('FINAL LAP!', 'amber');
            soundEngine.triggerLapComplete(true);
          } else if (r.lap > 1 && r.lap < totalLaps) {
            soundEngine.triggerLapComplete(false);
          }
        }
      }
    } else if (delta > 0.5) {
      r.lap = Math.max(0, r.lap - 1);
    }

    r.totalProgress = r.lap - 1 + r.progress;

    // ONLY open the main-track barrier where a cutout exists (entry throat or exit merge funnel).
    // Everywhere else on the highway, continuous reinforced barriers keep vehicles solidly contained.
    const latSign = info.lateralOffset >= 0 ? 1 : -1;
    const insideShortcutMouth = Boolean(
      scHit &&
        scHit.shortcut.side === latSign &&
        Math.abs(scHit.lateral) <= scHit.shortcut.halfWidth - 0.35 &&
        (scHit.frac <= scHit.shortcut.innerStartFrac || scHit.frac >= scHit.shortcut.innerEndFrac),
    );

    const maxLat = this.track.barrierHalfWidth - 1.15;
    if (!insideShortcutMouth && Math.abs(info.lateralOffset) > maxLat) {
      const sign = Math.sign(info.lateralOffset);
      const excess = Math.min(Math.max(0, Math.abs(info.lateralOffset) - maxLat), 4.5);
      r.pos.x -= info.sample.right.x * sign * excess;
      r.pos.z -= info.sample.right.z * sign * excess;

      // Cancel outward velocity component along barrier normal so vehicle slides smoothly without bouncing/teleporting
      const fwdX = -Math.sin(r.heading);
      const fwdZ = -Math.cos(r.heading);
      const rgtX = Math.cos(r.heading);
      const rgtZ = -Math.sin(r.heading);
      const vx = fwdX * r.forwardSpeed + rgtX * r.lateralSpeed;
      const vz = fwdZ * r.forwardSpeed + rgtZ * r.lateralSpeed;
      const wallNx = info.sample.right.x * sign;
      const wallNz = info.sample.right.z * sign;
      const vn = vx * wallNx + vz * wallNz;

      if (vn > 0) {
        const nvx = vx - wallNx * vn;
        const nvz = vz - wallNz * vn;
        const impactSeverity = Math.min(1, vn / Math.max(12, Math.hypot(vx, vz)));
        const wallScrub = impactSeverity > 0.34 ? 0.68 : impactSeverity > 0.16 ? 0.86 : 0.988;
        r.forwardSpeed = (nvx * fwdX + nvz * fwdZ) * wallScrub;
        r.lateralSpeed = (nvx * rgtX + nvz * rgtZ) * 0.35;

        const tangentHeading = Math.atan2(-info.sample.tangent.x, -info.sample.tangent.z);
        let hDiff = tangentHeading - r.heading;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        if (Math.sin(hDiff) * sign > 0) {
          r.heading += hDiff * Math.min(0.45, (0.3 + impactSeverity * 0.7) * dt * 6.5);
        }

        if (isPlayer && Math.abs(r.forwardSpeed) > 16) {
          this.currentWallScrape = Math.max(
            this.currentWallScrape,
            THREE.MathUtils.clamp((Math.abs(r.forwardSpeed) - 14) / 45, 0.25, 1.0),
          );
          if (Math.random() < 0.68) {
            _v1.set(r.pos.x + wallNx * 0.9, r.pos.y + 0.45, r.pos.z + wallNz * 0.9);
            _v2.set((Math.random() - 0.5) * 6, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 6);
            this.spawnParticle(_v1, _v2, '#FBBF24', 0.38, 0.26);
          }
          if (Math.abs(r.forwardSpeed) > 18 && impactSeverity > 0.16) {
            this.camShake = Math.max(this.camShake, Math.min(0.32, impactSeverity * 0.5));
            soundEngine.triggerImpact(Math.min(0.75, 0.28 + impactSeverity * 0.68));
          }
        }
      }
    }
  }

  private enforcePostCollisionBarrierSafety() {
    if (!this.track) return;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.knockedOut) continue;
      if (r.activeShortcutId !== null) {
        const scHit = this.track.queryShortcut(r.pos.x, r.pos.z, r.activeShortcutId);
        if (scHit && scHit.shortcut.id === r.activeShortcutId) {
          const maxScLat = scHit.shortcut.halfWidth - 1.05;
          const outerSide = scHit.shortcut.side;
          const inClosedMid = scHit.frac >= scHit.shortcut.innerStartFrac && scHit.frac <= scHit.shortcut.innerEndFrac;
          if (scHit.lateral * outerSide > maxScLat) {
            const sEx = Math.min(scHit.lateral * outerSide - maxScLat, 3.6);
            r.pos.x -= -scHit.tangent.z * outerSide * sEx;
            r.pos.z -= scHit.tangent.x * outerSide * sEx;
          } else if (inClosedMid && scHit.lateral * outerSide < -maxScLat) {
            const sEx = Math.min(-scHit.lateral * outerSide - maxScLat, 3.6);
            r.pos.x -= -scHit.tangent.z * -outerSide * sEx;
            r.pos.z -= scHit.tangent.x * -outerSide * sEx;
          }
          r.pos.y = Math.max(r.pos.y, scHit.elevationY + ROAD_SURFACE_OFFSET);
          r.visual.root.position.copy(r.pos);
          continue;
        }
      }

      const info = this.track.getClosestTrackInfo(r.pos.x, r.pos.z, r.trackIdx);
      const latSign = info.lateralOffset >= 0 ? 1 : -1;
      const scHit = this.track.queryShortcut(r.pos.x, r.pos.z);
      const insideMouth = Boolean(
        scHit &&
          scHit.shortcut.side === latSign &&
          Math.abs(scHit.lateral) <= scHit.shortcut.halfWidth - 0.35 &&
          (scHit.frac <= scHit.shortcut.innerStartFrac || scHit.frac >= scHit.shortcut.innerEndFrac),
      );
      const maxLat = this.track.barrierHalfWidth - 1.15;
      if (!insideMouth && Math.abs(info.lateralOffset) > maxLat) {
        const sign = Math.sign(info.lateralOffset);
        const excess = Math.min(Math.abs(info.lateralOffset) - maxLat, 4.5);
        r.pos.x -= info.sample.right.x * sign * excess;
        r.pos.z -= info.sample.right.z * sign * excess;
      }
      r.pos.y = Math.max(r.pos.y, info.elevationY + ROAD_SURFACE_OFFSET);
      r.visual.root.position.copy(r.pos);
    }
  }

  private resolveCarCollisions() {
    const bumperRad = 1.05;
    const minDist = bumperRad * 2;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < this.racers.length; i++) {
      const a = this.racers[i];
      if (a.knockedOut) continue;
      const aFwdX = -Math.sin(a.heading);
      const aFwdZ = -Math.cos(a.heading);
      const aRightX = Math.cos(a.heading);
      const aRightZ = -Math.sin(a.heading);

      for (let j = i + 1; j < this.racers.length; j++) {
        const b = this.racers[j];
        if (b.knockedOut) continue;
        if (Math.abs(a.airHeight - b.airHeight) > 1.35) continue;

        const bdx = b.pos.x - a.pos.x;
        const bdz = b.pos.z - a.pos.z;
        if (bdx * bdx + bdz * bdz > 5.2 * 5.2) continue;

        const bFwdX = -Math.sin(b.heading);
        const bFwdZ = -Math.cos(b.heading);
        const bRightX = Math.cos(b.heading);
        const bRightZ = -Math.sin(b.heading);

        // 2-circle front & rear bumper collision so cars collide realistically along their 4.4m chassis
        let bestNx = 0;
        let bestNz = 0;
        let maxPen = 0;
        for (let ac = -1; ac <= 1; ac += 2) {
          const ax = a.pos.x + aFwdX * ac * 1.18;
          const az = a.pos.z + aFwdZ * ac * 1.18;
          for (let bc = -1; bc <= 1; bc += 2) {
            const bx = b.pos.x + bFwdX * bc * 1.18;
            const bz = b.pos.z + bFwdZ * bc * 1.18;
            const dx = bx - ax;
            const dz = bz - az;
            const dSq = dx * dx + dz * dz;
            if (dSq < minDistSq && dSq > 0.0004) {
              const dist = Math.sqrt(dSq);
              const pen = minDist - dist;
              if (pen > maxPen) {
                maxPen = pen;
                bestNx = dx / dist;
                bestNz = dz / dist;
              }
            }
          }
        }

        if (maxPen > 0) {
          const overlap = maxPen * 0.52;
          a.pos.x -= bestNx * overlap;
          a.pos.z -= bestNz * overlap;
          b.pos.x += bestNx * overlap;
          b.pos.z += bestNz * overlap;

          // Real momentum exchange along collision normal (e = 0.36)
          const avx = aFwdX * a.forwardSpeed + aRightX * a.lateralSpeed;
          const avz = aFwdZ * a.forwardSpeed + aRightZ * a.lateralSpeed;
          const bvx = bFwdX * b.forwardSpeed + bRightX * b.lateralSpeed;
          const bvz = bFwdZ * b.forwardSpeed + bRightZ * b.lateralSpeed;
          const relVn = (bvx - avx) * bestNx + (bvz - avz) * bestNz;

          if (relVn < 0) {
            const imp = -(1 + 0.36) * relVn * 0.5;
            const newAvx = avx - bestNx * imp;
            const newAvz = avz - bestNz * imp;
            const newBvx = bvx + bestNx * imp;
            const newBvz = bvz + bestNz * imp;

            a.forwardSpeed = newAvx * aFwdX + newAvz * aFwdZ;
            a.lateralSpeed = THREE.MathUtils.clamp(newAvx * aRightX + newAvz * aRightZ, -13, 13);
            b.forwardSpeed = newBvx * bFwdX + newBvz * bFwdZ;
            b.lateralSpeed = THREE.MathUtils.clamp(newBvx * bRightX + newBvz * bRightZ, -13, 13);

            // Scrub additional energy on heavy impacts so slamming into opponents visibly slows cars down
            const impactSpd = -relVn;
            if (impactSpd > 9) {
              const crashDrag = Math.max(0.62, 1 - impactSpd * 0.011);
              a.forwardSpeed *= crashDrag;
              b.forwardSpeed *= crashDrag;
              const sideKickA = bestNx * aRightX + bestNz * aRightZ;
              const sideKickB = bestNx * bRightX + bestNz * bRightZ;
              a.heading += THREE.MathUtils.clamp(sideKickA * 0.12, -0.18, 0.18);
              b.heading += THREE.MathUtils.clamp(-sideKickB * 0.12, -0.18, 0.18);
            }
          }

          if (a.isPlayer || b.isPlayer) {
            const playerCar = a.isPlayer ? a : b;
            const rivalCar = a.isPlayer ? b : a;
            this.camShake = Math.max(this.camShake, Math.min(0.35, 0.15 + maxPen * 0.2));
            soundEngine.triggerImpact(0.55);
            _v1.set((a.pos.x + b.pos.x) * 0.5, a.pos.y + 0.6, (a.pos.z + b.pos.z) * 0.5);
            _v2.set((Math.random() - 0.5) * 9, 4, (Math.random() - 0.5) * 9);
            this.spawnParticle(_v1, _v2, '#FBBF24', 0.5, 0.35);

            if (Math.abs(playerCar.forwardSpeed) * 3.6 > 110 && rivalCar.shuntCooldown <= 0) {
              rivalCar.shuntCooldown = 4.0;
              rivalCar.forwardSpeed *= 0.64;
              rivalCar.pos.x += (rivalCar === b ? bestNx : -bestNx) * 1.4;
              rivalCar.pos.z += (rivalCar === b ? bestNz : -bestNz) * 1.4;
              this.nitrous = Math.min(100, this.nitrous + 22);
              this.sessionBounty += 1000;
              this.pushCallout(`RIVAL SHUNT ON ${rivalCar.name}! +$1,000 · NOS +22%`, 'amber');
            }
          }
        }
      }
    }
  }

  private updateTrackInteractions(dt: number) {
    if (!this.track || !this.player) return;
    const p = this.player;

    // Animate & respawn smashed shortcut barricade planks
    for (let i = 0; i < this.track.shortcuts.length; i++) {
      const sc = this.track.shortcuts[i];
      for (let j = 0; j < sc.planks.length; j++) {
        const pk = sc.planks[j];
        if (pk.smashed) {
          pk.vel.y -= 18 * dt;
          pk.mesh.position.addScaledVector(pk.vel, dt);
          pk.mesh.rotation.x += pk.rotVel.x * dt;
          pk.mesh.rotation.y += pk.rotVel.y * dt;
          pk.mesh.rotation.z += pk.rotVel.z * dt;
          pk.respawnTimer -= dt;
          if (pk.respawnTimer <= 0) {
            pk.smashed = false;
            pk.mesh.position.copy(pk.homePos);
            pk.mesh.rotation.set(0, 0, 0);
          }
        }
      }
    }

    // Smashable Water Barrels
    for (let i = 0; i < this.track.smashables.length; i++) {
      const sm = this.track.smashables[i];
      if (!sm.hit) {
        if (p.airHeight < 1.2 && p.pos.distanceToSquared(sm.pos) < 2.2 * 2.2 && Math.abs(p.forwardSpeed) > 10) {
          sm.hit = true;
          this.smashablesHit++;
          sm.respawnTimer = 18;
          sm.vel.set(
            -Math.sin(p.heading) * Math.abs(p.forwardSpeed) * 0.72 + (Math.random() - 0.5) * 10,
            6.5 + Math.random() * 4.5,
            -Math.cos(p.heading) * Math.abs(p.forwardSpeed) * 0.72 + (Math.random() - 0.5) * 10,
          );
          sm.rotVel.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
          soundEngine.triggerImpact(0.32);
          this.sessionBounty += 300;
          this.nitrous = Math.min(100, this.nitrous + 6);
          this.pushCallout('SMASH BONUS! +$300 BOUNTY · NOS +6%', 'amber');
        }
      } else {
        sm.vel.y -= 18 * dt;
        sm.pos.addScaledVector(sm.vel, dt);
        sm.mesh.position.copy(sm.pos);
        sm.mesh.rotation.x += sm.rotVel.x * dt;
        sm.mesh.rotation.y += sm.rotVel.y * dt;
        sm.mesh.rotation.z += sm.rotVel.z * dt;
        sm.respawnTimer -= dt;
        if (sm.respawnTimer <= 0) {
          sm.hit = false;
          sm.pos.copy(sm.homePos);
          sm.mesh.position.copy(sm.homePos);
          sm.mesh.rotation.set(0, 0, 0);
        }
      }
    }

    // Speed Traps (player + AI racers for competitive Speedtrap events)
    for (let tIdx = 0; tIdx < this.track.speedTraps.length; tIdx++) {
      const trap = this.track.speedTraps[tIdx];
      const trapMat = trap.flashMesh.material as THREE.MeshStandardMaterial;
      if (trapMat.emissiveIntensity > 2.0) {
        trapMat.emissiveIntensity = Math.max(2.0, trapMat.emissiveIntensity - dt * 14);
      }

      for (let rIdx = 0; rIdx < this.racers.length; rIdx++) {
        const r = this.racers[rIdx];
        if (r.knockedOut || r.finished) continue;
        if ((r.trapCooldowns[tIdx] ?? 0) > 0) continue;

        if (r.pos.distanceToSquared(trap.position) < 16 * 16) {
          r.trapCooldowns[tIdx] = 10;
          const rounded = Math.round(Math.abs(r.forwardSpeed) * 3.6);
          r.speedTrapTotalKmh += rounded;
          r.speedTrapHits++;

          if (r.isPlayer) {
            trapMat.emissiveIntensity = 9.0;
            this.speedTrapFlashTimer = 0.28;
            if (rounded > this.speedTrapBestKmh) this.speedTrapBestKmh = rounded;
            const bonus = rounded >= trap.targetKmh ? 1500 : 500;
            this.sessionBounty += bonus;
            this.pushCallout(
              this.raceParams?.mode === 'speedtrap'
                ? `CAMERA ${r.speedTrapHits}: +${rounded} KM/H (TOTAL ${r.speedTrapTotalKmh})`
                : `SPEED TRAP ${rounded} KM/H · +$${bonus.toLocaleString()} BOUNTY`,
              'cyan',
            );
            soundEngine.triggerCameraFlash();

            if (
              this.patrolsEnabled &&
              this.pursuitState === 'none' &&
              this.raceParams?.mode !== 'tollbooth' &&
              rounded >= trap.targetKmh
            ) {
              this.pursuitState = 'pursuit';
              this.heatLevel = 1;
              this.pushCallout('POLICE DISPATCHED — HEAT LEVEL 1', 'red');
              this.pushRadio(`Dispatch: Radar clocked speeders at ${rounded} km/h. Cruisers intercepting pack!`);
              this.spawnPoliceCruiser(p.trackIdx + 95, 3.2, false, false);
            }
          } else if (r.pos.distanceToSquared(p.pos) < 60 * 60) {
            trapMat.emissiveIntensity = 6.5;
          }
        }
      }
    }

    for (const pb of this.track.pursuitBreakers) {
      if (pb.triggered) {
        if (pb.collapseAnim < 1) {
          pb.collapseAnim = Math.min(1, pb.collapseAnim + dt * 3.2);
          pb.group.rotation.z = pb.collapseAnim * 1.45;
          pb.group.position.y = pb.position.y - pb.collapseAnim * 1.2;
        }
        pb.respawnTimer -= dt;
        if (pb.respawnTimer <= 0) {
          pb.triggered = false;
          pb.collapseAnim = 0;
          pb.group.rotation.z = 0;
          pb.group.position.y = pb.position.y;
        }
      } else if (p.pos.distanceToSquared(pb.position) < 6.8 * 6.8) {
        pb.triggered = true;
        pb.respawnTimer = 24;
        this.camShake = 0.45;
        soundEngine.triggerImpact(0.95);
        this.sessionBounty += 2000;
        let knocked = 0;

        for (let k = 0; k < 12; k++) {
          _v2.set((Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14);
          this.spawnParticle(pb.position, _v2, '#F59E0B', 0.9, 0.7);
        }

        for (const cop of this.cops) {
          if (!cop.wrecked && cop.pos.distanceTo(pb.position) < 38) {
            cop.wrecked = true;
            cop.wreckTimer = 8;
            knocked++;
            this.copsTakedowns++;
            this.sessionBounty += 2500;
          }
        }
        this.pushCallout(
          knocked > 0
            ? `PURSUIT BREAKER! ${knocked} COP${knocked > 1 ? 'S' : ''} TAKEN DOWN`
            : 'PURSUIT BREAKER TRIGGERED! +$2,000 BOUNTY',
          'amber',
        );
      }
    }
  }

  private updatePolicePursuit(dt: number, rawDt: number) {
    if (!this.track || !this.player || !this.raceParams) return;
    if (!this.patrolsEnabled) return;
    if (this.pursuitState === 'evaded' || this.pursuitState === 'busted') {
      musicEngine.setPursuitIntensity(false, this.heatLevel);
      return;
    }

    const p = this.player;
    const isPursuitFocused = this.raceParams.mode === 'pursuit' || this.raceParams.mode === 'freeroam';

    // Handle active patrolling cruisers BEFORE pursuit starts — they visibly cruise the road and lock onto ANY speeding racer (player OR bots)
    if (this.pursuitState === 'none') {
      musicEngine.setPursuitIntensity(false, this.heatLevel);
      for (let i = 0; i < this.cops.length; i++) {
        const cop = this.cops[i];
        if (cop.wrecked) continue;
        cop.flashPhase += rawDt * 10;
        const alt = Math.sin(cop.flashPhase) > 0;
        if (cop.visual.lightbarRed && cop.visual.lightbarBlue) {
          cop.visual.lightbarRed.emissiveIntensity = alt ? 4.2 : 0.35;
          cop.visual.lightbarBlue.emissiveIntensity = alt ? 0.35 : 4.2;
        }
        if (cop.visual.lightbarHaloRed && cop.visual.lightbarHaloBlue) {
          cop.visual.lightbarHaloRed.visible = alt;
          cop.visual.lightbarHaloBlue.visible = !alt;
        }

        const aheadIdx = (cop.trackIdx + 7) % this.track.samples.length;
        const aheadS = this.track.samples[aheadIdx];
        const patLane = i % 2 === 0 ? 3.2 : -3.2;
        _v1.copy(aheadS.point).addScaledVector(aheadS.right, patLane);
        const desiredH = Math.atan2(-(_v1.x - cop.pos.x), -(_v1.z - cop.pos.z));
        let diff = desiredH - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += THREE.MathUtils.clamp(diff * 3.5, -2.0, 2.0) * dt;
        cop.speed = 29;
        cop.pos.x += -Math.sin(cop.heading) * cop.speed * dt;
        cop.pos.z += -Math.cos(cop.heading) * cop.speed * dt;
        const cInfo = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
        cop.trackIdx = cInfo.sample.index;
        const maxPatrolLat = this.track.barrierHalfWidth - 1.2;
        if (Math.abs(cInfo.lateralOffset) > maxPatrolLat) {
          const sign = Math.sign(cInfo.lateralOffset);
          const ex = Math.abs(cInfo.lateralOffset) - maxPatrolLat;
          cop.pos.x -= cInfo.sample.right.x * sign * ex;
          cop.pos.z -= cInfo.sample.right.z * sign * ex;
        }
        cop.pos.y = cInfo.elevationY + ROAD_SURFACE_OFFSET;
        cop.visual.root.position.copy(cop.pos);
        cop.visual.root.rotation.set(cInfo.slopePitch, cop.heading, -cInfo.bankAngle, 'YXZ');
        const cSpin = (cop.speed * dt) / 0.36;
        cop.visual.wheelSpinners.forEach((w) => (w.rotation.x -= cSpin));

        // Any speeding racer (> 132 km/h within 56m) OR physical bump (< 3.0m) triggers pack pursuit!
        for (let r = 0; r < this.racers.length; r++) {
          const rc = this.racers[r];
          if (rc.knockedOut || rc.finished) continue;
          const dSq = cop.pos.distanceToSquared(rc.pos);
          const bumpedPatrol = dSq < 3.0 * 3.0 && rc.airHeight < 1.2;
          if (bumpedPatrol) {
            const dist = Math.max(0.1, Math.sqrt(dSq));
            const nx = (rc.pos.x - cop.pos.x) / dist;
            const nz = (rc.pos.z - cop.pos.z) / dist;
            const sep = (3.0 - dist) * 0.55;
            rc.pos.x += nx * sep;
            rc.pos.z += nz * sep;
            cop.pos.x -= nx * sep;
            cop.pos.z -= nz * sep;
            rc.forwardSpeed *= 0.52;
            if (rc.isPlayer) soundEngine.triggerImpact(0.65);
          }
          // Trigger pursuit when a racer physically bumps a patrol or blasts past at high speed
          const raceDiff = this.getRaceDifficulty();
          const speedTriggerKmh = raceDiff === 'Easy' && this.raceParams.mode !== 'pursuit' ? 142 : 132;
          const detectDistSq = 56 * 56;
          if (bumpedPatrol || (Math.abs(rc.forwardSpeed) * 3.6 > speedTriggerKmh && dSq < detectDistSq)) {
            this.pursuitState = 'pursuit';
            this.heatLevel = 1;
            this.highestHeat = Math.max(this.highestHeat, 1);
            this.cops.forEach((c) => {
              c.patrolling = false;
            });
            this.pushCallout('POLICE ENGAGED — INTERCEPTING ENTIRE PACK!', 'red');
            this.pushRadio(
              bumpedPatrol
                ? 'Unit 04: Suspect rammed a patrol cruiser! All units respond!'
                : rc.isPlayer
                  ? 'Unit 04: Street racers clocked over limit! All units intercept the pack!'
                  : `Unit 04: ${rc.name} clocked speeding! Engaging all street racers!`,
            );
            soundEngine.triggerBeep(true);
            break;
          }
        }
        if (this.pursuitState !== 'none') break;
      }
      return;
    }

    if (this.pursuitState === 'pursuit') {
      this.sessionBounty += Math.round(dt * 125 * this.heatLevel);
    }

    musicEngine.setPursuitIntensity(this.pursuitState === 'pursuit', this.heatLevel);

    const raceDiff = this.getRaceDifficulty();
    const minMissionHeat = this.raceParams.mission?.minHeat ?? 1;
    const maxHeatCap =
      isPursuitFocused || this.raceParams.mode === 'blacklist'
        ? 5
        : Math.max(minMissionHeat, raceDiff === 'Easy' ? 1 : raceDiff === 'Medium' ? 2 : 5);

    const rawTargetHeat =
      this.sessionBounty > 60000
        ? 5
        : this.sessionBounty > 34000
          ? 4
          : this.sessionBounty > 18000
            ? 3
            : this.sessionBounty > 7500
              ? 2
              : 1;
    const targetHeat = Math.min(maxHeatCap, rawTargetHeat);
    if (targetHeat > this.heatLevel) {
      this.heatLevel = targetHeat;
      this.highestHeat = Math.max(this.highestHeat, this.heatLevel);
      this.pushCallout(`HEAT LEVEL ${this.heatLevel} — REINFORCEMENTS INBOUND`, 'red');
      if (this.heatLevel === 3) {
        this.pushRadio('Dispatch: Heat 3! Rhino Heavy Enforcers & spike strips authorized!');
      } else if (this.heatLevel === 4) {
        this.pushRadio('Chopper 2: Air support & Federal Corvettes deployed!');
      } else if (this.heatLevel === 5) {
        this.pushRadio('Cross: Condition 5! Full Rockport containment — hit them all!');
      } else {
        this.pushRadio(`Dispatch: Escalating to Heat ${this.heatLevel}. Interceptors responding.`);
      }
      soundEngine.triggerBeep(true);
    }

    const desiredCops = isPursuitFocused
      ? Math.min(6, this.heatLevel + 2)
      : Math.min(5, Math.max(2, this.heatLevel + 1));
    const activeNormalCops = this.cops.filter((c) => !c.wrecked && !c.isRoadblock).length;
    this.copSpawnTimer -= dt;
    if (activeNormalCops < desiredCops && this.copSpawnTimer <= 0) {
      this.copSpawnTimer = Math.max(3.5, 6.8 - this.heatLevel * 0.6);
      const activeRacers = this.racers.filter((r) => !r.knockedOut && !r.finished);
      const leadRacer = activeRacers.sort((a, b) => b.totalProgress - a.totalProgress)[0] ?? p;
      const spawnRhino = this.heatLevel >= 3 && Math.random() > 0.55;
      if (spawnRhino) {
        this.spawnPoliceCruiser(leadRacer.trackIdx + 84, (Math.random() - 0.5) * 4.5, false, true, true);
        this.pushCallout('HEAVY RHINO ENFORCER AHEAD ON INTERCEPT!', 'red');
        this.pushRadio('Chopper 2: Heavy Rhino Enforcer charging down the highway!');
      } else {
        const aheadOffset = activeNormalCops % 2 === 0 ? 60 : -28;
        this.spawnPoliceCruiser(leadRacer.trackIdx + aheadOffset, (Math.random() - 0.5) * 6.0, false, false, false);
      }
    }

    if (this.heatLevel >= 3 || (this.raceParams.mode === 'pursuit' && this.heatLevel >= 2)) {
      this.nextRoadblockCooldown -= dt;
      if (this.nextRoadblockCooldown <= 0) {
        this.nextRoadblockCooldown = Math.max(18, 28 - this.heatLevel * 2.0);
        const rbIdx = p.trackIdx + 100;
        const rbLat = Math.min(5.2, this.track.roadHalfWidth * 0.44);
        this.spawnPoliceCruiser(rbIdx, -rbLat * 0.65, true, false);
        this.spawnPoliceCruiser(rbIdx, rbLat * 0.65, true, false);
        this.spawnSpikeStrip(rbIdx + 2);
        this.pushCallout('ROADBLOCK + SPIKE STRIP AHEAD — THREAD THE SHOULDER!', 'red');
        this.pushRadio('Unit 14: Roadblock and spike strip deployed — watch the shoulders!');
      }
    }

    // Spike strip collisions (Player AND AI rivals!) & cleanup
    for (let sIdx = this.spikeStrips.length - 1; sIdx >= 0; sIdx--) {
      const sp = this.spikeStrips[sIdx];
      for (let rIdx = 0; rIdx < this.racers.length; rIdx++) {
        const rc = this.racers[rIdx];
        if (rc.knockedOut || rc.finished || rc.airHeight >= 0.75) continue;
        if (!sp.hit && sp.pos.distanceToSquared(rc.pos) < 4.2 * 4.2) {
          sp.hit = true;
          sp.mesh.visible = false;
          if (rc.isPlayer) {
            this.spikedTimer = 3.0;
            p.forwardSpeed *= 0.68;
            this.camShake = 0.48;
            soundEngine.triggerImpact(0.9);
            this.pushCallout('TIRES NICKED BY SPIKE STRIP! 3S RECOVERY', 'red');
            this.pushRadio('Unit 14: Suspect rolled over spike strips! Speed dropping — box them in!');
          } else {
            rc.copSlowdownTimer = 3.6;
            rc.forwardSpeed *= 0.45;
            this.pushCallout(`${rc.name} HIT SPIKE STRIP!`, 'cyan');
            this.pushRadio(`Unit 14: ${rc.name} hit the spike strip — closing in!`);
          }
          break;
        }
      }
      if (sp.pos.distanceToSquared(p.pos) > 240 * 240) {
        this.scene.remove(sp.mesh);
        this.spikeStrips.splice(sIdx, 1);
      }
    }

    let closestCopDistToPlayer = Infinity;

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (cop.aiHitCooldown && cop.aiHitCooldown > 0) {
        cop.aiHitCooldown = Math.max(0, cop.aiHitCooldown - dt);
      }
      cop.flashPhase += rawDt * 18;
      const alt = Math.sin(cop.flashPhase) > 0;
      if (cop.visual.lightbarRed && cop.visual.lightbarBlue) {
        cop.visual.lightbarRed.emissiveIntensity = alt ? 5.2 : 0.25;
        cop.visual.lightbarBlue.emissiveIntensity = alt ? 0.25 : 5.2;
      }
      if (cop.visual.lightbarHaloRed && cop.visual.lightbarHaloBlue) {
        cop.visual.lightbarHaloRed.visible = !cop.wrecked && alt;
        cop.visual.lightbarHaloBlue.visible = !cop.wrecked && !alt;
      }

      if (cop.wrecked) {
        cop.wreckTimer -= dt;
        cop.speed = THREE.MathUtils.damp(cop.speed, 0, 3, dt);
        cop.visual.bodyGroup.rotation.z = 0.18;
        if (Math.random() < 0.3) {
          _v1.set(cop.pos.x, cop.pos.y + 0.8, cop.pos.z);
          _v2.set(0, 2.5, 0);
          this.spawnParticle(_v1, _v2, '#475569', 0.9, 0.6);
        }
        if (cop.wreckTimer <= 0) {
          this.scene.remove(cop.visual.root);
          cop.visual.dispose();
          this.cops.splice(i, 1);
        }
        continue;
      }

      const distToPlayer = cop.pos.distanceTo(p.pos);
      if (distToPlayer < closestCopDistToPlayer) closestCopDistToPlayer = distToPlayer;

      // Cleanly despawn units left far behind (> 275m) so cops never teleport back behind you
      if ((cop.isRoadblock && distToPlayer > 230) || (!cop.isRoadblock && !cop.isHeadOn && distToPlayer > 275)) {
        let nearAnyRacer = false;
        for (let r = 0; r < this.racers.length; r++) {
          const rc = this.racers[r];
          if (!rc.knockedOut && !rc.finished && cop.pos.distanceTo(rc.pos) < 180) {
            nearAnyRacer = true;
            break;
          }
        }
        if (!nearAnyRacer) {
          this.scene.remove(cop.visual.root);
          cop.visual.dispose();
          this.cops.splice(i, 1);
          continue;
        }
      }

      // Multi-target pursuit: even-ID cruisers bias toward attacking AI bots in the pack, odd-ID cruisers hunt nearest/player
      let target: RacerEntity = p;
      let targetDist = distToPlayer;
      if (!cop.isRoadblock) {
        let bestScore = Infinity;
        const huntBotsBias = cop.id % 2 === 0;
        for (let r = 0; r < this.racers.length; r++) {
          const cand = this.racers[r];
          if (cand.knockedOut || cand.finished) continue;
          const d = cop.pos.distanceTo(cand.pos);
          const weight = cand.isPlayer ? (huntBotsBias ? 1.35 : 0.92) : (huntBotsBias ? 0.65 : 0.95);
          const score = d * weight;
          if (score < bestScore) {
            bestScore = score;
            target = cand;
            targetDist = d;
          }
        }
        if (cop.targetId !== target.id && !target.isPlayer && distToPlayer < 165) {
          this.pushRadio(`Dispatch: Interceptor locking onto ${target.name}!`);
        }
        cop.targetId = target.id;
      }

      if (!cop.isRoadblock) {
        const info = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
        cop.trackIdx = info.sample.index;
        cop.pos.y = info.elevationY + ROAD_SURFACE_OFFSET;

        if (cop.isHeadOn) {
          const tFwdX = -Math.sin(target.heading);
          const tFwdZ = -Math.cos(target.heading);
          const alongTarget = (cop.pos.x - target.pos.x) * tFwdX + (cop.pos.z - target.pos.z) * tFwdZ;
          if (alongTarget < -18) {
            cop.isHeadOn = false;
          }
        }

        if (cop.isHeadOn) {
          if (targetDist < 105) {
            _v1.copy(target.pos);
          } else {
            const backIdx = (cop.trackIdx - 8 + this.track.samples.length) % this.track.samples.length;
            _v1.copy(this.track.samples[backIdx].point);
          }
        } else if (targetDist < 48) {
          const role = cop.id % 3;
          const flankOffset = role === 1 ? -2.6 : role === 2 ? 2.6 : 0;
          const tRightX = Math.cos(target.heading);
          const tRightZ = -Math.sin(target.heading);
          _v1.set(target.pos.x + tRightX * flankOffset, target.pos.y, target.pos.z + tRightZ * flankOffset);
        } else {
          const aheadIdx = (cop.trackIdx + 8) % this.track.samples.length;
          _v1.copy(this.track.samples[aheadIdx].point);
        }

        const desiredH = Math.atan2(-(_v1.x - cop.pos.x), -(_v1.z - cop.pos.z));
        let diff = desiredH - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += THREE.MathUtils.clamp(diff * 4.2, -2.5, 2.5) * dt;

        // Fair Heat-scaled cop speeds (Heat 1: 216 km/h -> Heat 5: 312 km/h Federal Interceptors)
        const baseCopKmh = cop.isRhino
          ? 212 + this.heatLevel * 12
          : 216 + (this.heatLevel - 1) * 24;
        const cornerScale = 1 - Math.min(0.22, Math.abs(diff) * 0.30);
        const catchupScale = targetDist > 65 ? 1.08 : 0.99;
        const maxCopSpeed = (baseCopKmh / 3.6) * cornerScale * catchupScale;

        if (cop.speed < maxCopSpeed) {
          cop.speed = Math.min(maxCopSpeed, cop.speed + (11.5 + this.heatLevel * 1.6) * dt);
        } else {
          cop.speed = Math.max(maxCopSpeed, cop.speed - 22 * dt);
        }

        cop.pos.x += -Math.sin(cop.heading) * cop.speed * dt;
        cop.pos.z += -Math.cos(cop.heading) * cop.speed * dt;

        const cInfo = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
        const copScHit =
          target.activeShortcutId !== null
            ? this.track.queryShortcut(cop.pos.x, cop.pos.z, target.activeShortcutId)
            : this.track.queryShortcut(cop.pos.x, cop.pos.z);
        const copInShortcut = Boolean(
          copScHit &&
            Math.abs(copScHit.lateral) <= copScHit.shortcut.halfWidth - 0.3 &&
            (target.activeShortcutId === copScHit.shortcut.id ||
              (copScHit.frac >= copScHit.shortcut.innerStartFrac && copScHit.frac <= copScHit.shortcut.innerEndFrac)),
        );
        if (copInShortcut && copScHit) {
          const maxCopScLat = copScHit.shortcut.halfWidth - 1.15;
          const scOuter = copScHit.shortcut.side;
          const inScMid =
            copScHit.frac >= copScHit.shortcut.innerStartFrac && copScHit.frac <= copScHit.shortcut.innerEndFrac;
          if (copScHit.lateral * scOuter > maxCopScLat) {
            const ex = Math.min(copScHit.lateral * scOuter - maxCopScLat, 3.5);
            cop.pos.x -= -copScHit.tangent.z * scOuter * ex;
            cop.pos.z -= copScHit.tangent.x * scOuter * ex;
          } else if (inScMid && copScHit.lateral * scOuter < -maxCopScLat) {
            const ex = Math.min(-copScHit.lateral * scOuter - maxCopScLat, 3.5);
            cop.pos.x -= -copScHit.tangent.z * -scOuter * ex;
            cop.pos.z -= copScHit.tangent.x * -scOuter * ex;
          }
          cop.pos.y = copScHit.elevationY + ROAD_SURFACE_OFFSET;
          cop.visual.root.rotation.set(copScHit.slopePitch, cop.heading, 0, 'YXZ');
        } else {
          cop.pos.y = cInfo.elevationY + ROAD_SURFACE_OFFSET;
          const maxLat = this.track.barrierHalfWidth - 1.2;
          if (Math.abs(cInfo.lateralOffset) > maxLat) {
            const sign = Math.sign(cInfo.lateralOffset);
            const ex = Math.min(Math.abs(cInfo.lateralOffset) - maxLat, 3.5);
            cop.pos.x -= cInfo.sample.right.x * sign * ex;
            cop.pos.z -= cInfo.sample.right.z * sign * ex;
          }
          cop.visual.root.rotation.set(cInfo.slopePitch, cop.heading, -cInfo.bankAngle, 'YXZ');
        }
      } else {
        const rbInfo = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
        cop.pos.y = rbInfo.elevationY + ROAD_SURFACE_OFFSET;
        cop.visual.root.rotation.set(0, cop.heading, 0);

        if (!cop.roadblockBreached && distToPlayer < 16 && Math.abs(p.forwardSpeed) * 3.6 > 85) {
          for (const other of this.cops) {
            if (other.isRoadblock && Math.abs(other.trackIdx - cop.trackIdx) <= 4) {
              other.roadblockBreached = true;
            }
          }
          this.sessionBounty += 1500;
          this.pushCallout('ROADBLOCK BREACH! +$1,500 BOUNTY', 'amber');
          soundEngine.triggerBeep(true);
        }
      }

      // Cop collision against AI rivals — continuous physical separation + impactful PIT/ram slowdowns
      for (let r = 0; r < this.racers.length; r++) {
        const ai = this.racers[r];
        if (ai.isPlayer || ai.knockedOut || ai.finished) continue;
        const aiDist = cop.pos.distanceTo(ai.pos);
        const minAiDist = cop.isRhino ? 2.85 : 2.55;
        if (aiDist < minAiDist) {
          const nx = (ai.pos.x - cop.pos.x) / Math.max(0.1, aiDist);
          const nz = (ai.pos.z - cop.pos.z) / Math.max(0.1, aiDist);
          const sep = (minAiDist - aiDist) * 0.55;
          ai.pos.x += nx * sep;
          ai.pos.z += nz * sep;
          cop.pos.x -= nx * sep;
          cop.pos.z -= nz * sep;

          if ((!cop.aiHitCooldown || cop.aiHitCooldown <= 0) && ai.copSlowdownTimer <= 0) {
            cop.aiHitCooldown = 1.4;
            ai.copSlowdownTimer = 2.8;
            const aiSpeedKmh = Math.abs(ai.forwardSpeed) * 3.6;
            ai.forwardSpeed *= cop.isRhino ? 0.42 : cop.isRoadblock ? 0.48 : 0.58;
            ai.heading += THREE.MathUtils.clamp((Math.random() - 0.5) * 0.36, -0.22, 0.22);
            if (aiSpeedKmh > 175 && !cop.isRhino) {
              cop.wrecked = true;
              cop.wreckTimer = 7;
              if (distToPlayer < 135) {
                this.pushCallout(`${ai.name} WRECKED A CRUISER!`, 'cyan');
              }
            } else if (distToPlayer < 135) {
              this.pushCallout(`POLICE RAMMED ${ai.name}!`, 'cyan');
            }
            if (distToPlayer < 120) {
              for (let s = 0; s < 5; s++) {
                _v2.set((Math.random() - 0.5) * 10, 3 + Math.random() * 3.5, (Math.random() - 0.5) * 10);
                this.spawnParticle(ai.pos, _v2, '#F59E0B', 0.55, 0.35);
              }
            }
          }
        }
      }

      // Cop collision against Player (tougher Rhino & Roadblock impact stops)
      const minPlDist = cop.isRhino ? 2.95 : 2.65;
      if (!cop.wrecked && distToPlayer < minPlDist && p.airHeight < 1.2) {
        const relSpeedKmh = Math.abs(p.forwardSpeed - (cop.isRoadblock ? 0 : cop.speed * 0.5)) * 3.6;
        const nosRam = this.input.nitrous && this.nitrous > 1;
        this.camShake = Math.max(this.camShake, 0.38);
        soundEngine.triggerImpact(0.86);

        for (let s = 0; s < 6; s++) {
          _v2.set((Math.random() - 0.5) * 12, 3 + Math.random() * 4, (Math.random() - 0.5) * 12);
          this.spawnParticle(cop.pos, _v2, '#F59E0B', 0.55, 0.4);
        }

        const nx = (p.pos.x - cop.pos.x) / Math.max(0.1, distToPlayer);
        const nz = (p.pos.z - cop.pos.z) / Math.max(0.1, distToPlayer);
        const sep = (minPlDist - distToPlayer) * 0.55;
        p.pos.x += nx * sep;
        p.pos.z += nz * sep;
        cop.pos.x -= nx * sep;
        cop.pos.z -= nz * sep;

        const takedownThreshold = cop.isRhino ? 88 : 48;
        if (relSpeedKmh > takedownThreshold || (nosRam && relSpeedKmh > 32) || (cop.isRoadblock && Math.abs(p.forwardSpeed) * 3.6 > 95)) {
          cop.wrecked = true;
          cop.wreckTimer = 7;
          this.copsTakedowns++;
          const reward = cop.isRhino ? 4500 : cop.isRoadblock ? 3000 : 2500;
          this.sessionBounty += reward;
          this.pushCallout(
            `${cop.isRhino ? 'RHINO' : 'COP'} TAKEDOWN! +$${reward.toLocaleString()} BOUNTY`,
            'amber',
          );
          p.forwardSpeed *= cop.isRhino ? 0.70 : cop.isRoadblock ? 0.74 : 0.88;
        } else {
          p.pos.x += nx * 0.85;
          p.pos.z += nz * 0.85;
          cop.pos.x -= nx * 1.1;
          cop.pos.z -= nz * 1.1;
          cop.speed *= 0.45;
          p.forwardSpeed *= cop.isRhino ? 0.62 : cop.isRoadblock ? 0.58 : 0.84;
        }
      }

      if (!cop.isRoadblock && !cop.wrecked) {
        const postScHit = this.track.queryShortcut(cop.pos.x, cop.pos.z);
        const postInSc = Boolean(
          postScHit &&
            Math.abs(postScHit.lateral) <= postScHit.shortcut.halfWidth - 0.3 &&
            postScHit.frac >= postScHit.shortcut.innerStartFrac &&
            postScHit.frac <= postScHit.shortcut.innerEndFrac,
        );
        if (postInSc && postScHit) {
          const maxCopScLat = postScHit.shortcut.halfWidth - 1.15;
          if (Math.abs(postScHit.lateral) > maxCopScLat) {
            const sign = Math.sign(postScHit.lateral);
            const ex = Math.min(Math.abs(postScHit.lateral) - maxCopScLat, 3.5);
            cop.pos.x -= -postScHit.tangent.z * sign * ex;
            cop.pos.z -= postScHit.tangent.x * sign * ex;
          }
          cop.pos.y = postScHit.elevationY + ROAD_SURFACE_OFFSET;
        } else {
          const postCopInfo = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
          cop.pos.y = postCopInfo.elevationY + ROAD_SURFACE_OFFSET;
          const maxCopLat = this.track.barrierHalfWidth - 1.2;
          if (Math.abs(postCopInfo.lateralOffset) > maxCopLat) {
            const sign = Math.sign(postCopInfo.lateralOffset);
            const ex = Math.min(Math.abs(postCopInfo.lateralOffset) - maxCopLat, 3.5);
            cop.pos.x -= postCopInfo.sample.right.x * sign * ex;
            cop.pos.z -= postCopInfo.sample.right.z * sign * ex;
          }
        }
      }

      cop.visual.root.position.copy(cop.pos);
      const cSpin = (cop.speed * dt) / 0.36;
      cop.visual.wheelSpinners.forEach((w) => (w.rotation.x -= cSpin));
    }

    if (closestCopDistToPlayer > 105) {
      if (this.pursuitState !== 'cooldown') {
        this.pursuitState = 'cooldown';
        this.pushCallout('COOLDOWN — HEAD FOR GREEN HIDING BAYS', 'emerald');
        this.pushRadio('Dispatch: Lost visual on suspect. Sweeping perimeter.');
      }
      const inCooldownZone = this.track.cooldownZones.some(
        (z) => p.pos.distanceToSquared(z.position) < z.radius * z.radius,
      );
      const evadeRate = inCooldownZone ? 58 : 24;
      this.evadeProgress = Math.min(100, this.evadeProgress + rawDt * evadeRate);
      this.bustProgress = Math.max(0, this.bustProgress - rawDt * 48);

      if (this.evadeProgress >= 100) {
        const evadeBonus = 3500 * this.heatLevel;
        this.sessionBounty += evadeBonus;
        this.pushCallout(`PURSUIT EVADED! +$${evadeBonus.toLocaleString()} BOUNTY`, 'emerald');
        if (this.raceParams.mode === 'pursuit') {
          this.pursuitState = 'evaded';
          this.completeRace(false);
        } else {
          this.pursuitState = 'none';
          this.evadeProgress = 0;
          this.heatLevel = 1;
          this.cops.forEach((c) => {
            this.scene.remove(c.visual.root);
            c.visual.dispose();
          });
          this.cops = [];
        }
      }
    } else {
      if (this.pursuitState === 'cooldown') {
        this.pursuitState = 'pursuit';
        this.pushCallout('UNITS RE-ACQUIRED VISUAL!', 'red');
      }
      this.evadeProgress = Math.max(0, this.evadeProgress - rawDt * 12);

      const playerSpeedKmh = Math.abs(p.forwardSpeed) * 3.6;
      if (closestCopDistToPlayer < 9.5 && playerSpeedKmh < 14) {
        let copsNearby = 0;
        for (let ci = 0; ci < this.cops.length; ci++) {
          if (!this.cops[ci].wrecked && this.cops[ci].pos.distanceToSquared(p.pos) < 12 * 12) {
            copsNearby++;
          }
        }
        const bustRate = (this.spikedTimer > 0 ? 28 : 20) + (copsNearby >= 2 ? 10 : 0);
        this.bustProgress = Math.min(100, this.bustProgress + rawDt * bustRate);
        if (this.bustProgress >= 100) {
          this.pursuitState = 'busted';
          this.completeRace(true);
        }
      } else {
        this.bustProgress = Math.max(0, this.bustProgress - rawDt * 42);
      }
    }
  }

  private buildMissionChecklist(wonMainCondition: boolean): MissionChecklistItem[] {
    const m = this.raceParams?.mission;
    if (!m || !this.player) return [];
    const items: MissionChecklistItem[] = [];

    if (m.type === 'pursuit_milestone' || m.type === 'interceptor') {
      items.push({
        label: 'Session Bounty',
        current: `$${this.sessionBounty.toLocaleString()} / $${(m.targetBounty ?? 0).toLocaleString()}`,
        done: this.sessionBounty >= (m.targetBounty ?? 0),
      });
      if ((m.targetTakedowns ?? 0) > 0) {
        items.push({
          label: 'Cop Takedowns',
          current: `${this.copsTakedowns} / ${m.targetTakedowns}`,
          done: this.copsTakedowns >= (m.targetTakedowns ?? 0),
        });
      }
      items.push({
        label: `Reach Heat ${m.minHeat ?? 1}+`,
        current: `Heat ${this.highestHeat} / ${m.minHeat ?? 1}`,
        done: this.highestHeat >= (m.minHeat ?? 1),
      });
      items.push({
        label: 'Evade RPD',
        current: this.pursuitState === 'evaded' ? 'EVADED' : `${Math.round(this.evadeProgress)}%`,
        done: this.pursuitState === 'evaded',
      });
      return items;
    }

    if (m.type === 'tollbooth') {
      items.push({
        label: 'Clear All Gates Before 0.0s',
        current: `${this.tollboothCheckpoint} / ${this.tollboothTotal}`,
        done: this.tollboothCheckpoint >= this.tollboothTotal,
      });
    } else if (m.type === 'speedtrap') {
      items.push({
        label: 'Lead Total Radar Score',
        current: `${this.player.speedTrapTotalKmh} km/h`,
        done: wonMainCondition,
      });
      if ((m.targetSpeedtrapKmh ?? 0) > 0) {
        items.push({
          label: `Hit ${m.targetSpeedtrapKmh} km/h Target`,
          current: `${this.player.speedTrapTotalKmh} / ${m.targetSpeedtrapKmh}`,
          done: this.player.speedTrapTotalKmh >= (m.targetSpeedtrapKmh ?? 0),
        });
      }
    } else {
      items.push({
        label: m.type === 'knockout' ? 'Survive & Finish P1' : 'Finish 1st Place',
        current: wonMainCondition ? 'P1' : 'IN RACE',
        done: wonMainCondition,
      });
    }

    if ((m.targetShortcuts ?? 0) > 0) {
      items.push({
        label: 'Shortcuts Taken',
        current: `${this.shortcutsTaken} / ${m.targetShortcuts}`,
        done: this.shortcutsTaken >= (m.targetShortcuts ?? 0),
      });
    }
    if ((m.targetDriftSec ?? 0) > 0) {
      items.push({
        label: 'Total Drift Time',
        current: `${this.driftTimeTotalSec.toFixed(1)}s / ${m.targetDriftSec}s`,
        done: this.driftTimeTotalSec >= (m.targetDriftSec ?? 0),
      });
    }
    if ((m.targetNearMisses ?? 0) > 0) {
      items.push({
        label: 'Traffic Near Misses',
        current: `${this.nearMissCount} / ${m.targetNearMisses}`,
        done: this.nearMissCount >= (m.targetNearMisses ?? 0),
      });
    }
    if ((m.targetAirtimeSec ?? 0) > 0) {
      items.push({
        label: 'Ramp Air Time',
        current: `${this.airTimeTotalSec.toFixed(1)}s / ${m.targetAirtimeSec}s`,
        done: this.airTimeTotalSec >= (m.targetAirtimeSec ?? 0),
      });
    }
    if ((m.targetSmashables ?? 0) > 0) {
      items.push({
        label: 'Smash Barrels / Props',
        current: `${this.smashablesHit} / ${m.targetSmashables}`,
        done: this.smashablesHit >= (m.targetSmashables ?? 0),
      });
    }

    return items;
  }

  private isMissionCompleted(wonMainCondition: boolean): boolean {
    const m = this.raceParams?.mission;
    if (!m || !this.player) return wonMainCondition;
    const list = this.buildMissionChecklist(wonMainCondition);
    return list.length > 0 && list.every((item) => item.done);
  }

  private getMissionFailReason(
    wonMainCondition: boolean,
    busted: boolean,
    knockedOut: boolean,
    tollboothExpired: boolean,
    pos: number,
  ): string | undefined {
    if (busted) return 'Busted by Rockport PD — stay above 25 km/h or smash Pursuit Breakers to escape.';
    if (knockedOut) return 'Eliminated in last place on lap rollover — avoid trailing the pack.';
    if (tollboothExpired) return `Clock hit 0.0s with ${this.tollboothTotal - this.tollboothCheckpoint} gate(s) remaining.`;
    const m = this.raceParams?.mission;
    if (!m) {
      return !wonMainCondition ? `Finished P${pos} — win P1 to claim victory.` : undefined;
    }
    const list = this.buildMissionChecklist(wonMainCondition);
    const failed = list.find((item) => !item.done);
    if (!failed) return undefined;
    return `Missed requirement: ${failed.label} (${failed.current}).`;
  }

  private completeRace(busted: boolean, knockedOut = false, tollboothExpired = false) {
    if (!this.raceParams || !this.player || this.outroActive) return;
    soundEngine.stopRaceLoops();
    musicEngine.stop();

    const isSpeedtrap = this.raceParams.mode === 'speedtrap';
    const activeList = this.racers.filter((r) => !r.knockedOut);
    const sorted = [...activeList].sort((a, b) => {
      if (isSpeedtrap) {
        if (b.speedTrapTotalKmh !== a.speedTrapTotalKmh) {
          return b.speedTrapTotalKmh - a.speedTrapTotalKmh;
        }
      }
      return b.totalProgress - a.totalProgress;
    });
    const pos = knockedOut ? activeList.length + 1 : Math.max(1, sorted.findIndex((r) => r.isPlayer) + 1);
    const isPursuit = this.raceParams.mode === 'pursuit';
    const isFreeroam = this.raceParams.mode === 'freeroam';
    const isTollbooth = this.raceParams.mode === 'tollbooth';

    const mainConditionMet =
      !busted &&
      !knockedOut &&
      !tollboothExpired &&
      (isPursuit ? this.pursuitState === 'evaded' : isFreeroam ? true : isTollbooth ? this.tollboothCheckpoint >= this.tollboothTotal : pos === 1);

    const mission = this.raceParams.mission;
    const missionCompleted = mission ? !busted && !knockedOut && !tollboothExpired && this.isMissionCompleted(mainConditionMet) : undefined;
    const won = mission ? Boolean(missionCompleted) : mainConditionMet;
    const missionFailReason = won ? undefined : this.getMissionFailReason(mainConditionMet, busted, knockedOut, tollboothExpired, pos);

    let cashEarned = 0;
    if (!busted) {
      if (knockedOut) {
        cashEarned = pos <= 3 ? 2500 : 1200;
      } else if (tollboothExpired) {
        cashEarned = this.tollboothCheckpoint * 900;
      } else if (isTollbooth) {
        cashEarned = 20000 + Math.round(this.tollboothTimeLeftMs * 0.2);
      } else if (isSpeedtrap) {
        cashEarned = pos === 1 ? 18500 : pos === 2 ? 9500 : 4500;
      } else if (isPursuit || isFreeroam) {
        cashEarned = Math.max(1500, Math.round(this.sessionBounty * 0.72));
      } else if (this.raceParams.mode === 'blacklist' && this.raceParams.rival) {
        cashEarned = won ? this.raceParams.rival.cashReward : 4000;
      } else if (this.raceParams.mode === 'knockout') {
        cashEarned = pos === 1 ? 24000 : 12000;
      } else if (this.raceParams.mode === 'sprint') {
        cashEarned = pos === 1 ? 11000 : pos === 2 ? 6000 : pos === 3 ? 3500 : 1800;
      } else {
        cashEarned = pos === 1 ? 18000 : pos === 2 ? 9500 : pos === 3 ? 5000 : 2500;
      }
      if (mission && missionCompleted) {
        cashEarned += mission.cashReward;
      }
    }

    const bountyEarned = busted
      ? Math.round(this.sessionBounty * 0.25)
      : this.sessionBounty +
        (mission && missionCompleted ? mission.bountyReward : 0) +
        (won && this.raceParams.rival
          ? this.raceParams.rival.bountyReward
          : won
            ? this.raceParams.mode === 'knockout' || this.raceParams.mode === 'tollbooth' || isSpeedtrap
              ? 4000
              : 2500
            : 800);

    const rivalDefeated = won && this.raceParams.mode === 'blacklist' ? this.raceParams.rival : undefined;
    const bossCarAwarded = rivalDefeated
      ? CARS.find((c) => c.id === rivalDefeated.bossCarId)
      : undefined;

    if (busted && this.cops.filter((c) => !c.wrecked).length < 2) {
      this.spawnPoliceCruiser(this.player.trackIdx + 3, 2.8, false, false);
      this.spawnPoliceCruiser(this.player.trackIdx - 3, -2.8, false, false);
    }

    const result: RaceResult = {
      mode: this.raceParams.mode,
      trackId: this.raceParams.trackId,
      environment: this.activeEnvironment,
      won,
      busted,
      knockedOut,
      tollboothExpired,
      position: pos,
      totalRacers: this.racers.length,
      totalTimeMs: Math.round(this.raceElapsedMs),
      bestLapMs: Math.round(this.bestLapMs || this.raceElapsedMs),
      cashEarned,
      bountyEarned,
      copsTakedowns: this.copsTakedowns,
      highestHeat: this.highestHeat,
      shortcutsTaken: this.shortcutsTaken,
      driftTimeTotalSec: Number(this.driftTimeTotalSec.toFixed(1)),
      airTimeTotalSec: Number(this.airTimeTotalSec.toFixed(1)),
      smashablesHit: this.smashablesHit,
      nearMissCount: this.nearMissCount,
      speedTrapTotalKmh: this.player.speedTrapTotalKmh,
      missionId: mission?.id,
      missionTitle: mission?.title,
      missionCompleted,
      missionFailReason,
      rivalDefeated,
      bossCarAwarded,
    };

    // Enter slow-motion 3D outro cinematic instead of freezing canvas
    this.outroActive = true;
    this.outroTimer = 0;
    this.outroOutcome = busted ? 'busted' : won ? 'win' : 'loss';
    this.resetInput();
    soundEngine.triggerFinishFanfare(won);
    this.emitTelemetry(this.getTotalLaps(), true);
    this.callbacks.onRaceComplete(result);
  }

  private updateCamera(rawDt: number) {
    if (!this.player) return;
    const p = this.player;
    const fwdX = -Math.sin(p.heading);
    const fwdZ = -Math.cos(p.heading);

    let camDiff = p.heading - this.camHeading;
    while (camDiff > Math.PI) camDiff -= Math.PI * 2;
    while (camDiff < -Math.PI) camDiff += Math.PI * 2;
    this.camHeading += camDiff * (1 - Math.exp(-10.2 * rawDt));

    const targetLookYaw =
      this.lookBack || (this.lookLeft && this.lookRight)
        ? Math.PI
        : this.lookLeft
          ? Math.PI * 0.54
          : this.lookRight
            ? -Math.PI * 0.54
            : 0;
    this.lookYawOffset = THREE.MathUtils.damp(this.lookYawOffset, targetLookYaw, 15, rawDt);
    const absLook = Math.abs(this.lookYawOffset);
    const lookingBehind = absLook > 1.85;

    const nosBoost = (this.input.nitrous && this.nitrous > 1 && this.input.throttle) || this.driftBoostTimer > 0;
    const speedRatio = Math.min(1, Math.abs(p.forwardSpeed) / 90);
    const swingFade = Math.max(0, 1 - absLook / 1.2);
    const driftSwing = THREE.MathUtils.clamp(p.lateralSpeed * 0.11, -1.2, 1.2) * swingFade;

    const slopeLookOffset = Math.sin(p.slopePitch) * 12;
    if (this.cameraMode === 'hood' || this.cameraMode === 'bumper') {
      const viewHeading = p.heading + this.lookYawOffset;
      const vFwdX = -Math.sin(viewHeading);
      const vFwdZ = -Math.cos(viewHeading);
      const isHood = this.cameraMode === 'hood';
      const mountAhead = lookingBehind ? -0.35 : isHood ? 0.35 : 2.05;
      const mountY = lookingBehind ? 1.65 : isHood ? 1.22 : 0.6;
      const lookY = lookingBehind ? 1.05 : isHood ? 0.9 : 0.65;
      _v1.set(p.pos.x + fwdX * mountAhead, p.pos.y + mountY, p.pos.z + fwdZ * mountAhead);
      _v2.set(
        p.pos.x + vFwdX * 26,
        p.pos.y + lookY + (lookingBehind ? -slopeLookOffset : slopeLookOffset * swingFade),
        p.pos.z + vFwdZ * 26,
      );
    } else {
      const orbitHeading = this.camHeading + this.lookYawOffset;
      const orbFwdX = -Math.sin(orbitHeading);
      const orbFwdZ = -Math.cos(orbitHeading);
      const orbRightX = Math.cos(orbitHeading);
      const orbRightZ = -Math.sin(orbitHeading);
      const dist =
        absLook > 0.25
          ? 6.4
          : this.cameraMode === 'chase_far'
            ? 6.15 + speedRatio * 1.15
            : 4.85 + speedRatio * 0.85;
      const height = this.cameraMode === 'chase_far' ? 2.32 : 1.88;
      const lookAheadDist = THREE.MathUtils.lerp(this.cameraMode === 'chase_far' ? 22 : 20, 14, Math.min(1, absLook / 1.5));
      _v1.set(
        p.pos.x - orbFwdX * dist + orbRightX * driftSwing,
        p.pos.y + height,
        p.pos.z - orbFwdZ * dist + orbRightZ * driftSwing,
      );
      _v2.set(
        p.pos.x + orbFwdX * lookAheadDist,
        p.pos.y + (this.cameraMode === 'chase_far' ? 1.08 : 0.96) + (lookingBehind ? -slopeLookOffset : slopeLookOffset * swingFade),
        p.pos.z + orbFwdZ * lookAheadDist,
      );
    }

    const posLambda = this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 32 : 19;
    const posYLambda = this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 32 : 24;
    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, _v1.x, posLambda, rawDt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, _v1.y, posYLambda, rawDt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, _v1.z, posLambda, rawDt);

    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, _v2.x, 22, rawDt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, _v2.y, 22, rawDt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, _v2.z, 22, rawDt);

    this.camShake = THREE.MathUtils.damp(this.camShake, 0, 12, rawDt);
    const sx = (Math.random() - 0.5) * this.camShake + (nosBoost ? (Math.random() - 0.5) * 0.045 : 0);
    const sy = (Math.random() - 0.5) * this.camShake + (nosBoost ? (Math.random() - 0.5) * 0.045 : 0);

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(this.camera.position.x, 0, this.camera.position.z);
    }
    if (absLook < 0.25) {
      this.camera.rotation.z += THREE.MathUtils.clamp(
        -this.steerInputSmooth * speedRatio * 0.028 - p.lateralSpeed * 0.004,
        -0.045,
        0.045,
      );
    }

    const targetFov = 64 + speedRatio * 15 + (nosBoost ? 11.5 : 0) + (this.isSpeedbreaker ? -7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, rawDt);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateSpeedStreaks(dt: number, nosActive: boolean) {
    if (!this.player) return;
    const p = this.player;
    const speedKmh = Math.abs(p.forwardSpeed) * 3.6;
    const shouldEmit = speedKmh > 130 || nosActive;

    if (shouldEmit) {
      this.streakSpawnAccum += dt * (nosActive ? 92 : (speedKmh - 115) * 0.25);
      const fwdX = -Math.sin(p.heading);
      const fwdZ = -Math.cos(p.heading);
      const rightX = Math.cos(p.heading);
      const rightZ = -Math.sin(p.heading);

      while (this.streakSpawnAccum >= 1) {
        this.streakSpawnAccum -= 1;
        for (let i = 0; i < this.speedStreakCount; i++) {
          const st = this.speedStreaks[i];
          if (!st.active) {
            const side = (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random() * 4.4);
            const ahead = 14 + Math.random() * 20;
            const height = 0.55 + Math.random() * 2.2;
            st.active = true;
            st.pos.set(
              p.pos.x + fwdX * ahead + rightX * side,
              p.pos.y + height,
              p.pos.z + fwdZ * ahead + rightZ * side,
            );
            st.heading = p.heading;
            st.age = 0;
            st.maxAge = nosActive ? 0.19 : 0.26;
            break;
          }
        }
      }
    } else {
      this.streakSpawnAccum = 0;
    }

    let dirty = false;
    const streakColor = nosActive ? '#38BDF8' : '#FEF3C7';
    for (let i = 0; i < this.speedStreakCount; i++) {
      const st = this.speedStreaks[i];
      if (!st.active) continue;
      dirty = true;
      st.age += dt;
      if (st.age >= st.maxAge) {
        st.active = false;
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.speedStreakMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      const fwdX = -Math.sin(st.heading);
      const fwdZ = -Math.cos(st.heading);
      st.pos.x -= fwdX * 22 * dt;
      st.pos.z -= fwdZ * 22 * dt;
      const life = 1 - st.age / st.maxAge;
      _dummy.position.copy(st.pos);
      _dummy.rotation.set(0, st.heading, 0);
      _dummy.scale.set(1, 1, 0.7 + life * 0.8);
      _dummy.updateMatrix();
      this.speedStreakMesh.setMatrixAt(i, _dummy.matrix);
      this.speedStreakMesh.setColorAt(i, _color.set(streakColor));
    }
    if (dirty) {
      this.speedStreakMesh.instanceMatrix.needsUpdate = true;
      if (this.speedStreakMesh.instanceColor) this.speedStreakMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateRain(dt: number) {
    if (!this.rainMesh.visible || !this.player) return;
    const px = this.player.pos.x;
    const py = this.player.pos.y;
    const pz = this.player.pos.z;
    for (let i = 0; i < this.rainCount; i++) {
      const drop = this.rainDrops[i];
      drop.y -= drop.speed * dt;
      if (drop.y < -1) {
        drop.y = 22 + Math.random() * 4;
        drop.x = (Math.random() - 0.5) * 76;
        drop.z = (Math.random() - 0.5) * 76;
      }
      _dummy.position.set(px + drop.x, py + drop.y, pz + drop.z);
      _dummy.rotation.set(0.14, 0, 0.08);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private updateParticles(dt: number) {
    let dirty = false;
    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      const t = 1 - p.age / p.maxAge;
      _dummy.position.copy(p.pos);
      _dummy.scale.setScalar(p.size * t);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private emitTelemetry(totalLaps: number, force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastTelemetryEmit < 55) return;
    this.lastTelemetryEmit = now;
    if (!this.player || !this.track) return;

    const p = this.player;
    const speedKmh = Math.round(Math.abs(p.forwardSpeed) * 3.6);
    const { gear, rpm } = this.computeGearAndRpm(p.forwardSpeed, this.input.throttle);

    const isSpeedtrap = this.raceParams?.mode === 'speedtrap';
    this.sortedRacersScratch.length = 0;
    for (let i = 0; i < this.racers.length; i++) {
      if (!this.racers[i].knockedOut) this.sortedRacersScratch.push(this.racers[i]);
    }
    this.sortedRacersScratch.sort((a, b) => {
      if (isSpeedtrap && b.speedTrapTotalKmh !== a.speedTrapTotalKmh) {
        return b.speedTrapTotalKmh - a.speedTrapTotalKmh;
      }
      return b.totalProgress - a.totalProgress;
    });
    const activeRacers = this.sortedRacersScratch.length;
    const position = Math.max(1, this.sortedRacersScratch.findIndex((r) => r.isPlayer) + 1);
    const speedTrapLeaderKmh = this.sortedRacersScratch[0]?.speedTrapTotalKmh ?? p.speedTrapTotalKmh;

    let gapMeters = 0;
    if (activeRacers > 1) {
      if (position === 1) {
        gapMeters = Math.round((p.totalProgress - this.sortedRacersScratch[1].totalProgress) * this.track.totalLength);
      } else {
        gapMeters = Math.round((p.totalProgress - this.sortedRacersScratch[0].totalProgress) * this.track.totalLength);
      }
    }

    const m = this.raceParams?.mission;
    const isPursuit = this.raceParams?.mode === 'pursuit';
    const isFreeroam = this.raceParams?.mode === 'freeroam';
    const isTollbooth = this.raceParams?.mode === 'tollbooth';
    const liveMainCondition =
      isPursuit ? this.pursuitState === 'evaded' : isFreeroam ? true : isTollbooth ? this.tollboothCheckpoint >= this.tollboothTotal : position === 1;
    const missionChecklist = this.buildMissionChecklist(liveMainCondition);
    let activeMissionObjective: string | null = m?.objectiveSummary ?? null;
    if (m && (m.type === 'pursuit_milestone' || m.type === 'interceptor')) {
      const bGoal = m.targetBounty ?? 0;
      const kGoal = m.targetTakedowns ?? 0;
      const hGoal = m.minHeat ?? 1;
      const allMilestonesMet =
        this.sessionBounty >= bGoal && this.copsTakedowns >= kGoal && this.highestHeat >= hGoal;
      activeMissionObjective = allMilestonesMet
        ? 'All Milestones Met — Evade Rockport PD Now!'
        : m.objectiveSummary;
    }

    const cinematicPhase: CinematicPhase = this.outroActive
      ? 'outro'
      : this.introTimer > 0
        ? 'intro'
        : this.countdownTimer > 0
          ? 'countdown'
          : 'racing';

    const trackMeta = TRACKS.find((t) => t.id === this.raceParams?.trackId);
    const introLabel = m
      ? `BLACKLIST #${m.tierRank} // ${m.title.toUpperCase()}`
      : this.raceParams?.mode === 'blacklist' && this.raceParams.rival
        ? `RIVAL PINK-SLIP // #${this.raceParams.rival.rank} ${this.raceParams.rival.alias.toUpperCase()}`
        : `${trackMeta?.name.toUpperCase() ?? 'ROCKPORT'} // ${(this.raceParams?.mode ?? 'RACE').toUpperCase()}`;
    const introSubLabel = m
      ? m.objectiveSummary
      : this.raceParams?.rival
        ? this.raceParams.rival.quote
        : `${trackMeta?.district ?? 'Rockport'} · ${this.racers.length} Cars on Grid`;

    const sample = this.track.samples[p.trackIdx];
    const fwdX = -Math.sin(p.heading);
    const fwdZ = -Math.cos(p.heading);
    const dot = fwdX * sample.tangent.x + fwdZ * sample.tangent.z;
    const wrongWay = dot < -0.45 && p.forwardSpeed > 6;

    const blips: MinimapBlip[] = [];
    this.track.cooldownZones.forEach((z) => blips.push({ x: z.position.x, z: z.position.z, type: 'cooldown' }));
    this.track.pursuitBreakers.forEach((b) => {
      if (!b.triggered) blips.push({ x: b.position.x, z: b.position.z, type: 'breaker' });
    });
    this.racers.forEach((r) => {
      if (!r.isPlayer && !r.knockedOut) blips.push({ x: r.pos.x, z: r.pos.z, type: 'rival' });
    });
    this.cops.forEach((c) => {
      if (!c.wrecked) blips.push({ x: c.pos.x, z: c.pos.z, type: c.isRhino ? 'rhino' : 'cop' });
    });
    blips.push({ x: p.pos.x, z: p.pos.z, type: 'player', heading: p.heading });

    if (this.callout && now > this.callout.expiresAt) this.callout = null;
    if (this.radioDispatch && now > this.radioExpiresAt) this.radioDispatch = null;

    let upcomingShortcut: { label: string; side: 'left' | 'right'; distanceM: number } | null = null;
    if (p.activeShortcutId === null && this.track.shortcuts.length > 0 && cinematicPhase === 'racing') {
      const nSamples = this.track.samples.length;
      let bestDelta = 26;
      for (let i = 0; i < this.track.shortcuts.length; i++) {
        const sc = this.track.shortcuts[i];
        const pastOpen = (p.trackIdx - sc.entryCutStartIdx + nSamples) % nSamples;
        if (pastOpen <= 4) {
          upcomingShortcut = {
            label: sc.label,
            side: sc.side < 0 ? 'left' : 'right',
            distanceM: 0,
          };
          break;
        }
        const deltaToOpen = (sc.entryCutStartIdx - p.trackIdx + nSamples) % nSamples;
        if (deltaToOpen >= 1 && deltaToOpen < bestDelta) {
          bestDelta = deltaToOpen;
          upcomingShortcut = {
            label: sc.label,
            side: sc.side < 0 ? 'left' : 'right',
            distanceM: Math.max(5, Math.round(((deltaToOpen / nSamples) * this.track.totalLength) / 5) * 5),
          };
        }
      }
    }

    this.callbacks.onTelemetry({
      speedKmh,
      rpm,
      gear,
      nitrous: this.nitrous,
      speedbreaker: this.speedbreaker,
      isSpeedbreakerActive: this.isSpeedbreaker,
      isNitrousActive: (this.input.nitrous && this.nitrous > 1 && this.input.throttle) || this.driftBoostTimer > 0,
      isDrifting: this.isDrifting,
      isSlipstreaming: this.isSlipstreaming,
      spikedTimer: this.spikedTimer,
      position,
      totalRacers: this.racers.length,
      activeRacers,
      gapMeters,
      lap: Math.min(totalLaps, Math.max(1, p.lap)),
      totalLaps,
      lapTimeMs: Math.max(0, Math.round(this.raceElapsedMs - this.currentLapStartMs)),
      bestLapMs: Math.round(this.bestLapMs),
      totalRaceTimeMs: Math.round(this.raceElapsedMs),
      tollboothTimeLeftMs: Math.round(this.tollboothTimeLeftMs),
      tollboothCheckpoint: this.tollboothCheckpoint,
      tollboothTotal: this.tollboothTotal,
      speedTrapTotalKmh: p.speedTrapTotalKmh,
      speedTrapLeaderKmh,
      speedTrapTargetKmh: m?.targetSpeedtrapKmh ?? 0,
      speedTrapHits: p.speedTrapHits,
      driftTimeTotalSec: Number(this.driftTimeTotalSec.toFixed(1)),
      airTimeTotalSec: Number(this.airTimeTotalSec.toFixed(1)),
      smashablesHit: this.smashablesHit,
      activeMissionTitle: m?.title ?? null,
      activeMissionModeTag: m?.modeTag ?? null,
      activeMissionObjective,
      missionChecklist,
      musicTrackName: musicEngine.getCurrentTrackLabel(),
      progress: p.progress,
      wrongWay,
      cinematicPhase,
      introLabel,
      introSubLabel,
      outroOutcome: this.outroOutcome,
      countdown: this.introTimer > 0 ? -1 : this.countdownTimer > 0 ? Math.ceil(this.countdownTimer) : -1,
      heatLevel: this.heatLevel,
      pursuitState: this.pursuitState,
      evadeProgress: this.evadeProgress,
      bustProgress: this.bustProgress,
      activeCops: this.cops.filter((c) => !c.wrecked).length,
      copsTakedowns: this.copsTakedowns,
      sessionBounty: this.sessionBounty,
      nearMissCount: this.nearMissCount,
      nearMissCombo: this.nearMissCombo,
      speedTrapBestKmh: this.speedTrapBestKmh,
      shortcutsTaken: this.shortcutsTaken,
      upcomingShortcut,
      driftHoldSec: this.isDrifting ? Number(this.driftHoldSec.toFixed(1)) : 0,
      driftComboScore: this.isDrifting ? Math.round(this.driftHoldSec * 280) : 0,
      speedTrapFlash: this.speedTrapFlashTimer > 0,
      environment: this.activeEnvironment,
      patrolsEnabled: this.patrolsEnabled,
      radioDispatch: this.radioDispatch,
      callout: this.callout ? { text: this.callout.text, tone: this.callout.tone, id: this.callout.id } : null,
      minimapPath: this.track.minimapPath,
      minimapShortcuts: this.track.shortcuts.map((sc) => sc.minimapPoints),
      minimapBlips: blips,
      cameraMode: this.cameraMode,
      fps: this.currentFps,
    });
  }

  private handleResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private resetInput() {
    this.input.throttle = false;
    this.input.brake = false;
    this.input.left = false;
    this.input.right = false;
    this.input.handbrake = false;
    this.input.nitrous = false;
    this.input.speedbreaker = false;
    this.lookLeft = false;
    this.lookRight = false;
    this.lookBack = false;
    this.lookYawOffset = 0;
  }

  private handleWindowBlur = () => {
    this.resetInput();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'race' || this.outroActive) return;
    if (
      e.code === 'Space' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      e.preventDefault();
    }
    soundEngine.init();
    if (this.introTimer > 0 && (e.code === 'Space' || e.key === 'Enter')) {
      this.skipIntro();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') this.input.throttle = true;
    if (k === 's' || e.key === 'ArrowDown') this.input.brake = true;
    if (this.aeLookEnabled) {
      if (e.key === 'ArrowLeft') this.input.left = true;
      if (e.key === 'ArrowRight') this.input.right = true;
      if (k === 'a') this.lookLeft = true;
      if (k === 'e') this.lookRight = true;
    } else {
      if (k === 'a' || e.key === 'ArrowLeft') this.input.left = true;
      if (k === 'd' || e.key === 'ArrowRight') this.input.right = true;
      if (k === 'q') this.lookLeft = true;
      if (k === 'e') this.lookRight = true;
    }
    if (e.code === 'Space') this.input.handbrake = true;
    if (e.key === 'Shift' || k === 'n') this.input.nitrous = true;
    if (k === 'x' || k === 'b') this.input.speedbreaker = true;
    if (k === 'l') this.lookBack = true;
    if (k === 'c' || k === 'v') {
      if (!e.repeat) this.cycleCameraMode();
    }
    if (k === 'm') {
      if (!e.repeat) this.skipMusicTrack();
    }
    if (k === 'r') {
      if (!e.repeat) this.resetPlayerToTrack();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') this.input.throttle = false;
    if (k === 's' || e.key === 'ArrowDown') this.input.brake = false;
    if (this.aeLookEnabled) {
      if (e.key === 'ArrowLeft') this.input.left = false;
      if (e.key === 'ArrowRight') this.input.right = false;
      if (k === 'a') this.lookLeft = false;
      if (k === 'e') this.lookRight = false;
    } else {
      if (k === 'a' || e.key === 'ArrowLeft') this.input.left = false;
      if (k === 'd' || e.key === 'ArrowRight') this.input.right = false;
      if (k === 'q') this.lookLeft = false;
      if (k === 'e') this.lookRight = false;
    }
    if (e.code === 'Space') this.input.handbrake = false;
    if (e.key === 'Shift' || k === 'n') this.input.nitrous = false;
    if (k === 'x' || k === 'b') this.input.speedbreaker = false;
    if (k === 'l') this.lookBack = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.mode === 'garage') {
      this.garageDragActive = true;
      this.garageLastPointerX = e.clientX;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.mode === 'garage' && this.garageDragActive) {
      const dx = e.clientX - this.garageLastPointerX;
      this.garageLastPointerX = e.clientX;
      this.garageOrbitAngle -= dx * 0.008;
    }
  };

  private handlePointerUp = () => {
    this.garageDragActive = false;
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    soundEngine.stopRaceLoops();
    musicEngine.stop();

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.clearRaceEntities();
    if (this.garageCar) this.garageCar.dispose();
    if (this.garageShowroom) this.garageShowroom.dispose();
    if (this.track) this.track.dispose();
    this.shadowTexture.dispose();
    if (this.heliGroup) {
      this.heliGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material.dispose();
        }
      });
    }
    this.spikeGeo.dispose();
    this.spikeMat.dispose();
    if (this.skyDomeMesh) {
      this.skyDomeMesh.geometry.dispose();
      const sMat = this.skyDomeMesh.material as THREE.MeshBasicMaterial;
      sMat.dispose();
    }
    if (this.skyTex) this.skyTex.dispose();
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.skidMesh.geometry.dispose();
    (this.skidMesh.material as THREE.Material).dispose();
    this.speedStreakMesh.geometry.dispose();
    (this.speedStreakMesh.material as THREE.Material).dispose();
    Object.values(this.raceEnvMaps).forEach((tex) => tex.dispose());
    this.garageEnvMap.dispose();
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.composerRt) {
      this.composerRt.dispose();
      this.composerRt = null;
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
