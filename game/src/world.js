// The simulation: the player, their car, the traffic around them, the force behind them and the
// story in front of them, advanced one fixed step at a time. Nothing here draws; render.js reads
// this state and hud.js prints it. Screens (title, play, paused, game over) live in main.js.
import { CAMERA, PLAYER, POLICE, SAVE_KEY, STEP, VEHICLE, WANTED } from './config.js';
import { angleDelta, damp } from './collision.js';
import { buildCity } from './city.js';
import { buildSolidGrid, resolveCircle } from './physics.js';
import { createCar, carsOverlap, damageCar, separateCars, stepCar } from './vehicle.js';
import { createTraffic, panicPeds, stepTraffic } from './traffic.js';
import { clearPolice, createPolice, policeSeeYou, stepPolice } from './police.js';
import { beginStory, createMissions, startJob, stepMissions } from './missions.js';

export const EVENT_BUSTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_DOWN = 8;

const START_MONEY = 140;

function makePlayer(city) {
  const p = city.pois.garage;
  return {
    x: p.x - 30,
    y: p.y + 74,
    angle: -Math.PI / 2,
    facing: -Math.PI / 2,
    health: PLAYER.health,
    car: null,
    punchCooldown: 0,
    punchTimer: 0,
    hurtTimer: 0,
    hurtFlash: 0,
    step: 0,
    moving: false,
    speed: 0,
  };
}

export function createWorld(random) {
  const city = buildCity(random);
  const grid = buildSolidGrid(city.solids);
  const world = {
    random,
    city,
    grid,
    dt: STEP,
    player: makePlayer(city),
    traffic: createTraffic(random, city, grid),
    police: createPolice(),
    missions: createMissions(city),
    loose: [],
    money: START_MONEY,
    moneyFlash: 0,
    objective: '',
    objectiveFlash: 0,
    waypoint: null,
    waypointDistance: 0,
    banner: '',
    bannerTimer: 0,
    briefing: [],
    briefingTimer: 0,
    wanted: { heat: 0, stars: 0, quiet: 0, seen: false, flash: 0 },
    camera: { x: 0, y: 0, zoom: CAMERA.zoom, shake: 0 },
    stats: { stolen: 0, pedsHit: 0, crashes: 0, missions: 0, driven: 0, played: 0, busts: 0 },
    arrest: 0,
    respawn: 0,
    toast: '',
    toastTimer: 0,
    crowned: false,
  };
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  world.reset = () => resetWorld(world);
  world.addHeat = (amount) => addHeat(world, amount);
  world.addMoney = (amount, flash) => addMoney(world, amount, flash);
  world.flashObjective = () => { world.objectiveFlash = 1.2; };
  world.spawnStoryCar = (x, y, angle, color) => {
    const car = createCar(x, y, angle, color, 'story');
    world.loose.push(car);
    return car;
  };
  world.enterCar = (car) => enterCar(world, car);
  world.save = () => saveWorld(world);
  world.load = () => loadWorld(world);
  world.startStory = () => {
    beginStory(world.missions, world);
    world.banner = world.missions.banner;
    world.bannerTimer = world.missions.bannerTimer;
    world.briefing = world.missions.briefing;
    world.briefingTimer = world.missions.briefingTimer;
  };
  return world;
}

function resetWorld(world) {
  world.player = makePlayer(world.city);
  world.traffic = createTraffic(world.random, world.city, world.grid);
  world.police = createPolice();
  world.missions = createMissions(world.city);
  world.loose = [];
  world.money = START_MONEY;
  world.moneyFlash = 0;
  world.objective = '';
  world.waypoint = null;
  world.banner = '';
  world.bannerTimer = 0;
  world.briefing = [];
  world.briefingTimer = 0;
  world.wanted = { heat: 0, stars: 0, quiet: 0, seen: false, flash: 0 };
  world.stats = { stolen: 0, pedsHit: 0, crashes: 0, missions: 0, driven: 0, played: 0, busts: 0 };
  world.arrest = 0;
  world.respawn = 0;
  world.crowned = false;
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  world.camera.zoom = CAMERA.zoom;
}

function addHeat(world, amount) {
  const before = world.wanted.stars;
  world.wanted.heat = Math.min(WANTED.max, world.wanted.heat + amount);
  world.wanted.quiet = 0;
  const stars = Math.min(5, Math.floor(world.wanted.heat / WANTED.perStar));
  world.wanted.stars = stars;
  if (stars > before) {
    world.wanted.flash = 1.6;
    world.toast = `WANTED ${'★'.repeat(stars)}`;
    world.toastTimer = 2.2;
  }
}

function addMoney(world, amount, flash) {
  world.money = Math.max(0, world.money + amount);
  if (flash) world.moneyFlash = 1.4;
}

function toast(world, text, seconds = 2) {
  world.toast = text;
  world.toastTimer = seconds;
}

/** Every car the player could get into, wherever it lives right now. */
function carsAround(world) {
  const list = [];
  for (const car of world.loose) if (car.alive) list.push(car);
  for (const car of world.traffic.cars) if (car.alive) list.push(car);
  for (const car of world.traffic.parked) if (car.alive) list.push(car);
  for (const car of world.police.cars) if (car.alive) list.push(car);
  return list;
}

function detachCar(world, car) {
  const take = (list) => {
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
  };
  take(world.loose);
  take(world.traffic.cars);
  take(world.traffic.parked);
  take(world.police.cars);
}

function nearestCar(world, range) {
  let best = null;
  let bestDist = range * range;
  for (const car of carsAround(world)) {
    const dx = car.x - world.player.x;
    const dy = car.y - world.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function enterCar(world, car) {
  const player = world.player;
  const wasPolice = car.kind === 'police';
  const stolen = car.kind !== 'story';
  detachCar(world, car);
  car.parked = false;
  car.cruise = 0;
  car.speed *= 0.2;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.facing = car.angle;
  if (stolen) {
    addHeat(world, wasPolice ? WANTED.stealCar + 10 : WANTED.stealCar);
    world.stats.stolen += 1;
    toast(world, wasPolice ? 'POLICE CRUISER STOLEN' : 'CAR STOLEN');
  }
}

function exitCar(world) {
  const player = world.player;
  const car = player.car;
  if (!car) return;
  car.speed = 0;
  car.slip = 0;
  player.car = null;
  // Step out onto the driver's side, clear of the body.
  const side = car.angle + Math.PI / 2;
  const x = car.x + Math.cos(side) * (VEHICLE.width / 2 + PLAYER.radius + 4);
  const y = car.y + Math.sin(side) * (VEHICLE.width / 2 + PLAYER.radius + 4);
  const out = resolveCircle(world.grid, x, y, PLAYER.radius);
  world.loose.push(car);
  player.x = out.x;
  player.y = out.y;
  player.facing = side;
}

function punch(world) {
  const player = world.player;
  if (player.punchCooldown > 0 || player.car) return;
  player.punchCooldown = PLAYER.punchCooldown;
  player.punchTimer = 0.22;
  const reach2 = PLAYER.punchRange * PLAYER.punchRange;
  let hit = false;
  for (const ped of world.traffic.peds) {
    if (!ped.alive) continue;
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    if (dx * dx + dy * dy > reach2) continue;
    if (Math.abs(angleDelta(player.facing, Math.atan2(dy, dx))) > PLAYER.punchArc) continue;
    ped.alive = false;
    ped.down = 5;
    world.stats.pedsHit += 1;
    addHeat(world, WANTED.downPed);
    panicPeds(world.traffic, ped.x, ped.y, 190);
    hit = true;
  }
  for (const officer of world.police.officers) {
    if (!officer.alive) continue;
    const dx = officer.x - player.x;
    const dy = officer.y - player.y;
    if (dx * dx + dy * dy > reach2) continue;
    if (Math.abs(angleDelta(player.facing, Math.atan2(dy, dx))) > PLAYER.punchArc) continue;
    officer.health -= PLAYER.punchDamage;
    addHeat(world, WANTED.punchCop);
    hit = true;
    if (officer.health <= 0) {
      officer.alive = false;
      addHeat(world, 14);
    }
  }
  if (hit) world.camera.shake = Math.max(world.camera.shake, 4);
}

/** Player on foot: movement, car entry, punching. */
function stepPlayerOnFoot(world, dt, controls) {
  const player = world.player;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);

  const move = controls.move;
  const len = Math.hypot(move.x, move.y);
  const speed = controls.run ? PLAYER.run : PLAYER.walk;
  player.moving = len > 0;
  player.speed = player.moving ? speed : 0;
  if (player.moving) {
    const ux = move.x / len;
    const uy = move.y / len;
    player.x += ux * speed * dt;
    player.y += uy * speed * dt;
    player.facing = Math.atan2(uy, ux);
    player.step += dt * (controls.run ? 13 : 9);
  }
  const out = resolveCircle(world.grid, player.x, player.y, PLAYER.radius);
  player.x = out.x;
  player.y = out.y;

  // Slow mend when nothing has hurt you for a while.
  if (player.hurtTimer <= 0 && player.health < PLAYER.health) {
    player.health = Math.min(PLAYER.health, player.health + 4.5 * dt);
  }

  if (controls.enter) {
    const car = nearestCar(world, PLAYER.enterRange);
    if (car) enterCar(world, car);
    else toast(world, 'NO CAR TO GET INTO');
  }
  if (controls.punch) punch(world);
}

/** Player in a car: drive, ram things, bail out. */
function stepPlayerDriving(world, dt, controls) {
  const player = world.player;
  const car = player.car;
  const throttle = -controls.move.y;
  const steer = controls.move.x;
  const beforeX = car.x;
  const beforeY = car.y;
  const impact = stepCar(car, dt, world.grid, throttle, steer, controls.handbrake);
  player.x = car.x;
  player.y = car.y;
  player.facing = car.angle;
  world.stats.driven += Math.hypot(car.x - beforeX, car.y - beforeY);

  if (impact > 210) {
    damageCar(car, Math.min(38, impact / 12));
    world.stats.crashes += 1;
    world.camera.shake = Math.max(world.camera.shake, Math.min(9, impact / 44));
    player.health -= Math.min(14, impact / 60);
    player.hurtTimer = 1.5;
    player.hurtFlash = 0.35;
    if (!car.alive) {
      toast(world, 'CAR WRECKED');
      exitCar(world);
      return;
    }
  }

  // Run down pedestrians: a knock-down, heat, and a street that scatters.
  if (Math.abs(car.speed) > 55) {
    for (const ped of world.traffic.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      if (dx * dx + dy * dy > 20 * 20) continue;
      ped.alive = false;
      ped.down = 5;
      world.stats.pedsHit += 1;
      addHeat(world, WANTED.downPed);
      panicPeds(world.traffic, ped.x, ped.y, 230);
      car.speed *= 0.82;
      world.camera.shake = Math.max(world.camera.shake, 5);
    }
  }

  if (controls.enter && Math.abs(car.speed) < 70) exitCar(world);
}

/** Cars bump each other and the player; the heavier hit wins and the small one flies off. */
function stepCarContacts(world) {
  const player = world.player;
  const car = player.car;
  const all = [];
  for (const c of world.traffic.cars) if (c.alive) all.push(c);
  for (const c of world.police.cars) if (c.alive) all.push(c);
  for (const c of world.loose) if (c.alive) all.push(c);

  if (car) {
    for (const other of all) {
      if (other === car) continue;
      if (!carsOverlap(car, other)) continue;
      const rel = Math.abs(car.speed - other.speed);
      separateCars(car, other);
      if (rel > 120) {
        damageCar(car, rel / 22);
        damageCar(other, rel / 14);
        world.camera.shake = Math.max(world.camera.shake, Math.min(8, rel / 40));
        world.stats.crashes += 1;
        if (other.kind === 'police') addHeat(world, WANTED.ramCop);
        other.speed = car.speed * 0.6;
        car.speed *= 0.55;
      }
    }
  }

  // Traffic against traffic: just keep them from stacking up.
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i];
    if (a === car) continue;
    for (let j = i + 1; j < all.length; j += 1) {
      const b = all[j];
      if (b === car) continue;
      if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
      if (carsOverlap(a, b)) {
        separateCars(a, b);
        if (Math.abs(a.speed - b.speed) > 90) {
          damageCar(a, 3);
          damageCar(b, 5);
          a.speed *= 0.7;
          b.speed *= 0.7;
        }
      }
    }
  }
}

function stepWanted(world, dt, seen) {
  const w = world.wanted;
  w.flash = Math.max(0, w.flash - dt);
  w.seen = seen;
  w.quiet += dt;
  const stars = w.stars;
  if (w.quiet > WANTED.quietDelay[stars]) {
    let rate = WANTED.decay[stars];
    if (!seen) rate += WANTED.hiding;
    w.heat = Math.max(0, w.heat - rate * dt);
    const next = Math.min(5, Math.floor(w.heat / WANTED.perStar));
    if (next < w.stars) {
      w.stars = next;
      toast(world, next === 0 ? 'YOU LOST THEM' : `WANTED ${'★'.repeat(next)}`);
    }
  }
}

function respawnAtPrecinct(world) {
  const p = world.city.pois.police;
  const player = world.player;
  player.car = null;
  player.health = PLAYER.health;
  player.x = p.x;
  player.y = p.y + 84;
  const out = resolveCircle(world.grid, player.x, player.y, PLAYER.radius);
  player.x = out.x;
  player.y = out.y;
  world.wanted = { heat: 0, stars: 0, quiet: 0, seen: false, flash: 0 };
  clearPolice(world.police);
  world.arrest = 0;
  world.respawn = 1.4;
}

/** One fixed simulation step. Returns EVENT_* flags for the shell to act on. */
export function stepWorld(world, dt, controls) {
  world.dt = dt;
  const input = controls ?? {
    move: { x: 0, y: 0 }, run: false, handbrake: false, enter: false, punch: false,
  };
  let events = 0;
  const player = world.player;
  world.stats.played += dt;

  world.respawn = Math.max(0, world.respawn - dt);
  world.moneyFlash = Math.max(0, world.moneyFlash - dt);
  world.objectiveFlash = Math.max(0, world.objectiveFlash - dt);
  world.toastTimer = Math.max(0, world.toastTimer - dt);
  world.bannerTimer = Math.max(0, world.bannerTimer - dt);
  world.briefingTimer = Math.max(0, world.briefingTimer - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);

  if (world.respawn > 0) {
    // Just out of custody: hold still a beat while the cuffs come off.
    input.move = { x: 0, y: 0 };
    input.enter = false;
    input.punch = false;
  }

  if (player.car) stepPlayerDriving(world, dt, input);
  else stepPlayerOnFoot(world, dt, input);

  stepTraffic(world.traffic, dt, world.grid, world.city, world.random, player);
  stepCarContacts(world);

  const seen = policeSeeYou(world.police, player.car ? player.car.x : player.x, player.car ? player.car.y : player.y);
  const force = stepPolice(world.police, dt, {
    grid: world.grid,
    city: world.city,
    player,
    playerCar: player.car,
    random: world.random,
    stars: world.wanted.stars,
  });

  if (force.playerDamage > 0) {
    player.health -= force.playerDamage;
    player.hurtTimer = 6;
    player.hurtFlash = 0.4;
    world.camera.shake = Math.max(world.camera.shake, 6);
  }

  // Arrest: an officer within reach long enough means cuffs, a fine and a ride downtown.
  if (world.wanted.stars > 0 && force.contact > 0 && !player.car) {
    world.arrest += dt;
    if (world.arrest > POLICE.arrestSeconds) {
      const fine = Math.min(world.money, 60 + world.wanted.stars * 40);
      addMoney(world, -fine);
      world.stats.busts += 1;
      world.banner = `BUSTED — $${fine} FINE`;
      world.bannerTimer = 4;
      respawnAtPrecinct(world);
      events |= EVENT_BUSTED;
    }
  } else if (force.contact > 0 && player.car) {
    // Sitting in a car during an arrest attempt: the force batters the doors.
    world.arrest += dt * 0.8;
    if (world.arrest > POLICE.arrestSeconds * 1.6) {
      exitCar(world);
      world.arrest = 0;
    }
  } else {
    world.arrest = Math.max(0, world.arrest - dt * 1.8);
  }

  stepWanted(world, dt, seen);

  const reward = stepMissions(world.missions, world);
  if (reward > 0) {
    events |= EVENT_MISSION;
    world.stats.missions += 1;
    world.save();
  }
  if (world.missions.bannerTimer > 0) {
    world.banner = world.missions.banner;
    world.bannerTimer = world.missions.bannerTimer;
    world.missions.bannerTimer = 0;
  }
  if (world.missions.briefingTimer > 0) {
    world.briefing = world.missions.briefing;
    world.briefingTimer = world.missions.briefingTimer;
    world.missions.briefingTimer = 0;
  }

  if (world.missions.finished && !world.crowned) {
    world.crowned = true;
    world.toast = 'SOLVADO IS YOURS';
    world.toastTimer = 4;
  }

  // Camera: follow the body, lean into the direction of travel, pull back at speed.
  const cam = world.camera;
  const targetX = player.car ? player.car.x : player.x;
  const targetY = player.car ? player.car.y : player.y;
  const look = player.car ? Math.min(CAMERA.lookAhead * 2.4, Math.abs(player.car.speed) * 0.12) : CAMERA.lookAhead * 0.4;
  const heading = player.car ? player.car.angle : player.facing;
  cam.x = damp(cam.x, targetX + Math.cos(heading) * look, CAMERA.smooth, dt);
  cam.y = damp(cam.y, targetY + Math.sin(heading) * look, CAMERA.smooth, dt);
  const speed = player.car ? Math.abs(player.car.speed) : 0;
  const wantZoom = speed > CAMERA.speedForZoom
    ? CAMERA.zoom + (CAMERA.zoomFast - CAMERA.zoom) * Math.min(1, (speed - CAMERA.speedForZoom) / 160)
    : CAMERA.zoom;
  cam.zoom = damp(cam.zoom, wantZoom, 2.4, dt);
  cam.shake = Math.max(0, cam.shake - dt * 18);

  if (player.health <= 0) {
    player.health = 0;
    events |= EVENT_DOWN;
  }
  return events;
}

/* ------------------------------------------------------------------ saving */

export function saveWorld(world) {
  const player = world.player;
  const data = {
    v: 1,
    money: world.money,
    heat: world.wanted.heat,
    job: world.missions.index,
    step: world.missions.step,
    finished: world.missions.finished,
    x: player.x,
    y: player.y,
    angle: player.facing,
    health: player.health,
    stats: world.stats,
    at: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Load a save: restore the player where they stood and the story where it stood. */
export function loadWorld(world) {
  let data;
  try {
    data = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return false;
  }
  if (!data || data.v !== 1) return false;
  resetWorld(world);
  world.money = Number(data.money) || 0;
  world.wanted.heat = Math.max(0, Math.min(WANTED.max, Number(data.heat) || 0));
  world.wanted.stars = Math.min(5, Math.floor(world.wanted.heat / WANTED.perStar));
  world.missions.index = Math.min(world.missions.jobs.length, Math.max(0, Number(data.job) || 0));
  world.missions.step = Math.max(0, Number(data.step) || 0);
  world.missions.finished = Boolean(data.finished);
  world.missions.active = !world.missions.finished && world.missions.index < world.missions.jobs.length;
  world.player.x = Number(data.x) || world.player.x;
  world.player.y = Number(data.y) || world.player.y;
  world.player.facing = Number(data.angle) || 0;
  world.player.health = Number(data.health) || PLAYER.health;
  if (data.stats) world.stats = { ...world.stats, ...data.stats };
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  if (world.missions.active) {
    const job = world.missions.jobs[world.missions.index];
    if (job && world.missions.step === 0) startJob(world.missions, world);
  }
  return true;
}

/** Whether a save exists (for the title screen's Continue button). */
export function hasSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Boolean(data && data.v === 1);
  } catch {
    return false;
  }
}

/** A short summary of a save, for the title card. */
export function readSaveSummary() {
  try {
    const data = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!data) return null;
    return { money: data.money ?? 0, job: (data.job ?? 0) + 1 };
  } catch {
    return null;
  }
}
