import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { musicEngine } from '../audio/musicEngine';
import { soundEngine } from '../audio/soundEngine';
import {
  AiSettings,
  DEFAULT_AI_SETTINGS,
  REWIND_RACE_MAX_USES,
  REWIND_SAMPLE_HZ,
} from '../config/aiConfig';
import {
  AIR_GRAVITY_MPS2,
  computeGearboxDriveState,
  CONTINUOUS_STEP_DISTANCE_M,
  FIXED_PHYSICS_DT,
  HANDLING_PRESETS,
  MAX_FRAME_DELTA_SEC,
  MAX_PHYSICS_SUBSTEPS,
  SURFACE_MODIFIERS,
} from '../config/physicsConfig';
import {
  HEAT_POLICE_SPECS,
  HEAVY_CRASH_DAMAGE_THRESHOLD_KMH,
  POLICE_COOLDOWN_BAY_EVADE_RATE,
  POLICE_COOLDOWN_EVADE_BASE_RATE,
  POLICE_DESPAWN_DIST_M,
  POLICE_LOS_BREAK_GRACE_SEC,
  POLICE_PURSUIT_BREAKER_RADIUS_M,
  POLICE_SPAWN_AHEAD_MAX_SAMPLES,
  POLICE_SPAWN_AHEAD_MIN_SAMPLES,
  TAKEDOWN_CAM_DURATION_SEC,
  TAKEDOWN_CAM_TIMESCALE,
} from '../config/policeConfig';
import {
  getDefaultControlBindings,
  GRAPHICS_QUALITY_PRESETS,
} from '../config/settingsConfig';
import {
  evaluateWeatherAndTime,
  getInitialTimePhaseForEnv,
  WeatherMode,
  WeatherSnapshot,
} from '../config/weatherConfig';
import { BLACKLIST_RIVALS, CARS, computeEffectiveStats, TRACKS } from '../data/gameData';
import {
  AiDebugEntry,
  AssistSettings,
  BlacklistRival,
  CameraMode,
  CarSpec,
  CinematicPhase,
  ControlBindings,
  DevTelemetryData,
  EnvironmentId,
  GarageCameraPreset,
  GarageCarConfig,
  GraphicsQuality,
  HandlingMode,
  MinimapBlip,
  MissionChecklistItem,
  MissionDefinition,
  OpponentHudEntry,
  OpponentHudStatus,
  PhysicsTuningParams,
  PursuitState,
  RaceMode,
  RaceResult,
  RaceTelemetry,
  TrackDifficulty,
  TrackId,
} from '../types/game';
import {
  AiBrainState,
  createAiBrainState,
  resetAiBrainState,
  stepAiRacerPhysics,
} from './aiDriver';
import { applyCarVisualDamage, buildCarMesh, CarVisualHandles } from './carBuilder';
import {
  buildGhostCarMesh,
  exportGhostShareCode,
  GhostPlaybackCursor,
  GhostRunData,
  GhostSessionRecorder,
  loadBestGhost,
  RewindRingBuffer,
  saveBestGhostIfFaster,
} from './ghostAndRewind';
import { createContactShadowTexture } from './textures';
import { buildGarageShowroom, buildTrack, BuiltTrack } from './trackBuilder';
import {
  createVehicleDynamicsState,
  stepVehiclePhysics,
  syncWheelTelemetry,
  VehicleDynamicsState,
  VehicleStepInput,
  VehicleStepOutput,
} from './vehiclePhysics';

interface RacerEntity {
  id: string;
  name: string;
  isPlayer: boolean;
  spec: CarSpec;
  visual: CarVisualHandles;
  spawnIdx: number;
  spawnLane: number;
  brain?: AiBrainState;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  heading: number;
  prevHeading: number;
  slopePitch: number;
  prevSlopePitch: number;
  bankRoll: number;
  prevBankRoll: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  pitch: number;
  prevPitch: number;
  roll: number;
  prevRoll: number;
  airHeight: number;
  prevAirHeight: number;
  verticalVel: number;
  lastLandingVelMps: number;
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
  busted: boolean;
  bustProgress: number;
  finishTimeMs: number;
  speedTrapTotalKmh: number;
  speedTrapHits: number;
  trapCooldowns: number[];
  frontDamage: number;
  rearDamage: number;
  sideDamage: number;
  alignmentSign: number;
  detachedHood: boolean;
  detachedFrontBumper: boolean;
  detachedRearBumper: boolean;
  detachedSpoiler: boolean;
}

interface CopEntity {
  id: number;
  targetId: string;
  visual: CarVisualHandles;
  pos: THREE.Vector3;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  massKg: number;
  hitStunTimer: number;
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
  onToggleTuning?: () => void;
  onToggleTelemetry?: () => void;
  onToggleAiDebug?: () => void;
  onToggleGhost?: (enabled: boolean) => void;
  onGhostSaved?: (isNewRecord: boolean, data: GhostRunData | null) => void;
  onPauseRequest?: () => void;
  onAutoPause?: () => void;
  onGamepadChange?: (connected: boolean, id: string | null) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _interpPos = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _fogHaze = new THREE.Color('#AEC0CC');
const ROAD_SURFACE_OFFSET = 0.0402;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function matchesKeyBinding(code: string, primary?: string, secondary?: string): boolean {
  return (Boolean(primary) && code === primary) || (Boolean(secondary) && code === secondary);
}

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
  private aeLookEnabled = false;
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

  // U1 Physics, Handling, Tuning, Graphics, Gamepad & Zero-GC Telemetry
  private handlingMode: HandlingMode = 'balanced';
  private assists: AssistSettings = { ...HANDLING_PRESETS.balanced.defaultAssists };
  private tuning: PhysicsTuningParams = { ...HANDLING_PRESETS.balanced.tuning };
  private graphicsQuality: GraphicsQuality = 'high';
  private controlBindings: ControlBindings = getDefaultControlBindings(false);
  private physicsAccumulator = 0;
  private lastPhysicsMs = 0;
  private lastFrameMs = 16.6;
  private lastSubsteps = 0;
  private vehicleDynamics: VehicleDynamicsState = createVehicleDynamicsState();
  private vehicleStepIn: VehicleStepInput = {
    dt: FIXED_PHYSICS_DT,
    rawDt: FIXED_PHYSICS_DT,
    forwardSpeed: 0,
    lateralSpeed: 0,
    steerAngle: 0,
    rawSteerInput: 0,
    throttleInput: false,
    brakeInput: false,
    handbrakeInput: false,
    throttleAxis: 1,
    brakeAxis: 1,
    nosActive: false,
    driftBoostActive: false,
    drafting: false,
    airborne: false,
    spikedTimer: 0,
    isSpeedbreaker: false,
    baseMaxMs: 65,
    maxForwardMs: 75,
    accelStat: 60,
    handlingStat: 60,
    bodyStyle: 'coupe',
    upcomingTurnSeverity: 0,
    lateralOffset: 0,
    roadHalfWidth: 11,
    inShortcut: false,
    shortcutLateral: 0,
    shortcutHalfWidth: 7,
    environment: 'golden_dusk',
    trackId: 'rockport_loop',
    tuning: this.tuning,
    assists: this.assists,
  };
  private vehicleStepOut: VehicleStepOutput = {
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    heaveOffset: 0,
    targetPitch: 0,
    targetRoll: 0,
    wheelspinIntensity: 0,
    surface: 'asphalt',
    absActive: false,
    tcsActive: false,
  };
  private devTelemetryData: DevTelemetryData = {
    fps: 60,
    frameMs: 16.6,
    physicsMs: 0.4,
    drawCalls: 0,
    activeEntities: 0,
    substeps: 1,
    surface: 'asphalt',
    handlingMode: 'balanced',
    wheels: [
      { id: 'FL', slipRatio: 0, slipAngleDeg: 0, loadN: 3500, compression: 0.42, surface: 'asphalt' },
      { id: 'FR', slipRatio: 0, slipAngleDeg: 0, loadN: 3500, compression: 0.42, surface: 'asphalt' },
      { id: 'RL', slipRatio: 0, slipAngleDeg: 0, loadN: 3500, compression: 0.42, surface: 'asphalt' },
      { id: 'RR', slipRatio: 0, slipAngleDeg: 0, loadN: 3500, compression: 0.42, surface: 'asphalt' },
    ],
  };
  private playerHeaveOffset = 0;
  private playerWheelspinIntensity = 0;
  private activeRainCount = 220;

  private gamepadConnected = false;
  private gamepadSteer = 0;
  private gamepadThrottleAxis = 0;
  private gamepadBrakeAxis = 0;
  private gamepadThrottleDown = false;
  private gamepadBrakeDown = false;
  private gamepadHandbrakeDown = false;
  private gamepadNitrousDown = false;
  private gamepadBreakerDown = false;
  private gamepadPrevStart = false;
  private gamepadPrevCam = false;
  private gamepadPrevReset = false;

  // 60 FPS adaptive tuner & zero-GC scratch
  private currentPixelRatio = 1;
  private perfFrameAccumMs = 0;
  private perfFrameSamples = 0;
  private currentFps = 60;
  private fpsFrameCount = 0;
  private fpsAccumSec = 0;
  private sortedRacersScratch: RacerEntity[] = [];
  private prevActiveRainCount = 220;
  private minimapShortcutsCached: { x: number; z: number }[][] = [];
  private blipsScratch: MinimapBlip[] = [];
  private opponentsScratch: OpponentHudEntry[] = [];

  // U2 Adaptive AI, AI Debug, 5s Rewind & Ghost System
  private aiSettings: AiSettings = { ...DEFAULT_AI_SETTINGS };
  private aiDebugVisible = false;
  private aiDebugLines: THREE.Line[] = [];
  private aiDebugEntriesScratch: AiDebugEntry[] = [];
  private rewindBuffer = new RewindRingBuffer();
  private rewindsLeft = REWIND_RACE_MAX_USES;
  private rewindImmunityTimer = 0;
  private showGhost = true;
  private skipCountdownOnRestart = false;
  private ghostRecorder = new GhostSessionRecorder();
  private ghostPlayback = new GhostPlaybackCursor();
  private ghostCarMesh: CarVisualHandles | null = null;
  private ghostPosScratch = new THREE.Vector3();
  private ghostRotScratch = new THREE.Euler(0, 0, 0, 'YXZ');
  private bestGhostForCurrentTrack: GhostRunData | null = null;
  private ghostSavedThisRun = false;

  // U3 Dynamic Weather, Day/Night, Police LOS, Visual Damage Debris & Takedown Camera
  private weatherMode: WeatherMode = 'auto';
  private dynamicDayNight = true;
  private policeEnabledSetting = true;
  private weatherSnap: WeatherSnapshot = {
    activeWeather: 'clear',
    rainIntensity: 0,
    fogMultiplier: 1,
    roadWetness: 0,
    timeOfDayPhase: 0.62,
    sunIntensityScale: 1,
    ambientBrightness: 1,
  };
  private baseBgColor = new THREE.Color('#2B2118');
  private baseFogColor = new THREE.Color('#2B2118');
  private baseHemiSky = new THREE.Color('#94BCEB');
  private baseHemiGround = new THREE.Color('#3E2B1E');
  private baseSunColor = new THREE.Color('#FFE0A6');
  private baseHemiInt = 0.96;
  private baseSunInt = 2.75;
  private baseExposure = 1.16;
  private baseFogDensity = 0.00044;
  private baseRoadRoughness = 0.78;
  private baseRoadMetalness = 0.14;
  private policeLosActive = false;
  private inCooldownZone = false;
  private losBrokenTimer = 0;
  private takedownCamTimer = 0;
  private takedownCamDuration = TAKEDOWN_CAM_DURATION_SEC;
  private takedownCamTarget = new THREE.Vector3();
  private takedownCamAngle = 0.72;
  private takedownCamMode: 'takedown' | 'crash' = 'takedown';
  private debrisPool: {
    active: boolean;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rot: THREE.Euler;
    rotVel: THREE.Vector3;
    scale: THREE.Vector3;
    age: number;
    maxAge: number;
    color: THREE.Color;
  }[] = [];
  private debrisMesh: THREE.InstancedMesh;
  private debrisCount = 24;

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
  private particleCount = 280;

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

    // Pre-allocated Detachable Car Part & Wreck Debris Pool (zero GC)
    const debGeo = new THREE.BoxGeometry(1, 1, 1);
    const debMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.42,
      metalness: 0.65,
    });
    this.debrisMesh = new THREE.InstancedMesh(debGeo, debMat, this.debrisCount);
    this.debrisMesh.frustumCulled = false;
    for (let i = 0; i < this.debrisCount; i++) {
      this.debrisPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
        age: 0,
        maxAge: 2.5,
        color: new THREE.Color('#E2E8F0'),
      });
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, _dummy.matrix);
      this.debrisMesh.setColorAt(i, _color.set('#E2E8F0'));
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.debrisMesh);

    // 3D Safe House Garage Bay
    this.garageShowroom = buildGarageShowroom(this.maxAnisotropy);
    this.scene.add(this.garageShowroom.group);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
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
    this.baseBgColor.set(p.bg);
    this.baseFogColor.set(p.fog);
    this.baseFogDensity = p.fogDensity;
    this.baseHemiSky.set(p.hemiSky);
    this.baseHemiGround.set(p.hemiGround);
    this.baseHemiInt = p.hemiInt;
    this.baseSunColor.set(p.sunColor);
    this.baseSunInt = p.sunInt;
    this.baseExposure = p.exposure;
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
    this.rainMesh.visible = env === 'overcast_rain' && this.weatherMode !== 'clear';
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
      params.mode === 'pursuit' || isPursuitMission
        ? true
        : this.policeEnabledSetting &&
          (params.mode === 'freeroam' ? true : (params.patrolsEnabled ?? true));
    this.shortcutsTaken = 0;

    for (let i = 0; i < this.skidCount; i++) {
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.clearDebris();

    this.raceParams = params;
    this.mode = 'race';
    this.paused = false;
    this.outroActive = false;
    this.outroTimer = 0;
    this.outroOutcome = null;
    this.track = buildTrack(params.trackId, this.maxAnisotropy, resolvedEnv);
    this.scene.add(this.track.group);
    this.minimapShortcutsCached = this.track.shortcuts.map((sc) => sc.minimapPoints);
    this.prevActiveRainCount = this.rainCount;
    this.baseRoadRoughness = this.track.roadMat.roughness;
    this.baseRoadMetalness = this.track.roadMat.metalness;
    this.weatherSnap.roadWetness =
      this.weatherMode === 'rain' ? 0.85 : this.weatherMode === 'clear' ? 0 : resolvedEnv === 'overcast_rain' ? 0.72 : 0;
    this.weatherSnap.timeOfDayPhase = getInitialTimePhaseForEnv(resolvedEnv);
    this.takedownCamTimer = 0;
    this.policeLosActive = false;
    this.inCooldownZone = false;
    this.losBrokenTimer = 0;

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
    this.physicsAccumulator = 0;
    this.lastPhysicsMs = 0;
    this.lastSubsteps = 0;
    this.vehicleDynamics = createVehicleDynamicsState();
    this.playerHeaveOffset = 0;
    this.playerWheelspinIntensity = 0;
    this.clock.getDelta();

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
      spawnIdx: startSampleIdx,
      spawnLane: playerLane,
      pos: playerStartPos,
      prevPos: playerStartPos.clone(),
      heading: startHeading,
      prevHeading: startHeading,
      slopePitch: gridStart.slopePitch,
      prevSlopePitch: gridStart.slopePitch,
      bankRoll: gridStart.bankAngle,
      prevBankRoll: gridStart.bankAngle,
      forwardSpeed: 0,
      lateralSpeed: 0,
      steerAngle: 0,
      pitch: 0,
      prevPitch: 0,
      roll: 0,
      prevRoll: 0,
      airHeight: 0,
      prevAirHeight: 0,
      verticalVel: 0,
      lastLandingVelMps: 0,
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
      busted: false,
      bustProgress: 0,
      finishTimeMs: 0,
      speedTrapTotalKmh: 0,
      speedTrapHits: 0,
      trapCooldowns: this.track.speedTraps.map(() => 0),
      frontDamage: 0,
      rearDamage: 0,
      sideDamage: 0,
      alignmentSign: 0,
      detachedHood: false,
      detachedFrontBumper: false,
      detachedRearBumper: false,
      detachedSpoiler: false,
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

      const bossBrain = createAiBrainState(
        0,
        rivalSpec,
        params.playerConfig,
        raceDiff,
        params.mission?.aiTierBoost ?? 2,
        true,
        laneGridX,
        this.tuning,
        this.assists,
        this.activeEnvironment,
        params.trackId,
      );

      this.racers.push({
        id: 'rival_boss',
        name: params.rival.alias,
        isPlayer: false,
        spec: rivalSpec,
        visual: rivalVisual,
        spawnIdx: startSampleIdx,
        spawnLane: laneGridX,
        brain: bossBrain,
        pos: rPos,
        prevPos: rPos.clone(),
        heading: startHeading,
        prevHeading: startHeading,
        slopePitch: gridStart.slopePitch,
        prevSlopePitch: gridStart.slopePitch,
        bankRoll: gridStart.bankAngle,
        prevBankRoll: gridStart.bankAngle,
        forwardSpeed: 0,
        lateralSpeed: 0,
        steerAngle: 0,
        pitch: 0,
        prevPitch: 0,
        roll: 0,
        prevRoll: 0,
        airHeight: 0,
        prevAirHeight: 0,
        verticalVel: 0,
        lastLandingVelMps: 0,
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
        aiSkill: Math.max(0.95, params.rival.aiSkill),
        finished: false,
        knockedOut: false,
        busted: false,
        bustProgress: 0,
        finishTimeMs: 0,
        speedTrapTotalKmh: 0,
        speedTrapHits: 0,
        trapCooldowns: this.track.speedTraps.map(() => 0),
        frontDamage: 0,
        rearDamage: 0,
        sideDamage: 0,
        alignmentSign: 0,
        detachedHood: false,
        detachedFrontBumper: false,
        detachedRearBumper: false,
        detachedSpoiler: false,
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
        raceDiff === 'Easy' ? 0.94 : raceDiff === 'Medium' ? 0.98 : raceDiff === 'Hard' ? 1.02 : 1.05;
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

        const aiBrain = createAiBrainState(
          i,
          aiSpec,
          params.playerConfig,
          raceDiff,
          aiTierBoost,
          false,
          offsets[i].lane,
          this.tuning,
          this.assists,
          this.activeEnvironment,
          params.trackId,
        );

        this.racers.push({
          id: `ai_${i}`,
          name: r.alias,
          isPlayer: false,
          spec: aiSpec,
          visual: aiVisual,
          spawnIdx: offsets[i].idx,
          spawnLane: offsets[i].lane,
          brain: aiBrain,
          pos: aPos,
          prevPos: aPos.clone(),
          heading: aHead,
          prevHeading: aHead,
          slopePitch: s.slopePitch,
          prevSlopePitch: s.slopePitch,
          bankRoll: s.bankAngle,
          prevBankRoll: s.bankAngle,
          forwardSpeed: 0,
          lateralSpeed: 0,
          steerAngle: 0,
          pitch: 0,
          prevPitch: 0,
          roll: 0,
          prevRoll: 0,
          airHeight: 0,
          prevAirHeight: 0,
          verticalVel: 0,
          lastLandingVelMps: 0,
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
          aiSkill: Math.min(1.08, diffSkillBase + i * 0.018 + aiTierBoost * 0.015),
          finished: false,
          knockedOut: false,
          busted: false,
          bustProgress: 0,
          finishTimeMs: 0,
          speedTrapTotalKmh: 0,
          speedTrapHits: 0,
          trapCooldowns: this.track!.speedTraps.map(() => 0),
          frontDamage: 0,
          rearDamage: 0,
          sideDamage: 0,
          alignmentSign: 0,
          detachedHood: false,
          detachedFrontBumper: false,
          detachedRearBumper: false,
          detachedSpoiler: false,
        });
      });
    }

    // Initialize AI Debug 3D lines (pre-allocated 6-point Line per AI racer)
    this.rebuildAiDebugLines();

    // Initialize Rewind & Ghost System for this track + mode
    this.rewindBuffer.clear();
    this.rewindsLeft = REWIND_RACE_MAX_USES;
    this.rewindImmunityTimer = 0;
    this.ghostRecorder.reset();
    this.ghostSavedThisRun = false;
    this.bestGhostForCurrentTrack = loadBestGhost(params.trackId, params.mode);
    this.ghostPlayback.load(this.bestGhostForCurrentTrack);
    if (this.bestGhostForCurrentTrack) {
      const ghostSpec =
        CARS.find((c) => c.id === this.bestGhostForCurrentTrack!.carId) ?? params.playerSpec;
      this.ghostCarMesh = buildGhostCarMesh(
        ghostSpec,
        this.shadowTexture,
        this.maxAnisotropy,
        this.isSoftwareGl,
      );
      this.ghostCarMesh.root.visible = false;
      this.scene.add(this.ghostCarMesh.root);
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

    const heatSpec = HEAT_POLICE_SPECS[Math.max(1, Math.min(5, this.heatLevel))] ?? HEAT_POLICE_SPECS[1];
    const initSpeed = isRoadblock ? 0 : patrolling ? 28 : isHeadOn ? 50 : 38;
    const initVx = -Math.sin(heading) * initSpeed;
    const initVz = -Math.cos(heading) * initSpeed;

    this.cops.push({
      id: Math.floor(Math.random() * 100000),
      targetId: 'player',
      visual,
      pos,
      vx: initVx,
      vz: initVz,
      heading,
      speed: initSpeed,
      massKg: isRhino ? heatSpec.rhinoMassKg : heatSpec.massKg,
      hitStunTimer: 0,
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

  private rebuildAiDebugLines() {
    for (let i = 0; i < this.aiDebugLines.length; i++) {
      const line = this.aiDebugLines[i];
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.aiDebugLines = [];

    const palette = ['#F59E0B', '#22D3EE', '#F43F5E', '#A855F7'];
    let colorIdx = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.isPlayer || !r.brain) continue;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: palette[colorIdx % palette.length],
        transparent: true,
        opacity: 0.92,
      });
      colorIdx++;
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = this.aiDebugVisible;
      this.scene.add(line);
      this.aiDebugLines.push(line);
    }
  }

  private clearRaceEntities() {
    this.racers.forEach((r) => {
      this.scene.remove(r.visual.root);
      r.visual.dispose();
    });
    this.racers = [];
    this.player = null;

    if (this.ghostCarMesh) {
      this.scene.remove(this.ghostCarMesh.root);
      this.ghostCarMesh.dispose();
      this.ghostCarMesh = null;
    }

    for (let i = 0; i < this.aiDebugLines.length; i++) {
      const line = this.aiDebugLines[i];
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.aiDebugLines = [];

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
    this.clearDebris();
    this.takedownCamTimer = 0;
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

  private clearDebris() {
    for (let i = 0; i < this.debrisCount; i++) {
      this.debrisPool[i].active = false;
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  public setWeatherMode(mode: WeatherMode) {
    this.weatherMode = mode;
  }

  public setDynamicDayNight(enabled: boolean) {
    this.dynamicDayNight = enabled;
  }

  public setPoliceEnabled(enabled: boolean) {
    this.policeEnabledSetting = enabled;
    if (this.mode !== 'race' || !this.raceParams) return;
    const isPursuitRequired =
      this.raceParams.mode === 'pursuit' || this.raceParams.mission?.type === 'pursuit_milestone';
    if (isPursuitRequired) return;

    this.patrolsEnabled = enabled && (this.raceParams.mode === 'freeroam' ? true : (this.raceParams.patrolsEnabled ?? true));
    if (!this.patrolsEnabled) {
      this.cops.forEach((c) => {
        this.scene.remove(c.visual.root);
        c.visual.dispose();
      });
      this.cops = [];
      this.spikeStrips.forEach((sp) => this.scene.remove(sp.mesh));
      this.spikeStrips = [];
      this.pursuitState = 'none';
      this.evadeProgress = 0;
      this.bustProgress = 0;
      this.policeLosActive = false;
      if (this.heliGroup) this.heliGroup.visible = false;
      musicEngine.setPursuitIntensity(false, 1);
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    musicEngine.setPaused(paused);
    if (paused) {
      this.resetInput();
      soundEngine.stopRaceLoops();
    } else {
      this.physicsAccumulator = 0;
      this.clock.getDelta();
    }
  }

  public setHandlingMode(mode: HandlingMode) {
    this.handlingMode = mode;
  }

  public setAssists(assists: AssistSettings) {
    this.assists = { ...assists };
    this.vehicleStepIn.assists = this.assists;
  }

  public setPhysicsTuning(tuning: PhysicsTuningParams) {
    this.tuning = { ...tuning };
    this.vehicleStepIn.tuning = this.tuning;
  }

  public setAiSettings(settings: AiSettings) {
    this.aiSettings = { ...settings };
  }

  public setShowGhost(enabled: boolean) {
    this.showGhost = enabled;
    if (this.ghostCarMesh && !enabled) {
      this.ghostCarMesh.root.visible = false;
    }
  }

  public setSkipCountdownOnRestart(skip: boolean) {
    this.skipCountdownOnRestart = skip;
  }

  public setAiDebugVisible(visible: boolean) {
    this.aiDebugVisible = visible;
    for (let i = 0; i < this.aiDebugLines.length; i++) {
      this.aiDebugLines[i].visible = visible;
    }
  }

  public getBestGhostForTrack(): GhostRunData | null {
    return this.bestGhostForCurrentTrack;
  }

  public exportBestGhostJson(): string | null {
    return this.bestGhostForCurrentTrack ? exportGhostShareCode(this.bestGhostForCurrentTrack) : null;
  }

  public setControlBindings(bindings: ControlBindings) {
    this.controlBindings = bindings;
    this.resetInput();
  }

  public setGraphicsQuality(quality: GraphicsQuality) {
    this.graphicsQuality = quality;
    const preset = GRAPHICS_QUALITY_PRESETS[quality];
    if (this.isSoftwareGl) {
      this.currentPixelRatio = 1;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.sunLight.castShadow = false;
      this.bloomEnabled = false;
      this.activeRainCount = Math.round(this.rainCount * 0.45);
      return;
    }

    this.currentPixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap);
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.composer?.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = preset.shadowsEnabled;
    this.sunLight.castShadow = preset.shadowsEnabled;
    this.bloomEnabled = preset.bloomEnabled;
    this.activeRainCount = Math.max(40, Math.round(this.rainCount * preset.rainDensityScale));
    this.perfFrameAccumMs = 0;
    this.perfFrameSamples = 0;
    this.handleResize();
  }

  public getGraphicsQuality(): GraphicsQuality {
    return this.graphicsQuality;
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
    p.prevPos.copy(p.pos);
    p.heading = Math.atan2(-info.sample.tangent.x, -info.sample.tangent.z);
    p.prevHeading = p.heading;
    p.lateralSpeed = 0;
    p.forwardSpeed = Math.min(Math.max(0, p.forwardSpeed), 18);
    p.airHeight = 0;
    p.prevAirHeight = 0;
    p.verticalVel = 0;
    this.physicsAccumulator = 0;
    p.visual.root.position.copy(p.pos);
    this.pushCallout('CAR RESET TO ROAD', 'amber');
  }

  /**
   * 5-second zero-GC Rewind: steps back ~2.75s along captured 60Hz snapshots.
   * Unlimited in Free Roam; 3 uses per standard Race/Event.
   */
  public triggerRewind(): boolean {
    if (
      this.mode !== 'race' ||
      this.paused ||
      this.outroActive ||
      this.introTimer > 0 ||
      this.countdownTimer > 0 ||
      !this.player ||
      !this.track
    ) {
      return false;
    }
    const isUnlimited = this.raceParams?.mode === 'freeroam';
    if (!isUnlimited && this.rewindsLeft <= 0) {
      this.pushCallout('NO REWINDS REMAINING', 'red');
      return false;
    }

    const stepsBack = Math.round(REWIND_SAMPLE_HZ * 2.75);
    const frame = this.rewindBuffer.popRewindFrame(stepsBack);
    if (!frame) {
      this.pushCallout('REWIND BUFFER TOO SHORT', 'amber');
      return false;
    }

    if (!isUnlimited) {
      this.rewindsLeft = Math.max(0, this.rewindsLeft - 1);
    }

    this.raceElapsedMs = frame.raceElapsedMs;
    this.currentLapStartMs = frame.currentLapStartMs;
    this.tollboothTimeLeftMs = frame.tollboothTimeLeftMs;
    if (frame.tollboothCheckpoint !== this.tollboothCheckpoint) {
      this.tollboothCheckpoint = frame.tollboothCheckpoint;
      this.updateTollboothBeacons();
    }
    this.nitrous = frame.nitrous;
    this.speedbreaker = frame.speedbreaker;
    this.sessionBounty = frame.sessionBounty;

    for (let i = 0; i < this.racers.length && i < frame.racers.length; i++) {
      const r = this.racers[i];
      const snap = frame.racers[i];
      if (!snap.active) continue;
      r.pos.set(snap.x, snap.y, snap.z);
      r.prevPos.copy(r.pos);
      r.heading = snap.heading;
      r.prevHeading = snap.heading;
      r.slopePitch = snap.slopePitch;
      r.prevSlopePitch = snap.slopePitch;
      r.bankRoll = snap.bankRoll;
      r.prevBankRoll = snap.bankRoll;
      r.forwardSpeed = snap.forwardSpeed;
      r.lateralSpeed = snap.lateralSpeed;
      r.steerAngle = snap.steerAngle;
      r.pitch = snap.pitch;
      r.prevPitch = snap.pitch;
      r.roll = snap.roll;
      r.prevRoll = snap.roll;
      r.airHeight = snap.airHeight;
      r.prevAirHeight = snap.airHeight;
      r.verticalVel = snap.verticalVel;
      r.airTimeTotal = snap.airTimeTotal;
      r.trackIdx = snap.trackIdx;
      r.progress = snap.progress;
      r.lap = snap.lap;
      r.totalProgress = snap.totalProgress;
      r.activeShortcutId = snap.activeShortcutId;
      r.reachedShortcutCore = snap.reachedShortcutCore;
      r.speedTrapTotalKmh = snap.speedTrapTotalKmh;
      r.speedTrapHits = snap.speedTrapHits;
      r.finished = snap.finished;
      r.knockedOut = snap.knockedOut;
      r.busted = snap.busted;
      r.bustProgress = snap.busted ? 100 : 0;
      r.frontDamage = snap.frontDamage;
      r.rearDamage = snap.rearDamage;
      r.sideDamage = snap.sideDamage;
      r.detachedHood = snap.detachedHood;
      r.detachedFrontBumper = snap.detachedFrontBumper;
      r.detachedRearBumper = snap.detachedRearBumper;
      r.detachedSpoiler = snap.detachedSpoiler;
      applyCarVisualDamage(
        r.visual,
        r.frontDamage,
        r.rearDamage,
        r.sideDamage,
        r.detachedHood,
        r.detachedFrontBumper,
        r.detachedRearBumper,
        r.detachedSpoiler,
      );
      r.visual.root.visible = !snap.knockedOut;
      r.visual.root.position.copy(r.pos);
      r.visual.root.rotation.set(r.slopePitch, r.heading, -r.bankRoll, 'YXZ');

      if (r.isPlayer) {
        this.vehicleDynamics.prevForwardSpeed = snap.forwardSpeed;
        this.vehicleDynamics.prevLateralSpeed = snap.lateralSpeed;
        this.vehicleDynamics.yawRate = 0;
      } else if (r.brain) {
        r.brain.dyn.prevForwardSpeed = snap.forwardSpeed;
        r.brain.dyn.prevLateralSpeed = snap.lateralSpeed;
        r.brain.dyn.yawRate = 0;
      }
    }

    // Trim any future ghost samples recorded past rewound timestamp
    const rewoundSec = this.raceElapsedMs / 1000;
    while (
      this.ghostRecorder.frames.length > 0 &&
      this.ghostRecorder.frames[this.ghostRecorder.frames.length - 1].t > rewoundSec
    ) {
      this.ghostRecorder.frames.pop();
    }
    this.ghostPlayback.reset();
    this.takedownCamTimer = 0;
    this.rewindImmunityTimer = 0.65;
    this.physicsAccumulator = 0;
    this.camShake = 0.14;
    soundEngine.triggerBeep(false);
    this.pushCallout(
      isUnlimited ? 'REWIND -2.8S · UNLIMITED' : `REWIND -2.8S · ${this.rewindsLeft} LEFT`,
      'cyan',
    );
    this.emitTelemetry(this.getTotalLaps(), true);
    return true;
  }

  /**
   * Instant in-place event restart (< 0.1s) — reuses built 3D track & car meshes with zero scene reload.
   */
  public instantRestartRace(skipCountdown?: boolean) {
    if (!this.raceParams || !this.track || !this.player) {
      if (this.raceParams) this.startRace(this.raceParams);
      return;
    }

    const params = this.raceParams;
    const totalLaps = this.getTotalLaps();
    const skipCd = skipCountdown ?? this.skipCountdownOnRestart;

    this.resetInput();
    this.paused = false;
    this.outroActive = false;
    this.outroTimer = 0;
    this.outroOutcome = null;
    this.introTimer = 0;
    this.countdownTimer = params.mode === 'freeroam' || skipCd ? 0 : 1.5;
    this.lastCountdownInt = params.mode === 'freeroam' || skipCd ? 0 : 2;
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
    this.sessionBounty = 0;
    this.copsTakedowns = 0;
    this.nearMissCount = 0;
    this.nearMissCombo = 0;
    this.nearMissComboTimer = 0;
    this.speedTrapBestKmh = 0;
    this.shortcutsTaken = 0;
    this.evadeProgress = 0;
    this.bustProgress = 0;
    this.nextRoadblockCooldown = 11;
    this.copSpawnTimer = 2.8;
    this.radioDispatch = null;
    this.physicsAccumulator = 0;
    this.vehicleDynamics = createVehicleDynamicsState();
    this.playerHeaveOffset = 0;
    this.playerWheelspinIntensity = 0;
    this.rewindBuffer.clear();
    this.rewindsLeft = REWIND_RACE_MAX_USES;
    this.rewindImmunityTimer = 0;
    this.ghostRecorder.reset();
    this.ghostSavedThisRun = false;
    this.bestGhostForCurrentTrack = loadBestGhost(params.trackId, params.mode);
    this.ghostPlayback.load(this.bestGhostForCurrentTrack);
    if (!this.ghostCarMesh && this.bestGhostForCurrentTrack) {
      const ghostSpec =
        CARS.find((c) => c.id === this.bestGhostForCurrentTrack!.carId) ?? params.playerSpec;
      this.ghostCarMesh = buildGhostCarMesh(
        ghostSpec,
        this.shadowTexture,
        this.maxAnisotropy,
        this.isSoftwareGl,
      );
      this.ghostCarMesh.root.visible = false;
      this.scene.add(this.ghostCarMesh.root);
    }

    // Clear skidmarks
    for (let i = 0; i < this.skidCount; i++) {
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.clearSpeedStreaks();
    this.clearDebris();
    this.takedownCamTimer = 0;
    this.policeLosActive = false;
    this.inCooldownZone = false;
    this.losBrokenTimer = 0;
    this.weatherSnap.roadWetness =
      this.weatherMode === 'rain' ? 0.85 : this.weatherMode === 'clear' ? 0 : this.activeEnvironment === 'overcast_rain' ? 0.72 : 0;

    // Reset all racers in-place to their starting grid slots
    const samples = this.track.samples;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const s = samples[r.spawnIdx];
      const startHead = Math.atan2(-s.tangent.x, -s.tangent.z);
      r.pos.copy(s.point).addScaledVector(s.right, r.spawnLane);
      r.pos.y += ROAD_SURFACE_OFFSET + r.spawnLane * Math.sin(s.bankAngle);
      r.prevPos.copy(r.pos);
      r.heading = startHead;
      r.prevHeading = startHead;
      r.slopePitch = s.slopePitch;
      r.prevSlopePitch = s.slopePitch;
      r.bankRoll = s.bankAngle;
      r.prevBankRoll = s.bankAngle;
      r.forwardSpeed = 0;
      r.lateralSpeed = 0;
      r.steerAngle = 0;
      r.pitch = 0;
      r.prevPitch = 0;
      r.roll = 0;
      r.prevRoll = 0;
      r.airHeight = 0;
      r.prevAirHeight = 0;
      r.verticalVel = 0;
      r.airTimeTotal = 0;
      r.shuntCooldown = 0;
      r.copSlowdownTimer = 0;
      r.activeShortcutId = null;
      r.reachedShortcutCore = false;
      r.shortcutPassCooldown = 0;
      r.trackIdx = r.spawnIdx;
      r.progress = s.progress;
      r.lap = 0;
      r.totalProgress = r.id === 'rival_boss' ? s.progress - 1 + 0.001 : s.progress - 1;
      r.laneTarget = r.spawnLane;
      r.finished = false;
      r.knockedOut = false;
      r.busted = false;
      r.bustProgress = 0;
      r.finishTimeMs = 0;
      r.speedTrapTotalKmh = 0;
      r.speedTrapHits = 0;
      r.frontDamage = 0;
      r.rearDamage = 0;
      r.sideDamage = 0;
      r.alignmentSign = 0;
      r.detachedHood = false;
      r.detachedFrontBumper = false;
      r.detachedRearBumper = false;
      r.detachedSpoiler = false;
      applyCarVisualDamage(r.visual, 0, 0, 0, false, false, false, false);
      for (let t = 0; t < r.trapCooldowns.length; t++) r.trapCooldowns[t] = 0;
      r.visual.root.visible = true;
      r.visual.root.position.copy(r.pos);
      r.visual.root.rotation.set(s.slopePitch, startHead, -s.bankAngle, 'YXZ');
      r.visual.bodyGroup.position.y = 0;
      r.visual.bodyGroup.rotation.set(0, 0, 0);
      if (r.brain) {
        resetAiBrainState(r.brain, r.spawnLane);
      }
    }

    // Reposition existing traffic cleanly (no mesh disposal/rebuild)
    const totalSamples = samples.length;
    const tCount = Math.max(1, this.traffic.length);
    const lanes = [-7.6, -2.9, 2.9, 7.6];
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i];
      const idx = Math.floor(((i + 0.5) / tCount) * totalSamples * 0.92 + 26) % totalSamples;
      const s = samples[idx];
      tr.laneOffset = lanes[i % lanes.length];
      tr.pos.copy(s.point).addScaledVector(s.right, tr.laneOffset);
      tr.pos.y += ROAD_SURFACE_OFFSET + tr.laneOffset * Math.sin(s.bankAngle);
      tr.heading = Math.atan2(-s.tangent.x, -s.tangent.z);
      tr.speed = tr.isTruck ? 15 : 20;
      tr.trackIdx = idx;
      tr.knockLatVel = 0;
      tr.nearMissCooldown = 0;
      tr.hitCooldown = 0;
      tr.visual.root.position.copy(tr.pos);
      tr.visual.root.rotation.set(s.slopePitch, tr.heading, -s.bankAngle, 'YXZ');
    }

    // Reset police units cleanly
    this.cops.forEach((c) => {
      this.scene.remove(c.visual.root);
      c.visual.dispose();
    });
    this.cops = [];
    this.spikeStrips.forEach((sp) => this.scene.remove(sp.mesh));
    this.spikeStrips = [];

    const laneGridX = Math.min(3.1, this.track.roadHalfWidth * 0.28);
    if (params.mode === 'pursuit') {
      this.pursuitState = 'pursuit';
      this.heatLevel = Math.max(1, params.mission?.minHeat ? Math.min(2, params.mission.minHeat) : 1);
      this.highestHeat = this.heatLevel;
      this.spawnPoliceCruiser(samples.length - 14, -laneGridX, false, false);
      this.spawnPoliceCruiser(52, laneGridX, false, false);
    } else {
      this.pursuitState = 'none';
      this.heatLevel = 1;
      this.highestHeat = 1;
      if (this.patrolsEnabled && params.mode !== 'tollbooth') {
        this.spawnPoliceCruiser(32, laneGridX * 1.1, false, false, false, true);
        this.spawnPoliceCruiser(88, -laneGridX * 1.1, false, false, false, true);
        this.spawnPoliceCruiser(148, laneGridX * 0.85, false, false, false, true);
      }
    }

    this.updateTollboothBeacons();
    musicEngine.startTrack(params.trackId);

    const p = this.player;
    const pFwdX = -Math.sin(p.heading);
    const pFwdZ = -Math.cos(p.heading);
    this.camHeading = p.heading;
    this.camPos.set(p.pos.x - pFwdX * 6.2, p.pos.y + 2.35, p.pos.z - pFwdZ * 6.2);
    this.camLook.set(p.pos.x + pFwdX * 22, p.pos.y + 1.08, p.pos.z + pFwdZ * 22);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.clock.getDelta();

    this.pushCallout(skipCd ? 'INSTANT RESTART — GO!' : 'INSTANT RESTART', 'emerald');
    this.emitTelemetry(totalLaps, true);
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

  private isPlayerInTunnel(): boolean {
    if (!this.track || !this.player) return false;
    const ranges = this.track.tunnelRanges;
    for (let i = 0; i < ranges.length; i++) {
      if (this.player.trackIdx >= ranges[i].startIdx && this.player.trackIdx <= ranges[i].endIdx) {
        return true;
      }
    }
    return false;
  }

  private spawnDebris(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    sx: number,
    sy: number,
    sz: number,
    colorHex: string,
  ) {
    for (let i = 0; i < this.debrisCount; i++) {
      const d = this.debrisPool[i];
      if (!d.active) {
        d.active = true;
        d.pos.copy(pos);
        d.vel.copy(vel);
        d.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        d.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        d.scale.set(sx, sy, sz);
        d.age = 0;
        d.maxAge = 2.6;
        d.color.set(colorHex);
        return;
      }
    }
  }

  private updateDebris(dt: number) {
    let dirty = false;
    for (let i = 0; i < this.debrisCount; i++) {
      const d = this.debrisPool[i];
      if (!d.active) continue;
      dirty = true;
      d.age += dt;
      if (d.age >= d.maxAge) {
        d.active = false;
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.debrisMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      d.vel.y -= 19 * dt;
      d.pos.addScaledVector(d.vel, dt);
      const floorY = this.player ? this.player.pos.y + 0.08 : 0.1;
      if (d.pos.y < floorY && d.vel.y < 0) {
        d.pos.y = floorY;
        d.vel.y *= -0.38;
        d.vel.x *= 0.72;
        d.vel.z *= 0.72;
        d.rotVel.multiplyScalar(0.65);
      }
      d.rot.x += d.rotVel.x * dt;
      d.rot.y += d.rotVel.y * dt;
      d.rot.z += d.rotVel.z * dt;
      const fade = d.age > d.maxAge - 0.5 ? Math.max(0.01, (d.maxAge - d.age) / 0.5) : 1;
      _dummy.position.copy(d.pos);
      _dummy.rotation.copy(d.rot);
      _dummy.scale.set(d.scale.x * fade, d.scale.y * fade, d.scale.z * fade);
      _dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, _dummy.matrix);
      this.debrisMesh.setColorAt(i, d.color);
    }
    if (dirty) {
      this.debrisMesh.instanceMatrix.needsUpdate = true;
      if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }
  }

  private triggerDramaticCam(targetPos: THREE.Vector3, mode: 'takedown' | 'crash') {
    if (this.outroActive || this.introTimer > 0) return;
    if (this.takedownCamTimer > 0.35 && mode === 'crash') return;
    this.takedownCamTimer = this.takedownCamDuration;
    this.takedownCamTarget.copy(targetPos);
    this.takedownCamMode = mode;
    this.takedownCamAngle = (Math.random() > 0.5 ? 1 : -1) * (0.68 + Math.random() * 0.25);
  }

  private applyImpactDamage(
    r: RacerEntity,
    localHitX: number,
    localHitZ: number,
    impactSpeedMps: number,
    triggerCrashCam: boolean,
  ) {
    if (impactSpeedMps < 14) return;
    const sev = THREE.MathUtils.clamp((impactSpeedMps - 14) / 36, 0.08, 0.72);
    const fwdX = -Math.sin(r.heading);
    const fwdZ = -Math.cos(r.heading);

    if (localHitZ > 0.32) {
      r.frontDamage = Math.min(1, r.frontDamage + sev);
    } else if (localHitZ < -0.32) {
      r.rearDamage = Math.min(1, r.rearDamage + sev);
    } else {
      r.sideDamage = Math.min(1, r.sideDamage + sev * 0.85);
    }

    const carCol = r.visual.paintHex || '#E2E8F0';
    if (!r.detachedFrontBumper && r.frontDamage >= 0.34) {
      r.detachedFrontBumper = true;
      _v1.set(r.pos.x + fwdX * 1.9, r.pos.y + 0.45, r.pos.z + fwdZ * 1.9);
      _v2.set((Math.random() - 0.5) * 9, 4.5 + Math.random() * 3.5, (Math.random() - 0.5) * 9);
      this.spawnDebris(_v1, _v2, 1.55, 0.24, 0.35, '#111827');
    }
    if (!r.detachedHood && r.frontDamage >= 0.62) {
      r.detachedHood = true;
      _v1.set(r.pos.x + fwdX * 1.1, r.pos.y + 0.85, r.pos.z + fwdZ * 1.1);
      _v2.set((Math.random() - 0.5) * 8, 6.2 + Math.random() * 4.0, (Math.random() - 0.5) * 8);
      this.spawnDebris(_v1, _v2, 1.35, 0.08, 1.15, carCol);
    }
    if (!r.detachedRearBumper && r.rearDamage >= 0.36) {
      r.detachedRearBumper = true;
      _v1.set(r.pos.x - fwdX * 1.9, r.pos.y + 0.45, r.pos.z - fwdZ * 1.9);
      _v2.set((Math.random() - 0.5) * 9, 4.2 + Math.random() * 3.2, (Math.random() - 0.5) * 9);
      this.spawnDebris(_v1, _v2, 1.5, 0.24, 0.32, '#111827');
    }
    if (!r.detachedSpoiler && r.rearDamage + r.sideDamage * 0.5 >= 0.58) {
      r.detachedSpoiler = true;
      _v1.set(r.pos.x - fwdX * 1.65, r.pos.y + 1.05, r.pos.z - fwdZ * 1.65);
      _v2.set((Math.random() - 0.5) * 10, 6.5 + Math.random() * 3.5, (Math.random() - 0.5) * 10);
      this.spawnDebris(_v1, _v2, 1.65, 0.08, 0.34, '#111827');
    }

    applyCarVisualDamage(
      r.visual,
      r.frontDamage,
      r.rearDamage,
      r.sideDamage,
      r.detachedHood,
      r.detachedFrontBumper,
      r.detachedRearBumper,
      r.detachedSpoiler,
    );

    if (
      triggerCrashCam &&
      r.isPlayer &&
      impactSpeedMps * 3.6 >= HEAVY_CRASH_DAMAGE_THRESHOLD_KMH &&
      this.takedownCamTimer <= 0
    ) {
      this.triggerDramaticCam(r.pos, 'crash');
    }
  }

  private updateWeatherAndAtmosphere(dt: number) {
    evaluateWeatherAndTime(
      this.weatherMode,
      this.activeEnvironment,
      this.raceElapsedMs * 0.001,
      this.dynamicDayNight,
      this.weatherSnap.roadWetness,
      dt,
      this.weatherSnap,
    );

    const rainInt = this.weatherSnap.rainIntensity;
    this.rainMesh.visible = rainInt > 0.08;
    const gfxPreset = GRAPHICS_QUALITY_PRESETS[this.graphicsQuality];
    this.activeRainCount = Math.max(
      0,
      Math.round(this.rainCount * gfxPreset.rainDensityScale * (rainInt > 0.08 ? rainInt : 0)),
    );

    const wet = this.weatherSnap.roadWetness;
    if (this.track) {
      this.track.roadMat.roughness = THREE.MathUtils.lerp(this.baseRoadRoughness, 0.16, wet);
      this.track.roadMat.metalness = THREE.MathUtils.lerp(this.baseRoadMetalness, 0.56, wet);
      this.track.roadMat.envMapIntensity = THREE.MathUtils.lerp(1.0, 2.25, wet);
    }

    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = this.baseFogDensity * this.weatherSnap.fogMultiplier;
      _color.copy(this.baseFogColor);
      if (this.weatherSnap.activeWeather === 'fog') {
        _color.lerp(_fogHaze, 0.35);
      }
      _color.multiplyScalar(0.55 + this.weatherSnap.ambientBrightness * 0.48);
      fog.color.copy(_color);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(_color);
      }
    }

    this.sunLight.intensity = this.baseSunInt * this.weatherSnap.sunIntensityScale * (rainInt > 0.25 ? 0.72 : 1.0);
    this.hemiLight.intensity = this.baseHemiInt * this.weatherSnap.ambientBrightness;
    this.renderer.toneMappingExposure = this.baseExposure * (0.86 + this.weatherSnap.ambientBrightness * 0.22);
  }

  private tick = () => {
    if (this.disposed) return;

    const rawDelta = Math.min(this.clock.getDelta(), MAX_FRAME_DELTA_SEC);
    this.lastFrameMs = rawDelta * 1000;
    this.fpsFrameCount++;
    this.fpsAccumSec += rawDelta;
    if (this.fpsAccumSec >= 0.5) {
      this.currentFps = Math.max(1, Math.round(this.fpsFrameCount / this.fpsAccumSec));
      this.fpsFrameCount = 0;
      this.fpsAccumSec = 0;
    }

    this.pollGamepad();

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
    this.updateWeatherAndAtmosphere(rawDt);

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
      this.updateDebris(rawDt);
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
      const launchThrottle = this.input.throttle || this.gamepadThrottleDown;
      this.gridRevRpm = THREE.MathUtils.damp(
        this.gridRevRpm,
        launchThrottle ? 0.88 : 0.2,
        launchThrottle ? 9.5 : 5.5,
        rawDt,
      );
      soundEngine.update({
        active: true,
        rpm: this.gridRevRpm,
        throttle: launchThrottle,
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
        const cfg = this.raceParams?.playerConfig;
        if (launchThrottle) {
          const turboStage = cfg ? cfg.turboLevel : 1;
          this.player.forwardSpeed = 13.5 + turboStage * 1.1;
          this.driftBoostTimer = 0.9;
          const p = this.player;
          const fwdX = -Math.sin(p.heading);
          const fwdZ = -Math.cos(p.heading);
          for (let s = 0; s < 8; s++) {
            _v1.set(
              p.pos.x - fwdX * 1.65 + (Math.random() - 0.5) * 1.4,
              p.pos.y + 0.25,
              p.pos.z - fwdZ * 1.65 + (Math.random() - 0.5) * 1.4,
            );
            _v2.set(-fwdX * (4 + Math.random() * 4), 1.4 + Math.random() * 1.8, -fwdZ * (4 + Math.random() * 4));
            this.spawnParticle(_v1, _v2, '#E2E8F0', 0.85, 0.45);
          }
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

    if (this.takedownCamTimer > 0) {
      this.takedownCamTimer = Math.max(0, this.takedownCamTimer - rawDt);
    }

    const throttleDown = this.input.throttle || this.gamepadThrottleDown;
    const wantsBreaker =
      (this.input.speedbreaker || this.gamepadBreakerDown) &&
      this.speedbreaker > 4 &&
      this.player.forwardSpeed > 10;
    if (wantsBreaker !== this.isSpeedbreaker) {
      soundEngine.triggerSpeedbreaker(wantsBreaker);
    }
    this.isSpeedbreaker = wantsBreaker;
    const timeScale = this.isSpeedbreaker
      ? 0.42
      : this.takedownCamTimer > 0
        ? TAKEDOWN_CAM_TIMESCALE
        : 1.0;

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
    if (this.driftBoostTimer > 0) {
      this.driftBoostTimer = Math.max(0, this.driftBoostTimer - rawDt);
    }
    if (this.spikedTimer > 0) {
      this.spikedTimer = Math.max(0, this.spikedTimer - rawDt);
    }

    // Fixed 1/120s physics timestep accumulator with render pose interpolation
    const tPhysStart = performance.now();
    this.physicsAccumulator = Math.min(
      this.physicsAccumulator + rawDt,
      FIXED_PHYSICS_DT * MAX_PHYSICS_SUBSTEPS,
    );
    let substeps = 0;
    let raceFinishedInStep = false;

    while (this.physicsAccumulator >= FIXED_PHYSICS_DT) {
      const fixedDt = FIXED_PHYSICS_DT * timeScale;
      this.physicsAccumulator -= FIXED_PHYSICS_DT;
      substeps++;

      this.raceElapsedMs += fixedDt * 1000;

      // Tollbooth Countdown Clock
      if (this.raceParams.mode === 'tollbooth') {
        this.tollboothTimeLeftMs = Math.max(0, this.tollboothTimeLeftMs - fixedDt * 1000);
        if (this.tollboothTimeLeftMs <= 0) {
          this.completeRace(false, false, true);
          raceFinishedInStep = true;
          break;
        }
      }

      // Snapshot previous poses for smooth render interpolation
      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        r.prevPos.copy(r.pos);
        r.prevHeading = r.heading;
        r.prevSlopePitch = r.slopePitch;
        r.prevBankRoll = r.bankRoll;
        r.prevPitch = r.pitch;
        r.prevRoll = r.roll;
        r.prevAirHeight = r.airHeight;
      }

      this.stepPlayerPhysics(fixedDt, FIXED_PHYSICS_DT);
      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        if (r.shuntCooldown > 0) r.shuntCooldown = Math.max(0, r.shuntCooldown - fixedDt);
        if (r.copSlowdownTimer > 0) r.copSlowdownTimer = Math.max(0, r.copSlowdownTimer - fixedDt);
        if (r.shortcutPassCooldown > 0) r.shortcutPassCooldown = Math.max(0, r.shortcutPassCooldown - fixedDt);
        for (let t = 0; t < r.trapCooldowns.length; t++) {
          if (r.trapCooldowns[t] > 0) r.trapCooldowns[t] = Math.max(0, r.trapCooldowns[t] - fixedDt);
        }
        if (!r.isPlayer && !r.knockedOut) this.updateAiRacer(r, fixedDt, FIXED_PHYSICS_DT);
      }
      this.updateCivilianTraffic(fixedDt);
      this.resolveCarCollisions();
      this.updateTrackInteractions(fixedDt);
      this.updatePolicePursuit(fixedDt, FIXED_PHYSICS_DT);
      this.enforcePostCollisionBarrierSafety();

      if (this.rewindImmunityTimer > 0) {
        this.rewindImmunityTimer = Math.max(0, this.rewindImmunityTimer - fixedDt);
      }
      if (this.rewindBuffer.shouldCapture(fixedDt)) {
        this.captureRewindFrame();
      }
      this.ghostRecorder.sample(
        fixedDt,
        this.raceElapsedMs / 1000,
        this.player.pos,
        this.player.heading,
        this.player.slopePitch,
        this.player.bankRoll,
      );

      // Ensure post-collision positions don't create interpolation jitter on wall snaps
      if (this.raceParams.mode === 'knockout') {
        let activeCount = 0;
        let lap2Count = 0;
        let lap3Count = 0;
        for (let i = 0; i < this.racers.length; i++) {
          const r = this.racers[i];
          if (!r.knockedOut) {
            activeCount++;
            if (r.lap >= 2) lap2Count++;
            if (r.lap >= 3) lap3Count++;
          }
        }
        if (activeCount === 4 && lap2Count >= 3) {
          this.sortedRacersScratch.length = 0;
          for (let i = 0; i < this.racers.length; i++) {
            if (!this.racers[i].knockedOut) this.sortedRacersScratch.push(this.racers[i]);
          }
          this.sortedRacersScratch.sort((a, b) => b.totalProgress - a.totalProgress);
          const loser = this.sortedRacersScratch[this.sortedRacersScratch.length - 1];
          loser.knockedOut = true;
          loser.visual.root.visible = false;
          if (loser.isPlayer) {
            this.completeRace(false, true);
            raceFinishedInStep = true;
            break;
          }
          this.pushCallout(`KNOCKOUT! ${loser.name} ELIMINATED · 3 RACERS LEFT`, 'red');
          soundEngine.triggerBeep(true);
        } else if (activeCount === 3 && lap3Count >= 2) {
          this.sortedRacersScratch.length = 0;
          for (let i = 0; i < this.racers.length; i++) {
            if (!this.racers[i].knockedOut) this.sortedRacersScratch.push(this.racers[i]);
          }
          this.sortedRacersScratch.sort((a, b) => b.totalProgress - a.totalProgress);
          const loser = this.sortedRacersScratch[this.sortedRacersScratch.length - 1];
          loser.knockedOut = true;
          loser.visual.root.visible = false;
          if (loser.isPlayer) {
            this.completeRace(false, true);
            raceFinishedInStep = true;
            break;
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
        raceFinishedInStep = true;
        break;
      }
    }

    this.lastPhysicsMs = performance.now() - tPhysStart;
    this.lastSubsteps = substeps;
    if (raceFinishedInStep) return;

    const alpha = THREE.MathUtils.clamp(this.physicsAccumulator / FIXED_PHYSICS_DT, 0, 1);
    const dtRender = rawDt * timeScale;
    this.applyInterpolatedVisualsAndAudio(alpha, dtRender, rawDt, timeScale);

    if (this.heliGroup) {
      const heliAllowed =
        this.heatLevel >= 4 &&
        (this.pursuitState === 'pursuit' || (this.pursuitState === 'cooldown' && !this.isPlayerInTunnel() && !this.inCooldownZone));
      if (heliAllowed) {
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
          const beamHidden = this.isPlayerInTunnel() || this.inCooldownZone;
          this.heliBeam.visible = !beamHidden;
        }
      } else {
        this.heliGroup.visible = false;
      }
    }

    if (this.dynamicDayNight) {
      const sunTheta = this.weatherSnap.timeOfDayPhase * Math.PI * 2;
      const sunElev = 24 + Math.max(0, Math.sin((this.weatherSnap.timeOfDayPhase - 0.05) * Math.PI * 2)) * 46;
      this.sunLight.position.set(
        this.player.pos.x + Math.cos(sunTheta) * 72,
        this.player.pos.y + sunElev,
        this.player.pos.z + Math.sin(sunTheta) * 58,
      );
    } else {
      this.sunLight.position.set(this.player.pos.x + 65, this.player.pos.y + 58, this.player.pos.z - 45);
    }
    this.sunLight.target.position.copy(this.player.pos);
    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.set(this.player.pos.x, this.player.pos.y * 0.2, this.player.pos.z);
    }

    this.updateCamera(rawDt);
    this.updateParticles(dtRender);
    this.updateDebris(dtRender);
    this.updateRain(rawDt);
    const nosDown = this.input.nitrous || this.gamepadNitrousDown;
    this.updateSpeedStreaks(
      rawDt,
      (nosDown && this.nitrous > 1 && throttleDown) || this.driftBoostTimer > 0,
    );

    const totalLaps = this.getTotalLaps();
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

  private captureRewindFrame() {
    const slot = this.rewindBuffer.borrowNextWriteSlot();
    slot.raceElapsedMs = this.raceElapsedMs;
    slot.currentLapStartMs = this.currentLapStartMs;
    slot.tollboothTimeLeftMs = this.tollboothTimeLeftMs;
    slot.tollboothCheckpoint = this.tollboothCheckpoint;
    slot.nitrous = this.nitrous;
    slot.speedbreaker = this.speedbreaker;
    slot.sessionBounty = this.sessionBounty;

    for (let i = 0; i < slot.racers.length; i++) {
      const dst = slot.racers[i];
      if (i >= this.racers.length) {
        dst.active = false;
        continue;
      }
      const r = this.racers[i];
      dst.active = true;
      dst.x = r.pos.x;
      dst.y = r.pos.y;
      dst.z = r.pos.z;
      dst.heading = r.heading;
      dst.slopePitch = r.slopePitch;
      dst.bankRoll = r.bankRoll;
      dst.forwardSpeed = r.forwardSpeed;
      dst.lateralSpeed = r.lateralSpeed;
      dst.steerAngle = r.steerAngle;
      dst.pitch = r.pitch;
      dst.roll = r.roll;
      dst.airHeight = r.airHeight;
      dst.verticalVel = r.verticalVel;
      dst.airTimeTotal = r.airTimeTotal;
      dst.trackIdx = r.trackIdx;
      dst.progress = r.progress;
      dst.lap = r.lap;
      dst.totalProgress = r.totalProgress;
      dst.activeShortcutId = r.activeShortcutId;
      dst.reachedShortcutCore = r.reachedShortcutCore;
      dst.speedTrapTotalKmh = r.speedTrapTotalKmh;
      dst.speedTrapHits = r.speedTrapHits;
      dst.finished = r.finished;
      dst.knockedOut = r.knockedOut;
      dst.busted = r.busted;
      dst.frontDamage = r.frontDamage;
      dst.rearDamage = r.rearDamage;
      dst.sideDamage = r.sideDamage;
      dst.detachedHood = r.detachedHood;
      dst.detachedFrontBumper = r.detachedFrontBumper;
      dst.detachedRearBumper = r.detachedRearBumper;
      dst.detachedSpoiler = r.detachedSpoiler;
    }
  }

  private computeGearAndRpm(forwardSpeed: number, throttle: boolean): { gear: number; rpm: number } {
    const state = computeGearboxDriveState(forwardSpeed, throttle);
    return { gear: state.gear, rpm: state.rpm };
  }

  private stepPlayerPhysics(dt: number, rawFixedDt: number) {
    const p = this.player!;
    const track = this.track!;
    const cfg = this.raceParams!.playerConfig;
    const stats = computeEffectiveStats(p.spec, cfg);

    const throttleDown = this.input.throttle || this.gamepadThrottleDown;
    const brakeDown = this.input.brake || this.gamepadBrakeDown;
    const handbrakeDown = this.input.handbrake || this.gamepadHandbrakeDown;
    const nitrousDown = this.input.nitrous || this.gamepadNitrousDown;

    const baseMaxMs = stats.topSpeedKmh / 3.6;
    const nosActive = nitrousDown && this.nitrous > 1 && throttleDown;
    const boostFlare = nosActive || this.driftBoostTimer > 0;

    // Aerodynamic Slipstream check
    const pFwdX = -Math.sin(p.heading);
    const pFwdZ = -Math.cos(p.heading);
    let drafting = false;
    if (p.forwardSpeed > 32 && throttleDown) {
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

    if (boostFlare) {
      if (nosActive) {
        this.nitrous = Math.max(0, this.nitrous - rawFixedDt * (22 - cfg.nitrousLevel * 2.2));
      }
    } else {
      const passiveRecharge = 3.2 + cfg.nitrousLevel * 1.0 + (drafting ? 7.5 : 0);
      this.nitrous = Math.min(100, this.nitrous + rawFixedDt * passiveRecharge);
    }

    const airborne = p.airHeight > 0.12;
    const kbSteer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const rawSteerInput = THREE.MathUtils.clamp(
      Math.abs(this.gamepadSteer) > 0.05 ? this.gamepadSteer : kbSteer,
      -1,
      1,
    );
    const steerRate = Math.abs(rawSteerInput) > 0.05 ? 14.5 : 21.0;
    this.steerInputSmooth = THREE.MathUtils.damp(this.steerInputSmooth, rawSteerInput, steerRate, rawFixedDt);
    const steerInput = this.steerInputSmooth;

    const spikeWobble = this.spikedTimer > 0 ? Math.sin(performance.now() * 0.018) * 0.06 : 0;
    const targetWheelAngle = steerInput * 0.50 + spikeWobble;
    p.steerAngle = THREE.MathUtils.damp(p.steerAngle, targetWheelAngle, 18, rawFixedDt);

    // Track/shortcut surface query + upcoming curvature for optional Brake Assist
    const info = track.getClosestTrackInfo(p.pos.x, p.pos.z, p.trackIdx);
    const scHit =
      p.activeShortcutId !== null
        ? track.queryShortcut(p.pos.x, p.pos.z, p.activeShortcutId)
        : null;
    const inShortcut = Boolean(scHit && p.activeShortcutId !== null && scHit.shortcut.id === p.activeShortcutId);

    let upcomingTurnSeverity = 0;
    if (this.assists.brakeAssist) {
      const nSamples = track.samples.length;
      const curTan = track.samples[p.trackIdx].tangent;
      const aheadSample = track.samples[(p.trackIdx + 9) % nSamples].tangent;
      const dot = THREE.MathUtils.clamp(curTan.x * aheadSample.x + curTan.z * aheadSample.z, -1, 1);
      upcomingTurnSeverity = THREE.MathUtils.clamp((1 - dot) * 1.8, 0, 1);
    }

    // Populate pre-allocated VehicleStepInput (zero heap allocations)
    const sIn = this.vehicleStepIn;
    sIn.dt = dt;
    sIn.rawDt = rawFixedDt;
    sIn.forwardSpeed = p.forwardSpeed;
    sIn.lateralSpeed = p.lateralSpeed;
    sIn.steerAngle = p.steerAngle;
    sIn.rawSteerInput = rawSteerInput;
    sIn.throttleInput = throttleDown;
    sIn.brakeInput = brakeDown;
    sIn.handbrakeInput = handbrakeDown;
    sIn.throttleAxis = this.gamepadThrottleDown ? this.gamepadThrottleAxis : 1.0;
    sIn.brakeAxis = this.gamepadBrakeDown ? this.gamepadBrakeAxis : 1.0;
    sIn.nosActive = nosActive;
    sIn.driftBoostActive = this.driftBoostTimer > 0;
    sIn.drafting = drafting;
    sIn.airborne = airborne;
    sIn.spikedTimer = this.spikedTimer;
    sIn.isSpeedbreaker = this.isSpeedbreaker;
    sIn.baseMaxMs = baseMaxMs;
    sIn.maxForwardMs = maxForwardMs;
    sIn.accelStat = stats.accel;
    sIn.handlingStat = stats.handling;
    sIn.bodyStyle = p.spec.bodyStyle;
    sIn.upcomingTurnSeverity = upcomingTurnSeverity;
    sIn.lateralOffset = info.lateralOffset;
    sIn.roadHalfWidth = track.roadHalfWidth;
    sIn.inShortcut = inShortcut;
    sIn.shortcutLateral = scHit ? scHit.lateral : 0;
    sIn.shortcutHalfWidth = scHit ? scHit.shortcut.halfWidth : 7;
    sIn.environment = this.activeEnvironment;
    sIn.trackId = this.raceParams!.trackId;
    sIn.roadWetness = this.weatherSnap.roadWetness;
    sIn.slopePitch = p.slopePitch;
    sIn.bankAngle = p.bankRoll;
    sIn.landingVelMps = p.lastLandingVelMps;
    p.lastLandingVelMps = 0;
    const totalDmg = Math.min(1, p.frontDamage * 0.45 + p.rearDamage * 0.3 + p.sideDamage * 0.35);
    sIn.damageDragFactor = totalDmg * 0.1;
    sIn.alignmentPull = 0;
    sIn.wheelRadiusM = p.spec.dimensions.wheelRadius;
    sIn.tuning = this.tuning;
    sIn.assists = this.assists;

    stepVehiclePhysics(this.vehicleDynamics, sIn, this.vehicleStepOut);

    const sOut = this.vehicleStepOut;
    p.forwardSpeed = sOut.forwardSpeed;
    p.lateralSpeed = sOut.lateralSpeed;
    p.heading += sOut.yawRate * dt;
    this.playerHeaveOffset = sOut.heaveOffset;
    this.playerWheelspinIntensity = sOut.wheelspinIntensity;

    const airPitch = airborne ? THREE.MathUtils.clamp(p.verticalVel * 0.011, -0.11, 0.13) : 0;
    p.pitch = THREE.MathUtils.damp(p.pitch, sOut.targetPitch + airPitch, 11, rawFixedDt);
    p.roll = THREE.MathUtils.damp(p.roll, sOut.targetRoll, 11, rawFixedDt);

    const driftSlip = airborne ? 0 : Math.min(1, Math.abs(p.lateralSpeed) / 7.8);
    const wasDrifting = this.isDrifting;
    this.isDrifting = !airborne && driftSlip > 0.24 && Math.abs(p.forwardSpeed) > 14;

    if (this.isDrifting) {
      this.driftHoldSec += rawFixedDt;
      this.driftTimeTotalSec += rawFixedDt;
      this.nitrous = Math.min(100, this.nitrous + rawFixedDt * 14 * driftSlip);
      this.speedbreaker = Math.min(100, this.speedbreaker + rawFixedDt * 11 * driftSlip);
    } else {
      if (wasDrifting && this.driftHoldSec >= 0.55 && p.forwardSpeed > 20 && throttleDown) {
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

    const dx = (fwdX * p.forwardSpeed + rightX * p.lateralSpeed) * dt;
    const dz = (fwdZ * p.forwardSpeed + rightZ * p.lateralSpeed) * dt;
    const stepDist = Math.hypot(dx, dz);

    this.currentWallScrape = THREE.MathUtils.damp(this.currentWallScrape, 0, 14, rawFixedDt);

    // Continuous incremental collision sub-steps so barrier pushback never gets overwritten at high speed
    const numChecks = stepDist > CONTINUOUS_STEP_DISTANCE_M
      ? Math.min(4, Math.ceil(stepDist / CONTINUOUS_STEP_DISTANCE_M))
      : 1;
    const invN = 1 / numChecks;
    for (let c = 0; c < numChecks; c++) {
      p.pos.x += dx * invN;
      p.pos.z += dz * invN;
      this.constrainToTrackAndUpdateLap(p, dt * invN, true);
    }

    for (let wi = 0; wi < p.visual.wheelSpinners.length; wi++) {
      const wh = this.vehicleDynamics.wheels[wi];
      const angVel = wh ? wh.angularVelRadSec : p.forwardSpeed / p.spec.dimensions.wheelRadius;
      p.visual.wheelSpinners[wi].rotation.x -= angVel * dt;
    }
  }

  private applyInterpolatedVisualsAndAudio(alpha: number, dtRender: number, rawDt: number, timeScale: number) {
    const p = this.player!;
    const throttleDown = this.input.throttle || this.gamepadThrottleDown;
    const brakeDown = this.input.brake || this.gamepadBrakeDown;
    const handbrakeDown = this.input.handbrake || this.gamepadHandbrakeDown;
    const nitrousDown = this.input.nitrous || this.gamepadNitrousDown;
    const nosActive = nitrousDown && this.nitrous > 1 && throttleDown;
    const boostFlare = nosActive || this.driftBoostTimer > 0;
    const airborne = p.airHeight > 0.12;
    const driftSlip = airborne ? 0 : Math.min(1, Math.abs(p.lateralSpeed) / 7.8);

    // Interpolate all active racers' visual poses cleanly between prevPos and pos
    let aiLineIdx = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.knockedOut) continue;
      _interpPos.lerpVectors(r.prevPos, r.pos, alpha);
      const rHead = lerpAngle(r.prevHeading, r.heading, alpha);
      const rSlope = THREE.MathUtils.lerp(r.prevSlopePitch, r.slopePitch, alpha);
      const rBank = THREE.MathUtils.lerp(r.prevBankRoll, r.bankRoll, alpha);
      r.visual.root.position.copy(_interpPos);
      r.visual.root.rotation.set(rSlope, rHead, -rBank, 'YXZ');
      if (!r.isPlayer) {
        if (r.brain) {
          const b = r.brain;
          for (let wi = 0; wi < r.visual.wheelSpinners.length; wi++) {
            const wh = b.dyn.wheels[wi];
            const angVel = wh ? wh.angularVelRadSec : r.forwardSpeed / r.spec.dimensions.wheelRadius;
            r.visual.wheelSpinners[wi].rotation.x -= angVel * dtRender;
          }
          const aiSteer = r.steerAngle * 0.85;
          const flAck = aiSteer > 0 ? aiSteer * 1.09 : aiSteer * 0.91;
          const frAck = aiSteer < 0 ? aiSteer * 1.09 : aiSteer * 0.91;
          r.visual.wheelFrontLeft.rotation.y = flAck;
          r.visual.wheelFrontRight.rotation.y = frAck;

          const aiAir = r.airHeight > 0.12;
          const baseRad = r.visual.wheelBaseRadius;
          const latLean = aiAir ? 0 : THREE.MathUtils.clamp(b.dyn.latAccelG * 0.024, -0.045, 0.045);
          for (let wi = 0; wi < 4; wi++) {
            const wh = b.dyn.wheels[wi];
            const isLeft = wi === 0 || wi === 2;
            const staticCam = wi < 2 ? -0.02 : -0.012;
            const hubDrop = aiAir ? -0.06 : (wh.compression - 0.42) * 0.11;
            r.visual.wheelHubs[wi].position.y = baseRad + hubDrop;
            r.visual.wheelCamberPivots[wi].rotation.z = isLeft
              ? staticCam + latLean
              : -staticCam + latLean;
          }
          if (r.visual.rotorGlowMats.length >= 2) {
            const fTemp = Math.max(b.dyn.wheels[0].brakeTemp, b.dyn.wheels[1].brakeTemp);
            const rTemp = Math.max(b.dyn.wheels[2].brakeTemp, b.dyn.wheels[3].brakeTemp);
            r.visual.rotorGlowMats[0].emissiveIntensity = Math.pow(fTemp, 1.55) * 4.0;
            r.visual.rotorGlowMats[1].emissiveIntensity = Math.pow(rTemp, 1.55) * 3.2;
          }

          const aiSlipYaw = aiAir
            ? 0
            : THREE.MathUtils.clamp((r.lateralSpeed / Math.max(14, Math.abs(r.forwardSpeed))) * 0.26, -0.15, 0.15);
          r.visual.bodyGroup.position.y = -b.heaveOffset;
          r.visual.bodyGroup.rotation.x = THREE.MathUtils.lerp(r.prevPitch, r.pitch, alpha);
          r.visual.bodyGroup.rotation.y = THREE.MathUtils.damp(r.visual.bodyGroup.rotation.y, aiSlipYaw, 12, rawDt);
          r.visual.bodyGroup.rotation.z = THREE.MathUtils.lerp(r.prevRoll, r.roll, alpha);

          r.visual.brakeLightMat.emissiveIntensity = b.braking ? 4.4 : 1.05;
          for (let bi = 0; bi < r.visual.brakeGlows.length; bi++) {
            const bg = r.visual.brakeGlows[bi];
            (bg.material as THREE.MeshBasicMaterial).opacity = b.braking ? 0.68 : 0.2;
            bg.scale.setScalar(b.braking ? 1.3 : 0.9);
          }
          for (let fi = 0; fi < r.visual.nosFlames.length; fi++) {
            const f = r.visual.nosFlames[fi];
            f.visible = b.nosActive;
            if (b.nosActive) f.scale.set(1.0 + Math.random() * 0.18, 1.0 + Math.random() * 0.18, 0.8 + Math.random() * 0.85);
          }
          for (let ci = 0; ci < r.visual.nosCores.length; ci++) {
            const c = r.visual.nosCores[ci];
            c.visible = b.nosActive;
            if (b.nosActive) c.scale.set(1.0, 1.0, 0.7 + Math.random() * 0.65);
          }
          for (let hi = 0; hi < r.visual.nosHalos.length; hi++) {
            const h = r.visual.nosHalos[hi];
            h.visible = b.nosActive;
            if (b.nosActive) h.scale.setScalar(0.95 + Math.random() * 0.4);
          }
          const nearPlayer = r.pos.distanceToSquared(p.pos) < 85 * 85;
          if (nearPlayer && (b.isDrifting || b.wheelspinIntensity > 0.35) && Math.random() < 0.5) {
            const aiSurfColor = SURFACE_MODIFIERS[b.dyn.currentSurface].particleColor;
            _v1.set(r.pos.x + (Math.random() - 0.5) * 1.4, r.pos.y + 0.16, r.pos.z + (Math.random() - 0.5) * 1.4);
            _v2.set((Math.random() - 0.5) * 2.1, 1.45, (Math.random() - 0.5) * 2.1);
            this.spawnParticle(_v1, _v2, aiSurfColor, 0.88, 0.48);
          } else if (nearPlayer && this.weatherSnap.roadWetness > 0.35 && Math.abs(r.forwardSpeed) > 22 && Math.random() < 0.35) {
            _v1.set(r.pos.x + (Math.random() - 0.5) * 1.5, r.pos.y + 0.2, r.pos.z + (Math.random() - 0.5) * 1.5);
            _v2.set((Math.random() - 0.5) * 1.8, 1.6, (Math.random() - 0.5) * 1.8);
            this.spawnParticle(_v1, _v2, '#94A3B8', 0.65, 0.32);
          }
          if (this.aiDebugVisible && aiLineIdx < this.aiDebugLines.length) {
            const line = this.aiDebugLines[aiLineIdx++];
            const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
            const arr = posAttr.array as Float32Array;
            for (let k = 0; k < 6; k++) {
              arr[k * 3] = b.debugPoints[k].x;
              arr[k * 3 + 1] = b.debugPoints[k].y;
              arr[k * 3 + 2] = b.debugPoints[k].z;
            }
            posAttr.needsUpdate = true;
          }
        } else {
          const spin = (r.forwardSpeed * dtRender) / r.spec.dimensions.wheelRadius;
          for (let wi = 0; wi < r.visual.wheelSpinners.length; wi++) {
            r.visual.wheelSpinners[wi].rotation.x -= spin;
          }
          r.visual.wheelFrontLeft.rotation.y = r.steerAngle * 0.85;
          r.visual.wheelFrontRight.rotation.y = r.steerAngle * 0.85;
        }
      }
    }

    // Holographic Best Ghost Car playback
    if (this.ghostCarMesh) {
      if (this.showGhost && !this.outroActive && this.introTimer <= 0 && this.ghostPlayback.hasData()) {
        const active = this.ghostPlayback.samplePose(
          this.raceElapsedMs / 1000,
          this.ghostPosScratch,
          this.ghostRotScratch,
        );
        this.ghostCarMesh.root.visible = active;
        if (active) {
          this.ghostCarMesh.root.position.copy(this.ghostPosScratch);
          this.ghostCarMesh.root.rotation.copy(this.ghostRotScratch);
        }
      } else {
        this.ghostCarMesh.root.visible = false;
      }
    }

    // Player suspension heave, pitch, roll, slip yaw, Ackermann wheel steering, camber & rotor glow
    const interpPitch = THREE.MathUtils.lerp(p.prevPitch, p.pitch, alpha);
    const interpRoll = THREE.MathUtils.lerp(p.prevRoll, p.roll, alpha);
    const visualSlipYaw = airborne
      ? 0
      : THREE.MathUtils.clamp((p.lateralSpeed / Math.max(14, Math.abs(p.forwardSpeed))) * 0.28, -0.15, 0.15);

    p.visual.bodyGroup.position.y = -this.playerHeaveOffset;
    p.visual.bodyGroup.rotation.x = interpPitch;
    p.visual.bodyGroup.rotation.y = THREE.MathUtils.damp(p.visual.bodyGroup.rotation.y, visualSlipYaw, 12, rawDt);
    p.visual.bodyGroup.rotation.z = interpRoll;

    const steerViz = p.steerAngle * 0.88;
    p.visual.wheelFrontLeft.rotation.y = steerViz > 0 ? steerViz * 1.09 : steerViz * 0.91;
    p.visual.wheelFrontRight.rotation.y = steerViz < 0 ? steerViz * 1.09 : steerViz * 0.91;

    const pBaseRad = p.visual.wheelBaseRadius;
    const pLatLean = airborne ? 0 : THREE.MathUtils.clamp(this.vehicleDynamics.latAccelG * 0.028, -0.052, 0.052);
    for (let wi = 0; wi < 4; wi++) {
      const wh = this.vehicleDynamics.wheels[wi];
      const isLeft = wi === 0 || wi === 2;
      const staticCam = wi < 2 ? -0.022 : -0.014;
      const hubDrop = airborne ? -0.065 : (wh.compression - 0.42) * 0.125;
      p.visual.wheelHubs[wi].position.y = pBaseRad + hubDrop;
      p.visual.wheelCamberPivots[wi].rotation.z = isLeft
        ? staticCam + pLatLean
        : -staticCam + pLatLean;
    }
    if (p.visual.rotorGlowMats.length >= 2) {
      const fTemp = Math.max(this.vehicleDynamics.wheels[0].brakeTemp, this.vehicleDynamics.wheels[1].brakeTemp);
      const rTemp = Math.max(this.vehicleDynamics.wheels[2].brakeTemp, this.vehicleDynamics.wheels[3].brakeTemp);
      p.visual.rotorGlowMats[0].emissiveIntensity = Math.pow(fTemp, 1.55) * 4.4;
      p.visual.rotorGlowMats[1].emissiveIntensity = Math.pow(rTemp, 1.55) * 3.5;
    }

    // Skidmarks & surface-colored tire smoke / wet rain spray once per render frame
    if (this.spikedTimer > 0 && Math.abs(p.forwardSpeed) > 12 && Math.random() < 0.65) {
      _v1.set(p.pos.x + (Math.random() - 0.5) * 1.4, p.pos.y + 0.14, p.pos.z + (Math.random() - 0.5) * 1.4);
      _v2.set((Math.random() - 0.5) * 6, 2.5, (Math.random() - 0.5) * 6);
      this.spawnParticle(_v1, _v2, '#F59E0B', 0.44, 0.28);
    }

    const pSinH = Math.sin(p.heading);
    const pCosH = Math.cos(p.heading);
    const pFwdX = -pSinH;
    const pFwdZ = -pCosH;
    const pRightX = pCosH;
    const pRightZ = -pSinH;
    const surfaceColor = SURFACE_MODIFIERS[this.vehicleDynamics.currentSurface].particleColor;
    const isTireSliding =
      !airborne &&
      (this.isDrifting || this.playerWheelspinIntensity > 0.25 || (handbrakeDown && Math.abs(p.forwardSpeed) > 8));

    if (isTireSliding) {
      this.skidAccum += rawDt;
      const emitSkid = this.skidAccum > 0.038;
      if (emitSkid) this.skidAccum = 0;

      const trackHalf = p.spec.dimensions.width * 0.44;
      const frontAx = p.spec.dimensions.length * 0.305;
      const rearAx = -p.spec.dimensions.length * 0.305;

      for (let wi = 0; wi < 4; wi++) {
        const wh = this.vehicleDynamics.wheels[wi];
        const wheelSlipping =
          Math.abs(wh.slipRatio) > 0.22 ||
          Math.abs(wh.slipAngleRad) > 0.2 ||
          (wi >= 2 && handbrakeDown && Math.abs(p.forwardSpeed) > 7);
        if (!wheelSlipping) continue;

        const side = wi === 0 || wi === 2 ? -trackHalf : trackHalf;
        const ax = wi < 2 ? frontAx : rearAx;
        const wx = p.pos.x + pFwdX * ax + pRightX * side;
        const wz = p.pos.z + pFwdZ * ax + pRightZ * side;

        if (emitSkid) {
          this.placeSkidmark(wx, p.pos.y, wz, p.heading);
        }
        if (Math.random() < 0.55) {
          _v1.set(wx + (Math.random() - 0.5) * 0.25, p.pos.y + 0.16, wz + (Math.random() - 0.5) * 0.25);
          _v2.set((Math.random() - 0.5) * 2.2, 1.35 + Math.random() * 0.7, (Math.random() - 0.5) * 2.2);
          this.spawnParticle(_v1, _v2, surfaceColor, 0.92, 0.54);
        }
      }
    } else if (!airborne && this.weatherSnap.roadWetness > 0.32 && Math.abs(p.forwardSpeed) > 20 && Math.random() < 0.72) {
      const rearAx = -p.spec.dimensions.length * 0.31;
      const trackHalf = p.spec.dimensions.width * 0.44;
      const side = Math.random() > 0.5 ? trackHalf : -trackHalf;
      _v1.set(p.pos.x + pFwdX * rearAx + pRightX * side, p.pos.y + 0.2, p.pos.z + pFwdZ * rearAx + pRightZ * side);
      _v2.set(-pFwdX * 3.5 + (Math.random() - 0.5) * 1.8, 1.7 + Math.random() * 0.8, -pFwdZ * 3.5 + (Math.random() - 0.5) * 1.8);
      this.spawnParticle(_v1, _v2, '#CBD5E1', 0.68, 0.34);
    }

    // NOS Exhaust Flames
    if (boostFlare) {
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
    }

    const { gear, rpm } = this.computeGearAndRpm(p.forwardSpeed, throttleDown);
    this.backfireTimer = Math.max(-0.5, this.backfireTimer - rawDt);
    if (
      (gear > this.lastPlayerGear && gear > 1) ||
      (!throttleDown && rpm > 0.72 && p.forwardSpeed > 20 && this.backfireTimer <= -0.35)
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

    const braking = brakeDown || handbrakeDown;
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

    let inTunnel = false;
    if (this.track) {
      const ranges = this.track.tunnelRanges;
      for (let i = 0; i < ranges.length; i++) {
        if (p.trackIdx >= ranges[i].startIdx && p.trackIdx <= ranges[i].endIdx) {
          inTunnel = true;
          break;
        }
      }
    }

    soundEngine.update({
      active: true,
      rpm,
      throttle: throttleDown,
      gear,
      speedKmh: Math.abs(p.forwardSpeed) * 3.6,
      nosActive,
      driftSlip,
      copProximity: copProx,
      onCurb: this.playerOnCurb || this.vehicleDynamics.currentSurface !== 'asphalt',
      airborne,
      inTunnel,
      drafting: this.isSlipstreaming,
      nearBarrier: this.playerNearBarrier,
      wallScrape: this.currentWallScrape,
      wheelspin: this.playerWheelspinIntensity,
      timeScale,
    });
  }

  private updateAiRacer(ai: RacerEntity, dt: number, rawFixedDt = FIXED_PHYSICS_DT) {
    if (!this.track || !this.player || !this.raceParams) return;

    if (ai.brain) {
      stepAiRacerPhysics(
        ai,
        ai.brain,
        this.track,
        this.player,
        this.racers,
        this.traffic,
        this.cops,
        this.getRaceDifficulty(),
        this.aiSettings,
        this.tuning,
        this.assists,
        this.activeEnvironment,
        dt,
        rawFixedDt,
        this.weatherSnap.roadWetness,
        this.spikeStrips,
        this.raceParams.playerConfig,
      );
    }

    const fwdX = -Math.sin(ai.heading);
    const fwdZ = -Math.cos(ai.heading);
    const rightX = Math.cos(ai.heading);
    const rightZ = -Math.sin(ai.heading);

    const dx = (fwdX * ai.forwardSpeed + rightX * ai.lateralSpeed) * dt;
    const dz = (fwdZ * ai.forwardSpeed + rightZ * ai.lateralSpeed) * dt;
    const stepDist = Math.hypot(dx, dz);

    const numChecks = stepDist > CONTINUOUS_STEP_DISTANCE_M
      ? Math.min(4, Math.ceil(stepDist / CONTINUOUS_STEP_DISTANCE_M))
      : 1;
    const invN = 1 / numChecks;
    for (let c = 0; c < numChecks; c++) {
      ai.pos.x += dx * invN;
      ai.pos.z += dz * invN;
      this.constrainToTrackAndUpdateLap(ai, dt * invN, false);
    }
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
            const kickScale = -relVn > 14 ? 0.08 : 0.03;
            r.heading += THREE.MathUtils.clamp(-steerKick * kickScale, -0.14, 0.14);

            // Knock traffic car forward & sideways
            t.speed = Math.max(8, t.speed + Math.max(0, -relVn) * 0.45);
            t.knockLatVel = THREE.MathUtils.clamp(t.knockLatVel - (hitNx * tRightX + hitNz * tRightZ) * 9.5, -12, 12);
            t.laneOffset = THREE.MathUtils.clamp(t.laneOffset + (t.laneOffset >= 0 ? -1.8 : 1.8), -8.2, 8.2);

            if (t.hitCooldown <= 0) {
              t.hitCooldown = 0.65;
              const impactSpd = -relVn;
              if (impactSpd > 14) {
                const hitLocalX = hitNx * rRightX + hitNz * rRightZ;
                const hitLocalZ = -(hitNx * rFwdX + hitNz * rFwdZ);
                this.applyImpactDamage(r, hitLocalX, hitLocalZ, impactSpd, r.isPlayer);
              }
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
      r.verticalVel -= AIR_GRAVITY_MPS2 * dt;
      r.airHeight += r.verticalVel * dt;
      r.airTimeTotal += dt;
      if (isPlayer) this.airTimeTotalSec += dt;
      if (r.airHeight <= 0) {
        r.lastLandingVelMps = Math.max(r.lastLandingVelMps, Math.max(0, -r.verticalVel));
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
            this.pushCallout(`AIR TIME ${r.airTimeTotal.toFixed(1)}S · +$${airBonus.toLocaleString()} · NOS +15%`, 'cyan');
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

          if (vn > 16) {
            const locX = wallNx * rgtX + wallNz * rgtZ;
            const locZ = wallNx * fwdX + wallNz * fwdZ;
            this.applyImpactDamage(r, locX, locZ, vn, isPlayer);
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

        if (vn > 16) {
          const locX = wallNx * rgtX + wallNz * rgtZ;
          const locZ = wallNx * fwdX + wallNz * fwdZ;
          this.applyImpactDamage(r, locX, locZ, vn, isPlayer);
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
            // Mass-weighted momentum exchange along collision normal (e = 0.38)
            const getMass = (style: CarSpec['bodyStyle']) =>
              style === 'muscle' ? 1610 : style === 'sedan' ? 1510 : style === 'gtr' ? 1410 : style === 'coupe' ? 1390 : 1340;
            const mA = getMass(a.spec.bodyStyle);
            const mB = getMass(b.spec.bodyStyle);
            const invMassSum = 1 / (mA + mB);
            const impBase = -(1 + 0.38) * relVn;
            const dVa = impBase * (mB * invMassSum);
            const dVb = impBase * (mA * invMassSum);
            const newAvx = avx - bestNx * dVa;
            const newAvz = avz - bestNz * dVa;
            const newBvx = bvx + bestNx * dVb;
            const newBvz = bvz + bestNz * dVb;

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
              const kickCoef = impactSpd > 14 ? 0.075 : 0.028;
              a.heading += THREE.MathUtils.clamp(sideKickA * kickCoef, -0.12, 0.12);
              b.heading += THREE.MathUtils.clamp(-sideKickB * kickCoef, -0.12, 0.12);
              if (impactSpd > 15) {
                const fwdHitA = bestNx * aFwdX + bestNz * aFwdZ;
                const fwdHitB = -(bestNx * bFwdX + bestNz * bFwdZ);
                this.applyImpactDamage(a, sideKickA, fwdHitA, impactSpd, a.isPlayer && impactSpd > 38);
                this.applyImpactDamage(b, -sideKickB, fwdHitB, impactSpd, b.isPlayer && impactSpd > 38);
              }
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
        let firstKnockedCop: CopEntity | null = null;

        for (let k = 0; k < 12; k++) {
          _v2.set((Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14);
          this.spawnParticle(pb.position, _v2, '#F59E0B', 0.9, 0.7);
        }
        for (let d = 0; d < 4; d++) {
          _v1.set(pb.position.x + (Math.random() - 0.5) * 2.5, pb.position.y + 2.2, pb.position.z + (Math.random() - 0.5) * 2.5);
          _v2.set((Math.random() - 0.5) * 12, 4.5 + Math.random() * 5, (Math.random() - 0.5) * 12);
          this.spawnDebris(_v1, _v2, 0.9, 0.4, 0.7, '#F59E0B');
        }

        for (const cop of this.cops) {
          if (!cop.wrecked && cop.pos.distanceTo(pb.position) < POLICE_PURSUIT_BREAKER_RADIUS_M) {
            cop.wrecked = true;
            cop.wreckTimer = 8;
            cop.vx *= 0.3;
            cop.vz *= 0.3;
            knocked++;
            if (!firstKnockedCop) firstKnockedCop = cop;
            this.copsTakedowns++;
            this.sessionBounty += 2500;
          }
        }
        if (knocked > 0) {
          this.nitrous = Math.min(100, this.nitrous + 35);
          if (firstKnockedCop) {
            this.triggerDramaticCam(firstKnockedCop.pos, 'takedown');
          }
        }
        this.pushCallout(
          knocked > 0
            ? `PURSUIT BREAKER! ${knocked} COP${knocked > 1 ? 'S' : ''} DOWN · +35% NOS`
            : 'PURSUIT BREAKER TRIGGERED! +$2,000 BOUNTY',
          'amber',
        );
      }
    }
  }

  private updatePolicePursuit(dt: number, rawDt: number) {
    if (!this.track || !this.player || !this.raceParams) return;
    if (!this.patrolsEnabled) {
      this.policeLosActive = false;
      this.inCooldownZone = false;
      this.losBrokenTimer = 0;
      return;
    }
    if (this.pursuitState === 'evaded' || this.pursuitState === 'busted') {
      this.policeLosActive = false;
      this.inCooldownZone = false;
      musicEngine.setPursuitIntensity(false, this.heatLevel);
      return;
    }

    const p = this.player;
    const isPursuitFocused = this.raceParams.mode === 'pursuit' || this.raceParams.mode === 'freeroam';
    const wet = this.weatherSnap.roadWetness;

    // Handle active patrolling cruisers BEFORE pursuit starts — real road motion, no teleporting
    if (this.pursuitState === 'none') {
      this.policeLosActive = false;
      this.inCooldownZone = false;
      this.losBrokenTimer = 0;
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
        cop.vx = -Math.sin(cop.heading) * cop.speed;
        cop.vz = -Math.cos(cop.heading) * cop.speed;
        cop.pos.x += cop.vx * dt;
        cop.pos.z += cop.vz * dt;
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
          const raceDiff = this.getRaceDifficulty();
          const speedTriggerKmh = raceDiff === 'Easy' && this.raceParams.mode !== 'pursuit' ? 142 : 132;
          const detectDistSq = 56 * 56;
          if (bumpedPatrol || (Math.abs(rc.forwardSpeed) * 3.6 > speedTriggerKmh && dSq < detectDistSq)) {
            this.pursuitState = 'pursuit';
            this.heatLevel = 1;
            this.highestHeat = Math.max(this.highestHeat, 1);
            this.policeLosActive = true;
            this.losBrokenTimer = 0;
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

    const heatSpec = HEAT_POLICE_SPECS[Math.max(1, Math.min(5, this.heatLevel))] ?? HEAT_POLICE_SPECS[1];
    const desiredCops = isPursuitFocused
      ? heatSpec.desiredUnitsMax
      : Math.min(heatSpec.desiredUnitsMax, Math.max(heatSpec.desiredUnitsMin, this.heatLevel + 1));

    let activeNormalCops = 0;
    for (let i = 0; i < this.cops.length; i++) {
      if (!this.cops[i].wrecked && !this.cops[i].isRoadblock) activeNormalCops++;
    }

    this.copSpawnTimer -= dt;
    if (activeNormalCops < desiredCops && this.copSpawnTimer <= 0) {
      this.copSpawnTimer = Math.max(3.5, 6.8 - this.heatLevel * 0.6);
      let leadRacer = p;
      for (let i = 0; i < this.racers.length; i++) {
        const cand = this.racers[i];
        if (!cand.knockedOut && !cand.finished && cand.totalProgress > leadRacer.totalProgress) {
          leadRacer = cand;
        }
      }
      const spawnRhino = this.heatLevel >= 3 && Math.random() > 0.55;
      if (spawnRhino) {
        const aheadSamples =
          POLICE_SPAWN_AHEAD_MIN_SAMPLES +
          Math.floor(Math.random() * (POLICE_SPAWN_AHEAD_MAX_SAMPLES - POLICE_SPAWN_AHEAD_MIN_SAMPLES + 1));
        this.spawnPoliceCruiser(leadRacer.trackIdx + aheadSamples, (Math.random() - 0.5) * 4.5, false, true, true);
        this.pushCallout('HEAVY RHINO ENFORCER AHEAD ON INTERCEPT!', 'red');
        this.pushRadio('Chopper 2: Heavy Rhino Enforcer charging down the highway!');
      } else {
        const aheadOffset =
          activeNormalCops % 2 === 0
            ? POLICE_SPAWN_AHEAD_MIN_SAMPLES + Math.floor(Math.random() * 14)
            : -32;
        this.spawnPoliceCruiser(leadRacer.trackIdx + aheadOffset, (Math.random() - 0.5) * 6.0, false, false, false);
      }
    }

    if (heatSpec.roadblockAllowed || (this.raceParams.mode === 'pursuit' && this.heatLevel >= 2)) {
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
        if (rc.knockedOut || rc.busted || rc.finished || rc.airHeight >= 0.75) continue;
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
            rc.copSlowdownTimer = 1.8;
            rc.forwardSpeed *= 0.65;
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
      if (cop.hitStunTimer > 0) {
        cop.hitStunTimer = Math.max(0, cop.hitStunTimer - dt);
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
        cop.vx = THREE.MathUtils.damp(cop.vx, 0, 3.2, dt);
        cop.vz = THREE.MathUtils.damp(cop.vz, 0, 3.2, dt);
        cop.pos.x += cop.vx * dt;
        cop.pos.z += cop.vz * dt;
        cop.speed = Math.hypot(cop.vx, cop.vz);
        cop.visual.root.position.copy(cop.pos);
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

      // Despawn far-away units cleanly so cops never teleport back behind the player
      if ((cop.isRoadblock && distToPlayer > 230) || (!cop.isRoadblock && !cop.isHeadOn && distToPlayer > POLICE_DESPAWN_DIST_M)) {
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

      // Multi-target pursuit
      let target: RacerEntity = p;
      let targetDist = distToPlayer;
      if (!cop.isRoadblock) {
        let bestScore = Infinity;
        const huntBotsBias = cop.id % 2 === 0;
        for (let r = 0; r < this.racers.length; r++) {
          const cand = this.racers[r];
          if (cand.knockedOut || cand.busted || cand.finished) continue;
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

        const steerLimit = heatSpec.maxSteerRate * (1 - wet * 0.18) * (cop.hitStunTimer > 0 ? 0.45 : 1.0);
        cop.heading += THREE.MathUtils.clamp(diff * 4.2, -steerLimit, steerLimit) * dt;

        // Real physics velocity-vector integration with wet-road slip and honest top speed
        const baseCopKmh = cop.isRhino ? heatSpec.rhinoTopSpeedKmh : heatSpec.topSpeedKmh;
        const cornerScale = 1 - Math.min(0.26, Math.abs(diff) * 0.32) - wet * 0.08;
        const targetMaxSpeed = (baseCopKmh / 3.6) * Math.max(0.55, cornerScale);

        const fwdX = -Math.sin(cop.heading);
        const fwdZ = -Math.cos(cop.heading);
        const rightX = Math.cos(cop.heading);
        const rightZ = -Math.sin(cop.heading);

        let fwdVel = cop.vx * fwdX + cop.vz * fwdZ;
        let latVel = cop.vx * rightX + cop.vz * rightZ;

        const copAccel = heatSpec.accelMps2 * (cop.isRhino ? 0.84 : 1.0) * (1 - wet * 0.16);
        if (cop.hitStunTimer > 0) {
          fwdVel = THREE.MathUtils.damp(fwdVel, targetMaxSpeed * 0.6, 2.2, dt);
        } else if (fwdVel < targetMaxSpeed) {
          fwdVel = Math.min(targetMaxSpeed, fwdVel + copAccel * dt);
        } else {
          fwdVel = Math.max(targetMaxSpeed, fwdVel - 22 * dt);
        }

        const latGripRate = (cop.hitStunTimer > 0 ? 2.6 : 7.8) * (1 - wet * 0.35);
        latVel = THREE.MathUtils.damp(latVel, 0, latGripRate, dt);

        cop.vx = fwdX * fwdVel + rightX * latVel;
        cop.vz = fwdZ * fwdVel + rightZ * latVel;
        cop.speed = Math.hypot(cop.vx, cop.vz);

        cop.pos.x += cop.vx * dt;
        cop.pos.z += cop.vz * dt;

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
            const nx = -copScHit.tangent.z * scOuter;
            const nz = copScHit.tangent.x * scOuter;
            cop.pos.x -= nx * ex;
            cop.pos.z -= nz * ex;
            const vn = cop.vx * nx + cop.vz * nz;
            if (vn > 0) {
              cop.vx -= nx * vn * 1.25;
              cop.vz -= nz * vn * 1.25;
            }
          } else if (inScMid && copScHit.lateral * scOuter < -maxCopScLat) {
            const ex = Math.min(-copScHit.lateral * scOuter - maxCopScLat, 3.5);
            const nx = -copScHit.tangent.z * -scOuter;
            const nz = copScHit.tangent.x * -scOuter;
            cop.pos.x -= nx * ex;
            cop.pos.z -= nz * ex;
            const vn = cop.vx * nx + cop.vz * nz;
            if (vn > 0) {
              cop.vx -= nx * vn * 1.25;
              cop.vz -= nz * vn * 1.25;
            }
          }
          cop.pos.y = copScHit.elevationY + ROAD_SURFACE_OFFSET;
          cop.visual.root.rotation.set(copScHit.slopePitch, cop.heading, 0, 'YXZ');
        } else {
          cop.pos.y = cInfo.elevationY + ROAD_SURFACE_OFFSET;
          const maxLat = this.track.barrierHalfWidth - 1.2;
          if (Math.abs(cInfo.lateralOffset) > maxLat) {
            const sign = Math.sign(cInfo.lateralOffset);
            const ex = Math.min(Math.abs(cInfo.lateralOffset) - maxLat, 3.5);
            const nx = cInfo.sample.right.x * sign;
            const nz = cInfo.sample.right.z * sign;
            cop.pos.x -= nx * ex;
            cop.pos.z -= nz * ex;
            const vn = cop.vx * nx + cop.vz * nz;
            if (vn > 0) {
              cop.vx -= nx * vn * 1.25;
              cop.vz -= nz * vn * 1.25;
            }
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

      // Cop collision against AI rivals — mass-weighted momentum exchange + visual damage
      for (let r = 0; r < this.racers.length; r++) {
        const ai = this.racers[r];
        if (ai.isPlayer || ai.knockedOut || ai.busted || ai.finished) continue;
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
            cop.aiHitCooldown = 1.6;
            cop.hitStunTimer = 0.55;
            ai.copSlowdownTimer = 1.4;
            const aiSpeedKmh = Math.abs(ai.forwardSpeed) * 3.6;
            ai.forwardSpeed *= cop.isRhino ? 0.58 : cop.isRoadblock ? 0.64 : 0.72;
            ai.heading += THREE.MathUtils.clamp((Math.random() - 0.5) * 0.24, -0.16, 0.16);
            cop.vx *= 0.55;
            cop.vz *= 0.55;

            const aFwdX = -Math.sin(ai.heading);
            const aFwdZ = -Math.cos(ai.heading);
            const aRightX = Math.cos(ai.heading);
            const aRightZ = -Math.sin(ai.heading);
            const lhx = (-nx) * aRightX + (-nz) * aRightZ;
            const lhz = (-nx) * aFwdX + (-nz) * aFwdZ;
            this.applyImpactDamage(ai, lhx, lhz, Math.max(15, aiSpeedKmh / 3.6), false);

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

      // Cop collision against Player — mass-weighted momentum impulse, visual damage & dramatic Takedown NOS
      const minPlDist = cop.isRhino ? 2.95 : 2.65;
      if (!cop.wrecked && distToPlayer < minPlDist && p.airHeight < 1.2) {
        const pFwdX = -Math.sin(p.heading);
        const pFwdZ = -Math.cos(p.heading);
        const pRightX = Math.cos(p.heading);
        const pRightZ = -Math.sin(p.heading);
        const pVx = pFwdX * p.forwardSpeed + pRightX * p.lateralSpeed;
        const pVz = pFwdZ * p.forwardSpeed + pRightZ * p.lateralSpeed;
        const copVx = cop.isRoadblock ? 0 : cop.vx;
        const copVz = cop.isRoadblock ? 0 : cop.vz;
        const relVx = pVx - copVx;
        const relVz = pVz - copVz;
        const relSpeedMps = Math.hypot(relVx, relVz);
        const relSpeedKmh = relSpeedMps * 3.6;

        const nosRam = this.input.nitrous && this.nitrous > 1;
        this.camShake = Math.max(this.camShake, 0.42);
        soundEngine.triggerImpact(0.88);

        for (let s = 0; s < 6; s++) {
          _v2.set((Math.random() - 0.5) * 12, 3 + Math.random() * 4, (Math.random() - 0.5) * 12);
          this.spawnParticle(cop.pos, _v2, '#F59E0B', 0.55, 0.4);
        }

        const nx = (p.pos.x - cop.pos.x) / Math.max(0.1, distToPlayer);
        const nz = (p.pos.z - cop.pos.z) / Math.max(0.1, distToPlayer);
        const sep = (minPlDist - distToPlayer) * 0.58;
        p.pos.x += nx * sep;
        p.pos.z += nz * sep;
        cop.pos.x -= nx * sep;
        cop.pos.z -= nz * sep;

        // Apply visual deformation on player chassis toward impact side
        const localHitX = (-nx) * pRightX + (-nz) * pRightZ;
        const localHitZ = (-nx) * pFwdX + (-nz) * pFwdZ;
        this.applyImpactDamage(p, localHitX, localHitZ, relSpeedMps, false);

        // Mass-weighted impulse along collision normal
        const playerMass = 1480;
        const copMass = cop.massKg;
        const vn = relVx * nx + relVz * nz;
        if (vn < 0) {
          const j = (-(1 + 0.35) * vn) / (1 / playerMass + 1 / copMass);
          const pNextVx = pVx + (j / playerMass) * nx;
          const pNextVz = pVz + (j / playerMass) * nz;
          p.forwardSpeed = pNextVx * pFwdX + pNextVz * pFwdZ;
          p.lateralSpeed = pNextVx * pRightX + pNextVz * pRightZ;
          cop.vx -= (j / copMass) * nx;
          cop.vz -= (j / copMass) * nz;
          cop.speed = Math.hypot(cop.vx, cop.vz);
        }
        cop.hitStunTimer = 0.7;

        const takedownThreshold = cop.isRhino ? 88 : 48;
        if (relSpeedKmh > takedownThreshold || (nosRam && relSpeedKmh > 32) || (cop.isRoadblock && Math.abs(p.forwardSpeed) * 3.6 > 95)) {
          cop.wrecked = true;
          cop.wreckTimer = 7;
          this.copsTakedowns++;
          const reward = cop.isRhino ? 4500 : cop.isRoadblock ? 3000 : 2500;
          this.sessionBounty += reward;
          this.nitrous = Math.min(100, this.nitrous + 35);
          for (let d = 0; d < 3; d++) {
            _v1.set(cop.pos.x, cop.pos.y + 0.65, cop.pos.z);
            _v2.set((Math.random() - 0.5) * 11, 5 + Math.random() * 4, (Math.random() - 0.5) * 11);
            this.spawnDebris(_v1, _v2, 0.75, 0.16, 0.65, cop.isRhino ? '#334155' : '#0F172A');
          }
          this.triggerDramaticCam(cop.pos, 'takedown');
          this.pushCallout(
            `${cop.isRhino ? 'RHINO' : 'COP'} TAKEDOWN! +$${reward.toLocaleString()} · +35% NOS`,
            'amber',
          );
          p.forwardSpeed *= cop.isRhino ? 0.78 : cop.isRoadblock ? 0.80 : 0.92;
        } else {
          p.pos.x += nx * 0.7;
          p.pos.z += nz * 0.7;
          cop.pos.x -= nx * 0.9;
          cop.pos.z -= nz * 0.9;
          cop.vx *= 0.5;
          cop.vz *= 0.5;
          cop.speed = Math.hypot(cop.vx, cop.vz);
          p.forwardSpeed *= cop.isRhino ? 0.72 : cop.isRoadblock ? 0.68 : 0.88;
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

    // Honest Line-of-Sight check: tunnel occlusion, cooldown bay cover, Heat 4+ helicopter lock
    const inTunnel = this.isPlayerInTunnel();
    this.inCooldownZone = this.track.cooldownZones.some(
      (z) => p.pos.distanceToSquared(z.position) < z.radius * z.radius,
    );
    const effectiveLos =
      inTunnel || this.inCooldownZone ? Math.min(28, heatSpec.losRangeM * 0.35) : heatSpec.losRangeM;
    const heliLock =
      heatSpec.helicopterLocked && !inTunnel && !this.inCooldownZone && closestCopDistToPlayer < 165;
    const hasVisual = closestCopDistToPlayer <= effectiveLos || heliLock;
    this.policeLosActive = hasVisual;

    if (!hasVisual) {
      this.losBrokenTimer += rawDt;
      if (this.losBrokenTimer >= POLICE_LOS_BREAK_GRACE_SEC && this.pursuitState !== 'cooldown') {
        this.pursuitState = 'cooldown';
        this.pushCallout(
          inTunnel
            ? 'TUNNEL COVER — LOS BROKEN! EVADING...'
            : 'COOLDOWN — HEAD FOR GREEN HIDING BAYS',
          'emerald',
        );
        this.pushRadio('Dispatch: Lost visual on suspect. Sweeping perimeter.');
      }
      if (this.pursuitState === 'cooldown') {
        const evadeRate = this.inCooldownZone ? POLICE_COOLDOWN_BAY_EVADE_RATE : POLICE_COOLDOWN_EVADE_BASE_RATE;
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
            this.losBrokenTimer = 0;
            this.heatLevel = 1;
            this.cops.forEach((c) => {
              this.scene.remove(c.visual.root);
              c.visual.dispose();
            });
            this.cops = [];
          }
        }
      }
    } else {
      this.losBrokenTimer = 0;
      if (this.pursuitState === 'cooldown') {
        this.pursuitState = 'pursuit';
        this.pushCallout(heliLock ? 'CHOPPER 2 RE-ACQUIRED HEAT SIGNATURE!' : 'UNITS RE-ACQUIRED VISUAL!', 'red');
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

    // AI Opponent pinning & arrest check by RPD units
    if (this.cops.length > 0) {
      for (let r = 0; r < this.racers.length; r++) {
        const rc = this.racers[r];
        if (rc.isPlayer || rc.finished || rc.knockedOut || rc.busted) continue;
        let minCopDistSq = Infinity;
        let copsNear = 0;
        for (let ci = 0; ci < this.cops.length; ci++) {
          const c = this.cops[ci];
          if (c.wrecked) continue;
          const dSq = c.pos.distanceToSquared(rc.pos);
          if (dSq < minCopDistSq) minCopDistSq = dSq;
          if (dSq < 14 * 14) copsNear++;
        }
        const aiSpeedKmh = Math.abs(rc.forwardSpeed) * 3.6;
        if (
          minCopDistSq < 11.5 * 11.5 &&
          (aiSpeedKmh < 32 || (rc.copSlowdownTimer > 0 && aiSpeedKmh < 60))
        ) {
          rc.bustProgress = Math.min(100, rc.bustProgress + rawDt * (24 + copsNear * 14));
          if (rc.bustProgress >= 100) {
            rc.busted = true;
            rc.bustProgress = 100;
            rc.forwardSpeed *= 0.35;
            for (let ci = 0; ci < this.cops.length; ci++) {
              if (this.cops[ci].targetId === rc.id) {
                this.cops[ci].targetId = p.id;
              }
            }
            this.pushCallout(`BUSTED! RPD STOPPED ${rc.name}!`, 'cyan');
            this.pushRadio(`Dispatch: Suspect ${rc.name} boxed in and placed under arrest!`);
            for (let s = 0; s < 8; s++) {
              _v2.set((Math.random() - 0.5) * 9, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 9);
              this.spawnParticle(rc.pos, _v2, '#38BDF8', 0.65, 0.42);
            }
          }
        } else {
          rc.bustProgress = Math.max(0, rc.bustProgress - rawDt * 24);
        }
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
    if ((m.maxDamagePercent ?? 0) > 0) {
      const dmgPct = Math.round(
        Math.min(100, (this.player.frontDamage * 0.45 + this.player.rearDamage * 0.3 + this.player.sideDamage * 0.25) * 100),
      );
      items.push({
        label: `Clean Chassis <= ${m.maxDamagePercent}%`,
        current: `${dmgPct}% / ${m.maxDamagePercent}%`,
        done: dmgPct <= (m.maxDamagePercent ?? 100),
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
      if (a.busted !== b.busted) return a.busted ? 1 : -1;
      if (isSpeedtrap && b.speedTrapTotalKmh !== a.speedTrapTotalKmh) {
        return b.speedTrapTotalKmh - a.speedTrapTotalKmh;
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

    // Persist offline Ghost replay & track personal best on valid non-busted completions
    if (
      !this.ghostSavedThisRun &&
      !busted &&
      !knockedOut &&
      !tollboothExpired &&
      this.raceParams.mode !== 'freeroam' &&
      this.raceParams.mode !== 'pursuit'
    ) {
      this.ghostSavedThisRun = true;
      const saved = saveBestGhostIfFaster(
        this.raceParams.trackId,
        this.raceParams.mode,
        this.raceParams.playerSpec.id,
        this.raceParams.playerSpec.name,
        'You',
        result.totalTimeMs,
        result.bestLapMs,
        this.ghostRecorder.frames,
      );
      if (saved.isNewRecord && saved.data) {
        this.bestGhostForCurrentTrack = saved.data;
        this.callbacks.onGhostSaved?.(true, saved.data);
      } else {
        this.callbacks.onGhostSaved?.(false, saved.data);
      }
    }

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

    // Corner-anticipation camera yaw look-into-apex at racing speed
    let cornerApexShift = 0;
    if (this.track && absLook < 0.25 && Math.abs(p.forwardSpeed) > 16) {
      const nSamples = this.track.samples.length;
      const aheadS = this.track.samples[(p.trackIdx + 9) % nSamples];
      const aheadHead = Math.atan2(-aheadS.tangent.x, -aheadS.tangent.z);
      let dH = aheadHead - p.heading;
      while (dH > Math.PI) dH -= Math.PI * 2;
      while (dH < -Math.PI) dH += Math.PI * 2;
      cornerApexShift = THREE.MathUtils.clamp(dH * 0.18 * speedRatio, -0.14, 0.14);
    }

    const slopeLookOffset = Math.sin(p.slopePitch) * 12;
    if (this.cameraMode === 'hood' || this.cameraMode === 'bumper') {
      const viewHeading = p.heading + this.lookYawOffset + cornerApexShift * 0.45;
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
      const lookHeading = orbitHeading + cornerApexShift;
      const lkFwdX = -Math.sin(lookHeading);
      const lkFwdZ = -Math.cos(lookHeading);
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
        p.pos.x + lkFwdX * lookAheadDist,
        p.pos.y + (this.cameraMode === 'chase_far' ? 1.08 : 0.96) + (lookingBehind ? -slopeLookOffset : slopeLookOffset * swingFade),
        p.pos.z + lkFwdZ * lookAheadDist,
      );
    }

    if (this.takedownCamTimer > 0 && !this.outroActive && absLook < 0.3) {
      const progress = 1 - this.takedownCamTimer / Math.max(0.1, this.takedownCamDuration);
      const sweepHeading = p.heading + this.takedownCamAngle + progress * 0.58;
      const dist = this.takedownCamMode === 'takedown' ? 6.2 : 5.4;
      const cx = this.takedownCamTarget.x + Math.sin(sweepHeading) * dist;
      const cz = this.takedownCamTarget.z + Math.cos(sweepHeading) * dist;
      const cy = this.takedownCamTarget.y + (this.takedownCamMode === 'takedown' ? 1.55 : 1.38);
      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, cx, 11, rawDt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, cy, 11, rawDt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, cz, 11, rawDt);
      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, this.takedownCamTarget.x, 14, rawDt);
      this.camLook.y = THREE.MathUtils.damp(this.camLook.y, this.takedownCamTarget.y + 0.85, 14, rawDt);
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, this.takedownCamTarget.z, 14, rawDt);
      this.camShake = THREE.MathUtils.damp(this.camShake, 0, 12, rawDt);
      this.camera.position.set(this.camPos.x, this.camPos.y, this.camPos.z);
      this.camera.lookAt(this.camLook);
      this.camera.rotation.z += this.takedownCamMode === 'takedown' ? 0.085 : -0.09;
      if (this.skyDomeMesh) {
        this.skyDomeMesh.position.set(this.camera.position.x, 0, this.camera.position.z);
      }
      if (Math.abs(this.camera.fov - 55) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 55, 8, rawDt);
        this.camera.updateProjectionMatrix();
      }
      return;
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
        -this.steerInputSmooth * speedRatio * 0.032 - p.lateralSpeed * 0.0045,
        -0.055,
        0.055,
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
    const activeCount = Math.min(this.rainCount, this.activeRainCount);
    const limit = Math.max(activeCount, this.prevActiveRainCount);
    for (let i = 0; i < limit; i++) {
      if (i >= activeCount) {
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
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
    this.prevActiveRainCount = activeCount;
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
    const throttleDown = this.input.throttle || this.gamepadThrottleDown;
    const nitrousDown = this.input.nitrous || this.gamepadNitrousDown;
    const speedKmh = Math.round(Math.abs(p.forwardSpeed) * 3.6);
    const { gear, rpm } = this.computeGearAndRpm(p.forwardSpeed, throttleDown);

    const isSpeedtrap = this.raceParams?.mode === 'speedtrap';
    this.sortedRacersScratch.length = 0;
    let activeRacers = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (!r.knockedOut) {
        this.sortedRacersScratch.push(r);
        if (!r.busted) activeRacers++;
      }
    }
    this.sortedRacersScratch.sort((a, b) => {
      if (a.busted !== b.busted) return a.busted ? 1 : -1;
      if (isSpeedtrap && b.speedTrapTotalKmh !== a.speedTrapTotalKmh) {
        return b.speedTrapTotalKmh - a.speedTrapTotalKmh;
      }
      return b.totalProgress - a.totalProgress;
    });
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

    let blipIdx = 0;
    const pushBlip = (x: number, z: number, type: MinimapBlip['type'], heading?: number) => {
      let b = this.blipsScratch[blipIdx];
      if (!b) {
        b = { x, z, type, heading };
        this.blipsScratch[blipIdx] = b;
      } else {
        b.x = x;
        b.z = z;
        b.type = type;
        b.heading = heading;
      }
      blipIdx++;
    };
    for (let i = 0; i < this.track.cooldownZones.length; i++) {
      const z = this.track.cooldownZones[i];
      pushBlip(z.position.x, z.position.z, 'cooldown');
    }
    for (let i = 0; i < this.track.pursuitBreakers.length; i++) {
      const b = this.track.pursuitBreakers[i];
      if (!b.triggered) pushBlip(b.position.x, b.position.z, 'breaker');
    }
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (!r.isPlayer && !r.knockedOut && !r.busted) pushBlip(r.pos.x, r.pos.z, 'rival');
    }
    let activeCopsCount = 0;
    for (let i = 0; i < this.cops.length; i++) {
      const c = this.cops[i];
      if (!c.wrecked) {
        activeCopsCount++;
        pushBlip(c.pos.x, c.pos.z, c.isRhino ? 'rhino' : 'cop');
      }
    }
    pushBlip(p.pos.x, p.pos.z, 'player', p.heading);
    this.blipsScratch.length = blipIdx;

    // Populate Opponent Status List (zero allocation reuse)
    let oppIdx = 0;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.isPlayer) continue;
      const rankIdx = this.sortedRacersScratch.indexOf(r);
      const rPos = rankIdx >= 0 ? rankIdx + 1 : this.racers.length;
      const rStatus: OpponentHudStatus = r.knockedOut
        ? 'knocked_out'
        : r.busted
          ? 'busted'
          : r.finished
            ? 'finished'
            : 'racing';
      const rGap = Math.round((r.totalProgress - p.totalProgress) * this.track.totalLength);
      const rSpd = Math.round(Math.abs(r.forwardSpeed) * 3.6);
      const rBust = Math.round(r.bustProgress);
      let opp = this.opponentsScratch[oppIdx];
      if (!opp) {
        opp = {
          id: r.id,
          name: r.name,
          carName: r.spec.name,
          paintHex: r.visual.paintHex,
          isBoss: r.id === 'rival_boss',
          position: rPos,
          status: rStatus,
          gapMeters: rGap,
          speedKmh: rSpd,
          bustProgress: rBust,
        };
        this.opponentsScratch[oppIdx] = opp;
      } else {
        opp.id = r.id;
        opp.name = r.name;
        opp.carName = r.spec.name;
        opp.paintHex = r.visual.paintHex;
        opp.isBoss = r.id === 'rival_boss';
        opp.position = rPos;
        opp.status = rStatus;
        opp.gapMeters = rGap;
        opp.speedKmh = rSpd;
        opp.bustProgress = rBust;
      }
      oppIdx++;
    }
    this.opponentsScratch.length = oppIdx;
    if (oppIdx > 1) {
      this.opponentsScratch.sort((a, b) => a.position - b.position);
    }

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

    // Update zero-GC Dev Telemetry structure in place
    let activeEntities = this.racers.length + this.traffic.length + this.spikeStrips.length;
    for (let i = 0; i < this.cops.length; i++) {
      if (!this.cops[i].wrecked) activeEntities++;
    }
    for (let i = 0; i < this.particleCount; i++) {
      if (this.particles[i].active) activeEntities++;
    }
    for (let i = 0; i < this.speedStreakCount; i++) {
      if (this.speedStreaks[i].active) activeEntities++;
    }

    const dtData = this.devTelemetryData;
    dtData.fps = this.currentFps;
    dtData.frameMs = Math.round(this.lastFrameMs * 100) / 100;
    dtData.physicsMs = Math.round(this.lastPhysicsMs * 100) / 100;
    dtData.drawCalls = this.renderer.info.render.calls;
    dtData.activeEntities = activeEntities;
    dtData.substeps = this.lastSubsteps;
    dtData.surface = this.vehicleDynamics.currentSurface;
    dtData.handlingMode = this.handlingMode;
    syncWheelTelemetry(this.vehicleDynamics, dtData.wheels);

    // Populate AI Debug telemetry entries (zero allocation reuse)
    let aiDebugIdx = 0;
    if (this.aiDebugVisible) {
      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        if (r.isPlayer || !r.brain) continue;
        const gapM = Math.round((r.totalProgress - p.totalProgress) * this.track.totalLength);
        let entry = this.aiDebugEntriesScratch[aiDebugIdx];
        if (!entry) {
          entry = {
            id: r.id,
            name: r.name,
            personality: r.brain.personality,
            action: r.brain.actionTag,
            speedKmh: 0,
            targetSpeedKmh: 0,
            nitrous: 100,
            adaptiveMult: 1,
            gapMeters: 0,
          };
          this.aiDebugEntriesScratch[aiDebugIdx] = entry;
        }
        entry.id = r.id;
        entry.name = r.name;
        entry.personality = r.brain.personality;
        entry.action = r.busted ? 'BUSTED' : r.brain.actionTag;
        entry.speedKmh = Math.round(Math.abs(r.forwardSpeed) * 3.6);
        entry.targetSpeedKmh = Math.round(r.brain.targetSpeedMs * 3.6);
        entry.nitrous = Math.round(r.brain.nitrous);
        entry.adaptiveMult = Math.round(r.brain.adaptiveMult * 100) / 100;
        entry.gapMeters = gapM;
        aiDebugIdx++;
      }
      this.aiDebugEntriesScratch.length = aiDebugIdx;
    } else {
      this.aiDebugEntriesScratch.length = 0;
    }

    this.callbacks.onTelemetry({
      speedKmh,
      rpm,
      gear,
      nitrous: this.nitrous,
      speedbreaker: this.speedbreaker,
      isSpeedbreakerActive: this.isSpeedbreaker,
      isNitrousActive: (nitrousDown && this.nitrous > 1 && throttleDown) || this.driftBoostTimer > 0,
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
      activeCops: activeCopsCount,
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
      minimapShortcuts: this.minimapShortcutsCached,
      minimapBlips: this.blipsScratch,
      opponents: this.opponentsScratch.length > 0 ? this.opponentsScratch : undefined,
      cameraMode: this.cameraMode,
      fps: this.currentFps,
      surfaceType: this.vehicleDynamics.currentSurface,
      handlingMode: this.handlingMode,
      gamepadConnected: this.gamepadConnected,
      rewindsLeft: this.rewindsLeft,
      rewindUnlimited: isFreeroam,
      rewindBufferSec: Math.round(this.rewindBuffer.getAvailableSeconds() * 10) / 10,
      hasBestGhost: Boolean(this.bestGhostForCurrentTrack),
      ghostEnabled: this.showGhost,
      aiDebugEntries: this.aiDebugVisible ? this.aiDebugEntriesScratch : undefined,
      weatherState: this.weatherSnap.activeWeather,
      roadWetness: this.weatherSnap.roadWetness,
      damagePercent: Math.round(
        Math.min(100, (p.frontDamage * 0.45 + p.rearDamage * 0.3 + p.sideDamage * 0.25) * 100),
      ),
      detachedPartsCount:
        (p.detachedHood ? 1 : 0) +
        (p.detachedFrontBumper ? 1 : 0) +
        (p.detachedRearBumper ? 1 : 0) +
        (p.detachedSpoiler ? 1 : 0),
      policeLosActive: this.policeLosActive,
      inCooldownZone: this.inCooldownZone,
      helicopterActive: Boolean(
        this.pursuitState !== 'none' &&
          this.patrolsEnabled &&
          (HEAT_POLICE_SPECS[Math.max(1, Math.min(5, this.heatLevel))]?.helicopterLocked ?? false),
      ),
      takedownCamActive: this.takedownCamTimer > 0 && !this.outroActive,
      devTelemetry: dtData,
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

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.resetInput();
      if (this.mode === 'race' && !this.paused && !this.outroActive) {
        this.setPaused(true);
        this.callbacks.onAutoPause?.();
      }
    }
  };

  private handleGamepadConnected = (e: GamepadEvent) => {
    this.gamepadConnected = true;
    this.callbacks.onGamepadChange?.(true, e.gamepad.id);
    if (this.mode === 'race') {
      this.pushCallout('GAMEPAD CONNECTED', 'cyan');
    }
  };

  private handleGamepadDisconnected = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let anyActive = false;
    let activeId: string | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) {
        anyActive = true;
        activeId = pads[i]!.id;
        break;
      }
    }
    this.gamepadConnected = anyActive;
    if (!anyActive) {
      this.gamepadSteer = 0;
      this.gamepadThrottleDown = false;
      this.gamepadBrakeDown = false;
      this.gamepadHandbrakeDown = false;
      this.gamepadNitrousDown = false;
      this.gamepadBreakerDown = false;
    }
    this.callbacks.onGamepadChange?.(anyActive, activeId);
  };

  private pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        pad = pads[i];
        break;
      }
    }
    if (!pad) {
      if (this.gamepadConnected) {
        this.gamepadConnected = false;
        this.gamepadSteer = 0;
        this.gamepadThrottleDown = false;
        this.gamepadBrakeDown = false;
        this.gamepadHandbrakeDown = false;
        this.gamepadNitrousDown = false;
        this.gamepadBreakerDown = false;
        this.callbacks.onGamepadChange?.(false, null);
      }
      return;
    }
    if (!this.gamepadConnected) {
      this.gamepadConnected = true;
      this.callbacks.onGamepadChange?.(true, pad.id);
    }

    const rawX = pad.axes[0] ?? 0;
    const deadzone = 0.18;
    if (Math.abs(rawX) > deadzone) {
      const mag = (Math.abs(rawX) - deadzone) / (1 - deadzone);
      // Negate X so left stick left (+1) matches keyboard left = +1 steer
      this.gamepadSteer = -Math.sign(rawX) * mag;
    } else {
      this.gamepadSteer = 0;
    }

    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    const btnA = Boolean(pad.buttons[0]?.pressed);
    const btnB = Boolean(pad.buttons[1]?.pressed);
    const btnX = Boolean(pad.buttons[2]?.pressed);
    const btnY = Boolean(pad.buttons[3]?.pressed);
    const btnLB = Boolean(pad.buttons[4]?.pressed);
    const btnRB = Boolean(pad.buttons[5]?.pressed);
    const btnBack = Boolean(pad.buttons[8]?.pressed);
    const btnStart = Boolean(pad.buttons[9]?.pressed);
    const btnDpadUp = Boolean(pad.buttons[12]?.pressed);

    this.gamepadThrottleAxis = Math.max(rt, btnA ? 1 : 0);
    this.gamepadBrakeAxis = Math.max(lt, btnX ? 1 : 0);
    this.gamepadThrottleDown = this.gamepadThrottleAxis > 0.08;
    this.gamepadBrakeDown = this.gamepadBrakeAxis > 0.08;
    this.gamepadHandbrakeDown = btnB;
    this.gamepadNitrousDown = btnRB || btnY;
    this.gamepadBreakerDown = btnLB;

    if (btnStart && !this.gamepadPrevStart && this.mode === 'race' && !this.outroActive) {
      this.callbacks.onPauseRequest?.();
    }
    if (btnBack && !this.gamepadPrevCam && this.mode === 'race' && !this.outroActive) {
      this.cycleCameraMode();
    }
    if (btnDpadUp && !this.gamepadPrevReset && this.mode === 'race' && !this.outroActive) {
      this.resetPlayerToTrack();
    }
    this.gamepadPrevStart = btnStart;
    this.gamepadPrevCam = btnBack;
    this.gamepadPrevReset = btnDpadUp;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'race' || this.outroActive) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
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

    const b = this.controlBindings;
    const c = e.code;
    if (matchesKeyBinding(c, b.throttle.primary, b.throttle.secondary)) this.input.throttle = true;
    if (matchesKeyBinding(c, b.brake.primary, b.brake.secondary)) this.input.brake = true;
    if (matchesKeyBinding(c, b.left.primary, b.left.secondary)) this.input.left = true;
    if (matchesKeyBinding(c, b.right.primary, b.right.secondary)) this.input.right = true;
    if (matchesKeyBinding(c, b.lookLeft.primary, b.lookLeft.secondary)) this.lookLeft = true;
    if (matchesKeyBinding(c, b.lookRight.primary, b.lookRight.secondary)) this.lookRight = true;
    if (matchesKeyBinding(c, b.lookBack.primary, b.lookBack.secondary)) this.lookBack = true;
    if (matchesKeyBinding(c, b.handbrake.primary, b.handbrake.secondary)) this.input.handbrake = true;
    if (matchesKeyBinding(c, b.nitrous.primary, b.nitrous.secondary)) this.input.nitrous = true;
    if (matchesKeyBinding(c, b.speedbreaker.primary, b.speedbreaker.secondary)) this.input.speedbreaker = true;

    if (!e.repeat) {
      if (matchesKeyBinding(c, b.cycleCamera.primary, b.cycleCamera.secondary)) {
        this.cycleCameraMode();
      } else if (matchesKeyBinding(c, b.nextMusicTrack.primary, b.nextMusicTrack.secondary)) {
        this.skipMusicTrack();
      } else if (matchesKeyBinding(c, b.resetToTrack.primary, b.resetToTrack.secondary)) {
        this.resetPlayerToTrack();
      } else if (matchesKeyBinding(c, b.instantRestart.primary, b.instantRestart.secondary)) {
        e.preventDefault();
        this.instantRestartRace();
      } else if (matchesKeyBinding(c, b.rewind.primary, b.rewind.secondary)) {
        e.preventDefault();
        this.triggerRewind();
      } else if (matchesKeyBinding(c, b.toggleTuning.primary, b.toggleTuning.secondary)) {
        this.callbacks.onToggleTuning?.();
      } else if (matchesKeyBinding(c, b.toggleTelemetry.primary, b.toggleTelemetry.secondary)) {
        e.preventDefault();
        this.callbacks.onToggleTelemetry?.();
      } else if (matchesKeyBinding(c, b.toggleAiDebug.primary, b.toggleAiDebug.secondary)) {
        e.preventDefault();
        this.setAiDebugVisible(!this.aiDebugVisible);
        this.callbacks.onToggleAiDebug?.();
      } else if (matchesKeyBinding(c, b.toggleGhost.primary, b.toggleGhost.secondary)) {
        const next = !this.showGhost;
        this.setShowGhost(next);
        this.pushCallout(next ? 'BEST GHOST: ON' : 'BEST GHOST: OFF', 'cyan');
        this.callbacks.onToggleGhost?.(next);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const b = this.controlBindings;
    const c = e.code;
    if (matchesKeyBinding(c, b.throttle.primary, b.throttle.secondary)) this.input.throttle = false;
    if (matchesKeyBinding(c, b.brake.primary, b.brake.secondary)) this.input.brake = false;
    if (matchesKeyBinding(c, b.left.primary, b.left.secondary)) this.input.left = false;
    if (matchesKeyBinding(c, b.right.primary, b.right.secondary)) this.input.right = false;
    if (matchesKeyBinding(c, b.lookLeft.primary, b.lookLeft.secondary)) this.lookLeft = false;
    if (matchesKeyBinding(c, b.lookRight.primary, b.lookRight.secondary)) this.lookRight = false;
    if (matchesKeyBinding(c, b.lookBack.primary, b.lookBack.secondary)) this.lookBack = false;
    if (matchesKeyBinding(c, b.handbrake.primary, b.handbrake.secondary)) this.input.handbrake = false;
    if (matchesKeyBinding(c, b.nitrous.primary, b.nitrous.secondary)) this.input.nitrous = false;
    if (matchesKeyBinding(c, b.speedbreaker.primary, b.speedbreaker.secondary)) this.input.speedbreaker = false;
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
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
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
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
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
