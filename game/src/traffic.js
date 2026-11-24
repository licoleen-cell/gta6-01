// The city's population: cars that keep to their lane around the block grid, and pedestrians who
// walk the sidewalk rings. Both are simple, cheap and a little jumpy — a pedestrian who sees a
// punch or a speeding car bolts for the nearest corner, which is what sells the street as alive.
import { CAR_COLORS, GRID, LANE, TRAFFIC, VEHICLE } from './config.js';
import { angleDelta } from './collision.js';
import { createCar, stepCar } from './vehicle.js';
import { pointClear } from './physics.js';
import { pick, randInt } from './random.js';

const PED_COLORS = ['#e0b48a', '#c98d63', '#8d5f42', '#f0c9a8', '#a9714b', '#6d4830'];
const SHIRT_COLORS = ['#d9574f', '#3f7fbf', '#e0a63c', '#6aa06a', '#c9c4bb', '#8a63a8', '#3fa79b', '#c96b3c', '#f2e8d5', '#4a4f5a'];

/** The lane point a car aims for when it reaches `node` coming from `from`. */
function laneAim(node, from) {
  const dx = node.x - from.x;
  const dy = node.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Keep right of the direction of travel.
  return { x: node.x - (dy / len) * LANE, y: node.y + (dx / len) * LANE };
}

/** Choose the next node: mostly straight on, sometimes a turn, never straight back. */
function chooseNext(random, node, from) {
  const options = node.neighbours.filter((n) => n !== from);
  if (options.length === 0) return from;
  const back = from;
  const straight = options.find((n) => (n.col - node.col) === (node.col - back.col) && (n.row - node.row) === (node.row - back.row));
  if (straight && random() < 0.66) return straight;
  return pick(random, options);
}

function spawnCar(random, city, grid) {
  for (let tries = 0; tries < 24; tries += 1) {
    const row = randInt(random, 0, GRID.rows);
    const col = randInt(random, 0, GRID.cols);
    const node = city.nodes[row][col];
    const next = pick(random, node.neighbours);
    if (!next) continue;
    const aim = laneAim(node, next);
    const angle = Math.atan2(node.y - next.y, node.x - next.x);
    const x = node.x + (aim.x - node.x) * (0.2 + random() * 0.6);
    const y = node.y + (aim.y - node.y) * (0.2 + random() * 0.6);
    if (!pointClear(grid, x, y, VEHICLE.radius)) continue;
    const car = createCar(x, y, angle, pick(random, CAR_COLORS), 'civilian');
    car.node = next;
    car.from = node;
    car.cruise = TRAFFIC.carSpeedMin + random() * (TRAFFIC.carSpeedMax - TRAFFIC.carSpeedMin);
    car.speed = car.cruise * 0.6;
    return car;
  }
  return null;
}

function spawnPed(random, city, grid) {
  for (let tries = 0; tries < 24; tries += 1) {
    const loop = pick(random, city.walkLoops);
    const i = randInt(random, 0, loop.length - 1);
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const t = random();
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!pointClear(grid, x, y, 8)) continue;
    return {
      x,
      y,
      px: x,
      py: y,
      loop,
      seg: i,
      dir: random() < 0.5 ? 1 : -1,
      speed: TRAFFIC.pedSpeedMin + random() * (TRAFFIC.pedSpeedMax - TRAFFIC.pedSpeedMin),
      baseSpeed: 0,
      skin: pick(random, PED_COLORS),
      shirt: pick(random, SHIRT_COLORS),
      facing: Math.atan2(b.y - a.y, b.x - a.x),
      panic: 0,
      phase: random() * Math.PI * 2,
      down: 0,
      alive: true,
      kind: 'ped',
    };
  }
  return null;
}

export function createTraffic(random, city, grid) {
  const cars = [];
  const peds = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const car = spawnCar(random, city, grid);
    if (car) cars.push(car);
  }
  for (let i = 0; i < TRAFFIC.peds; i += 1) {
    const ped = spawnPed(random, city, grid);
    if (ped) {
      ped.baseSpeed = ped.speed;
      peds.push(ped);
    }
  }
  // Cars parked in the city's lots are stealable, stationary traffic.
  const parked = city.parked.map((spot) => {
    const car = createCar(spot.x, spot.y, spot.angle, spot.color, 'parked');
    car.speed = 0;
    car.cruise = 0;
    car.parked = true;
    return car;
  });
  return { cars, peds, parked, spawnTimer: 0 };
}

/** Send every pedestrian near (x, y) running away from it. */
export function panicPeds(traffic, x, y, radius) {
  for (const ped of traffic.peds) {
    if (!ped.alive) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (dx * dx + dy * dy < radius * radius) ped.panic = Math.max(ped.panic, 3.5);
  }
}

export function stepTraffic(traffic, dt, grid, city, random, player) {
  // Cars: keep to the lane, slow for whatever is in front, and stop dead at a red light of traffic.
  for (const car of traffic.cars) {
    if (!car.alive) continue;
    const aim = laneAim(car.node, car.from);
    const dx = aim.x - car.x;
    const dy = aim.y - car.y;
    const dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const delta = angleDelta(car.angle, want);
    // Slow into a sharp turn, and creep when the node is close so it does not overshoot the lane.
    const turnSlow = 1 - Math.min(0.62, Math.abs(delta) * 0.75);
    const nearSlow = dist < 46 ? 0.45 : 1;
    let throttle = 0;
    const target = car.cruise * turnSlow * nearSlow;
    if (car.speed < target) throttle = 1;
    else if (car.speed > target + 12) throttle = -1;
    const steer = Math.max(-1, Math.min(1, delta * 2.6));
    const impact = stepCar(car, dt, grid, throttle, steer, false);
    if (impact > 130) car.speed *= 0.5;
    // Reached the lane point: turn the corner.
    if (dist < 26) {
      car.from = car.node;
      car.node = chooseNext(random, car.node, car.from);
      if (dist < 14) car.speed *= 0.85;
    }
    car.stuck = car.speed < 6 ? car.stuck + dt : 0;
  }

  // Keep the population topped up: recycle cars that wandered off or died.
  for (let i = traffic.cars.length - 1; i >= 0; i -= 1) {
    const car = traffic.cars[i];
    const far = Math.abs(car.x - player.x) > TRAFFIC.despawn && Math.abs(car.y - player.y) > TRAFFIC.despawn;
    if (!car.alive || far || car.stuck > 9) traffic.cars.splice(i, 1);
  }
  traffic.spawnTimer -= dt;
  if (traffic.spawnTimer <= 0 && traffic.cars.length < TRAFFIC.cars) {
    traffic.spawnTimer = TRAFFIC.spawnMin / 1000 + random() * ((TRAFFIC.spawnMax - TRAFFIC.spawnMin) / 1000);
    const car = spawnCar(random, city, grid);
    if (car && Math.hypot(car.x - player.x, car.y - player.y) > 240) traffic.cars.push(car);
  }

  // Pedestrians: walk the ring, turn the corner, bolt when panicked.
  for (const ped of traffic.peds) {
    if (!ped.alive) {
      ped.down -= dt;
      if (ped.down <= 0) {
        ped.alive = true;
        ped.x = ped.loop[0].x;
        ped.y = ped.loop[0].y;
        ped.seg = 0;
      }
      continue;
    }
    ped.px = ped.x;
    ped.py = ped.y;
    ped.panic = Math.max(0, ped.panic - dt);
    ped.phase += dt * 7;
    const target = ped.loop[ped.seg];
    const dx = target.x - ped.x;
    const dy = target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    let speed = ped.panic > 0 ? 92 : ped.baseSpeed;
    if (ped.panic > 0) {
      // Run directly away from the player, off the ring.
      const ax = ped.x - player.x;
      const ay = ped.y - player.y;
      const len = Math.hypot(ax, ay) || 1;
      ped.x += (ax / len) * speed * dt;
      ped.y += (ay / len) * speed * dt;
      ped.facing = Math.atan2(ay, ax);
    } else {
      if (dist < 4) {
        ped.seg = (ped.seg + ped.dir + ped.loop.length) % ped.loop.length;
      } else {
        const ux = dx / dist;
        const uy = dy / dist;
        ped.x += ux * speed * dt;
        ped.y += uy * speed * dt;
        ped.facing = Math.atan2(uy, ux);
      }
    }
    // Pedestrians never walk into buildings; the ring is inset so this is only a guard.
    if (!pointClear(grid, ped.x, ped.y, 6)) {
      ped.x = ped.px;
      ped.y = ped.py;
      ped.seg = (ped.seg + ped.dir + ped.loop.length) % ped.loop.length;
    }
  }
}
