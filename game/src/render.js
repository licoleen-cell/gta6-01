// The painter. One top-down view of the city, cut to whatever the camera can see: paved blocks and
// road markings, buildings with a short sun-shadow, palms and lamps, then every body — cars,
// pedestrians, officers, the player — sorted by depth so a car passing a palm slips behind it.
// Only blocks in view are drawn and each block's paving is cached, so the frame cost stays flat.
import { BEACH, CELL, CITY, FONT, GRID, PALETTE, SEA, VEHICLE, WORLD } from './config.js';
import { blockRect } from './city.js';

const SKIN = ['#e0b48a', '#c98d63', '#8d5f42', '#f0c9a8', '#a9714b', '#6d4830'];
const VIEW_MARGIN = 90;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const groundCache = new Map();
  const view = { w: 0, h: 0, dpr: 1 };
  let time = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    view.w = w;
    view.h = h;
    view.dpr = dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  /** A block plot's paving, painted once and reused. */
  function blockGround(col, row, kind) {
    const key = `${col},${row}`;
    let surf = groundCache.get(key);
    if (surf) return surf;
    const plot = blockRect(col, row);
    surf = document.createElement('canvas');
    surf.width = Math.ceil(plot.w);
    surf.height = Math.ceil(plot.h);
    const g = surf.getContext('2d');
    if (kind === 'park') {
      g.fillStyle = PALETTE.grass;
      g.fillRect(0, 0, plot.w, plot.h);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 0; x < plot.w; x += 34) g.fillRect(x, 0, 17, plot.h);
      // Mown path crossing corner to corner.
      g.strokeStyle = PALETTE.path;
      g.lineWidth = 20;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(plot.w, plot.h);
      g.moveTo(plot.w, 0);
      g.lineTo(0, plot.h);
      g.stroke();
    } else if (kind === 'plaza') {
      g.fillStyle = '#ddcbaa';
      g.fillRect(0, 0, plot.w, plot.h);
      g.strokeStyle = 'rgba(160,140,110,0.45)';
      g.lineWidth = 1;
      for (let x = 0; x <= plot.w; x += 24) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, plot.h);
        g.stroke();
      }
      for (let y = 0; y <= plot.h; y += 24) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(plot.w, y);
        g.stroke();
      }
    } else if (kind === 'lot') {
      g.fillStyle = '#c9c2b2';
      g.fillRect(0, 0, plot.w, plot.h);
      // Painted bays.
      g.strokeStyle = 'rgba(255,255,255,0.34)';
      g.lineWidth = 2;
      const ax = GRID.sidewalk + 22;
      const ay = GRID.sidewalk + 30;
      const aw = plot.w - GRID.sidewalk * 2 - 44;
      for (let i = 0; i <= 3; i += 1) {
        const x = ax + (aw / 3) * i;
        g.beginPath();
        g.moveTo(x, ay);
        g.lineTo(x, ay + 150);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(ax + aw, ay);
      g.stroke();
    } else if (kind === 'docks') {
      g.fillStyle = '#c3bdaf';
      g.fillRect(0, 0, plot.w, plot.h);
      g.strokeStyle = 'rgba(120,116,106,0.35)';
      g.lineWidth = 2;
      for (let y = 0; y < plot.h; y += 18) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(plot.w, y);
        g.stroke();
      }
    } else {
      g.fillStyle = '#cfc8b8';
      g.fillRect(0, 0, plot.w, plot.h);
    }
    // The sidewalk ring: a lighter kerb band inside the road.
    g.strokeStyle = PALETTE.curb;
    g.lineWidth = GRID.sidewalk * 2;
    g.strokeRect(0, 0, plot.w, plot.h);
    g.strokeStyle = PALETTE.sidewalk;
    g.lineWidth = GRID.sidewalk * 2 - 5;
    g.strokeRect(0, 0, plot.w, plot.h);
    groundCache.set(key, surf);
    return surf;
  }

  /** The asphalt, lane paint, crossings, parkland edge, beach and sea. */
  function drawGround(world, left, right, top, bottom) {
    const city = world.city;
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(left, top, right - left, bottom - top);

    // Lane dashes along every road in view.
    ctx.strokeStyle = PALETTE.lineDim;
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 17]);
    const roadTop = Math.max(0, top);
    const roadBottom = Math.min(CITY, bottom);
    const roadLeft = Math.max(0, left);
    const roadRight = Math.min(CITY, right);
    if (roadBottom > roadTop) {
      for (let row = 0; row <= GRID.rows; row += 1) {
        const y = row * CELL + GRID.road / 2;
        if (y < roadTop - 10 || y > roadBottom + 10) continue;
        ctx.beginPath();
        ctx.moveTo(roadLeft, y);
        ctx.lineTo(roadRight, y);
        ctx.stroke();
      }
      for (let col = 0; col <= GRID.cols; col += 1) {
        const x = col * CELL + GRID.road / 2;
        if (x < roadLeft - 10 || x > roadRight + 10) continue;
        ctx.beginPath();
        ctx.moveTo(x, roadTop);
        ctx.lineTo(x, roadBottom);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Zebra crossings on each approach to every intersection in view.
    ctx.fillStyle = 'rgba(240,236,222,0.5)';
    const half = GRID.road / 2;
    const c0 = Math.max(0, Math.floor(left / CELL));
    const c1 = Math.min(GRID.cols, Math.floor(right / CELL));
    const r0 = Math.max(0, Math.floor(top / CELL));
    const r1 = Math.min(GRID.rows, Math.floor(bottom / CELL));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const cx = col * CELL + half;
        const cy = row * CELL + half;
        if (cy > CITY || cx > CITY) continue;
        for (let i = 0; i < 4; i += 1) {
          const t = -half + 12 + i * 20;
          ctx.fillRect(cx + t, cy - half - 15, 11, 11);
          ctx.fillRect(cx + t, cy + half + 4, 11, 11);
          ctx.fillRect(cx - half - 15, cy + t, 11, 11);
          ctx.fillRect(cx + half + 4, cy + t, 11, 11);
        }
      }
    }

    // Parkland fringe north of the grid.
    if (top < 0) {
      ctx.fillStyle = PALETTE.grassDark;
      ctx.fillRect(left, top, right - left, -top);
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(left, top + 20, right - left, -top);
    }

    if (bottom > CITY - 40) drawShore(city, left, right, bottom);
  }

  function drawShore(city, left, right, bottom) {
    const shoreTop = CITY - 18;
    // Dry sand, then wet sand, then the shallows.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(left, shoreTop, right - left, BEACH);
    ctx.fillStyle = PALETTE.sandDark;
    ctx.fillRect(left, CITY + 118, right - left, 44);
    ctx.fillStyle = PALETTE.waterShallow;
    ctx.fillRect(left, CITY + 150, right - left, 46);
    const waterTop = CITY + 194;
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(left, waterTop, right - left, bottom - waterTop);
    if (bottom > SEA + CITY + 40) {
      ctx.fillStyle = PALETTE.waterDeep;
      ctx.fillRect(left, CITY + SEA * 0.5 + 60, right - left, bottom);
    }
    // Foam at the waterline.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const x0 = Math.max(left, 0);
    const x1 = Math.min(right, WORLD.w);
    for (let x = x0; x <= x1; x += 22) {
      const wob = Math.sin(x * 0.021 + time * 1.2) * 4;
      if (x === x0) ctx.moveTo(x, CITY + 152 + wob);
      else ctx.lineTo(x, CITY + 152 + wob);
    }
    ctx.stroke();
    // The pier running into the water.
    const pier = city.pier;
    ctx.fillStyle = '#a37a52';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = '#8a6543';
    for (let y = pier.y; y < pier.y + pier.h; y += 11) ctx.fillRect(pier.x, y, pier.w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(pier.x, pier.y, 4, pier.h);
  }

  function shadowEllipse(x, y, rx, ry, alpha = 0.2) {
    ctx.fillStyle = `rgba(20,28,50,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBuilding(b) {
    const lift = b.kind === 'tower' ? Math.min(22, (b.floors ?? 4) * 1.8) : b.kind === 'civic' ? 12 : b.kind === 'warehouse' ? 5 : 9;
    ctx.fillStyle = PALETTE.roofShadow;
    ctx.fillRect(b.x + 8, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4 - lift * 0.25, b.w - 8, b.h - 8 - lift * 0.25);
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Roof furniture, placed by the building's own seed.
    const seed = b.seed ?? 0.5;
    const bw = Math.min(28, b.w * 0.3);
    const bh = Math.min(20, b.h * 0.24);
    const vx = b.x + b.w * (0.18 + seed * 0.5);
    const vy = b.y + b.h * (0.22 + seed * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fillRect(vx, vy, bw, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(vx + 3, vy + 3, bw - 6, bh - 6);
    // Window grid on the taller kinds.
    if (b.kind === 'tower' || b.kind === 'civic' || b.kind === 'club' || b.kind === 'garage') {
      ctx.fillStyle = 'rgba(30,50,80,0.20)';
      const rows = Math.min(6, Math.max(2, Math.floor(b.h / 26)));
      const cols = Math.max(2, Math.floor(b.w / 24));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if ((r + c + Math.floor(seed * 9)) % 3 === 0) continue;
          ctx.fillRect(b.x + 10 + c * ((b.w - 20) / cols), b.y + 10 + r * ((b.h - 22) / rows), 6, 4);
        }
      }
    }
    if (b.awning) {
      const aw = Math.min(56, b.w * 0.62);
      const ax = b.x + b.w / 2 - aw / 2;
      ctx.fillStyle = b.awning;
      ctx.fillRect(ax, b.y + b.h - 10, aw, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(ax + 4 + i * (aw / 5), b.y + b.h - 10, 5, 9);
    }
    if (b.name && b.w > 78) {
      ctx.save();
      ctx.font = `700 ${Math.max(7, Math.min(10, b.w / 12))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(30,38,50,0.7)';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - 15);
      ctx.restore();
    }
  }

  function drawProp(p) {
    switch (p.kind) {
      case 'palm': {
        shadowEllipse(p.x, p.y, p.size * 0.46, p.size * 0.3, 0.17);
        ctx.strokeStyle = PALETTE.trunk;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 2, p.y - p.size * 0.5);
        ctx.stroke();
        const cx = p.x - 2;
        const cy = p.y - p.size * 0.5;
        ctx.fillStyle = PALETTE.palm;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + (p.seed ?? 0) * 3;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * p.size * 0.42, cy + Math.sin(a) * p.size * 0.3, p.size * 0.38, p.size * 0.14, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = PALETTE.palmLight;
        ctx.beginPath();
        ctx.arc(cx, cy, p.size * 0.13, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'palms': {
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2;
          drawProp({
            kind: 'palm',
            x: p.x + Math.cos(a) * p.size,
            y: p.y + Math.sin(a) * p.size * 0.75,
            size: 15 + ((Math.floor((p.seed ?? 0) * 100) + i * 3) % 6),
            seed: i * 0.17,
          });
        }
        break;
      }
      case 'tree': {
        shadowEllipse(p.x, p.y, p.size * 0.55, p.size * 0.4, 0.17);
        ctx.fillStyle = PALETTE.treeDark;
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.size * 0.26, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.tree;
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.13, p.y - p.size * 0.38, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bench': {
        ctx.fillStyle = '#9a7a52';
        ctx.fillRect(p.x - p.size / 2, p.y - 4, p.size, 8);
        ctx.fillStyle = '#7d6140';
        ctx.fillRect(p.x - p.size / 2, p.y + 4, p.size, 3);
        break;
      }
      case 'lamp': {
        ctx.strokeStyle = PALETTE.metal;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - 11);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,232,168,0.9)';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 12, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pond': {
        ctx.fillStyle = PALETTE.water;
        ctx.beginPath();
        ctx.ellipse(p.x + 23, p.y + 23, 24, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.26)';
        ctx.beginPath();
        ctx.ellipse(p.x + 16, p.y + 16, 10, 5, -0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'container': {
        ctx.fillStyle = 'rgba(20,28,50,0.18)';
        ctx.fillRect(p.x - p.w / 2 + 3, p.y - p.h / 2 + 4, p.w, p.h);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 1; i < 5; i += 1) ctx.fillRect(p.x - p.w / 2 + (p.w / 5) * i, p.y - p.h / 2, 2, p.h);
        break;
      }
      case 'umbrella': {
        ctx.fillStyle = 'rgba(20,28,50,0.15)';
        ctx.beginPath();
        ctx.arc(p.x + 4, p.y + 4, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.color ?? '#e56b6f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'lifeguard': {
        ctx.fillStyle = '#f0e7d2';
        ctx.fillRect(p.x - 12, p.y - 10, 24, 20);
        ctx.fillStyle = '#d9574f';
        ctx.fillRect(p.x - 12, p.y - 10, 24, 5);
        break;
      }
      case 'neon': {
        ctx.strokeStyle = 'rgba(255,120,200,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,220,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'flag': {
        ctx.strokeStyle = PALETTE.metal;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 10);
        ctx.lineTo(p.x, p.y - 16);
        ctx.stroke();
        ctx.fillStyle = '#c8452f';
        ctx.fillRect(p.x, p.y - 16, 12 + Math.sin(time * 3) * 2, 8);
        break;
      }
      case 'planter': {
        ctx.fillStyle = '#9d8f77';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 3, p.size, p.size * 0.66);
        ctx.fillStyle = PALETTE.tree;
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.size * 0.2, p.size * 0.42, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'crate': {
        ctx.fillStyle = '#b78c5c';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.strokeStyle = '#8d6a44';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        break;
      }
      default:
        break;
    }
  }

  function drawFountain(city) {
    const f = city.fountain;
    if (!f) return;
    ctx.fillStyle = '#cfc6b2';
    ctx.fillRect(f.x - 4, f.y - 4, f.w + 8, f.h + 8);
    ctx.fillStyle = PALETTE.waterShallow;
    ctx.fillRect(f.x + 9, f.y + 9, f.w - 18, f.h - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.arc(f.x + f.w / 2, f.y + f.h / 2, 10 + Math.sin(time * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(car, isPlayer) {
    const w = VEHICLE.width;
    const l = VEHICLE.length;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(20,28,50,0.24)';
    ctx.beginPath();
    ctx.ellipse(4, 5, l * 0.52, w * 0.54, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    // Body.
    ctx.fillStyle = car.flash > 0 ? '#ffffff' : car.color;
    roundRect(ctx, -l / 2, -w / 2, l, w, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    roundRect(ctx, -l / 2 + 3, -w / 2 + 3, 9, w - 6, 3);
    ctx.fill();
    roundRect(ctx, l / 2 - 9, -w / 2 + 3, 6, w - 6, 3);
    ctx.fill();
    // Cabin glass, with a windscreen highlight.
    ctx.fillStyle = 'rgba(28,42,58,0.78)';
    roundRect(ctx, -6, -w / 2 + 4, 16, w - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,225,240,0.40)';
    roundRect(ctx, 8, -w / 2 + 5, 5, w - 10, 2);
    ctx.fill();
    // Lights.
    ctx.fillStyle = '#fdf4cf';
    ctx.fillRect(l / 2 - 2, -w / 2 + 3, 2, 5);
    ctx.fillRect(l / 2 - 2, w / 2 - 8, 2, 5);
    ctx.fillStyle = '#c8452f';
    ctx.fillRect(-l / 2, -w / 2 + 3, 2, 5);
    ctx.fillRect(-l / 2, w / 2 - 8, 2, 5);
    if (car.kind === 'police') {
      ctx.fillStyle = '#1f2a44';
      roundRect(ctx, -l / 2 + 2, -w / 2 + 2, l - 4, 5, 2);
      ctx.fill();
      const on = Math.sin(car.siren * 9) > 0;
      ctx.fillStyle = on ? '#ff5a4a' : '#4a7fd8';
      ctx.fillRect(-3, -w / 2 + 3, 7, w - 6);
      ctx.fillStyle = on ? '#ffd3cc' : '#d3e0ff';
      ctx.fillRect(-1, -w / 2 + 4, 3, w - 8);
      // A soft glow so a patrol car reads at a glance on the map and in traffic.
      ctx.fillStyle = on ? 'rgba(255,80,60,0.22)' : 'rgba(80,140,255,0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, l * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isPlayer) {
      // A thin teal underline marks the player's own car.
      ctx.strokeStyle = 'rgba(56,197,184,0.75)';
      ctx.lineWidth = 2;
      roundRect(ctx, -l / 2 - 2, -w / 2 - 2, l + 4, w + 4, 7);
      ctx.stroke();
    }
    if (car.smoke > 0.35 && car.alive) {
      ctx.fillStyle = `rgba(58,58,64,${0.22 * car.smoke})`;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(l / 2 - 8 + Math.sin(time * 2 + i) * 6, Math.cos(time * 1.6 + i) * 7, 5 + i * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPerson(x, y, facing, colors, phase, down, extra) {
    if (down > 0) {
      shadowEllipse(x, y, 8, 5, 0.2);
      ctx.fillStyle = colors.shirt;
      roundRect(ctx, x - 8, y - 4, 16, 8, 4);
      ctx.fill();
      return;
    }
    const bob = Math.sin(phase) * 1.1;
    shadowEllipse(x, y + 1, 7, 4.5, 0.24);
    // Legs.
    ctx.strokeStyle = colors.pants;
    ctx.lineWidth = 3;
    const swing = Math.sin(phase) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x - 1 + swing, y + 5);
    ctx.moveTo(x + 1, y - 1);
    ctx.lineTo(x + 1 - swing, y + 5);
    ctx.stroke();
    // Torso.
    ctx.fillStyle = colors.shirt;
    roundRect(ctx, x - 4.2, y - 8 + bob, 8.4, 8, 3);
    ctx.fill();
    // Arms.
    ctx.strokeStyle = colors.skin;
    ctx.lineWidth = 2.4;
    const arm = Math.sin(phase + Math.PI) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 6 + bob);
    ctx.lineTo(x - 6 + arm * 0.4, y - 1 + bob);
    ctx.moveTo(x + 4, y - 6 + bob);
    ctx.lineTo(x + 6 - arm * 0.4, y - 1 + bob);
    ctx.stroke();
    // Head, nudged toward the facing direction.
    const hx = x + Math.cos(facing) * 1.4;
    const hy = y - 10 + bob;
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 3.3, Math.PI * 0.92, Math.PI * 2.08);
    ctx.fill();
    if (extra) extra(x, y + bob, facing);
  }

  function drawPlayer(world) {
    const p = world.player;
    if (p.car) return;
    const hurt = p.hurtFlash > 0 && Math.sin(time * 40) > 0;
    drawPerson(p.x, p.y, p.facing, {
      shirt: hurt ? '#ffffff' : '#1f3b6e',
      pants: '#2b3442',
      skin: '#d7a273',
      hair: '#2a2420',
    }, p.step, 0, (x, y, facing) => {
      ctx.fillStyle = '#38c5b8';
      ctx.fillRect(x - 2, y - 7, 4, 2);
      if (p.punchTimer > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, p.punchTimer * 4)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y - 2, 16, facing - 0.7, facing + 0.7);
        ctx.stroke();
      }
    });
  }

  function drawOfficer(o) {
    drawPerson(o.x, o.y, o.facing, {
      shirt: '#2b3a63',
      pants: '#1d2740',
      skin: SKIN[1],
      hair: '#20242c',
    }, o.phase, 0, (x, y) => {
      ctx.fillStyle = '#f4c95d';
      ctx.fillRect(x - 1.5, y - 6, 3, 3);
      ctx.fillStyle = '#1a2440';
      ctx.fillRect(x - 4, y - 14, 8, 3);
      if (o.swing > 0.75) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 3, 13, o.facing - 0.6, o.facing + 0.6);
        ctx.stroke();
      }
    });
  }

  function drawEntities(world) {
    const player = world.player;
    const bodies = [];
    for (const car of world.traffic.parked) if (car.alive) bodies.push({ y: car.y, draw: () => drawCar(car, false) });
    for (const car of world.traffic.cars) if (car.alive) bodies.push({ y: car.y, draw: () => drawCar(car, false) });
    for (const car of world.police.cars) if (car.alive) bodies.push({ y: car.y, draw: () => drawCar(car, false) });
    for (const car of world.loose) if (car.alive) bodies.push({ y: car.y, draw: () => drawCar(car, false) });
    if (player.car) bodies.push({ y: player.car.y, draw: () => drawCar(player.car, true) });
    for (const ped of world.traffic.peds) {
      if (!ped.alive && ped.down <= 0) continue;
      bodies.push({
        y: ped.y,
        draw: () => drawPerson(ped.x, ped.y, ped.facing, {
          shirt: ped.shirt, pants: '#3a4050', skin: ped.skin, hair: '#2e2620',
        }, ped.phase, ped.alive ? 0 : ped.down),
      });
    }
    for (const officer of world.police.officers) {
      if (!officer.alive) continue;
      bodies.push({ y: officer.y, draw: () => drawOfficer(officer) });
    }
    if (!player.car) bodies.push({ y: player.y + 0.1, draw: () => drawPlayer(world) });
    bodies.sort((a, b) => a.y - b.y);
    for (const body of bodies) body.draw();
  }

  function drawWaypoint(world) {
    const wp = world.waypoint;
    if (!wp) return;
    const pulse = 0.5 + Math.sin(time * 4) * 0.5;
    ctx.strokeStyle = `rgba(255,209,102,${0.45 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 30 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,209,102,${0.1 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 30 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();
    // A pennant over the point.
    const flick = Math.sin(time * 5) * 2;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(wp.x, wp.y - 46);
    ctx.lineTo(wp.x + 15, wp.y - 40);
    ctx.lineTo(wp.x, wp.y - 34 + flick * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wp.x, wp.y - 34);
    ctx.lineTo(wp.x, wp.y - 16);
    ctx.stroke();
  }

  /** Light over the world: sun wash, vignette, hurt flash, wanted pulse. */
  function drawOverlay(world) {
    const p = world.player;
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.36, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78);
    g.addColorStop(0, 'rgba(255,246,220,0)');
    g.addColorStop(1, 'rgba(38,28,14,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    if (p.hurtFlash > 0) {
      ctx.fillStyle = `rgba(200,40,40,${p.hurtFlash * 0.34})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (world.wanted.stars >= 4) {
      const pulse = 0.045 + Math.sin(time * 5) * 0.025;
      ctx.fillStyle = `rgba(190,30,30,${pulse * (world.wanted.stars === 5 ? 1.7 : 1)})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (world.respawn > 0) {
      ctx.fillStyle = `rgba(10,12,18,${Math.min(0.7, world.respawn * 0.5)})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function drawWorld(world) {
    const cam = world.camera;
    const zoom = cam.zoom;
    const shake = cam.shake > 0 ? cam.shake : 0;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const halfW = view.w / 2 / zoom;
    const halfH = view.h / 2 / zoom;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(view.w / 2 + shakeX, view.h / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const left = cam.x - halfW - VIEW_MARGIN;
    const right = cam.x + halfW + VIEW_MARGIN;
    const top = cam.y - halfH - VIEW_MARGIN;
    const bottom = cam.y + halfH + VIEW_MARGIN;

    drawGround(world, left, right, top, bottom);

    const city = world.city;
    const c0 = Math.max(0, Math.floor(left / CELL) - 1);
    const c1 = Math.min(GRID.cols - 1, Math.floor(right / CELL));
    const r0 = Math.max(0, Math.floor(top / CELL) - 1);
    const r1 = Math.min(GRID.rows - 1, Math.floor(bottom / CELL));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const plot = blockRect(col, row);
        ctx.drawImage(blockGround(col, row, city.layoutKind(col, row)), plot.x, plot.y);
      }
    }
    drawFountain(city);

    for (const prop of city.props) {
      if (prop.x < left || prop.x > right || prop.y < top || prop.y > bottom) continue;
      drawProp(prop);
    }

    // Buildings last among the statics, so anything behind a wall stays behind it.
    const visible = [];
    for (const b of city.buildings) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      visible.push(b);
    }
    visible.sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const b of visible) drawBuilding(b);

    drawEntities(world);
    drawWaypoint(world);
    ctx.restore();

    drawOverlay(world);
  }

  return {
    resize,
    /** Paint the world, then let the shell lay its screen furniture over it. */
    draw(world, dt, overlay) {
      time += dt || 1 / 60;
      drawWorld(world);
      if (overlay) overlay(ctx, view, time);
    },
    get view() {
      return view;
    },
  };
}
