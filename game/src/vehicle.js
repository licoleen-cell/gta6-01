// The one car model the whole city drives: an arcade body with a heading, a forward speed and a
// little lateral slide. The player, the traffic and the police all use it; they differ only in who
// picks the throttle and the steering. The hull is tested as two circles (front and rear) so a long
// car cannot clip a corner the way a single circle would.
import { VEHICLE } from './config.js';
import { approach } from './collision.js';
import { resolveCircle } from './physics.js';

/** Half the distance between the two hull circles. */
const HULL_SPREAD = 13;
const HULL_RADIUS = VEHICLE.width / 2 - 1;
/** The distance at which two car centres count as touching: long enough for a car's length, short
 * enough that a queue in a lane does not overlap. */
const CAR_REACH = VEHICLE.length * 0.86;

export function createCar(x, y, angle, color, kind = 'civilian') {
  return {
    x,
    y,
    angle,
    speed: 0,
    slip: 0,
    color,
    kind,
    steer: 0,
    driver: null,
    health: 100,
    smoke: 0,
    alive: true,
    braking: false,
    /** Last position, for the renderer's motion streaks and the camera's shake. */
    px: x,
    py: y,
    /** Damage flash timer, set when the car takes a hit. */
    flash: 0,
    /** Police lights phase. */
    siren: 0,
    /** Set by traffic AI: the lane node it is heading for. */
    node: null,
    next: null,
    cruise: 100,
    stuck: 0,
  };
}

/** Where the car's nose and tail sit. */
export function carPoints(car) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return {
    nose: { x: car.x + cos * HULL_SPREAD, y: car.y + sin * HULL_SPREAD },
    tail: { x: car.x - cos * HULL_SPREAD, y: car.y - sin * HULL_SPREAD },
  };
}

/**
 * Advance a car one step. `throttle` is -1 (brake/reverse) to 1 (accelerate), `steer` is -1 (left)
 * to 1 (right), `handbrake` breaks grip for a slide. Returns the collision impact speed (0 when
 * nothing was hit) so the caller can bill damage.
 */
export function stepCar(car, dt, grid, throttle, steer, handbrake) {
  if (!car.alive) return 0;
  car.px = car.x;
  car.py = car.y;
  car.flash = Math.max(0, car.flash - dt);
  car.siren += dt;

  // Throttle, brake and drag along the car's own axis.
  const forward = car.speed;
  let drive = 0;
  if (throttle > 0) drive = forward < 0 ? VEHICLE.brake : VEHICLE.accel;
  else if (throttle < 0) drive = forward > 0 ? -VEHICLE.brake : -VEHICLE.reverse;
  car.braking = throttle < 0 && forward > 0;

  if (drive !== 0) {
    const next = forward + drive * throttle * dt;
    car.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, next));
  } else {
    car.speed = approach(car.speed, 0, VEHICLE.drag * 60 * dt);
  }
  if (handbrake) car.speed = approach(car.speed, 0, VEHICLE.handbrakeDrag * 60 * dt);

  // Steering scales with speed so a parked car does not spin, and reverses when backing up.
  const speedRatio = Math.min(1, Math.abs(car.speed) / 120);
  const targetSteer = steer * VEHICLE.steer * speedRatio * (car.speed < 0 ? -1 : 1);
  car.steer = approach(car.steer, targetSteer, 9 * dt);
  const turn = car.steer * (Math.abs(car.speed) / VEHICLE.maxSpeed + 0.35) * dt;
  car.angle += turn;

  // Lateral slide: the tail keeps swinging a moment after the wheel is turned.
  const grip = handbrake ? VEHICLE.handbrakeGrip : VEHICLE.grip;
  car.slip = approach(car.slip, turn * Math.abs(car.speed) * 2.2, grip * 60 * dt);

  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const nx = car.x + cos * car.speed * dt - sin * car.slip * dt;
  const ny = car.y + sin * car.speed * dt + cos * car.slip * dt;

  // Two-circle hull against the city, then re-aim the body from the corrected circles.
  let x = nx;
  let y = ny;
  let impact = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const nose = resolveCircle(grid, x + c * HULL_SPREAD, y + s * HULL_SPREAD, HULL_RADIUS);
    const tail = resolveCircle(grid, x - c * HULL_SPREAD, y - s * HULL_SPREAD, HULL_RADIUS);
    if (!nose.hit && !tail.hit) break;
    const cx = (nose.x + tail.x) / 2;
    const cy = (nose.y + tail.y) / 2;
    if (pass === 0) impact = Math.abs(car.speed);
    x = cx;
    y = cy;
    const dx = nose.x - tail.x;
    const dy = nose.y - tail.y;
    if (Math.hypot(dx, dy) > 1) car.angle = Math.atan2(dy, dx);
  }
  car.x = x;
  car.y = y;
  if (impact > 0) car.speed *= 0.18;
  return impact;
}

/** Apply damage; returns true when the car just died. */
export function damageCar(car, amount) {
  if (!car.alive) return false;
  car.health -= amount;
  car.flash = 0.25;
  car.smoke = Math.max(car.smoke, 1 - car.health / 100);
  if (car.health <= 0) {
    car.health = 0;
    car.alive = false;
    return true;
  }
  return false;
}

/** Whether two cars' hulls overlap (centre distance against a shared body radius). */
export function carsOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < CAR_REACH * CAR_REACH;
}

/** Push two overlapping cars apart along the line between them. */
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const overlap = CAR_REACH - d;
  if (overlap <= 0) return 0;
  const ux = (dx / d) * overlap * 0.5;
  const uy = (dy / d) * overlap * 0.5;
  a.x -= ux;
  a.y -= uy;
  b.x += ux;
  b.y += uy;
  return overlap;
}
