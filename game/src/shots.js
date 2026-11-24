// The scenes behind ?shot=..., each one the real simulation played forward from a fresh world and
// then arranged the way a short session would have left it: the player in a car with the force on
// their tail, a busy avenue seen over a bonnet, the first job's briefing on the plaza. Every body
// in frame is a live entity the rules are stepping; the only staging is where they start and how
// long the autopilot drives, so the same seed always paints the same frame.
import { CELL, LANE, STEP } from './config.js';
import { createCar } from './vehicle.js';
import { startJob } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { createRandom } from './random.js';

/** The lane point a car aims for when heading from `from` to `node` (keeps right). */
function laneAim(node, from) {
  const dx = node.x - from.x;
  const dy = node.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: node.x - (dy / len) * LANE, y: node.y + (dx / len) * LANE };
}

function controls(move, extra = {}) {
  return { move, run: false, handbrake: false, enter: false, punch: false, ...extra };
}

/** Where the eastbound lane runs at the given block row. */
function eastLaneY(row) {
  return row * CELL + 48 + LANE;
}

function northLaneX(col) {
  return col * CELL + 48 - LANE;
}

/** Put a traffic car on the lane from one node to the next, a little way along it. */
function placeTraffic(world, car, from, node, t, cruise) {
  const aim = laneAim(node, from);
  car.from = from;
  car.node = node;
  car.x = from.x + (aim.x - from.x) * t;
  car.y = from.y + (aim.y - from.y) * t;
  car.angle = Math.atan2(aim.y - from.y, aim.x - from.x);
  car.speed = cruise;
  car.cruise = cruise;
  car.stuck = 0;
}

/** Stand a pedestrian partway along a block's sidewalk ring. */
function placePed(world, ped, col, row, seg, t) {
  const loop = world.city.walkLoops[row * 9 + col];
  if (!loop) return;
  const a = loop[seg % loop.length];
  const b = loop[(seg + 1) % loop.length];
  ped.loop = loop;
  ped.seg = (seg + 1) % loop.length;
  ped.dir = 1;
  ped.x = a.x + (b.x - a.x) * t;
  ped.y = a.y + (b.y - a.y) * t;
  ped.px = ped.x;
  ped.py = ped.y;
  ped.facing = Math.atan2(b.y - a.y, b.x - a.x);
  ped.panic = 0;
  ped.alive = true;
}

/** Fill the avenue around the player with traffic and the corners with people. */
function dressStreet(world, row, col) {
  const nodes = world.city.nodes;
  const cars = world.traffic.cars;
  let i = 0;
  // Eastbound: a queue ahead, a couple behind.
  for (const [from, to, t] of [
    [3, 4, 0.62], [3, 4, 0.34], [4, 5, 0.18], [5, 6, 0.55], [2, 3, 0.72],
  ]) {
    const car = cars[i++];
    if (car) placeTraffic(world, car, nodes[row][from], nodes[row][to], t, 96 + (i % 3) * 12);
  }
  // Westbound, the oncoming lane.
  for (const [from, to, t] of [[5, 4, 0.6], [6, 5, 0.22], [4, 3, 0.4]]) {
    const car = cars[i++];
    if (car) placeTraffic(world, car, nodes[row][from], nodes[row][to], t, 104 + (i % 3) * 10);
  }
  // Cross street, north and south, so the junction is busy.
  for (const [from, to, t] of [[row + 1, row, 0.5], [row, row + 1, 0.72]]) {
    const car = cars[i++];
    if (car) placeTraffic(world, car, nodes[from][col], nodes[to][col], t, 92);
  }
  // People on the four corners.
  const peds = world.traffic.peds;
  let p = 0;
  const corners = [
    [col, row, 0, 0.4], [col + 1, row, 2, 0.7], [col, row + 1, 1, 0.55], [col + 1, row + 1, 3, 0.3],
  ];
  for (const [pc, pr, seg, t] of corners) {
    for (let k = 0; k < 4; k += 1) {
      const ped = peds[p++];
      if (ped) placePed(world, ped, Math.min(8, pc), Math.min(8, pr), seg + k, (t + k * 0.13) % 1);
    }
  }
}

/** Clear the momentary damage white-out so a still shows each car's paint, not a hit frame. */
function settlePaint(world, car) {
  car.flash = 0;
  car.smoke = 0;
  for (const other of world.traffic.cars) other.flash = 0;
  for (const other of world.police.cars) other.flash = 0;
}

function snapCamera(world, x, y, zoom) {
  world.camera.x = x;
  world.camera.y = y;
  world.camera.zoom = zoom;
  world.camera.shake = 0;
}

/** Drive east along the row, keeping to the lane. */
function autopilotEast(world, car) {
  const lane = eastLaneY(Math.round((car.y - 48 - LANE) / CELL));
  const steer = Math.max(-1, Math.min(1, (lane - car.y) * 0.05));
  return controls({ x: steer > 0.2 ? 1 : steer < -0.2 ? -1 : 0, y: -1 });
}

function sceneChase(world, random) {
  world.reset();
  world.money = 1240;
  // Job 3 starts you hot: the briefing asks you to shake the force off.
  world.missions.index = 2;
  startJob(world.missions, world);
  world.banner = world.missions.banner;
  world.bannerTimer = world.missions.bannerTimer;

  const row = 4;
  const col = 3;
  const nodes = world.city.nodes;
  // The player's car, mid-avenue, heading east in the eastbound lane.
  const car = createCar(nodes[row][col].x + 40, eastLaneY(row), 0, '#3f7fbf', 'civilian');
  car.speed = 210;
  world.player.car = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.facing = 0;

  // A patrol car close on the quarter and another coming the other way, both with lights up.
  const tail = createCar(car.x - 96, eastLaneY(row) - 6, 0, '#f4f2ec', 'police');
  tail.speed = 220;
  tail.officers = 2;
  tail.siren = 0.4;
  world.police.cars.push(tail);
  const tail2 = createCar(car.x - 214, eastLaneY(row) + 4, 0, '#f4f2ec', 'police');
  tail2.speed = 214;
  tail2.officers = 1;
  tail2.siren = 0.9;
  world.police.cars.push(tail2);
  const oncoming = createCar(car.x + 210, row * CELL + 48 - LANE, Math.PI, '#f4f2ec', 'police');
  oncoming.speed = 180;
  oncoming.officers = 2;
  oncoming.siren = 1.4;
  world.police.cars.push(oncoming);

  // An officer already out of the car and running along the kerb.
  world.police.officers.push({
    x: car.x - 54, y: eastLaneY(row) + 40, px: 0, py: 0, facing: 0,
    speed: 150, health: 100, alive: true, phase: 1.2, kind: 'cop', swing: 0,
  });

  // Traffic ahead and behind, so the street is not a private road.
  dressStreet(world, row, col + 1);

  snapCamera(world, car.x + 40, car.y + 2, 1.2);
  const fixed = { x: 0, y: -1 };
  for (let i = 0; i < 46; i += 1) {
    world.step = STEP;
    const speed = Math.abs(car.speed) / 340;
    world.player.car = car;
    stepFixed(world, controls(fixed, { handbrake: false }), 1);
    // Keep the camera glued: this frame is a portrait, not a follow.
    snapCamera(world, car.x + 40, car.y + 2, 1.2 - speed * 0.06);
  }
  // A touch of body english on the wheel and lights mid-flash.
  car.steer = 0.1;
  tail.siren = 0.62;
  tail2.siren = 0.28;
  oncoming.siren = 0.94;
  world.wanted.flash = 0.9;
  // The cover is the chase itself: the job banner and the objective card already name what is
  // happening, so the three-line briefing card is kept out of the middle of the frame.
  world.briefing = [];
  world.briefingTimer = 0;
  settlePaint(world, car);
  return { screen: SCREEN_PLAY };
}

/** A step helper so the scenes and the shell step the same world the same way. */
let stepFixed = null;

function sceneStreets(world) {
  world.reset();
  world.money = 860;
  // The last job's first leg: drive to the club. No heat, so the street is just a street.
  world.missions.index = 3;
  world.missions.step = 0;
  world.missions.active = true;
  world.briefing = [];
  world.briefingTimer = 0;

  const row = 5;
  const col = 3;
  const nodes = world.city.nodes;
  const car = createCar(nodes[row][col].x + 10, eastLaneY(row), 0, '#c96b3c', 'civilian');
  car.speed = 150;
  world.player.car = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.facing = 0;
  dressStreet(world, row, col + 1);
  // Held a little south of the car: the avenue's oncoming lane sits below the player, and this
  // lifts the near traffic clear of the bottom edge instead of cutting a car on it.
  snapCamera(world, car.x + 90, car.y + 4, 1.16);
  for (let i = 0; i < 34; i += 1) {
    stepFixed(world, controls({ x: 0, y: -1 }), 1);
    snapCamera(world, car.x + 90, car.y + 4, 1.16);
  }
  car.speed = 168;
  settlePaint(world, car);
  return { screen: SCREEN_PLAY };
}

function sceneMission(world) {
  world.reset();
  world.money = 320;
  world.missions.index = 0;
  world.missions.step = 0;
  world.missions.active = true;
  const job = world.missions.jobs[0];
  world.briefing = job.briefing.slice();
  world.briefingTimer = 9.5;
  world.banner = job.title;
  world.bannerTimer = 4;

  // On foot on the plaza's south sidewalk, the kiosk and the fountain in frame.
  const plaza = world.city.pois.plaza;
  world.player.x = plaza.x - 118;
  world.player.y = plaza.y + 96;
  world.player.facing = -Math.PI / 2;
  world.player.step = 1.4;
  // A few people crossing the plaza, and a car on the avenue behind.
  const peds = world.traffic.peds;
  for (let i = 0; i < 8; i += 1) {
    const ped = peds[i];
    if (!ped) continue;
    const a = (i / 8) * Math.PI * 2;
    ped.loop = world.city.walkLoops[4];
    ped.seg = 1;
    ped.dir = 1;
    ped.x = plaza.x + Math.cos(a) * 66;
    ped.y = plaza.y + Math.sin(a) * 52;
    ped.facing = a + Math.PI / 2;
    ped.phase = i;
    ped.alive = true;
    ped.panic = 0;
  }
  const nodes = world.city.nodes;
  const car = world.traffic.cars[0];
  if (car) placeTraffic(world, car, nodes[1][3], nodes[1][4], 0.55, 104);
  const car2 = world.traffic.cars[1];
  if (car2) placeTraffic(world, car2, nodes[1][4], nodes[1][3], 0.35, 98);

  snapCamera(world, plaza.x - 20, plaza.y + 40, 1.4);
  for (let i = 0; i < 24; i += 1) {
    stepFixed(world, controls({ x: 0, y: 0 }), 1);
    world.player.x = plaza.x - 118;
    world.player.y = plaza.y + 96;
    snapCamera(world, plaza.x - 20, plaza.y + 40, 1.4);
  }
  world.briefing = job.briefing.slice();
  world.briefingTimer = 9.0;
  world.banner = job.title;
  world.bannerTimer = 3.4;
  return { screen: SCREEN_PLAY };
}

function sceneTitle(world) {
  world.reset();
  world.money = 140;
  world.missions.index = 0;
  world.missions.step = 0;
  world.missions.active = true;
  const row = 4;
  const col = 2;
  dressStreet(world, row, col + 1);
  const nodes = world.city.nodes;
  const car = world.traffic.cars[0];
  if (car) placeTraffic(world, car, nodes[row][col], nodes[row][col + 1], 0.4, 110);
  const focusX = nodes[row][col + 1].x + 30;
  const focusY = eastLaneY(row) - 20;
  snapCamera(world, focusX, focusY, 1.1);
  for (let i = 0; i < 40; i += 1) {
    stepFixed(world, controls({ x: 0, y: 0 }), 1);
    snapCamera(world, focusX, focusY, 1.1);
  }
  world.objective = 'Explore the city';
  return { screen: SCREEN_TITLE };
}

/**
 * Build the named scene into `world` and return the screen to show over it. `step` is the shell's
 * own fixed-step function so the staged frames advance through exactly the same rules as play.
 */
export function stageShot(name, world, step, seed) {
  stepFixed = (w, input, count) => {
    for (let i = 0; i < count; i += 1) step(w, STEP, input);
  };
  const random = createRandom((seed | 0) * 7 + 13);
  switch (name) {
    case 'chase':
      return sceneChase(world, random);
    case 'streets':
      return sceneStreets(world);
    case 'mission':
      return sceneMission(world);
    case 'title':
      return sceneTitle(world);
    default:
      return sceneTitle(world);
  }
}

/** The shot list the build uses, kept beside the scenes that fill them. */
export const SHOTS = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '2-streets.jpg', query: '?shot=streets&seed=1' },
  { name: '3-mission.jpg', query: '?shot=mission&seed=1' },
  { name: '4-title.jpg', query: '?shot=title&seed=1' },
];

