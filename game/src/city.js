// Palm Coast's street plan, built once from the seed: nine by nine blocks of roads, sidewalks and
// buildings, a park, a plaza, a marina and a beach along the southern sea. The city exposes the
// solid rectangles the physics collides against, the intersection nodes traffic routes between,
// the sidewalk loops pedestrians walk, and the points of interest the missions use. Drawing lives
// in render.js; nothing here touches the canvas.
import { BUILDING_COLORS, CELL, CITY, GRID, LANE, WORLD } from './config.js';
import { randInt, pick } from './random.js';

/** Shop and landmark names, all invented for this city. */
const SHOP_NAMES = [
  'CAFÉ LUMBRE', 'MOTEL SOLANO', 'TALLER RIVERA', 'PANADERÍA ORO', 'FARMACIA MAR',
  'BAR EL ANCLA', 'DISCOS TURBO', 'HOTEL VISTA', 'MERCADO SUR', 'PELUQUERÍA NINA',
  'CINE PALMA', 'FLORES DE LOLA', 'TAPICERÍA RÍO', 'HELADOS CUMBRE', 'LIBRERÍA FARO',
  'GYM ACERO', 'SODA BRISA', 'RELOJES TIC-TAC',
];

const TOWER_NAMES = ['TORRE ALBURA', 'EDIFICIO MAREA', 'BANCO CORAL', 'TORRE SALITRE', 'CENTRO VELA'];

/**
 * The blocks by hand, so the city reads as one place: the towers cluster north of centre, shops
 * fill the middle, the park and the plaza sit either side of the main avenue, and the docks and
 * the marina take the south where the sea is.
 */
const LAYOUT = [
  ['shops', 'shops', 'tower', 'tower', 'plaza', 'shops', 'shops', 'shops', 'shops'],
  ['shops', 'tower', 'tower', 'police', 'shops', 'shops', 'lot', 'shops', 'shops'],
  ['shops', 'tower', 'tower', 'shops', 'shops', 'park', 'park', 'shops', 'shops'],
  ['shops', 'shops', 'shops', 'shops', 'club', 'park', 'park', 'shops', 'lot'],
  ['shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops'],
  ['lot', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'garage'],
  ['docks', 'docks', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops', 'lot'],
  ['docks', 'docks', 'docks', 'shops', 'shops', 'shops', 'shops', 'shops', 'shops'],
  ['docks', 'docks', 'docks', 'docks', 'shops', 'shops', 'shops', 'shops', 'lot'],
];

const DISTRICT_NAMES = [
  ['Casas del Norte', 'Casas del Norte', 'Torres Albura', 'Torres Albura', 'Plaza del Sol', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo'],
  ['Casas del Norte', 'Torres Albura', 'Torres Albura', 'Torres Albura', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo'],
  ['Mercado Viejo', 'Torres Albura', 'Torres Albura', 'Mercado Viejo', 'Mercado Viejo', 'Parque Brisa', 'Parque Brisa', 'Mercado Viejo', 'Mercado Viejo'],
  ['Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo', 'Mercado Viejo', 'Barrio Neón', 'Parque Brisa', 'Parque Brisa', 'Mercado Viejo', 'Mercado Viejo'],
  ['Mercado Viejo', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón'],
  ['Muelles', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón'],
  ['Muelles', 'Muelles', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón'],
  ['Muelles', 'Muelles', 'Muelles', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón'],
  ['Muelles', 'Muelles', 'Muelles', 'Muelles', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón', 'Barrio Neón'],
];

/** A block's walkable plot: inside the road and its sidewalk. */
export function blockRect(col, row) {
  return {
    x: col * CELL + GRID.road,
    y: row * CELL + GRID.road,
    w: GRID.block,
    h: GRID.block,
  };
}

/** The centre of the intersection at (col, row): col and row run 0..GRID.cols. */
export function nodeCenter(col, row) {
  return { x: col * CELL + GRID.road / 2, y: row * CELL + GRID.road / 2 };
}

function makeBuilding(x, y, w, h, palette, kind, random) {
  return {
    x, y, w, h,
    wall: palette.wall,
    roof: palette.roof,
    trim: palette.trim,
    kind,
    seed: random(),
    name: '',
    awning: null,
  };
}

/** One block's buildings, split by the block's kind. */
function buildBlock(city, col, row, kind, random) {
  const plot = blockRect(col, row);
  const inset = GRID.sidewalk;
  const area = {
    x: plot.x + inset,
    y: plot.y + inset,
    w: plot.w - inset * 2,
    h: plot.h - inset * 2,
  };
  const palette = pick(random, BUILDING_COLORS);
  const buildings = city.buildings;

  if (kind === 'park' || kind === 'plaza') {
    if (kind === 'plaza') {
      const size = 66;
      const fountain = {
        x: area.x + area.w / 2 - size / 2,
        y: area.y + area.h / 2 - size / 2,
        w: size,
        h: size,
      };
      city.fountain = fountain;
      city.solids.push({ x: fountain.x + 10, y: fountain.y + 10, w: fountain.w - 20, h: fountain.h - 20, kind: 'fountain' });
      // A ring of palms and planters around the plaza, four small kiosks at the corners.
      for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
        const kx = area.x + area.w * fx - 15;
        const ky = area.y + area.h * fy - 12;
        const kiosk = makeBuilding(kx, ky, 30, 24, palette, 'kiosk', random);
        kiosk.name = pick(random, SHOP_NAMES);
        kiosk.awning = '#e07a5f';
        buildings.push(kiosk);
        city.solids.push({ x: kiosk.x, y: kiosk.y, w: kiosk.w, h: kiosk.h, kind: 'building' });
      }
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        city.props.push({
          kind: 'palm',
          x: area.x + area.w / 2 + Math.cos(a) * 58,
          y: area.y + area.h / 2 + Math.sin(a) * 58,
          size: 17 + random() * 5,
          seed: random(),
        });
      }
      city.props.push({ kind: 'bench', x: area.x + 18, y: area.y + area.h / 2, size: 18, seed: random() });
      city.props.push({ kind: 'bench', x: area.x + area.w - 18, y: area.y + area.h / 2, size: 18, seed: random() });
    } else {
      // The park: a diagonal path cross, a pond, a bandstand, palms and benches.
      city.props.push({ kind: 'palms', x: area.x + area.w * 0.5, y: area.y + area.h * 0.52, size: 58, seed: random() });
      city.props.push({ kind: 'pond', x: area.x + 30, y: area.y + 26, size: 46, seed: random() });
      city.solids.push({ x: area.x + 30 + 12, y: area.y + 26 + 12, w: 22, h: 22, kind: 'pond' });
      const bandstand = makeBuilding(area.x + area.w - 78, area.y + area.h - 74, 48, 42, palette, 'bandstand', random);
      bandstand.name = 'KIOSCO BRISA';
      buildings.push(bandstand);
      city.solids.push({ x: bandstand.x, y: bandstand.y, w: bandstand.w, h: bandstand.h, kind: 'building' });
      for (let i = 0; i < 14; i += 1) {
        city.props.push({
          kind: random() < 0.6 ? 'tree' : 'bench',
          x: area.x + 8 + random() * (area.w - 16),
          y: area.y + 8 + random() * (area.h - 16),
          size: 14 + random() * 12,
          seed: random(),
        });
      }
    }
    return;
  }

  if (kind === 'lot') {
    // A paved lot with painted bays and a low fence on the street side.
    city.lots.push({ x: area.x, y: area.y, w: area.w, h: area.h });
    const cols = 3;
    const rows = 3;
    for (let i = 0; i < cols * rows; i += 1) {
      const bay = {
        x: area.x + 22 + (i % cols) * 52,
        y: area.y + 30 + Math.floor(i / cols) * 50,
        w: 44,
        h: 40,
      };
      if (random() < 0.42) {
        city.parked.push({
          x: bay.x + 22,
          y: bay.y + 20,
          angle: random() < 0.85 ? -Math.PI / 2 : Math.PI / 2,
          color: pick(random, ['#d9574f', '#3f7fbf', '#e0a63c', '#6aa06a', '#c9c4bb', '#8a63a8', '#3fa79b']),
        });
      }
    }
    return;
  }

  if (kind === 'tower') {
    const count = random() < 0.5 ? 1 : 2;
    if (count === 1) {
      const w = 120 + random() * 40;
      const h = 118 + random() * 36;
      const b = makeBuilding(area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h, palette, 'tower', random);
      b.floors = randInt(random, 8, 16);
      b.name = pick(random, TOWER_NAMES);
      buildings.push(b);
      city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
      // A plaza slab of palms at the entrance.
      city.props.push({ kind: 'palm', x: b.x - 22, y: b.y + b.h + 12, size: 20, seed: random() });
      city.props.push({ kind: 'palm', x: b.x + b.w + 22, y: b.y + b.h + 12, size: 20, seed: random() });
      city.props.push({ kind: 'planter', x: b.x + b.w / 2, y: b.y + b.h + 10, size: 22, seed: random() });
    } else {
      const gap = 14;
      const w = (area.w - gap) / 2;
      for (let i = 0; i < 2; i += 1) {
        const h = 110 + random() * 64;
        const b = makeBuilding(area.x + i * (w + gap), area.y + (area.h - h) / 2, w, h, palette, 'tower', random);
        b.floors = randInt(random, 6, 14);
        b.name = i === 0 ? pick(random, TOWER_NAMES) : '';
        buildings.push(b);
        city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
      }
    }
    return;
  }

  if (kind === 'docks') {
    const warehouse = makeBuilding(area.x + 6, area.y + 8, area.w - 12, 92, palette, 'warehouse', random);
    warehouse.name = pick(random, ['ALMACÉN 9', 'BODEGA SUR', 'DEPÓSITO CORAL', 'GRÚA 4']);
    warehouse.floors = 2;
    buildings.push(warehouse);
    city.solids.push({ x: warehouse.x, y: warehouse.y, w: warehouse.w, h: warehouse.h, kind: 'building' });
    // Stacks of containers along the quay.
    for (let i = 0; i < 4; i += 1) {
      const cw = 40;
      const ch = 20;
      const cx = area.x + 8 + (i % 2) * 52;
      const cy = area.y + 112 + Math.floor(i / 2) * 26;
      city.props.push({
        kind: 'container',
        x: cx + cw / 2,
        y: cy + ch / 2,
        w: cw,
        h: ch,
        color: pick(random, ['#c8553d', '#2f6b8f', '#d8a13a', '#4b8b6b']),
        seed: random(),
      });
      city.solids.push({ x: cx, y: cy, w: cw, h: ch, kind: 'container' });
    }
    return;
  }

  if (kind === 'police') {
    const b = makeBuilding(area.x + 14, area.y + 20, area.w - 28, area.h - 60, palette, 'civic', random);
    b.name = 'PRECINTO 3';
    b.floors = 4;
    buildings.push(b);
    city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
    city.props.push({ kind: 'flag', x: b.x + b.w / 2, y: b.y - 6, size: 20, seed: random() });
    return;
  }

  if (kind === 'club') {
    const b = makeBuilding(area.x + 10, area.y + 26, area.w - 20, area.h - 70, palette, 'club', random);
    b.name = 'CLUB NEÓN';
    b.floors = 3;
    b.awning = '#3d2b6b';
    buildings.push(b);
    city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
    city.props.push({ kind: 'neon', x: b.x + b.w / 2, y: b.y + b.h + 8, size: 26, seed: random() });
    return;
  }

  if (kind === 'garage') {
    const b = makeBuilding(area.x + 12, area.y + 30, area.w - 24, area.h - 78, palette, 'garage', random);
    b.name = 'TALLER RIVERA';
    b.floors = 2;
    buildings.push(b);
    city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
    for (let i = 0; i < 3; i += 1) {
      city.props.push({ kind: 'crate', x: b.x - 14 + i * 12, y: b.y + b.h + 22 + (i % 2) * 10, size: 13, seed: random() });
    }
    return;
  }

  // Shops: two or four small buildings with awnings, alleys between them.
  const rows = random() < 0.45 ? 2 : 1;
  const cols = 2;
  const gap = 12;
  const bw = (area.w - gap * (cols - 1)) / cols;
  const bh = rows === 2 ? (area.h - gap) / 2 : area.h * (0.62 + random() * 0.3);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (rows === 1 && random() < 0.18) continue;
      const jitterH = rows === 1 ? random() * 12 : 0;
      const b = makeBuilding(
        area.x + c * (bw + gap),
        area.y + r * (bh + gap),
        bw,
        Math.max(52, bh - jitterH),
        random() < 0.7 ? palette : pick(random, BUILDING_COLORS),
        'shop',
        random,
      );
      b.floors = randInt(random, 2, 4);
      b.name = pick(random, SHOP_NAMES);
      b.awning = pick(random, ['#d9645f', '#4f9d8c', '#e0a63c', '#4a7fbf', '#b0619a']);
      buildings.push(b);
      city.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });
    }
  }
}

/** Whether a circle resting at (x, y) is clear of every solid rectangle. */
function circleClear(solids, x, y, radius) {
  for (const rect of solids) {
    const nx = x < rect.x ? rect.x : x > rect.x + rect.w ? rect.x + rect.w : x;
    const ny = y < rect.y ? rect.y : y > rect.y + rect.h ? rect.y + rect.h : y;
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < radius * radius) return false;
  }
  return true;
}

/**
 * The nearest spot to (x, y) where a body of `radius` stands clear, searched in rings. A block's
 * centre is usually inside a building, so every landmark the story marks is moved out to the
 * pavement or the street beside it; otherwise a waypoint could sit inside a wall.
 */
function clearSpot(solids, x, y, radius) {
  if (circleClear(solids, x, y, radius)) return { x, y };
  for (let ring = 1; ring <= 26; ring += 1) {
    const dist = ring * 12;
    const steps = 8 + ring * 4;
    for (let i = 0; i < steps; i += 1) {
      // Start due south so a landmark's door faces the street, then sweep both ways.
      const a = Math.PI / 2 + ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI * 2)) / steps;
      const px = x + Math.cos(a) * dist;
      const py = y + Math.sin(a) * dist;
      if (circleClear(solids, px, py, radius)) return { x: px, y: py };
    }
  }
  return { x, y };
}

export function buildCity(random) {
  const city = {
    buildings: [],
    solids: [],
    props: [],
    lots: [],
    parked: [],
    nodes: [],
    districtNames: DISTRICT_NAMES,
    fountain: null,
    beach: { y: CITY, h: WORLD.h - CITY },
    sea: { y: CITY + 150, h: WORLD.h - CITY - 150 },
  };

  // Buildings, parks and lots, block by block.
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      buildBlock(city, col, row, LAYOUT[row][col], random);
    }
  }

  // The pier, the lifeguard towers and the beach clutter along the shore.
  const pierX = 3.5 * CELL + 20;
  city.pier = { x: pierX, y: CITY + 96, w: 62, h: 150 };
  for (let i = 0; i < 7; i += 1) {
    city.props.push({ kind: 'palm', x: 30 + i * 96 + random() * 24, y: CITY + 42 + random() * 40, size: 20 + random() * 6, seed: random() });
    city.props.push({ kind: 'umbrella', x: 70 + i * 104 + random() * 20, y: CITY + 116 + random() * 24, size: 15, seed: random(), color: pick(random, ['#e56b6f', '#4f9d8c', '#e0a63c', '#6a8ee0']) });
  }
  city.props.push({ kind: 'lifeguard', x: 7.6 * CELL + 40, y: CITY + 66, size: 24, seed: random() });
  city.props.push({ kind: 'lifeguard', x: 1.5 * CELL + 30, y: CITY + 74, size: 24, seed: random() });

  // The sea is solid: the player may wade at the edge but not swim out.
  city.solids.push({ x: -40, y: CITY + 132, w: WORLD.w + 80, h: WORLD.h - CITY, kind: 'sea' });

  // The map's land ends at the city's outer kerb. Thin invisible walls keep a car (or a runner)
  // from driving off the drawing into blank asphalt on the north, west and east.
  city.solids.push({ x: -40, y: -40, w: 40, h: CITY + 200, kind: 'bound' }, { x: CITY, y: -40, w: 40, h: CITY + 200, kind: 'bound' }, { x: -40, y: -40, w: CITY + 80, h: 40, kind: 'bound' });

  // Intersections: the traffic graph's nodes, each with its on-screen centre.
  for (let row = 0; row <= GRID.rows; row += 1) {
    const line = [];
    for (let col = 0; col <= GRID.cols; col += 1) {
      line.push({ col, row, ...nodeCenter(col, row), neighbours: [] });
    }
    city.nodes.push(line);
  }
  for (let row = 0; row <= GRID.rows; row += 1) {
    for (let col = 0; col <= GRID.cols; col += 1) {
      const node = city.nodes[row][col];
      const at = (c, r) => city.nodes[r]?.[c];
      for (const [c, r] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]) {
        const other = at(c, r);
        if (other) node.neighbours.push(other);
      }
    }
  }

  // Sidewalk loops: pedestrians walk the ring just inside each block's curb.
  city.walkLoops = [];
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const plot = blockRect(col, row);
      const inset = 7;
      const left = plot.x + inset;
      const top = plot.y + inset;
      const right = plot.x + plot.w - inset;
      const bottom = plot.y + plot.h - inset;
      city.walkLoops.push([
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ]);
    }
  }

  // The places the story knows by name: each is a clear point beside its landmark, so no waypoint
  // ever sits inside a wall and the job car can be parked on the street without clipping.
  const centre = (col, row) => {
    const b = blockRect(col, row);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  const place = (col, row, radius) => {
    const c = centre(col, row);
    return clearSpot(city.solids, c.x, c.y, radius);
  };
  city.pois = {
    garage: { ...place(8, 5, 22), name: 'Taller Rivera', label: 'TALLER' },
    club: { ...place(4, 3, 22), name: 'Club Neón', label: 'CLUB' },
    docks: { ...place(1, 7, 22), name: 'Muelle 9', label: 'MUELLE' },
    plaza: { ...place(4, 0, 22), name: 'Plaza del Sol', label: 'PLAZA' },
    park: { ...place(5, 2, 22), name: 'Parque Brisa', label: 'PARQUE' },
    police: { ...place(3, 1, 22), name: 'Precinto 3', label: 'POLICÍA' },
    pier: { x: city.pier.x + city.pier.w / 2, y: city.pier.y + 68, name: 'Muelle Viejo', label: 'MUELLE' },
    marina: { ...place(6, 7, 30), name: 'Marina Coral', label: 'MARINA' },
  };

  /** What kind of block sits at (col, row): shops, tower, park, docks, and so on. */
  city.layoutKind = (col, row) => LAYOUT[row]?.[col] ?? 'shops';
  /** The nearest clear ground to a point, for standing an officer or a pedestrian. */
  city.clearSpot = (x, y, radius) => clearSpot(city.solids, x, y, radius);
  /**
   * The nearest lane point to (x, y), with the nose pointing along the longer run of road and the
   * body on the correct side of the centre line. A story car parked on a block would face a wall
   * as often as a street, so every car the story hands the player starts on the road, already
   * pointing down an open lane.
   */
  city.roadSpot = (x, y) => {
    const row = Math.max(0, Math.min(GRID.rows, Math.round((y - GRID.road / 2) / CELL)));
    const west = x > CITY / 2;
    const centre = row * CELL + GRID.road / 2;
    return { x, y: west ? centre - LANE : centre + LANE, angle: west ? Math.PI : 0 };
  };
  city.grid = GRID;

  // A ring of lamps on every block corner, so the streets read as lit at a glance.
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const plot = blockRect(col, row);
      for (const [dx, dy] of [[6, 6], [plot.w - 6, 6], [6, plot.h - 6], [plot.w - 6, plot.h - 6]]) {
        if (random() < 0.55) continue;
        city.props.push({ kind: 'lamp', x: plot.x + dx, y: plot.y + dy, size: 11, seed: random() });
      }
    }
  }

  return city;
}
