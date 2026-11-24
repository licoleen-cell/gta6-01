// Circle-against-rectangle geometry, the one collision the whole city uses: a point with a radius
// (the player, a pedestrian, a car's hull) moved out of a solid rectangle. Plain numbers, no
// allocation on the hot path, no browser in it.

/**
 * Move a circle out of a rectangle along the shortest path. Returns { x, y, hit } with the given
 * position unchanged (hit false) when they do not touch. A circle whose centre is inside the
 * rectangle leaves through the nearest face.
 */
export function pushCircleOut(cx, cy, radius, rect) {
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  if (cx <= left - radius || cx >= right + radius || cy <= top - radius || cy >= bottom + radius) {
    return { x: cx, y: cy, hit: false };
  }
  const insideX = cx > left && cx < right;
  const insideY = cy > top && cy < bottom;
  if (insideX && insideY) {
    const dl = cx - left;
    const dr = right - cx;
    const dt = cy - top;
    const db = bottom - cy;
    const least = Math.min(dl, dr, dt, db);
    if (least === dl) return { x: left - radius, y: cy, hit: true };
    if (least === dr) return { x: right + radius, y: cy, hit: true };
    if (least === dt) return { x: cx, y: top - radius, hit: true };
    return { x: cx, y: bottom + radius, hit: true };
  }
  const nx = cx < left ? left : cx > right ? right : cx;
  const ny = cy < top ? top : cy > bottom ? bottom : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return { x: cx, y: cy, hit: false };
  if (distance < 1e-6) {
    const toLeft = cx - left;
    const toRight = right - cx;
    return toLeft < toRight ? { x: left - radius, y: cy, hit: true } : { x: right + radius, y: cy, hit: true };
  }
  const push = (radius - distance) / distance;
  return { x: cx + dx * push, y: cy + dy * push, hit: true };
}

/** Signed shortest difference between two angles, in radians, within (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A number moved toward another by at most `step`. */
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

/** Ease a value toward a target at a frame-rate independent rate. */
export function damp(value, target, rate, dt) {
  return target + (value - target) * Math.exp(-rate * dt);
}
