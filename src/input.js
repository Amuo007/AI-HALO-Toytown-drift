// Keyboard input state.
export const input = { throttle: 0, steer: 0, handbrake: false };
const keys = new Set();

window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  window.dispatchEvent(new CustomEvent('keyaction', { detail: e.code }));
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export function sampleInput() {
  input.throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0);
  input.steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0);
  input.handbrake = keys.has('Space');
  return input;
}
