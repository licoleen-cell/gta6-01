// Every tuning number and colour for SOLVADO HEAT in one place. The city is measured in world
// pixels (one pixel roughly a hand's width of street), the simulation runs at a fixed 60 steps a
// second, and the renderer fits the view to the window, so no rule here depends on screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The street grid: 9x9 blocks, a road between every pair, a sidewalk ringing every block. */
export const GRID = { cols: 9, rows: 9, block: 224, road: 96, sidewalk: 15 };

/** One block plus the road on its north and west side. */
export const CELL = GRID.block + GRID.road;

/** The city proper is square: 9 cells plus the closing road. The beach and the sea run off its south. */
export const CITY = GRID.cols * CELL + GRID.road;
export const BEACH = 190;
export const SEA = 470;
export const WORLD = { w: CITY, h: CITY + BEACH + SEA };

/** How far a lane's centre sits from a road's centre line. */
export const LANE = 23;

/** The camera follows the player: zoomed in on foot, pulled back a little at speed. */
export const CAMERA = {
  zoom: 1.34,
  zoomFast: 1.06,
  speedForZoom: 300,
  smooth: 7.5,
  lookAhead: 26,
};

export const PLAYER = {
  radius: 9,
  walk: 128,
  run: 198,
  health: 100,
  punchRange: 30,
  punchArc: 1.15,
  punchDamage: 34,
  punchCooldown: 0.36,
  enterRange: 52,
};

/** The car the player drives and the ones the city drives: one arcade model, a few bodies. */
export const VEHICLE = {
  length: 46,
  width: 23,
  accel: 250,
  brake: 520,
  reverse: 150,
  maxSpeed: 340,
  maxReverse: 120,
  drag: 1.9,
  rollDrag: 0.6,
  grip: 7.4,
  steer: 2.9,
  handbrakeGrip: 2.2,
  handbrakeDrag: 2.6,
  radius: 15,
  mass: 1,
};

export const TRAFFIC = {
  cars: 34,
  peds: 74,
  carSpeedMin: 92,
  carSpeedMax: 142,
  pedSpeedMin: 30,
  pedSpeedMax: 52,
  despawn: 1250,
  spawnMin: 420,
  spawnMax: 900,
};

export const POLICE = {
  /** How many patrol cars the force keeps on you at each star count (0 has none). */
  carsPerStar: [0, 1, 2, 3, 4, 6],
  /** How many of those crews get out and come at you on foot. */
  footPerStar: [0, 1, 2, 3, 4, 5],
  carSpeedMin: 130,
  carSpeedMax: 205,
  footSpeed: 148,
  sightRange: 620,
  spawnMin: 520,
  spawnMax: 1000,
  arrestRange: 26,
  arrestSeconds: 1.15,
  bribePerStar: 240,
};

/** Heat runs 0..100; each full 20 is a star. Crimes add heat, quiet time takes it away. */
export const WANTED = {
  max: 100,
  perStar: 20,
  stealCar: 16,
  downPed: 26,
  ramCop: 12,
  punchCop: 30,
  /** Seconds without a crime before heat starts coming down. */
  quietDelay: [0, 5, 7, 9, 12, 15],
  /** Heat lost per second once quiet, by star count. */
  decay: [0, 2.6, 2.1, 1.7, 1.3, 0.9],
  /** Heat lost per second while hidden (no officer can see you), on top of the above. */
  hiding: 3.4,
};

export const PALETTE = {
  grass: '#8fae6a',
  grassDark: '#7c9c5b',
  park: '#7fa95f',
  path: '#d9cbaa',
  asphalt: '#4e4c52',
  asphaltDark: '#46444a',
  asphaltLight: '#56545b',
  line: '#e8e2cf',
  lineDim: '#cfc7af',
  sidewalk: '#cfc8b8',
  sidewalkEdge: '#b3ab99',
  curb: '#a49b88',
  lot: '#b9b2a2',
  sand: '#e6d3a5',
  sandDark: '#d9c493',
  water: '#2c93a8',
  waterDeep: '#1d7388',
  waterShallow: '#4fb4c2',
  foam: '#dff2f2',
  roofShadow: 'rgba(24, 32, 58, 0.20)',
  shadow: 'rgba(24, 32, 58, 0.22)',
  trunk: '#8a6242',
  palm: '#4f8f4a',
  palmLight: '#6aa85c',
  tree: '#4a834a',
  treeDark: '#3d6f3f',
  metal: '#8d939c',
  hudInk: '#101820',
  gold: '#ffd166',
  teal: '#38c5b8',
  red: '#e5534b',
  blue: '#4aa8e0',
  white: '#fbf7ee',
};

/** Building facades, roofs and accents: sun-bleached Mediterranean-modern. */
export const BUILDING_COLORS = [
  { wall: '#efe3c8', roof: '#d6c4a4', trim: '#c8b48d' },
  { wall: '#e9b9a3', roof: '#cfa189', trim: '#bd8f74' },
  { wall: '#a9cec7', roof: '#8fb8b0', trim: '#78a29a' },
  { wall: '#f6f1e4', roof: '#dbd2bd', trim: '#c4ba9f' },
  { wall: '#e2c48c', roof: '#c8a970', trim: '#b0925c' },
  { wall: '#c6c1dd', roof: '#aca6c6', trim: '#948eae' },
  { wall: '#f0c9a4', roof: '#d4ab85', trim: '#bd926c' },
  { wall: '#bfd3a4', roof: '#a5b98b', trim: '#8fa075' },
  { wall: '#dfd6c8', roof: '#c5bba9', trim: '#aca28f' },
];

/** The paint a civilian car can wear. */
export const CAR_COLORS = [
  '#d9574f', '#3f7fbf', '#e0a63c', '#6aa06a', '#c9c4bb', '#8a63a8',
  '#3fa79b', '#c96b3c', '#4a4f5a', '#e2d6bb', '#b04a6a', '#5d8fbf',
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Where a save lives between visits (this browser only). */
export const SAVE_KEY = 'solvado-heat.save.v1';
