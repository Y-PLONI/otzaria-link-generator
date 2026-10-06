/** How many groups of the edit list are mounted at once. */
export const RENDER_WINDOW_SIZE = 60;
/** How far the window moves when the user scrolls to one of its edges. */
export const RENDER_WINDOW_STEP = 20;

export function clampWindowStart(start: number, total: number, size = RENDER_WINDOW_SIZE): number {
  return Math.max(0, Math.min(start, total - size));
}

/** A window that holds `index` near its middle. */
export function windowStartAround(index: number, total: number, size = RENDER_WINDOW_SIZE): number {
  return clampWindowStart(index - Math.floor(size / 2), total, size);
}

/**
 * The window to scroll to `index` from: the current one when the index sits clear of any edge
 * that would move the window on arrival, or one centred on it otherwise.
 */
export function windowStartToReveal(
  index: number,
  start: number,
  total: number,
  size = RENDER_WINDOW_SIZE,
  margin = RENDER_WINDOW_STEP
): number {
  const clamped = clampWindowStart(start, total, size);
  const end = Math.min(total, clamped + size);
  const low = clamped > 0 ? clamped + margin : 0;
  const high = end < total ? end - margin : total;
  return index >= low && index < high ? clamped : windowStartAround(index, total, size);
}

export function shiftWindowStart(
  start: number,
  direction: 1 | -1,
  total: number,
  size = RENDER_WINDOW_SIZE,
  step = RENDER_WINDOW_STEP
): number {
  return clampWindowStart(start + direction * step, total, size);
}
