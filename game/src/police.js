// The force: patrol cars that hunt the player's car and officers who come at the player on foot.
// How many of each, how fast and how hard they hit all follow the wanted stars. Heat itself lives
// in world.js; this file only spends it — spawning, chasing, ramming, shooting the breeze.
import { LANE, POLICE } from './config.js';
import { angleDelta } from './collision.js';
import { createCar, damageCar, stepCar } from './vehicle.js';
import { pointClear, resolveCircle } from './physics.js';
import { randInt } from './random.js';

const CAR_COLOR = '#f4f2ec';

function laneAim(node, from) {
  const dx = node.x - from.x;
  const dy = node.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: node.x - (dy / len) * LANE, y: node.y + (dx / len) * LANE };
}

function spawnPatrol(random, city, grid, player, stars) {
  for (let tries = 0; tries < 30; tries += 1) {
    const row = randInt(random, 0, city.nodes.length - 1);
    const col = randInt(random, 0, city.nodes[0].length - 1);
    const node = city.nodes[row][col];
    const dx = node.x - player.x;
    const dy = node.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < POLICE.spawnMin || d > POLICE.spawnMax) continue;
    if (!pointClear(grid, node.x, node.y, 18)) continue;
    const car = createCar(node.x, node.y, Math.atan2(-dy, -dx), CAR_COLOR, 'police');
    car.node = node;
    car.from = node.neighbours[0] ?? node;
    car.cruise = POLICE.carSpeedMin + random() * (POLICE.carSpeedMax - POLICE.carSpeedMin);
    car.officers = Math.max(1, Math.min(2, Math.ceil(stars / 2)));
    car.speed = 40;
    return car;
  }
  return null;
}

function spawnOfficer(random, city, grid, player, x, y) {
  for (let tries = 0; tries < 16; tries += 1) {
    const a = random() * Math.PI * 2;
    const r = 30 + random() * 40;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (!pointClear(grid, px, py, 9)) continue;
    return {
      x: px,
      y: py,
      px: px,
      py: py,
      facing: 0,
      speed: POLICE.footSpeed,
      health: 100,
      alive: true,
      phase: random() * Math.PI * 2,
      kind: 'cop',
      swing: 0,
    };
  }
  return null;
}

export function createPolice() {
  return { cars: [], officers: [], spawnTimer: 1.2, siren: 0, calm: 0 };
}

/**
 * Advance the force. Returns the number of officers within arrest range of the player (the caller
 * decides whether that becomes a bust) and any damage dealt to the player this step.
 */
export function stepPolice(police, dt, ctx) {
  const { grid, city, player, playerCar, random, stars } = ctx;
  const wantCars = POLICE.carsPerStar[stars] ?? 0;
  const wantFoot = POLICE.footPerStar[stars] ?? 0;
  police.siren += dt;

  // Clean again: the force stands down and drives off. Without this a chased player who lost
  // their stars would still be beaten by officers nobody is paying to look for them.
  if (stars === 0) {
    police.calm += dt;
    if (police.calm > 1.4) clearPolice(police);
    for (const car of police.cars) {
      car.speed = Math.max(car.speed, 0);
      stepCar(car, dt, grid, 0, 0, false);
    }
    return { contact: 0, playerDamage: 0 };
  }
  police.calm = 0;

  // Spawn toward the wanted strength, a little at a time.
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.5 + random() * 1.6;
    if (police.cars.filter((c) => c.alive).length < wantCars) {
      const car = spawnPatrol(random, city, grid, player, stars);
      if (car) police.cars.push(car);
    }
    if (police.officers.filter((o) => o.alive).length < wantFoot) {
      const officer = spawnOfficer(random, city, grid, player, player.x, player.y);
      if (officer) police.officers.push(officer);
    }
  }

  const targetX = playerCar ? playerCar.x : player.x;
  const targetY = playerCar ? playerCar.y : player.y;
  let contact = 0;
  let playerDamage = 0;

  // Patrol cars: drive at the player, ram on contact, drop officers when close and stopped.
  for (const car of police.cars) {
    if (!car.alive) continue;
    const dx = targetX - car.x;
    const dy = targetY - car.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const delta = angleDelta(car.angle, want);
    const speedCap = POLICE.carSpeedMin + (stars / 5) * (POLICE.carSpeedMax - POLICE.carSpeedMin);
    let throttle = 0;
    if (dist > 60) {
      if (car.speed < speedCap) throttle = 1;
      else throttle = 0;
    } else if (car.speed > 30) {
      throttle = -1;
    }
    const steer = Math.max(-1, Math.min(1, delta * 3.2));
    const impact = stepCar(car, dt, grid, throttle, steer, false);
    if (impact > 120) damageCar(car, 12);

    // Ramming the player's car: both take a knock, heat rises.
    car.ramCooldown = Math.max(0, (car.ramCooldown ?? 0) - dt);
    if (playerCar && car.ramCooldown <= 0 && Math.hypot(car.x - playerCar.x, car.y - playerCar.y) < 34) {
      const rel = Math.abs(car.speed) + Math.abs(playerCar.speed);
      if (rel > 90) {
        car.ramCooldown = 1.1;
        playerDamage += 5;
        damageCar(playerCar, 6 + stars);
        car.speed *= -0.3;
      }
    }

    // Close and slow: send the crew out on foot.
    if (dist < 130 && car.speed < 70 && car.officers > 0 && police.officers.length < wantFoot + 2) {
      const officer = spawnOfficer(random, city, grid, player, car.x, car.y);
      if (officer) {
        police.officers.push(officer);
        car.officers -= 1;
      }
    }
  }

  // Officers on foot: close in, swing when in reach.
  for (const officer of police.officers) {
    if (!officer.alive) continue;
    officer.px = officer.x;
    officer.py = officer.y;
    officer.phase += dt * 8;
    officer.swing = Math.max(0, officer.swing - dt);
    const dx = targetX - officer.x;
    const dy = targetY - officer.y;
    const dist = Math.hypot(dx, dy);
    if (dist > POLICE.arrestRange) {
      const ux = dx / (dist || 1);
      const uy = dy / (dist || 1);
      officer.x += ux * officer.speed * dt;
      officer.y += uy * officer.speed * dt;
      officer.facing = Math.atan2(uy, ux);
      const out = resolveCircle(grid, officer.x, officer.y, 8);
      officer.x = out.x;
      officer.y = out.y;
    } else {
      officer.facing = Math.atan2(dy, dx);
      if (officer.swing <= 0) {
        officer.swing = 1.1;
        playerDamage += 9 + stars;
      }
    }
    if (dist < POLICE.arrestRange + 6) contact += 1;
  }

  // Recycle the dead and the far away so the force stays near the player.
  police.cars = police.cars.filter((car) => car.alive && Math.hypot(car.x - player.x, car.y - player.y) < POLICE.spawnMax * 2.2);
  police.officers = police.officers.filter((o) => o.alive && Math.hypot(o.x - player.x, o.y - player.y) < POLICE.spawnMax * 2.2);

  return { contact, playerDamage };
}

/** Whether any officer has eyes on the player (used to stop heat falling while watched). */
export function policeSeeYou(police, x, y) {
  for (const officer of police.officers) {
    if (!officer.alive) continue;
    const dx = officer.x - x;
    const dy = officer.y - y;
    if (dx * dx + dy * dy < POLICE.sightRange * POLICE.sightRange) return true;
  }
  for (const car of police.cars) {
    if (!car.alive) continue;
    const dx = car.x - x;
    const dy = car.y - y;
    if (dx * dx + dy * dy < POLICE.sightRange * POLICE.sightRange) return true;
  }
  return false;
}

/** Clear the force (after a bust or a fresh start). */
export function clearPolice(police) {
  police.cars.length = 0;
  police.officers.length = 0;
  police.spawnTimer = 2;
}
