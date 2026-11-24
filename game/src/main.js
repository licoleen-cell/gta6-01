// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over, with a short busted card laid
// over play while the player wakes up outside the precinct.
//
// ?seed=N fixes the city and the traffic. ?shot=chase|streets|mission|title (with &seed=N) stages
// that scene through the real rules, paints it twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_DOWN, EVENT_MISSION, hasSave, readSaveSummary, stepWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_NEW, ACTION_PAUSE, ACTION_POINTER, ACTION_PUNCH, createInput,
} from './input.js';
import { createRenderer } from './render.js';
import {
  drawBusted, drawGameOver, drawHud, drawPaused, drawTitle, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
} from './hud.js';
import { stageShot } from './shots.js';
import {
  isMuted, setMuted, sfxBusted, sfxCrash, sfxDown, sfxObjective, sfxPunch, sfxReward, sfxSteal, sfxWanted,
  startEngine, stopEngine, stopSiren, unlockAudio, updateEngine, updateSiren,
} from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// A dev handle so a headless check can read the staged world (no network, nothing loads it).
window.__solvado = { world, renderer, seed };

/** The scene behind the title card, so the menu is the city, not a blank. */
function stageTitleBackdrop() {
  world.reset();
  world.objective = 'Explore the city';
  const p = world.city.pois.plaza;
  world.player.x = p.x - 90;
  world.player.y = p.y + 80;
  world.player.facing = -Math.PI / 2;
  world.camera.x = p.x - 20;
  world.camera.y = p.y + 30;
  world.camera.zoom = 1.05;
}

/* ------------------------------------------------------------------ shots */

function runShot(name) {
  const scene = stageShot(name, world, stepWorld, seed);
  let painted = 0;
  function paint() {
    renderShotScene(scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function renderShotScene(screen) {
  if (screen === SCREEN_TITLE) {
    renderer.draw(world, 1 / 60, (ctx, view) => drawTitle(ctx, view, world, null));
  } else {
    renderer.draw(world, 1 / 60, (ctx, view) => drawHud(ctx, view, world));
  }
}

/* ------------------------------------------------------------------- play */

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let muted = isMuted();
  let bustedTimer = 0;
  let titleBackdrop = true;
  /** One-shot presses waiting for the next fixed step (see the latch in frame()). */
  let heldActions = 0;
  stageTitleBackdrop();

  // Audio is only created once the player has touched the page.
  function wake() {
    unlockAudio();
    window.removeEventListener('keydown', wake);
    window.removeEventListener('pointerdown', wake);
  }
  window.addEventListener('keydown', wake);
  window.addEventListener('pointerdown', wake);

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNew() {
    world.reset();
    world.startStory();
    screen = SCREEN_PLAY;
    accumulator = 0;
    titleBackdrop = false;
    announce(`Playing. ${world.missions.jobs[0].title}.`);
  }

  function continueSave() {
    if (world.load()) {
      screen = SCREEN_PLAY;
      accumulator = 0;
      titleBackdrop = false;
      announce('Save loaded. Playing.');
    } else {
      startNew();
    }
  }

  function toTitle() {
    screen = SCREEN_TITLE;
    titleBackdrop = true;
    stopEngine();
    stopSiren();
    announce('Solvado Heat. Press Enter to start.');
  }

  function handleActions(actions) {
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW) {
        startNew();
      } else if (actions & (ACTION_CONFIRM | ACTION_POINTER | ACTION_PUNCH)) {
        if (hasSave()) continueSave();
        else startNew();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_POINTER | ACTION_PUNCH)) startNew();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_POINTER)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      heldActions = 0;
      stopEngine();
      stopSiren();
      // Pausing is the player's natural quit point, so the run is written down here too.
      world.save();
      announce('Paused.');
    }
  }

  function step(input) {
    if (screen === SCREEN_TITLE) {
      if (titleBackdrop) {
        // The menu's city keeps living behind the card.
        stepWorld(world, STEP, { move: { x: 0, y: 0 }, run: false, handbrake: false, enter: false, punch: false });
      }
      return;
    }
    const events = stepWorld(world, STEP, input);
    if (events & EVENT_DOWN) {
      screen = SCREEN_OVER;
      stopEngine();
      stopSiren();
      sfxDown();
      world.save();
      announce(`Wasted. $${world.money}.`);
      return;
    }
    if (events & EVENT_BUSTED) {
      bustedTimer = 2.6;
      sfxBusted();
      world.save();
    }
    if (events & EVENT_MISSION) sfxReward();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    handleActions(actions);

    // Audio: engine note follows the car, siren follows the chase.
    if (screen === SCREEN_PLAY) {
      const car = world.player.car;
      if (car && car.alive) {
        startEngine();
        updateEngine(Math.min(1, Math.abs(car.speed) / 340), 0);
      } else {
        stopEngine();
      }
      updateSiren(world.wanted.stars > 0 && world.police.cars.length > 0, world.wanted.stars);
      if (world.wanted.stars === 0) stopSiren();
    }

    if (screen === SCREEN_PLAY) {
      // One-shot presses are latched until a fixed step actually consumes them: on a 144 Hz
      // display most frames run no step, and a punch must not evaporate between two of them.
      heldActions |= actions & (ACTION_ENTER | ACTION_PUNCH);
      const controls = {
        move: input.move(),
        run: input.run(),
        handbrake: input.handbrake(),
        enter: Boolean(heldActions & ACTION_ENTER),
        punch: Boolean(heldActions & ACTION_PUNCH),
      };
      let pending = { ...controls };
      let stepped = false;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(pending);
        stepped = true;
        pending = { ...pending, enter: false, punch: false };
        accumulator -= STEP;
      }
      if (stepped) heldActions = 0;
    } else {
      accumulator = 0;
      if (screen === SCREEN_TITLE && titleBackdrop) {
        // Let the menu city breathe at the display's rate, one step per frame.
        stepWorld(world, 1 / 60, { move: { x: 0, y: 0 }, run: false, handbrake: false, enter: false, punch: false });
      }
    }

    if (bustedTimer > 0) bustedTimer = Math.max(0, bustedTimer - 1 / 60);
    drawScreen(now);
  }

  function drawScreen() {
    if (screen === SCREEN_TITLE) {
      renderer.draw(world, 1 / 60, (ctx, view) => drawTitle(ctx, view, world, readSaveSummary()));
    } else if (screen === SCREEN_PLAY) {
      renderer.draw(world, 1 / 60, (ctx, view) => {
        drawHud(ctx, view, world);
        if (bustedTimer > 0) drawBusted(ctx, view, world);
        if (muted) {
          ctx.save();
          ctx.font = `600 10px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.textAlign = 'right';
          ctx.fillText('MUTED (M)', view.w - 18, 14);
          ctx.restore();
        }
      });
    } else if (screen === SCREEN_PAUSED) {
      renderer.draw(world, 0, (ctx, view) => {
        drawHud(ctx, view, world);
        drawPaused(ctx, view, world);
      });
    } else {
      renderer.draw(world, 0, (ctx, view) => drawGameOver(ctx, view, world));
    }
  }

  // Sound events that only the shell can see (a crash, a steal) are read off the world's counters.
  let lastStolen = 0;
  let lastPeds = 0;
  let lastStars = 0;
  let lastObjective = '';
  const audioTick = () => {
    if (screen !== SCREEN_PLAY) return;
    if (world.stats.stolen > lastStolen) {
      lastStolen = world.stats.stolen;
      sfxSteal();
    }
    if (world.stats.pedsHit > lastPeds) {
      lastPeds = world.stats.pedsHit;
      sfxPunch();
    }
    if (world.wanted.stars > lastStars) {
      lastStars = world.wanted.stars;
      sfxWanted(world.wanted.stars);
    } else if (world.wanted.stars < lastStars) lastStars = world.wanted.stars;
    if (world.objective !== lastObjective) {
      if (lastObjective) sfxObjective();
      lastObjective = world.objective;
    }
    if (world.stats.crashes > (audioTick.crashes ?? 0)) {
      audioTick.crashes = world.stats.crashes;
      sfxCrash(0.8);
    }
  };
  audioTick.crashes = 0;
  setInterval(audioTick, 90);

  // Pause on mute toggle and on leaving the tab.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      muted = !muted;
      setMuted(muted);
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (event.code === 'KeyR' && screen === SCREEN_PAUSED) toTitle();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      stopEngine();
      stopSiren();
      announce('Paused.');
    }
  });

  announce('Solvado Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
