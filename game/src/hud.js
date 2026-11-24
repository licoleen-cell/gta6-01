// Everything printed over the world: the top-left money and wanted stars, the top-right objective
// card, the bottom-left minimap, the bottom-right speedometer, the briefing card that opens a job,
// and the full-screen title, pause, busted and game-over cards. All text, no images: the HUD is
// drawn fresh every frame from world state, so the screenshot shows the real numbers.
import { CITY, FONT, FONT_MONO, GRID, PALETTE, WORLD } from './config.js';

const INK = PALETTE.hudInk;
const CARD = 'rgba(14,20,30,0.86)';

function font(ctx, size, weight = 600, family = FONT) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function plate(ctx, x, y, w, h, radius = 10, fill = CARD) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function text(ctx, value, x, y, size, color, align = 'left', weight = 600, family = FONT) {
  font(ctx, size, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

/** A five-point star, filled (earned) or hollow (still to earn). */
function star(ctx, cx, cy, radius, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.44;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = PALETTE.gold;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,84,10,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/** The minimap: the whole city shrunk to a square, with the player, the force and the objective. */
function minimap(ctx, world, x, y, size) {
  const scale = size / WORLD.w;
  plate(ctx, x - 6, y - 6, size + 12, size + 12, 12, 'rgba(12,18,26,0.82)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  // Land, then the road grid as light lines, then the sea.
  ctx.fillStyle = '#c9c2b2';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#8fae6a';
  ctx.fillRect(x, y, size, size * 0.02);
  ctx.fillStyle = '#4e4c52';
  const cell = (GRID.block + GRID.road) * scale;
  const road = GRID.road * scale;
  // A road is drawn as a band per grid line; fill the gaps between blocks with asphalt.
  ctx.fillRect(x, y, size, size);
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const bx = x + (col * (GRID.block + GRID.road) + GRID.road) * scale;
      const by = y + (row * (GRID.block + GRID.road) + GRID.road) * scale;
      const kind = world.city.layoutKind(col, row);
      ctx.fillStyle = kind === 'park' ? '#7fa95f' : kind === 'plaza' ? '#d9cbaa' : kind === 'lot' ? '#b9b2a2' : '#d6cfbe';
      ctx.fillRect(bx, by, GRID.block * scale, GRID.block * scale);
    }
  }
  // The beach and the sea.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x, y + CITY * scale, size, (WORLD.h - CITY) * scale);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x, y + (CITY + 150) * scale, size, (WORLD.h - CITY - 150) * scale);

  // Buildings as darker blocks, so the shape of the city reads.
  ctx.fillStyle = 'rgba(70,64,58,0.5)';
  for (const b of world.city.buildings) {
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }

  // The objective: a gold ring and a line toward it from the player.
  const px = world.player.car ? world.player.car.x : world.player.x;
  const py = world.player.car ? world.player.car.y : world.player.y;
  const wp = world.waypoint;
  if (wp) {
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + px * scale, y + py * scale);
    ctx.lineTo(x + wp.x * scale, y + wp.y * scale);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + wp.x * scale, y + wp.y * scale, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Police: red pips, brighter with more stars.
  for (const car of world.police.cars) {
    if (!car.alive) continue;
    ctx.fillStyle = '#ff5a4a';
    ctx.beginPath();
    ctx.arc(x + car.x * scale, y + car.y * scale, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const officer of world.police.officers) {
    if (!officer.alive) continue;
    ctx.fillStyle = '#ffb3a8';
    ctx.beginPath();
    ctx.arc(x + officer.x * scale, y + officer.y * scale, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // The player: a bright arrow pointing where they face.
  const heading = world.player.car ? world.player.car.angle : world.player.facing;
  const mx = x + px * scale;
  const my = y + py * scale;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(heading);
  ctx.fillStyle = '#4ff0dc';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // North marker and the frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);
  text(ctx, 'N', x + size - 9, y + 12, 9, 'rgba(255,255,255,0.55)', 'center', 700);
}

function wantedStars(ctx, world, x, y) {
  const stars = world.wanted.stars;
  for (let i = 0; i < 5; i += 1) {
    const filled = i < stars;
    const pulse = filled && world.wanted.flash > 0 ? 1 + Math.sin(world.wanted.flash * 22) * 0.18 : 1;
    star(ctx, x + i * 26, y, 10 * pulse, filled);
  }
}

export function drawHud(ctx, view, world) {
  const pad = 18;
  const narrow = view.w < 780;

  /* --- top left: money, name, wanted ---------------------------------- */
  plate(ctx, pad, pad, 236, 78, 12);
  text(ctx, 'SOLVADO HEAT', pad + 14, pad + 22, 11, 'rgba(255,255,255,0.5)', 'left', 700);
  text(ctx, `$${world.money.toLocaleString('en-US')}`, pad + 14, pad + 52, 28, world.moneyFlash > 0 ? PALETTE.gold : PALETTE.white, 'left', 700, FONT_MONO);
  wantedStars(ctx, world, pad + 152, pad + 44);
  // Heat bar under the stars, so the drift toward the next star is visible.
  const barW = 74;
  const barX = pad + 150;
  const barY = pad + 62;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(barX, barY, barW, 4);
  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(barX, barY, barW * (world.wanted.heat % 20) / 20 + (world.wanted.stars >= 5 ? barW : 0), 4);

  /* --- top right: the objective -------------------------------------- */
  const cardW = narrow ? 250 : 320;
  const cardX = view.w - pad - cardW;
  const objective = world.objective || 'Explore the city';
  plate(ctx, cardX, pad, cardW, 96, 12);
  text(ctx, 'OBJECTIVE', cardX + 14, pad + 22, 10, PALETTE.gold, 'left', 700);
  // Wrap the objective to two lines.
  font(ctx, 14, 700);
  const words = objective.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > cardW - 28 && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  for (let i = 0; i < Math.min(2, lines.length); i += 1) {
    text(ctx, lines[i], cardX + 14, pad + 44 + i * 18, 14, PALETTE.white, 'left', 700);
  }
  const dist = world.waypoint ? Math.round(world.waypointDistance) : 0;
  text(ctx, world.waypoint ? `${dist} m · ${world.waypoint.label}` : 'No active job', cardX + 14, pad + 84, 11, 'rgba(255,255,255,0.62)', 'left', 600, FONT_MONO);

  /* --- bottom left: minimap ------------------------------------------ */
  const mapSize = narrow ? 132 : 198;
  minimap(ctx, world, pad, view.h - pad - mapSize, mapSize);
  // Health pip under the map.
  const hpY = view.h - pad + 4;
  if (hpY < view.h - 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(pad, view.h - 10, mapSize, 4);
    ctx.fillStyle = world.player.health > 40 ? '#4fbf8f' : PALETTE.red;
    ctx.fillRect(pad, view.h - 10, mapSize * Math.max(0, world.player.health / 100), 4);
  }

  /* --- bottom right: speed / district -------------------------------- */
  const car = world.player.car;
  const boxW = 178;
  const boxX = view.w - pad - boxW;
  const boxY = view.h - pad - 92;
  plate(ctx, boxX, boxY, boxW, 92, 12);
  const district = districtName(world);
  text(ctx, district.toUpperCase(), boxX + boxW - 14, boxY + 22, 10, PALETTE.teal, 'right', 700);
  if (car) {
    const mph = Math.round(Math.abs(car.speed) * 0.62);
    text(ctx, String(mph), boxX + boxW - 46, boxY + 66, 34, PALETTE.white, 'right', 700, FONT_MONO);
    text(ctx, 'MPH', boxX + boxW - 14, boxY + 66, 11, 'rgba(255,255,255,0.55)', 'right', 700);
    // A little tachometer arc.
    const ratio = Math.min(1, Math.abs(car.speed) / 340);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(boxX + 34, boxY + 58, 20, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.strokeStyle = ratio > 0.8 ? PALETTE.red : PALETTE.teal;
    ctx.beginPath();
    ctx.arc(boxX + 34, boxY + 58, 20, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * ratio);
    ctx.stroke();
    if (car.kind === 'police') text(ctx, 'POLICE CRUISER', boxX + 14, boxY + 86, 9, '#ff8b7d', 'left', 700);
    else text(ctx, 'E to get out', boxX + 14, boxY + 86, 9, 'rgba(255,255,255,0.35)', 'left', 700);
  } else {
    text(ctx, 'ON FOOT', boxX + 14, boxY + 56, 16, PALETTE.white, 'left', 700);
    text(ctx, 'E to enter a car', boxX + 14, boxY + 76, 11, 'rgba(255,255,255,0.6)', 'left', 600);
    text(ctx, 'J to punch', boxX + 14, boxY + 88, 10, 'rgba(255,255,255,0.4)', 'left', 600);
    // Walking gait pip.
    ctx.fillStyle = PALETTE.teal;
    ctx.beginPath();
    ctx.arc(boxX + boxW - 28, boxY + 58, 6 + Math.sin(world.player.step) * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- transient: banner, briefing, toast, mission distance ----------- */
  if (world.bannerTimer > 0 && world.banner) {
    const alpha = Math.min(1, world.bannerTimer * 1.6);
    ctx.globalAlpha = alpha;
    font(ctx, 18, 700);
    const w = ctx.measureText(world.banner).width + 44;
    plate(ctx, view.w / 2 - w / 2, 118, w, 44, 10);
    text(ctx, world.banner, view.w / 2, 146, 18, PALETTE.gold, 'center', 700);
    ctx.globalAlpha = 1;
  }
  if (world.toastTimer > 0 && world.toast) {
    const alpha = Math.min(1, world.toastTimer * 2);
    ctx.globalAlpha = alpha;
    font(ctx, 13, 700);
    const w = ctx.measureText(world.toast).width + 34;
    plate(ctx, view.w / 2 - w / 2, 170, w, 30, 8, 'rgba(14,20,30,0.7)');
    text(ctx, world.toast, view.w / 2, 190, 13, PALETTE.white, 'center', 700);
    ctx.globalAlpha = 1;
  }
  if (world.briefingTimer > 0 && world.briefing.length) {
    const lines = world.briefing;
    const cardH = 34 + lines.length * 21;
    const w = Math.min(view.w - 80, 620);
    const bx = view.w / 2 - w / 2;
    const by = view.h - 210 - cardH;
    ctx.globalAlpha = Math.min(1, world.briefingTimer * 1.2);
    plate(ctx, bx, by, w, cardH, 12, 'rgba(10,16,26,0.9)');
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(bx + 12, by + 12, 3, cardH - 24);
    for (let i = 0; i < lines.length; i += 1) {
      text(ctx, lines[i], bx + 26, by + 26 + i * 21, 13, i === 0 ? PALETTE.white : 'rgba(255,255,255,0.78)', 'left', 600);
    }
    ctx.globalAlpha = 1;
  }

  // Arrest warning.
  if (world.arrest > 0.15 && world.wanted.stars > 0) {
    const a = Math.min(1, world.arrest * 2);
    ctx.globalAlpha = a;
    text(ctx, 'BEING ARRESTED — MOVE', view.w / 2, view.h * 0.34, 22, PALETTE.red, 'center', 700);
    ctx.globalAlpha = 1;
  }
}

function districtName(world) {
  const px = world.player.car ? world.player.car.x : world.player.x;
  const py = world.player.car ? world.player.car.y : world.player.y;
  const col = Math.max(0, Math.min(GRID.cols - 1, Math.floor(px / (GRID.block + GRID.road))));
  const row = Math.max(0, Math.min(GRID.rows - 1, Math.floor(py / (GRID.block + GRID.road))));
  if (py > CITY) return 'Playa Solvado';
  return world.city.districtNames[row]?.[col] ?? 'Solvado';
}

/* ------------------------------------------------------------------ cards */

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The title screen: name, pitch, controls and the start prompt. */
export function drawTitle(ctx, view, world, best) {
  ctx.fillStyle = 'rgba(8,12,20,0.62)';
  ctx.fillRect(0, 0, view.w, view.h);
  const w = Math.min(view.w - 60, 660);
  const x = view.w / 2 - w / 2;
  const y = Math.max(40, view.h / 2 - 250);
  plate(ctx, x, y, w, 500, 18, 'rgba(10,16,26,0.94)');

  // A sun-bleached band behind the title.
  const g = ctx.createLinearGradient(x, y, x + w, y + 130);
  g.addColorStop(0, 'rgba(224,122,46,0.30)');
  g.addColorStop(1, 'rgba(56,197,184,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(x + 1, y + 1, w - 2, 128);

  text(ctx, 'SOLVADO', view.w / 2, y + 66, 58, PALETTE.white, 'center', 800);
  text(ctx, 'HEAT', view.w / 2, y + 112, 40, PALETTE.gold, 'center', 800);
  text(ctx, 'an open-world crime story on the Palm Coast', view.w / 2, y + 148, 13, 'rgba(255,255,255,0.66)', 'center', 600);

  const lines = [
    'You are Vela Ríos, a driver with debts in a city that never cools down.',
    'Four jobs. Traffic, cops and a wanted level that follows you home.',
  ];
  for (let i = 0; i < lines.length; i += 1) {
    text(ctx, lines[i], view.w / 2, y + 186 + i * 22, 13, 'rgba(255,255,255,0.8)', 'center', 500);
  }

  // Control legend in two columns.
  const keys = [
    ['WASD / ARROWS', 'walk · drive · steer'],
    ['SHIFT', 'run'],
    ['E', 'enter / leave car'],
    ['J or SPACE', 'punch'],
    ['P / ESC', 'pause'],
  ];
  const colW = (w - 80) / 2;
  for (let i = 0; i < keys.length; i += 1) {
    const cx = x + 40 + (i % 2) * colW;
    const cy = y + 250 + Math.floor(i / 2) * 34;
    plate(ctx, cx, cy, 82, 24, 6, 'rgba(255,255,255,0.10)');
    text(ctx, keys[i][0], cx + 41, cy + 17, 11, PALETTE.white, 'center', 700, FONT_MONO);
    text(ctx, keys[i][1], cx + 94, cy + 17, 12, 'rgba(255,255,255,0.7)', 'left', 500);
  }

  if (best) {
    text(ctx, `SAVE: JOB ${best.job} · $${best.money}`, view.w / 2, y + 366, 12, PALETTE.teal, 'center', 700, FONT_MONO);
    text(ctx, 'ENTER / SPACE to continue · N for a new run', view.w / 2, y + 404, 15, PALETTE.gold, 'center', 700);
    text(ctx, 'or click the city', view.w / 2, y + 434, 12, 'rgba(255,255,255,0.55)', 'center', 600);
  } else {
    text(ctx, 'Press ENTER, SPACE or click to start', view.w / 2, y + 400, 16, PALETTE.gold, 'center', 700);
  }
  text(ctx, 'No downloads. No network. One city, all yours.', view.w / 2, y + 472, 10, 'rgba(255,255,255,0.36)', 'center', 500);
}

export function drawPaused(ctx, view, world) {
  ctx.fillStyle = 'rgba(8,12,20,0.6)';
  ctx.fillRect(0, 0, view.w, view.h);
  const w = Math.min(view.w - 60, 460);
  const h = 340;
  const x = view.w / 2 - w / 2;
  const y = view.h / 2 - h / 2;
  plate(ctx, x, y, w, h, 16, 'rgba(10,16,26,0.94)');
  text(ctx, 'PAUSED', view.w / 2, y + 58, 32, PALETTE.white, 'center', 800);
  const stats = [
    ['Money', `$${world.money}`],
    ['Wanted', world.wanted.stars ? '★'.repeat(world.wanted.stars) : 'clean'],
    ['Jobs done', `${world.stats.missions} / 4`],
    ['Cars stolen', String(world.stats.stolen)],
    ['Distance', `${(world.stats.driven / 100).toFixed(1)} km`],
  ];
  for (let i = 0; i < stats.length; i += 1) {
    text(ctx, stats[i][0], x + 40, y + 110 + i * 28, 13, 'rgba(255,255,255,0.55)', 'left', 500);
    text(ctx, stats[i][1], x + w - 40, y + 110 + i * 28, 14, PALETTE.white, 'right', 700, FONT_MONO);
  }
  text(ctx, 'P / ESC to resume', view.w / 2, y + h - 66, 15, PALETTE.gold, 'center', 700);
  text(ctx, 'The city will wait.', view.w / 2, y + h - 38, 11, 'rgba(255,255,255,0.4)', 'center', 500);
}

export function drawGameOver(ctx, view, world) {
  ctx.fillStyle = 'rgba(30,6,8,0.66)';
  ctx.fillRect(0, 0, view.w, view.h);
  const w = Math.min(view.w - 60, 480);
  const h = 330;
  const x = view.w / 2 - w / 2;
  const y = view.h / 2 - h / 2;
  plate(ctx, x, y, w, h, 16, 'rgba(12,10,14,0.95)');
  text(ctx, 'WASTED', view.w / 2, y + 66, 40, PALETTE.red, 'center', 800);
  text(ctx, 'Vela went down in the street.', view.w / 2, y + 96, 12, 'rgba(255,255,255,0.6)', 'center', 500);
  const stats = [
    ['Money', `$${world.money}`],
    ['Jobs done', `${world.stats.missions} / 4`],
    ['Cars stolen', String(world.stats.stolen)],
    ['Cops down', String(world.stats.busts)],
  ];
  for (let i = 0; i < stats.length; i += 1) {
    text(ctx, stats[i][0], x + 40, y + 136 + i * 26, 13, 'rgba(255,255,255,0.55)', 'left', 500);
    text(ctx, stats[i][1], x + w - 40, y + 136 + i * 26, 14, PALETTE.white, 'right', 700, FONT_MONO);
  }
  text(ctx, 'ENTER to try again', view.w / 2, y + h - 40, 15, PALETTE.gold, 'center', 700);
}

export function drawBusted(ctx, view, world) {
  const w = Math.min(view.w - 60, 420);
  const x = view.w / 2 - w / 2;
  const y = view.h / 2 - 70;
  plate(ctx, x, y, w, 140, 14, 'rgba(10,16,26,0.92)');
  text(ctx, 'BUSTED', view.w / 2, y + 52, 30, '#7fb6ff', 'center', 800);
  text(ctx, `Fine paid. You wake up outside Precinto 3.`, view.w / 2, y + 82, 11, 'rgba(255,255,255,0.62)', 'center', 500);
  text(ctx, `$${world.money} left`, view.w / 2, y + 112, 14, PALETTE.gold, 'center', 700, FONT_MONO);
}
