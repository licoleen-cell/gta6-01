// Moving circles out of the city's solid rectangles, plus the bucket grid that keeps the check
// cheap: a body only tests the rectangles in its own and its neighbours' 256-pixel cells.
import { pushCircleOut } from './collision.js';

const BUCKET = 256;
const scratch = [];
let stamp = 0;

/** Bucket every solid rectangle by the cells it covers. */
export function buildSolidGrid(solids) {
  const grid = new Map();
  for (const rect of solids) {
    const x0 = Math.floor(rect.x / BUCKET);
    const x1 = Math.floor((rect.x + rect.w) / BUCKET);
    const y0 = Math.floor(rect.y / BUCKET);
    const y1 = Math.floor((rect.y + rect.h) / BUCKET);
    for (let gy = y0; gy <= y1; gy += 1) {
      for (let gx = x0; gx <= x1; gx += 1) {
        const key = `${gx},${gy}`;
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(rect);
      }
    }
  }
  return grid;
}

/**
 * The solids a circle at (x, y) with radius r can touch, de-duplicated. The returned array is
 * reused between calls: read it before asking again.
 */
export function solidsNear(grid, x, y, r) {
  scratch.length = 0;
  stamp += 1;
  const x0 = Math.floor((x - r) / BUCKET);
  const x1 = Math.floor((x + r) / BUCKET);
  const y0 = Math.floor((y - r) / BUCKET);
  const y1 = Math.floor((y + r) / BUCKET);
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) {
      const list = grid.get(`${gx},${gy}`);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 1) {
        const rect = list[i];
        if (rect._stamp === stamp) continue;
        rect._stamp = stamp;
        scratch.push(rect);
      }
    }
  }
  return scratch;
}

/** Push a circle out of every solid it overlaps; returns { x, y, hit }. */
export function resolveCircle(grid, x, y, radius) {
  let hit = false;
  for (let pass = 0; pass < 2; pass += 1) {
    const solids = solidsNear(grid, x, y, radius);
    let moved = false;
    for (let i = 0; i < solids.length; i += 1) {
      const out = pushCircleOut(x, y, radius, solids[i]);
      if (out.hit) {
        x = out.x;
        y = out.y;
        hit = true;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y, hit };
}

/** Whether a point is clear of every solid (used to place spawns). */
export function pointClear(grid, x, y, radius) {
  const solids = solidsNear(grid, x, y, radius);
  for (let i = 0; i < solids.length; i += 1) {
    const out = pushCircleOut(x, y, radius, solids[i]);
    if (out.hit) return false;
  }
  return true;
}
