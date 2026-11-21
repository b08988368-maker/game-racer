import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import { BLACKLIST_RIVALS, CARS, computeEffectiveStats, TRACKS } from '../data/gameData';
import {
  BlacklistRival,
  CameraMode,
  CarSpec,
  EnvironmentId,
  GarageCarConfig,
  MinimapBlip,
  PursuitState,
  RaceMode,
  RaceResult,
  RaceTelemetry,
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
  flashPhase: number;
}

interface TrafficEntity {
  id: number;
  visual: CarVisualHandles;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  trackIdx: number;
  laneOffset: number;
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
}

export interface RacingEngineCallbacks {
  onTelemetry: (t: RaceTelemetry) => void;
  onRaceComplete: (result: RaceResult) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const ROAD_SURFACE_OFFSET = 0.044;

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: RacingEngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raceEnvMap: THREE.Texture;
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
  private heliBeam: THREE.Mesh | null = null;
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

  private raceParams: RaceStartParams | null = null;
  private racers: RacerEntity[] = [];
  private cops: CopEntity[] = [];
  private traffic: TrafficEntity[] = [];
  private player: RacerEntity | null = null;
  private cameraMode: CameraMode = 'chase_far';
  private lookBack = false;
  private camHeading = 0;
  private camPos = new THREE.Vector3(0, 4, 10);
  private camLook = new THREE.Vector3(0, 1, 0);
  private camShake = 0;

  private countdownTimer = 3.2;
  private lastCountdownInt = 4;
  private raceElapsedMs = 0;
  private currentLapStartMs = 0;
  private bestLapMs = 0;
  private nitrous = 100;
  private speedbreaker = 100;
  private isSpeedbreaker = false;
  private isDrifting = false;
  private driftHoldSec = 0;
  private driftBoostTimer = 0;
  private isSlipstreaming = false;
  private playerOnCurb = false;
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
  private speedStreakCount = 36;
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

    this.camera = new THREE.PerspectiveCamera(48, initW / initH, 0.3, 2600);

    // Custom Golden-Hour Dusk & Safe House PMREM Environment Maps (warm Most Wanted reflections, zero white studio washout)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.raceEnvMap = this.createGoldenHourEnvMap(pmrem);
    this.garageEnvMap = this.createGarageEnvMap(pmrem);
    pmrem.dispose();

    this.scene.environment = this.garageEnvMap;
    this.scene.environmentIntensity = 0.85;

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

    // Helicopter Spotlight Cone (Heat 4+)
    const beamGeo = new THREE.ConeGeometry(8.5, 48, 20, 1, true);
    beamGeo.translate(0, -24, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#FEF9C3',
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heliBeam = new THREE.Mesh(beamGeo, beamMat);
    this.heliBeam.position.set(0, 48, 0);
    this.heliBeam.visible = false;
    this.scene.add(this.heliBeam);

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
      this.renderer.compile(this.scene, this.camera);
    }

    this.clock.start();
    this.tick();
  }

  private createGoldenHourEnvMap(pmrem: THREE.PMREMGenerator): THREE.Texture {
    const envScene = new THREE.Scene();
    const domeGeo = new THREE.SphereGeometry(50, 24, 16);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#102036');
    grad.addColorStop(0.32, '#274263');
    grad.addColorStop(0.47, '#D9772B');
    grad.addColorStop(0.51, '#FBBF64');
    grad.addColorStop(0.58, '#473121');
    grad.addColorStop(1.0, '#14100C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    const sGrad = ctx.createRadialGradient(180, 62, 2, 180, 62, 32);
    sGrad.addColorStop(0, 'rgba(255, 248, 220, 1)');
    sGrad.addColorStop(0.35, 'rgba(253, 210, 120, 0.7)');
    sGrad.addColorStop(1, 'rgba(253, 210, 120, 0)');
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
    const skyGeo = new THREE.SphereGeometry(2100, 32, 20);
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
        fogDensity: 0.00054,
        hemiSky: '#94BCEB',
        hemiGround: '#3E2B1E',
        hemiInt: 0.9,
        sunColor: '#FFE0A6',
        sunInt: 2.45,
        rimColor: '#7DD3FC',
        rimInt: 0.65,
        envInt: 0.82,
        exposure: 1.12,
      },
      midnight_neon: {
        bg: '#090F1E',
        fog: '#090F1E',
        fogDensity: 0.00062,
        hemiSky: '#60A5FA',
        hemiGround: '#0F172A',
        hemiInt: 0.78,
        sunColor: '#93C5FD',
        sunInt: 1.45,
        rimColor: '#38BDF8',
        rimInt: 0.95,
        envInt: 0.92,
        exposure: 1.16,
      },
      overcast_rain: {
        bg: '#1A2430',
        fog: '#1A2430',
        fogDensity: 0.00072,
        hemiSky: '#94A3B8',
        hemiGround: '#1E293B',
        hemiInt: 0.96,
        sunColor: '#CBD5E1',
        sunInt: 1.6,
        rimColor: '#60A5FA',
        rimInt: 0.72,
        envInt: 0.94,
        exposure: 1.08,
      },
      noon_clear: {
        bg: '#6BA4DB',
        fog: '#89B8E6',
        fogDensity: 0.00038,
        hemiSky: '#BAE6FD',
        hemiGround: '#3F4E3A',
        hemiInt: 1.08,
        sunColor: '#FFFBEB',
        sunInt: 2.75,
        rimColor: '#E0F2FE',
        rimInt: 0.55,
        envInt: 0.82,
        exposure: 1.1,
      },
      dawn_mist: {
        bg: '#1A2929',
        fog: '#243836',
        fogDensity: 0.00074,
        hemiSky: '#99F6E4',
        hemiGround: '#1F2925',
        hemiInt: 0.95,
        sunColor: '#FDE68A',
        sunInt: 2.0,
        rimColor: '#6EE7B7',
        rimInt: 0.68,
        envInt: 0.84,
        exposure: 1.12,
      },
      crimson_foundry: {
        bg: '#261317',
        fog: '#2B151A',
        fogDensity: 0.00066,
        hemiSky: '#FDA4AF',
        hemiGround: '#241415',
        hemiInt: 0.86,
        sunColor: '#FDBA74',
        sunInt: 2.25,
        rimColor: '#FB7185',
        rimInt: 0.75,
        envInt: 0.86,
        exposure: 1.14,
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
    soundEngine.stopRaceLoops();
    if (this.heliBeam) this.heliBeam.visible = false;
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

    this.scene.environment = this.raceEnvMap;

    const trackMeta = TRACKS.find((t) => t.id === params.trackId);
    const resolvedEnv: Exclude<EnvironmentId, 'auto'> =
      params.environment && params.environment !== 'auto'
        ? params.environment
        : params.mode === 'blacklist' && params.rival
          ? params.rival.environment
          : (trackMeta?.defaultEnv ?? 'golden_dusk');
    this.applyRaceEnvironment(resolvedEnv);
    this.patrolsEnabled =
      params.mode === 'pursuit' || params.mode === 'freeroam' ? true : (params.patrolsEnabled ?? true);
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
    this.track = buildTrack(params.trackId, this.maxAnisotropy, resolvedEnv);
    this.scene.add(this.track.group);

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
    this.driftBoostTimer = 0;
    this.isSlipstreaming = false;
    this.playerOnCurb = false;
    this.lastPlayerGear = 0;
    this.backfireTimer = -0.5;
    this.tollboothTimeLeftMs = params.mode === 'tollbooth' ? 36000 : 0;
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
    this.nextRoadblockCooldown = 12;
    this.copSpawnTimer = 3.2;
    this.radioDispatch = null;
    this.perfFrameAccumMs = 0;
    this.perfFrameSamples = 0;

    soundEngine.setCarStyle(params.playerSpec.bodyStyle);

    // Highlight active tollbooth gates in tollbooth mode
    this.updateTollboothBeacons();

    if (params.mode === 'pursuit') {
      this.pursuitState = 'pursuit';
      this.heatLevel = 1;
      this.highestHeat = 1;
      this.pushCallout('HEAT LEVEL 1 — OUTRUN ROCKPORT PD', 'red');
      this.pushRadio('Dispatch: All units, suspect sighted on highway. Box them in.');
    } else if (params.mode === 'freeroam') {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      this.pushCallout('FREE ROAM — HIT RAMPS, SPEED TRAPS OR PROVOKE PD', 'amber');
    } else if (params.mode === 'tollbooth') {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      this.pushCallout('TOLLBOOTH TRIAL — CLEAR ALL 8 GATES BEFORE TIME EXPIRES', 'cyan');
    } else {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      if (params.mode === 'blacklist' && params.rival) {
        this.pushCallout(`BLACKLIST #${params.rival.rank} DUEL VS ${params.rival.alias}`, 'amber');
        this.pushRadio(`${params.rival.alias}: "${params.rival.quote}"`);
      } else if (params.mode === 'sprint') {
        this.pushCallout('ROCKPORT 1-LAP SPRINT — BEAT THE PACK', 'amber');
      } else if (params.mode === 'knockout') {
        this.pushCallout('LAP KNOCKOUT — LAST PLACE ELIMINATED EACH LAP', 'red');
      } else {
        this.pushCallout('ROCKPORT CIRCUIT — 3 LAPS', 'amber');
      }
    }

    const totalLaps = this.getTotalLaps();
    const startSampleIdx = this.track.samples.length - 8;
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
    const playerStartPos = gridStart.point.clone().addScaledVector(gridStart.right, -3.1);
    playerStartPos.y += ROAD_SURFACE_OFFSET - 3.1 * Math.sin(gridStart.bankAngle);
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
      shortcutPassCooldown: 0,
      trackIdx: startSampleIdx,
      progress: gridStart.progress,
      lap: 0,
      totalProgress: gridStart.progress - 1,
      laneTarget: -3.1,
      aiSkill: 1,
      finished: false,
      knockedOut: false,
      finishTimeMs: 0,
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
      const rPos = gridStart.point.clone().addScaledVector(gridStart.right, 3.1);
      rPos.y += ROAD_SURFACE_OFFSET + 3.1 * Math.sin(gridStart.bankAngle);
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
        shortcutPassCooldown: 0,
        trackIdx: startSampleIdx,
        progress: gridStart.progress,
        lap: 0,
        totalProgress: gridStart.progress - 1 + 0.001,
        laneTarget: 3.1,
        aiSkill: params.rival.aiSkill,
        finished: false,
        knockedOut: false,
        finishTimeMs: 0,
      });
    } else if (params.mode === 'circuit' || params.mode === 'sprint' || params.mode === 'knockout') {
      const aiPool = BLACKLIST_RIVALS.slice(0, 3);
      const offsets = [
        { idx: this.track.samples.length - 8, lane: 3.1 },
        { idx: this.track.samples.length - 12, lane: -3.1 },
        { idx: this.track.samples.length - 12, lane: 3.1 },
      ];
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
          shortcutPassCooldown: 0,
          trackIdx: offsets[i].idx,
          progress: s.progress,
          lap: 0,
          totalProgress: s.progress - 1,
          laneTarget: offsets[i].lane,
          aiSkill: 0.78 + i * 0.04,
          finished: false,
          knockedOut: false,
          finishTimeMs: 0,
        });
      });
    }

    const trafficCount = params.mode === 'freeroam' ? 18 : params.mode === 'pursuit' ? 12 : 8;
    this.spawnCivilianTraffic(trafficCount);

    if (params.mode === 'pursuit') {
      this.spawnPoliceCruiser(this.track.samples.length - 12, -3.1, false, false);
      this.spawnPoliceCruiser(this.track.samples.length - 16, 3.1, false, false);
    }

    this.camPos.copy(playerStartPos).addScaledVector(gridStart.tangent, -7.2).add(new THREE.Vector3(0, 2.3, 0));
    this.camLook.copy(playerStartPos).addScaledVector(gridStart.tangent, 14);
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
        nearMissCooldown: 0,
        hitCooldown: 0,
      });
    }
  }

  private spawnPoliceCruiser(trackIdx: number, laneOffset: number, isRoadblock: boolean, isRhino: boolean, isHeadOn = false) {
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
    const clampedLat = THREE.MathUtils.clamp(laneOffset, -10.2, 10.2);
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
      speed: isRoadblock ? 0 : isHeadOn ? 46 : 32,
      trackIdx: idx,
      wrecked: false,
      wreckTimer: 0,
      isRoadblock,
      isRhino,
      isHeadOn,
      flashPhase: Math.random() * 6,
    });
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
    if (paused) {
      this.resetInput();
      soundEngine.stopRaceLoops();
    }
  }

  public finishFreeroamEarly() {
    if (this.mode === 'race' && this.raceParams?.mode === 'freeroam') {
      this.completeRace(false);
    }
  }

  public cycleCameraMode() {
    const order: CameraMode[] = ['chase_far', 'chase_close', 'hood'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.pushCallout(
      this.cameraMode === 'chase_far'
        ? 'CAMERA: CHASE FAR'
        : this.cameraMode === 'chase_close'
          ? 'CAMERA: CHASE CLOSE'
          : 'CAMERA: HOOD CAM',
      'cyan',
    );
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

    if (!this.isSoftwareGl && this.mode === 'race' && !this.paused && rawDelta > 0) {
      this.perfFrameAccumMs += rawDelta * 1000;
      this.perfFrameSamples++;
      if (this.perfFrameSamples >= 45) {
        const avgMs = this.perfFrameAccumMs / this.perfFrameSamples;
        this.perfFrameAccumMs = 0;
        this.perfFrameSamples = 0;
        if (avgMs > 18.5) {
          if (this.currentPixelRatio > 1.0) {
            this.currentPixelRatio = Math.max(1.0, Number((this.currentPixelRatio - 0.25).toFixed(2)));
            this.renderer.setPixelRatio(this.currentPixelRatio);
          } else if (this.renderer.shadowMap.enabled) {
            this.renderer.shadowMap.enabled = false;
            this.sunLight.castShadow = false;
          }
        }
      }
    }

    if (this.mode === 'garage') {
      this.updateGarage(rawDelta);
    } else if (this.mode === 'race' && !this.paused && this.player && this.track) {
      this.updateRace(rawDelta);
    }

    this.renderer.render(this.scene, this.camera);

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
    if (!this.garageDragActive) {
      this.garageOrbitAngle += dt * 0.3;
    }
    const radius = 6.2;
    this.camera.position.set(Math.sin(this.garageOrbitAngle) * radius, 1.95, Math.cos(this.garageOrbitAngle) * radius);
    this.camera.lookAt(0, 0.72, 0);
  }

  private updateRace(rawDt: number) {
    if (!this.player || !this.track || !this.raceParams) return;

    if (this.countdownTimer > 0) {
      this.countdownTimer -= rawDt;
      const cInt = Math.ceil(this.countdownTimer);
      if (cInt < this.lastCountdownInt && cInt >= 1 && cInt <= 3) {
        this.lastCountdownInt = cInt;
        soundEngine.triggerBeep(false);
      }
      if (this.countdownTimer <= 0) {
        soundEngine.triggerBeep(true);
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
      if (!r.isPlayer && !r.knockedOut) this.updateAiRacer(r, dt);
    }
    this.updateCivilianTraffic(dt);
    this.resolveCarCollisions();
    this.updateTrackInteractions(dt);
    this.updatePolicePursuit(dt, rawDt);

    if (this.heliBeam) {
      if (this.pursuitState === 'pursuit' && this.heatLevel >= 4) {
        this.heliBeam.visible = true;
        const tNow = performance.now() * 0.0022;
        this.heliBeam.position.set(
          this.player.pos.x + Math.sin(tNow) * 12,
          this.player.pos.y + 46,
          this.player.pos.z + Math.cos(tNow) * 12,
        );
        this.heliBeam.rotation.z = Math.sin(tNow * 1.4) * 0.22;
        this.heliBeam.rotation.x = Math.cos(tNow * 1.1) * 0.22;
      } else {
        this.heliBeam.visible = false;
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

  private getTotalLaps(): number {
    if (!this.raceParams) return 3;
    if (this.raceParams.mode === 'pursuit' || this.raceParams.mode === 'freeroam') return 99;
    if (this.raceParams.mode === 'tollbooth') return 2;
    if (this.raceParams.mode === 'sprint') return 1;
    if (this.raceParams.mode === 'knockout') return 3;
    if (this.raceParams.mode === 'blacklist' && this.raceParams.rival) return this.raceParams.rival.laps;
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

    const maxForwardMs = nosActive
      ? baseMaxMs * 1.18
      : this.driftBoostTimer > 0
        ? baseMaxMs * 1.1
        : drafting
          ? baseMaxMs * 1.06
          : baseMaxMs;

    const launchAccel = 2.4 + (stats.accel / 100) * 8.0;
    const speedNorm = Math.min(1.18, Math.max(0, p.forwardSpeed) / baseMaxMs);
    const torqueCurve = Math.max(0.45, 1.0 - 0.38 * Math.min(1, speedNorm));
    const driveAccel =
      launchAccel *
      torqueCurve *
      (nosActive ? 1.44 : this.driftBoostTimer > 0 ? 1.28 : 1.0) *
      (drafting ? 1.1 : 1.0);
    const aeroCoeff = (launchAccel * 0.62) / (baseMaxMs * baseMaxMs);
    const rollingDrag = 0.45;
    const currentDrag =
      aeroCoeff * p.forwardSpeed * Math.abs(p.forwardSpeed) + rollingDrag * Math.sign(p.forwardSpeed);

    if (boostFlare) {
      if (nosActive) {
        this.nitrous = Math.max(0, this.nitrous - rawDt * (22 - cfg.nitrousLevel * 2.2));
      }
      p.visual.nosFlames.forEach((f) => {
        f.visible = true;
        f.scale.set(1.1, 1.1, 0.8 + Math.random() * 0.65);
      });
      const sinH = Math.sin(p.heading);
      const cosH = Math.cos(p.heading);
      _v1.set(p.pos.x + sinH * 2.4, p.pos.y + 0.35, p.pos.z + cosH * 2.4);
      _v2.set(sinH * 9 + (Math.random() - 0.5) * 1.6, 0.4, cosH * 9 + (Math.random() - 0.5) * 1.6);
      this.spawnParticle(_v1, _v2, nosActive ? '#38BDF8' : '#F59E0B', 0.65, 0.25);
    } else {
      p.visual.nosFlames.forEach((f) => (f.visible = false));
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

    const steerInput = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const speedTaper = 1.0 - Math.min(0.54, Math.abs(p.forwardSpeed) / 145);
    const targetSteer = steerInput * 0.48 * speedTaper;
    p.steerAngle = THREE.MathUtils.damp(p.steerAngle, targetSteer, 14, rawDt);

    const speedRatio = Math.min(1, Math.abs(p.forwardSpeed) / 10);
    const highSpeedTurnDamp = 1.0 - Math.min(0.32, Math.abs(p.forwardSpeed) / 120);
    const handlingFactor = 1.82 + (stats.handling / 100) * 1.15;
    const breakerBoost = this.isSpeedbreaker ? 1.55 : 1.0;
    const brakeDriftTap = !airborne && this.input.brake && Math.abs(steerInput) > 0.1 && Math.abs(p.forwardSpeed) > 26;
    const handbrakeTurn = this.input.handbrake ? 1.38 : brakeDriftTap ? 1.24 : 1.0;
    const turnDir = p.forwardSpeed >= -0.2 ? 1 : -1;
    const gripScale = airborne ? 0.25 : 1.0;

    const angularVel =
      p.steerAngle * speedRatio * handlingFactor * highSpeedTurnDamp * breakerBoost * handbrakeTurn * turnDir * gripScale;
    p.heading += angularVel * dt;

    const counterSteering = steerInput * p.lateralSpeed < -0.15;
    const baseGrip = this.input.handbrake
      ? 4.4
      : brakeDriftTap
        ? 6.2
        : (14.5 + (stats.handling / 100) * 3.8) * (Math.abs(steerInput) < 0.1 ? 1.35 : 1.0);
    const driftGrip = baseGrip * (counterSteering ? 1.45 : 1.0);
    const lateralInject = this.input.handbrake ? 0.36 : brakeDriftTap ? 0.26 : 0.14;
    if (!airborne) {
      p.lateralSpeed += angularVel * p.forwardSpeed * lateralInject * dt;
      p.lateralSpeed = THREE.MathUtils.damp(p.lateralSpeed, 0, driftGrip, dt);
    }

    const driftSlip = airborne ? 0 : Math.min(1, Math.abs(p.lateralSpeed) / 8.2);
    const wasDrifting = this.isDrifting;
    this.isDrifting = !airborne && driftSlip > 0.24 && Math.abs(p.forwardSpeed) > 14;

    if (this.isDrifting) {
      this.driftHoldSec += rawDt;
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
        this.pushCallout('DRIFT EXIT BOOST!', 'amber');
      }
      this.driftHoldSec = 0;
    }

    const fwdX = -Math.sin(p.heading);
    const fwdZ = -Math.cos(p.heading);
    const rightX = Math.cos(p.heading);
    const rightZ = -Math.sin(p.heading);

    p.pos.x += (fwdX * p.forwardSpeed + rightX * p.lateralSpeed) * dt;
    p.pos.z += (fwdZ * p.forwardSpeed + rightZ * p.lateralSpeed) * dt;

    this.constrainToTrackAndUpdateLap(p, dt, true);

    const airPitch = p.airHeight > 0.1 ? THREE.MathUtils.clamp(p.verticalVel * 0.018, -0.18, 0.24) : 0;
    const targetPitch =
      (this.input.brake && p.forwardSpeed > 2 ? -0.036 : this.input.throttle ? 0.022 : 0) * (nosActive ? 1.35 : 1) +
      airPitch;
    const targetRoll = -steerInput * Math.min(1, Math.abs(p.forwardSpeed) / 28) * 0.052;
    const visualSlipYaw = airborne
      ? 0
      : THREE.MathUtils.clamp((p.lateralSpeed / Math.max(12, Math.abs(p.forwardSpeed))) * 0.48, -0.24, 0.24);
    p.pitch = THREE.MathUtils.damp(p.pitch, targetPitch, 10, rawDt);
    p.roll = THREE.MathUtils.damp(p.roll, targetRoll, 10, rawDt);

    p.visual.root.position.copy(p.pos);
    p.visual.root.rotation.set(p.slopePitch, p.heading, -p.bankRoll, 'YXZ');
    p.visual.bodyGroup.rotation.x = p.pitch;
    p.visual.bodyGroup.rotation.y = THREE.MathUtils.damp(p.visual.bodyGroup.rotation.y, visualSlipYaw, 10, rawDt);
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
      timeScale: this.isSpeedbreaker ? 0.42 : 1.0,
    });
  }

  private updateAiRacer(ai: RacerEntity, dt: number) {
    if (!this.track || !this.player || !this.raceParams) return;
    const samples = this.track.samples;

    // Dynamic overtaking: dodge slower traffic ahead across 4 highway lanes
    const aiFwdX = -Math.sin(ai.heading);
    const aiFwdZ = -Math.cos(ai.heading);
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i];
      const tdx = tr.pos.x - ai.pos.x;
      const tdz = tr.pos.z - ai.pos.z;
      const fwdDist = tdx * aiFwdX + tdz * aiFwdZ;
      if (fwdDist > 3 && fwdDist < 34) {
        if (Math.abs(tr.laneOffset - ai.laneTarget) < 3.4) {
          ai.laneTarget = tr.laneOffset >= 0 ? -4.2 : 4.2;
          break;
        }
      }
    }

    const targetSampleIdx = (ai.trackIdx + 10) % samples.length;
    const targetSample = samples[targetSampleIdx];

    _v1.copy(targetSample.point).addScaledVector(targetSample.right, ai.laneTarget);
    const dx = _v1.x - ai.pos.x;
    const dz = _v1.z - ai.pos.z;
    const desiredHeading = Math.atan2(-dx, -dz);

    let angleDiff = desiredHeading - ai.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    ai.heading += THREE.MathUtils.clamp(angleDiff * 4.5, -2.6, 2.6) * dt;

    const playerStats = computeEffectiveStats(this.player.spec, this.raceParams.playerConfig);
    const basePaceKmh =
      this.raceParams.mode === 'blacklist'
        ? Math.max(ai.spec.baseTopSpeedKmh, playerStats.topSpeedKmh * 0.94)
        : ai.spec.baseTopSpeedKmh;

    const gap = this.player.totalProgress - ai.totalProgress;
    const rubberBand = THREE.MathUtils.clamp(1 + gap * 0.85, 0.90, 1.10);
    const cornerSlowdown = 1 - Math.min(0.32, Math.abs(angleDiff) * 0.42);
    const copDrag = ai.copSlowdownTimer > 0 ? 0.68 : 1.0;
    const targetSpeed = (basePaceKmh / 3.6) * ai.aiSkill * rubberBand * cornerSlowdown * copDrag;

    const aiBoosting = gap > 0.04 && Math.abs(angleDiff) < 0.14 && ai.forwardSpeed > 28;
    ai.visual.nosFlames.forEach((f) => {
      f.visible = aiBoosting;
      if (aiBoosting) {
        f.scale.set(1.0, 1.0, 0.75 + Math.random() * 0.55);
      }
    });

    const aiMaxAccel = 6.2 + ai.aiSkill * 3.2;
    if (ai.forwardSpeed < targetSpeed) {
      const speedNorm = Math.min(1, Math.max(0, ai.forwardSpeed) / Math.max(10, targetSpeed));
      const accelNow = aiMaxAccel * (1 - 0.55 * speedNorm);
      ai.forwardSpeed = Math.min(targetSpeed, ai.forwardSpeed + accelNow * dt);
    } else {
      ai.forwardSpeed = Math.max(targetSpeed, ai.forwardSpeed - 22 * dt);
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

      t.pos.x += -Math.sin(t.heading) * t.speed * dt;
      t.pos.z += -Math.cos(t.heading) * t.speed * dt;

      const info = this.track.getClosestTrackInfo(t.pos.x, t.pos.z, t.trackIdx);
      t.trackIdx = info.sample.index;
      t.pos.y = info.elevationY + ROAD_SURFACE_OFFSET;

      t.visual.root.position.copy(t.pos);
      t.visual.root.rotation.set(info.slopePitch, t.heading, -info.bankAngle, 'YXZ');
      const spin = (t.speed * dt) / 0.35;
      t.visual.wheelSpinners.forEach((w) => (w.rotation.x -= spin));

      const dist = t.pos.distanceTo(this.player.pos);
      const playerKmh = Math.abs(this.player.forwardSpeed) * 3.6;

      if (dist < 2.5 && this.player.airHeight < 1.2 && t.hitCooldown <= 0) {
        t.hitCooldown = 1.25;
        this.camShake = Math.max(this.camShake, 0.28);
        soundEngine.triggerImpact(0.65);
        this.player.forwardSpeed *= 0.78;
        const nx = (this.player.pos.x - t.pos.x) / Math.max(0.1, dist);
        const nz = (this.player.pos.z - t.pos.z) / Math.max(0.1, dist);
        this.player.pos.x += nx * 0.95;
        this.player.pos.z += nz * 0.95;
        t.pos.x -= nx * 1.3;
        t.pos.z -= nz * 1.3;
        t.laneOffset = THREE.MathUtils.clamp(t.laneOffset + (t.laneOffset >= 0 ? -2.2 : 2.2), -8.0, 8.0);
        for (let k = 0; k < 5; k++) {
          _v2.set((Math.random() - 0.5) * 10, 3 + Math.random() * 3, (Math.random() - 0.5) * 10);
          this.spawnParticle(t.pos, _v2, '#F59E0B', 0.55, 0.35);
        }
      } else if (dist >= 2.5 && dist < 5.6 && playerKmh > 120 && t.nearMissCooldown <= 0) {
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
    r.trackIdx = info.sample.index;
    r.progress = info.sample.progress;

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
            r.verticalVel = r.forwardSpeed * Math.sin(ramp.launchAngle) * 1.18 + 2.4;
            if (isPlayer) {
              soundEngine.triggerBeep(false);
            }
          }
        }
      }
    }

    // Vertical airtime gravity integration
    if (r.airHeight > 0 || r.verticalVel > 0) {
      r.verticalVel -= 19.5 * dt;
      r.airHeight += r.verticalVel * dt;
      r.airTimeTotal += dt;
      if (r.airHeight <= 0) {
        if (isPlayer && r.airTimeTotal > 0.45) {
          soundEngine.triggerLandingThump();
          this.camShake = Math.max(this.camShake, 0.25);
          const airBonus = 500 + Math.round(r.airTimeTotal * 900);
          this.sessionBounty += airBonus;
          this.nitrous = Math.min(100, this.nitrous + 15);
          this.pushCallout(`AIR TIME ${r.airTimeTotal.toFixed(1)}S · +$${airBonus.toLocaleString()} BOUNTY`, 'cyan');
          for (let k = 0; k < 6; k++) {
            _v2.set((Math.random() - 0.5) * 8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 8);
            this.spawnParticle(r.pos, _v2, '#F59E0B', 0.65, 0.35);
          }
        }
        r.airHeight = 0;
        r.verticalVel = 0;
        r.airTimeTotal = 0;
      }
    }

    const scHit = this.track.queryShortcut(r.pos.x, r.pos.z);
    const onShortcutRibbon = Boolean(
      scHit &&
        scHit.distanceSq < (scHit.shortcut.halfWidth + 2.6) * (scHit.shortcut.halfWidth + 2.6) &&
        (r.activeShortcutId === scHit.shortcut.id || Math.abs(info.lateralOffset) > this.track.roadHalfWidth - 1.2),
    );

    if (onShortcutRibbon && scHit) {
      r.activeShortcutId = scHit.shortcut.id;
      groundHeight = scHit.elevationY + ROAD_SURFACE_OFFSET;
      r.pos.y = groundHeight + Math.max(0, r.airHeight);
      r.slopePitch = THREE.MathUtils.damp(r.slopePitch, 0, 10, dt);
      r.bankRoll = THREE.MathUtils.damp(r.bankRoll, 0, 10, dt);

      if (isPlayer) {
        this.playerOnCurb = false;
      }

      // Clamp to shortcut concrete corridor edges
      const maxScLat = scHit.shortcut.halfWidth - 1.05;
      if (Math.abs(scHit.lateral) > maxScLat) {
        const sSign = Math.sign(scHit.lateral);
        const sEx = Math.abs(scHit.lateral) - maxScLat;
        const scRightX = -scHit.tangent.z;
        const scRightZ = scHit.tangent.x;
        r.pos.x -= scRightX * sSign * (sEx + 0.08);
        r.pos.z -= scRightZ * sSign * (sEx + 0.08);
        const scHead = Math.atan2(-scHit.tangent.x, -scHit.tangent.z);
        let hDiff = scHead - r.heading;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        r.heading += hDiff * Math.min(1, dt * 10);
        r.forwardSpeed *= 0.99;
      }

      // Check exit back onto main track near end of shortcut
      if (scHit.ptIndex >= scHit.shortcut.points.length - 4) {
        const endSample = this.track.samples[scHit.shortcut.endIdx];
        if (endSample) {
          r.trackIdx = endSample.index;
          r.progress = endSample.progress;
          r.totalProgress = r.lap - 1 + r.progress;
        }
        if (isPlayer && r.shortcutPassCooldown <= 0) {
          r.shortcutPassCooldown = 8.0;
          this.shortcutsTaken++;
          this.nitrous = Math.min(100, this.nitrous + 18);
          this.sessionBounty += 1000;
          this.pushCallout(`SHORTCUT: ${scHit.shortcut.label.toUpperCase()}! +$1,000 · NOS +18%`, 'emerald');
          soundEngine.triggerBeep(true);
        }
        r.activeShortcutId = null;
      } else {
        const scFrac = scHit.ptIndex / Math.max(1, scHit.shortcut.points.length - 1);
        const startProg = this.track.samples[scHit.shortcut.startIdx]?.progress ?? prevProgress;
        const endProg = this.track.samples[scHit.shortcut.endIdx]?.progress ?? prevProgress;
        const spanProg = endProg >= startProg ? endProg - startProg : endProg + 1 - startProg;
        r.progress = (startProg + spanProg * scFrac) % 1;
        r.totalProgress = r.lap - 1 + r.progress;
      }
      return;
    }

    r.activeShortcutId = null;

    r.pos.y = groundHeight + Math.max(0, r.airHeight);
    r.slopePitch = THREE.MathUtils.damp(r.slopePitch, info.slopePitch, 10, dt);
    r.bankRoll = THREE.MathUtils.damp(r.bankRoll, info.bankAngle, 10, dt);

    if (isPlayer) {
      this.playerOnCurb = Math.abs(info.lateralOffset) > this.track.roadHalfWidth - 0.55;
    }

    // Tollbooth Checkpoint progression check
    if (isPlayer && this.raceParams?.mode === 'tollbooth' && this.tollboothCheckpoint < this.tollboothTotal) {
      const targetGate = this.track.tollbooths[this.tollboothCheckpoint % 4];
      if (r.pos.distanceToSquared(targetGate.position) < 16 * 16) {
        this.tollboothCheckpoint++;
        this.sessionBounty += 1200;
        this.nitrous = Math.min(100, this.nitrous + 25);
        soundEngine.triggerBeep(true);
        if (this.tollboothCheckpoint >= this.tollboothTotal) {
          this.completeRace(false);
          return;
        }
        this.tollboothTimeLeftMs += 26000;
        this.updateTollboothBeacons();
        this.pushCallout(
          `GATE ${this.tollboothCheckpoint}/${this.tollboothTotal} CLEARED · +26.0S · NOS +25%`,
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
          this.raceParams?.mode !== 'tollbooth' &&
          r.lap === totalLaps
        ) {
          this.pushCallout('FINAL LAP!', 'amber');
          soundEngine.triggerBeep(true);
        }
      }
    } else if (delta > 0.5) {
      r.lap = Math.max(0, r.lap - 1);
    }

    r.totalProgress = r.lap - 1 + r.progress;

    // Allow passing cleanly through open shortcut barrier cutouts
    const nSamples = this.track.samples.length;
    const latSign = info.lateralOffset >= 0 ? 1 : -1;
    const nearShortcutGate = this.track.shortcuts.some((sc) => {
      if (sc.side !== latSign) return false;
      const dStart = Math.min(
        Math.abs(r.trackIdx - sc.startIdx),
        nSamples - Math.abs(r.trackIdx - sc.startIdx),
      );
      const dEnd = Math.min(
        Math.abs(r.trackIdx - sc.endIdx),
        nSamples - Math.abs(r.trackIdx - sc.endIdx),
      );
      return dStart <= 5 || dEnd <= 5;
    });

    const maxLat = this.track.barrierHalfWidth - 1.15;
    if (!nearShortcutGate && Math.abs(info.lateralOffset) > maxLat) {
      const sign = Math.sign(info.lateralOffset);
      const excess = Math.abs(info.lateralOffset) - maxLat;
      r.pos.x -= info.sample.right.x * sign * (excess + 0.12);
      r.pos.z -= info.sample.right.z * sign * (excess + 0.12);

      const tangentHeading = Math.atan2(-info.sample.tangent.x, -info.sample.tangent.z);
      let hDiff = tangentHeading - r.heading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      r.heading += hDiff * Math.min(1, dt * 11);

      const wallScrub = Math.abs(hDiff) > 0.35 ? 0.94 : 0.992;
      r.forwardSpeed *= wallScrub;
      r.lateralSpeed = -sign * 1.4;

      if (isPlayer && Math.abs(r.forwardSpeed) > 15) {
        this.camShake = Math.max(this.camShake, 0.14);
        soundEngine.triggerImpact(0.32);
        _v1.set(r.pos.x, r.pos.y + 0.5, r.pos.z);
        _v2.set((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6);
        this.spawnParticle(_v1, _v2, '#F59E0B', 0.45, 0.3);
      }
    }
  }

  private resolveCarCollisions() {
    for (let i = 0; i < this.racers.length; i++) {
      const a = this.racers[i];
      if (a.knockedOut) continue;
      for (let j = i + 1; j < this.racers.length; j++) {
        const b = this.racers[j];
        if (b.knockedOut) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 2.35;
        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.5;
          a.pos.x -= nx * overlap;
          a.pos.z -= nz * overlap;
          b.pos.x += nx * overlap;
          b.pos.z += nz * overlap;

          if (a.isPlayer || b.isPlayer) {
            const playerCar = a.isPlayer ? a : b;
            const rivalCar = a.isPlayer ? b : a;
            this.camShake = Math.max(this.camShake, 0.22);
            soundEngine.triggerImpact(0.48);
            _v1.set((a.pos.x + b.pos.x) * 0.5, a.pos.y + 0.6, (a.pos.z + b.pos.z) * 0.5);
            _v2.set((Math.random() - 0.5) * 8, 4, (Math.random() - 0.5) * 8);
            this.spawnParticle(_v1, _v2, '#FBBF24', 0.5, 0.35);

            if (Math.abs(playerCar.forwardSpeed) * 3.6 > 110 && rivalCar.shuntCooldown <= 0) {
              rivalCar.shuntCooldown = 4.0;
              rivalCar.forwardSpeed *= 0.68;
              rivalCar.pos.x += (rivalCar === b ? nx : -nx) * 1.4;
              rivalCar.pos.z += (rivalCar === b ? nz : -nz) * 1.4;
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
    const speedKmh = Math.abs(p.forwardSpeed) * 3.6;

    // Smashable Water Barrels
    for (let i = 0; i < this.track.smashables.length; i++) {
      const sm = this.track.smashables[i];
      if (!sm.hit) {
        if (p.airHeight < 1.2 && p.pos.distanceToSquared(sm.pos) < 2.2 * 2.2 && Math.abs(p.forwardSpeed) > 10) {
          sm.hit = true;
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

    for (const trap of this.track.speedTraps) {
      const trapMat = trap.flashMesh.material as THREE.MeshStandardMaterial;
      if (trapMat.emissiveIntensity > 2.0) {
        trapMat.emissiveIntensity = Math.max(2.0, trapMat.emissiveIntensity - dt * 14);
      }
      if (trap.cooldownTimer > 0) {
        trap.cooldownTimer -= dt;
      } else if (p.pos.distanceToSquared(trap.position) < 16 * 16) {
        trap.cooldownTimer = 10;
        trapMat.emissiveIntensity = 9.0;
        const rounded = Math.round(speedKmh);
        if (rounded > this.speedTrapBestKmh) this.speedTrapBestKmh = rounded;
        const bonus = rounded >= trap.targetKmh ? 1500 : 500;
        this.sessionBounty += bonus;
        this.pushCallout(`SPEED TRAP ${rounded} KM/H · +$${bonus.toLocaleString()} BOUNTY`, 'cyan');
        soundEngine.triggerBeep(true);

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
          // Spawn cruiser rolling ahead on the highway instead of popping behind bumper
          this.spawnPoliceCruiser(p.trackIdx + 95, 3.2, false, false);
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
    if (this.pursuitState === 'none' || this.pursuitState === 'evaded' || this.pursuitState === 'busted') return;

    const p = this.player;
    const isPursuitFocused = this.raceParams.mode === 'pursuit' || this.raceParams.mode === 'freeroam';

    if (this.pursuitState === 'pursuit') {
      this.sessionBounty += Math.round(dt * 125 * this.heatLevel);
    }

    const targetHeat =
      this.sessionBounty > 45000
        ? 5
        : this.sessionBounty > 25000
          ? 4
          : this.sessionBounty > 12000
            ? 3
            : this.sessionBounty > 4500
              ? 2
              : 1;
    if (targetHeat > this.heatLevel) {
      this.heatLevel = targetHeat;
      this.highestHeat = Math.max(this.highestHeat, this.heatLevel);
      this.pushCallout(`HEAT LEVEL ${this.heatLevel} — REINFORCEMENTS INBOUND`, 'red');
      if (this.heatLevel === 3) {
        this.pushRadio('Dispatch: Heat 3! Rhino Heavy Enforcers rolling to intercept lead racers!');
      } else if (this.heatLevel === 4) {
        this.pushRadio('Chopper 2: Air support on station! Tracking all street racers.');
      } else {
        this.pushRadio(`Dispatch: Escalating to Heat ${this.heatLevel}. Roadblocks authorized ahead.`);
      }
      soundEngine.triggerBeep(true);
    }

    const desiredCops = isPursuitFocused ? Math.min(4, this.heatLevel + 1) : Math.min(2, this.heatLevel);
    const activeNormalCops = this.cops.filter((c) => !c.wrecked && !c.isRoadblock).length;
    this.copSpawnTimer -= dt;
    if (activeNormalCops < desiredCops && this.copSpawnTimer <= 0) {
      this.copSpawnTimer = 6.5;
      // Pick the lead active racer (player or AI rival) so reinforcements spawn naturally ahead on the highway
      const leadRacer = this.racers
        .filter((r) => !r.knockedOut && !r.finished)
        .sort((a, b) => b.totalProgress - a.totalProgress)[0] ?? p;
      const spawnRhino = this.heatLevel >= 3 && Math.random() > 0.5;
      if (spawnRhino) {
        this.spawnPoliceCruiser(leadRacer.trackIdx + 140, (Math.random() - 0.5) * 5.0, false, true, true);
        this.pushCallout('HEAVY RHINO ENFORCER AHEAD ON INTERCEPT!', 'red');
        this.pushRadio('Chopper 2: Heavy Rhino Enforcer charging down the highway!');
      } else {
        // Spawn ahead on the highway (+135 samples) so units roll into pursuit realistically instead of teleporting onto your bumper
        this.spawnPoliceCruiser(leadRacer.trackIdx + 135, (Math.random() - 0.5) * 7.0, false, false, false);
      }
    }

    if (isPursuitFocused && this.heatLevel >= 2) {
      this.nextRoadblockCooldown -= dt;
      if (this.nextRoadblockCooldown <= 0) {
        this.nextRoadblockCooldown = 22;
        const rbIdx = p.trackIdx + 115;
        this.spawnPoliceCruiser(rbIdx, -5.2, true, false);
        this.spawnPoliceCruiser(rbIdx, 5.2, true, false);
        this.pushCallout('POLICE ROADBLOCK AHEAD!', 'red');
        this.pushRadio('Unit 14: Roadblock established ahead on highway.');
      }
    }

    let closestCopDistToPlayer = Infinity;

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      cop.flashPhase += rawDt * 18;
      if (cop.visual.lightbarRed && cop.visual.lightbarBlue) {
        const alt = Math.sin(cop.flashPhase) > 0;
        cop.visual.lightbarRed.emissiveIntensity = alt ? 4.8 : 0.25;
        cop.visual.lightbarBlue.emissiveIntensity = alt ? 0.25 : 4.8;
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

      // Multi-target pursuit: each cruiser intercepts whichever active racer (player OR AI rival) is closest/speeding near it
      let target: RacerEntity = p;
      let targetDist = distToPlayer;
      if (!cop.isRoadblock) {
        let bestScore = distToPlayer;
        for (let r = 0; r < this.racers.length; r++) {
          const cand = this.racers[r];
          if (cand.knockedOut || cand.finished) continue;
          const d = cop.pos.distanceTo(cand.pos);
          // Slight preference for faster speeding lead cars or closer racers so cops pursue the whole pack fairly
          const score = cand.isPlayer ? d : d * 0.88;
          if (score < bestScore) {
            bestScore = score;
            target = cand;
            targetDist = d;
          }
        }
        if (cop.targetId !== target.id && !target.isPlayer && distToPlayer < 160) {
          this.pushRadio(`Dispatch: Unit engaging ${target.name} in the pack!`);
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
          const flankOffset = role === 1 ? -2.9 : role === 2 ? 2.9 : 0;
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
        cop.heading += THREE.MathUtils.clamp(diff * 4.0, -2.3, 2.3) * dt;

        // Realistic Heat-scaled cop speed caps (Heat 1: 225 km/h -> Heat 5: 297 km/h; never 400+ km/h rubber-band)
        const baseCopKmh = cop.isRhino
          ? 210 + this.heatLevel * 10
          : 225 + (this.heatLevel - 1) * 18;
        const cornerScale = 1 - Math.min(0.28, Math.abs(diff) * 0.38);
        const catchupScale = targetDist > 85 ? 1.05 : 1.0;
        const maxCopSpeed = (baseCopKmh / 3.6) * cornerScale * catchupScale;

        if (cop.speed < maxCopSpeed) {
          cop.speed = Math.min(maxCopSpeed, cop.speed + (9.5 + this.heatLevel * 1.1) * dt);
        } else {
          cop.speed = Math.max(maxCopSpeed, cop.speed - 20 * dt);
        }

        cop.pos.x += -Math.sin(cop.heading) * cop.speed * dt;
        cop.pos.z += -Math.cos(cop.heading) * cop.speed * dt;

        const cInfo = this.track.getClosestTrackInfo(cop.pos.x, cop.pos.z, cop.trackIdx);
        cop.pos.y = cInfo.elevationY + ROAD_SURFACE_OFFSET;
        const maxLat = this.track.barrierHalfWidth - 1.2;
        if (Math.abs(cInfo.lateralOffset) > maxLat) {
          const sign = Math.sign(cInfo.lateralOffset);
          const ex = Math.abs(cInfo.lateralOffset) - maxLat;
          cop.pos.x -= cInfo.sample.right.x * sign * ex;
          cop.pos.z -= cInfo.sample.right.z * sign * ex;
        }
        cop.visual.root.rotation.set(cInfo.slopePitch, cop.heading, -cInfo.bankAngle, 'YXZ');
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

      // Cop collision against AI rivals (cops physically PIT & slow AI racers too!)
      for (let r = 0; r < this.racers.length; r++) {
        const ai = this.racers[r];
        if (ai.isPlayer || ai.knockedOut || ai.finished) continue;
        const aiDist = cop.pos.distanceTo(ai.pos);
        if (aiDist < 2.6 && ai.copSlowdownTimer <= 0) {
          ai.copSlowdownTimer = 2.6;
          ai.forwardSpeed *= 0.62;
          const nx = (ai.pos.x - cop.pos.x) / Math.max(0.1, aiDist);
          const nz = (ai.pos.z - cop.pos.z) / Math.max(0.1, aiDist);
          ai.pos.x += nx * 1.1;
          ai.pos.z += nz * 1.1;
          cop.pos.x -= nx * 1.0;
          cop.pos.z -= nz * 1.0;
          if (Math.abs(ai.forwardSpeed) * 3.6 > 165) {
            cop.wrecked = true;
            cop.wreckTimer = 7;
          }
          if (distToPlayer < 110) {
            this.pushCallout(`POLICE RAMMED ${ai.name}!`, 'cyan');
          }
        }
      }

      // Cop collision against Player (fair takedown thresholds)
      if (!cop.wrecked && distToPlayer < (cop.isRhino ? 2.85 : 2.6) && p.airHeight < 1.2) {
        const relSpeedKmh = Math.abs(p.forwardSpeed - (cop.isRoadblock ? 0 : cop.speed * 0.5)) * 3.6;
        const nosRam = this.input.nitrous && this.nitrous > 1;
        this.camShake = Math.max(this.camShake, 0.34);
        soundEngine.triggerImpact(0.82);

        for (let s = 0; s < 6; s++) {
          _v2.set((Math.random() - 0.5) * 12, 3 + Math.random() * 4, (Math.random() - 0.5) * 12);
          this.spawnParticle(cop.pos, _v2, '#F59E0B', 0.55, 0.4);
        }

        const takedownThreshold = cop.isRhino ? 74 : 40;
        if (relSpeedKmh > takedownThreshold || nosRam || (cop.isRoadblock && Math.abs(p.forwardSpeed) * 3.6 > 80)) {
          cop.wrecked = true;
          cop.wreckTimer = 7;
          this.copsTakedowns++;
          const reward = cop.isRhino ? 4500 : cop.isRoadblock ? 3000 : 2500;
          this.sessionBounty += reward;
          this.pushCallout(
            `${cop.isRhino ? 'RHINO' : 'COP'} TAKEDOWN! +$${reward.toLocaleString()} BOUNTY`,
            'amber',
          );
          p.forwardSpeed *= cop.isRhino ? 0.78 : 0.89;
        } else {
          const nx = (p.pos.x - cop.pos.x) / Math.max(0.1, distToPlayer);
          const nz = (p.pos.z - cop.pos.z) / Math.max(0.1, distToPlayer);
          p.pos.x += nx * 1.1;
          p.pos.z += nz * 1.1;
          cop.pos.x -= nx * 1.2;
          cop.pos.z -= nz * 1.2;
          p.forwardSpeed *= cop.isRhino ? 0.6 : 0.74;
        }
      }

      cop.visual.root.position.copy(cop.pos);
      const cSpin = (cop.speed * dt) / 0.36;
      cop.visual.wheelSpinners.forEach((w) => (w.rotation.x -= cSpin));
    }

    if (closestCopDistToPlayer > 125) {
      if (this.pursuitState !== 'cooldown') {
        this.pursuitState = 'cooldown';
        this.pushCallout('COOLDOWN — HEAD FOR GREEN HIDING BAYS', 'emerald');
        this.pushRadio('Dispatch: Lost visual on suspect. Sweeping perimeter.');
      }
      const inCooldownZone = this.track.cooldownZones.some(
        (z) => p.pos.distanceToSquared(z.position) < z.radius * z.radius,
      );
      const evadeRate = inCooldownZone ? 44 : 18;
      this.evadeProgress = Math.min(100, this.evadeProgress + rawDt * evadeRate);
      this.bustProgress = Math.max(0, this.bustProgress - rawDt * 45);

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
      this.evadeProgress = Math.max(0, this.evadeProgress - rawDt * 26);

      const playerSpeedKmh = Math.abs(p.forwardSpeed) * 3.6;
      if (closestCopDistToPlayer < 8.5 && playerSpeedKmh < 10) {
        this.bustProgress = Math.min(100, this.bustProgress + rawDt * 22);
        if (this.bustProgress >= 100) {
          this.pursuitState = 'busted';
          this.completeRace(true);
        }
      } else {
        this.bustProgress = Math.max(0, this.bustProgress - rawDt * 38);
      }
    }
  }

  private completeRace(busted: boolean, knockedOut = false, tollboothExpired = false) {
    if (!this.raceParams || !this.player) return;
    soundEngine.stopRaceLoops();

    const activeList = this.racers.filter((r) => !r.knockedOut);
    const sorted = [...activeList].sort((a, b) => b.totalProgress - a.totalProgress);
    const pos = knockedOut ? activeList.length + 1 : Math.max(1, sorted.findIndex((r) => r.isPlayer) + 1);
    const isPursuit = this.raceParams.mode === 'pursuit';
    const isFreeroam = this.raceParams.mode === 'freeroam';
    const isTollbooth = this.raceParams.mode === 'tollbooth';

    const won =
      !busted &&
      !knockedOut &&
      !tollboothExpired &&
      (isPursuit ? this.pursuitState === 'evaded' : isFreeroam ? true : isTollbooth ? this.tollboothCheckpoint >= this.tollboothTotal : pos === 1);

    let cashEarned = 0;
    if (!busted) {
      if (knockedOut) {
        cashEarned = pos <= 3 ? 2500 : 1200;
      } else if (tollboothExpired) {
        cashEarned = this.tollboothCheckpoint * 900;
      } else if (isTollbooth) {
        cashEarned = 20000 + Math.round(this.tollboothTimeLeftMs * 0.2);
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
    }

    const bountyEarned = busted
      ? Math.round(this.sessionBounty * 0.25)
      : this.sessionBounty +
        (won && this.raceParams.rival
          ? this.raceParams.rival.bountyReward
          : won
            ? this.raceParams.mode === 'knockout' || this.raceParams.mode === 'tollbooth'
              ? 4000
              : 2500
            : 800);

    const rivalDefeated = won && this.raceParams.mode === 'blacklist' ? this.raceParams.rival : undefined;
    const bossCarAwarded = rivalDefeated
      ? CARS.find((c) => c.id === rivalDefeated.bossCarId)
      : undefined;

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
      rivalDefeated,
      bossCarAwarded,
    };

    this.paused = true;
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
    this.camHeading += camDiff * (1 - Math.exp(-6.2 * rawDt));

    const camFwdX = -Math.sin(this.camHeading);
    const camFwdZ = -Math.cos(this.camHeading);

    const nosBoost = (this.input.nitrous && this.nitrous > 1 && this.input.throttle) || this.driftBoostTimer > 0;
    const speedRatio = Math.min(1, Math.abs(p.forwardSpeed) / 88);

    const slopeLookOffset = Math.sin(p.slopePitch) * 12;
    if (this.lookBack) {
      _v1.set(p.pos.x + fwdX * 7.2, p.pos.y + 2.4, p.pos.z + fwdZ * 7.2);
      _v2.set(p.pos.x - fwdX * 14, p.pos.y + 0.8 - slopeLookOffset, p.pos.z - fwdZ * 14);
    } else if (this.cameraMode === 'hood') {
      _v1.set(p.pos.x + fwdX * 0.35, p.pos.y + 1.25, p.pos.z + fwdZ * 0.35);
      _v2.set(p.pos.x + fwdX * 26, p.pos.y + 0.9 + slopeLookOffset, p.pos.z + fwdZ * 26);
    } else {
      const dist = this.cameraMode === 'chase_far' ? 5.7 + speedRatio * 1.3 : 4.5 + speedRatio * 0.85;
      const height = this.cameraMode === 'chase_far' ? 2.02 : 1.7;
      _v1.set(p.pos.x - camFwdX * dist, p.pos.y + height, p.pos.z - camFwdZ * dist);
      _v2.set(p.pos.x + fwdX * 15, p.pos.y + 0.88 + slopeLookOffset, p.pos.z + fwdZ * 15);
    }

    const posLambda = this.cameraMode === 'hood' ? 32 : 13;
    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, _v1.x, posLambda, rawDt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, _v1.y, posLambda, rawDt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, _v1.z, posLambda, rawDt);

    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, _v2.x, 18, rawDt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, _v2.y, 18, rawDt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, _v2.z, 18, rawDt);

    this.camShake = THREE.MathUtils.damp(this.camShake, 0, 12, rawDt);
    const sx = (Math.random() - 0.5) * this.camShake + (nosBoost ? (Math.random() - 0.5) * 0.045 : 0);
    const sy = (Math.random() - 0.5) * this.camShake + (nosBoost ? (Math.random() - 0.5) * 0.045 : 0);

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    const targetFov = 65 + speedRatio * 14 + (nosBoost ? 8 : 0) + (this.isSpeedbreaker ? -7 : 0);
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
      this.streakSpawnAccum += dt * (nosActive ? 55 : (speedKmh - 115) * 0.25);
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

    this.sortedRacersScratch.length = 0;
    for (let i = 0; i < this.racers.length; i++) {
      if (!this.racers[i].knockedOut) this.sortedRacersScratch.push(this.racers[i]);
    }
    this.sortedRacersScratch.sort((a, b) => b.totalProgress - a.totalProgress);
    const activeRacers = this.sortedRacersScratch.length;
    const position = Math.max(1, this.sortedRacersScratch.findIndex((r) => r.isPlayer) + 1);

    let gapMeters = 0;
    if (activeRacers > 1) {
      if (position === 1) {
        gapMeters = Math.round((p.totalProgress - this.sortedRacersScratch[1].totalProgress) * this.track.totalLength);
      } else {
        gapMeters = Math.round((p.totalProgress - this.sortedRacersScratch[0].totalProgress) * this.track.totalLength);
      }
    }

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
      progress: p.progress,
      wrongWay,
      countdown: this.countdownTimer > 0 ? Math.ceil(this.countdownTimer) : -1,
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
      environment: this.activeEnvironment,
      patrolsEnabled: this.patrolsEnabled,
      radioDispatch: this.radioDispatch,
      callout: this.callout ? { text: this.callout.text, tone: this.callout.tone, id: this.callout.id } : null,
      minimapPath: this.track.minimapPath,
      minimapShortcuts: this.track.shortcuts.map((sc) => sc.minimapPoints),
      minimapBlips: blips,
      cameraMode: this.cameraMode,
    });
  }

  private handleResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private resetInput() {
    this.input.throttle = false;
    this.input.brake = false;
    this.input.left = false;
    this.input.right = false;
    this.input.handbrake = false;
    this.input.nitrous = false;
    this.input.speedbreaker = false;
    this.lookBack = false;
  }

  private handleWindowBlur = () => {
    this.resetInput();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'race') return;
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
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') this.input.throttle = true;
    if (k === 's' || e.key === 'ArrowDown') this.input.brake = true;
    if (k === 'a' || e.key === 'ArrowLeft') this.input.left = true;
    if (k === 'd' || e.key === 'ArrowRight') this.input.right = true;
    if (e.code === 'Space') this.input.handbrake = true;
    if (e.key === 'Shift' || k === 'n') this.input.nitrous = true;
    if (k === 'x' || k === 'b') this.input.speedbreaker = true;
    if (k === 'l') this.lookBack = true;
    if (k === 'c' || k === 'v') {
      if (!e.repeat) this.cycleCameraMode();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') this.input.throttle = false;
    if (k === 's' || e.key === 'ArrowDown') this.input.brake = false;
    if (k === 'a' || e.key === 'ArrowLeft') this.input.left = false;
    if (k === 'd' || e.key === 'ArrowRight') this.input.right = false;
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
    this.raceEnvMap.dispose();
    this.garageEnvMap.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
