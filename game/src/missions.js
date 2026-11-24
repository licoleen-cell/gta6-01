// The story, four jobs long. Each job is a small state machine that reads the world (where the
// player is, what they are driving, how many stars they carry) and hands back the objective line
// the HUD shows, the point the minimap marks, and a short briefing when it starts. The city's
// places come from city.pois, so the jobs are tied to landmarks, not to bare coordinates.

const JOBS = [
  {
    id: 'errand',
    title: 'JOB 1 — THE ERRAND',
    reward: 180,
    briefing: [
      'RIVERA: "Vela. You still owe me for the last favour."',
      'RIVERA: "Kiosk at Plaza del Sol. A parcel with my name on it."',
      'RIVERA: "Bring it to the docks. Muelle 9. Don\'t open it."',
    ],
    steps: [
      { text: 'Pick up the parcel at Plaza del Sol', poi: 'plaza', radius: 62 },
      { text: 'Deliver the parcel to Muelle 9', poi: 'docks', radius: 70 },
    ],
  },
  {
    id: 'car',
    title: 'JOB 2 — THE WRONG CAR',
    reward: 320,
    briefing: [
      'RIVERA: "Good. Now a car. Orange coupé, Marina Coral, bay 4."',
      'RIVERA: "It belongs to a man who owes me. Take it. Don\'t scratch it."',
      'RIVERA: "Bring it here and we call it even."',
    ],
    steps: [
      { text: 'Steal the orange coupé at Marina Coral', needCar: true, poi: 'marina', radius: 60 },
      { text: 'Drive the coupé to Taller Rivera', drive: true, poi: 'garage', radius: 70 },
    ],
  },
  {
    id: 'heat',
    title: 'JOB 3 — HEAT',
    reward: 600,
    briefing: [
      'RIVERA: "That car was a detective\'s. They know my name now."',
      'RIVERA: "Lose them. Get to the old pier and keep your head down."',
      'RIVERA: "Three stars or not — I want you gone from the map."',
    ],
    steps: [
      { text: 'Shake the police — reach the old pier with no stars', evade: true, poi: 'pier', radius: 74 },
    ],
    onStart: 'raiseHeat',
    heat: 62,
  },
  {
    id: 'finale',
    title: 'JOB 4 — SOLVADO HEAT',
    reward: 1200,
    briefing: [
      'RIVERA: "You\'re a problem, Vela. A useful one."',
      'RIVERA: "The club needs a driver who doesn\'t flinch."',
      'RIVERA: "One more run. Then the city is yours to burn."',
    ],
    steps: [
      { text: 'Drive to Club Neón and collect the last payment', drive: true, poi: 'club', radius: 70 },
      { text: 'Escape the ambush — lose the police at the plaza', evade: true, poi: 'plaza', radius: 74 },
    ],
    onStart: 'raiseHeat',
    heat: 78,
  },
];

const EPILOGUE = {
  title: 'FREE ROAM — SOLVADO IS YOURS',
  reward: 0,
  briefing: [
    'The club pays. The cops keep looking.',
    'The city is open: steal, drive, fight, run. Or just watch the sun on the pier.',
  ],
  steps: [],
};

function poi(city, name) {
  return city.pois[name] ?? { x: 0, y: 0, name, label: '' };
}

export function createMissions(city) {
  return {
    jobs: JOBS,
    index: 0,
    step: 0,
    done: [],
    briefing: [],
    briefingTimer: 0,
    banner: '',
    bannerTimer: 0,
    active: false,
    finished: false,
    carTaken: false,
    targetCar: null,
  };
}

function pushBriefing(missions, lines, title) {
  missions.briefing = lines.slice();
  missions.briefingTimer = 9.5;
  missions.banner = title;
  missions.bannerTimer = 4.5;
}

/** Begin the current job: brief the player and run its startup hook. */
export function startJob(missions, world) {
  const job = missions.jobs[missions.index];
  if (!job) return;
  missions.active = true;
  missions.step = 0;
  missions.carTaken = false;
  pushBriefing(missions, job.briefing, job.title);
  if (job.onStart === 'raiseHeat' && job.heat) world.addHeat(job.heat);
  if (job.id === 'errand') {
    // A car waits on the street outside the garage: the first job teaches the drive as well as
    // the walk, and it starts in an open lane so the player cannot be handed a car facing a wall.
    const spot = world.city.roadSpot(world.city.pois.garage.x - 60, world.city.pois.garage.y + 96);
    world.spawnStoryCar(spot.x, spot.y, spot.angle, '#3f7fbf');
  }
  if (job.id === 'car') {
    const spot = carSpot(world.city, world.city.pois.marina);
    const car = world.spawnStoryCar(spot.x, spot.y, spot.angle, '#e07a2e');
    missions.targetCar = car;
  }
}

/** The start of the story, called once from the title screen. */
export function beginStory(missions, world) {
  missions.index = 0;
  missions.done = [];
  missions.finished = false;
  missions.targetCar = null;
  startJob(missions, world);
}

/** A clear spot beside a landmark, so the job car is never parked inside a wall. */
function spotNear(city, point, offset) {
  return city.clearSpot(point.x + offset, point.y, 30);
}

/** A car delivered to the nearest open lane beside a landmark, nose east and ready to drive. */
function carSpot(city, point) {
  const spot = city.roadSpot(point.x, point.y);
  const clear = city.clearSpot(spot.x, spot.y, 26);
  return { x: clear.x, y: spot.y, angle: spot.angle };
}

/**
 * Advance the story. Returns a reward to pay out (0 when the step did not finish) and sets the
 * HUD's objective/waypoint fields on `world`. Called every simulation step.
 */
export function stepMissions(missions, world) {
  missions.bannerTimer = Math.max(0, missions.bannerTimer - world.dt);
  missions.briefingTimer = Math.max(0, missions.briefingTimer - world.dt);
  const job = missions.jobs[missions.index];
  if (!job || !missions.active) {
    world.objective = missions.finished ? 'Free roam — Solvado is yours' : '';
    world.waypoint = null;
    return 0;
  }

  const step = job.steps[missions.step];
  if (!step) {
    // Job over: pay, then move on or roll the epilogue.
    const reward = job.reward;
    missions.done.push(job.id);
    missions.banner = `JOB COMPLETE — $${job.reward}`;
    missions.bannerTimer = 5;
    missions.index += 1;
    world.addMoney(reward, true);
    if (missions.index >= missions.jobs.length) {
      missions.finished = true;
      missions.active = false;
      pushBriefing(missions, EPILOGUE.briefing, EPILOGUE.title);
    } else {
      startJob(missions, world);
    }
    return reward;
  }

  const point = poi(world.city, step.poi);
  world.objective = step.text;
  world.waypoint = { x: point.x, y: point.y, label: point.label ?? '' };
  const px = world.player.car ? world.player.car.x : world.player.x;
  const py = world.player.car ? world.player.car.y : world.player.y;
  const dist = Math.hypot(px - point.x, py - point.y);
  world.waypointDistance = dist;

  if (step.needCar) {
    let target = missions.targetCar;
    // The coupé is the point of the job, so a wrecked one is replaced rather than softlocking it.
    if (!target || !target.alive) {
      const spot = carSpot(world.city, world.city.pois.marina);
      target = world.spawnStoryCar(spot.x, spot.y, spot.angle, '#e07a2e');
      missions.targetCar = target;
      missions.banner = 'ANOTHER COUPÉ IS WAITING AT THE MARINA';
      missions.bannerTimer = 3.5;
    }
    world.waypoint = { x: target.x, y: target.y, label: 'COUPÉ' };
    if (world.player.car === target) {
      missions.carTaken = true;
      missions.step += 1;
      missions.banner = 'COUPÉ TAKEN — GET TO THE GARAGE';
      missions.bannerTimer = 3.5;
      world.addHeat(26);
      world.flashObjective();
    }
    return 0;
  }

  if (step.drive) {
    // Job 2's second leg names the coupé; any other car still reaches the garage, but the
    // objective only ticks while the stolen car is the one being driven.
    if (!world.player.car) return 0;
    if (missions.targetCar && world.player.car !== missions.targetCar && missions.jobs[missions.index].id === 'car') {
      world.objective = 'Bring the stolen coupé to Taller Rivera';
      return 0;
    }
    if (dist < step.radius) {
      missions.step += 1;
      world.flashObjective();
    }
    return 0;
  }

  if (step.evade) {
    if (world.wanted.stars > 0) return 0;
    if (dist < step.radius) {
      missions.step += 1;
      world.flashObjective();
    }
    return 0;
  }

  if (dist < step.radius) {
    missions.step += 1;
    missions.banner = missions.step < job.steps.length ? 'NEXT — ' + job.steps[missions.step].text : 'OBJECTIVE MET';
    missions.bannerTimer = 3.2;
    world.flashObjective();
  }
  return 0;
}
