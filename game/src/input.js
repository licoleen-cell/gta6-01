// Keyboard and pointer input for driving, walking and fighting. Held keys give a movement vector
// and the run/handbrake buttons; one-shot presses (confirm, pause, enter a car, punch) are queued
// as bit flags and taken once by the loop, so a press between two frames is never lost.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_POINTER = 16;
export const ACTION_NEW = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['KeyJ', 'KeyF', 'Space']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || RUN.has(event.code) || PUNCH.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    }
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER_CAR.has(event.code)) actions |= ACTION_ENTER;
    else if (event.code === 'KeyN') actions |= ACTION_NEW;
    if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    if (CONFIRM.has(event.code) || PAUSE.has(event.code) || ENTER_CAR.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    actions |= ACTION_POINTER;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Screen-space move vector: x right, y down, each -1, 0 or 1. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        if (LEFT.has(code)) x -= 1;
        else if (RIGHT.has(code)) x += 1;
        else if (UP.has(code)) y -= 1;
        else if (DOWN.has(code)) y += 1;
      }
      return { x: Math.sign(x), y: Math.sign(y) };
    },
    run() {
      for (const code of held) if (RUN.has(code)) return true;
      return false;
    },
    handbrake() {
      return held.has('Space');
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
