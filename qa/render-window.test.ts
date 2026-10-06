/**
 * The edit list mounts only a window of its groups. These pin down how that window is placed.
 *
 * Run: npx tsx qa/render-window.test.ts
 */

import {
  clampWindowStart,
  shiftWindowStart,
  windowStartAround,
  windowStartToReveal
} from '../src/utils/renderWindow';

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} — expected ${expected}, got ${actual}`);
  }
};

console.log('clampWindowStart');
check('short list starts at 0', clampWindowStart(30, 10, 60), 0);
check('never past the last full window', clampWindowStart(500, 300, 60), 240);
check('never negative', clampWindowStart(-5, 300, 60), 0);
check('inside stays', clampWindowStart(100, 300, 60), 100);

console.log('shiftWindowStart');
check('down by a step', shiftWindowStart(0, 1, 300, 60, 20), 20);
check('up by a step', shiftWindowStart(40, -1, 300, 60, 20), 20);
check('up stops at 0', shiftWindowStart(10, -1, 300, 60, 20), 0);
check('down stops at the end', shiftWindowStart(230, 1, 300, 60, 20), 240);

console.log('windowStartAround');
check('centres the index', windowStartAround(150, 300, 60), 120);
check('near the top', windowStartAround(5, 300, 60), 0);
check('near the bottom', windowStartAround(298, 300, 60), 240);

console.log('windowStartToReveal');
check('mounted and clear of the edges: no move', windowStartToReveal(130, 100, 300, 60, 20), 100);
check('outside the window: centred', windowStartToReveal(10, 100, 300, 60, 20), 0);
check('beyond the window: centred', windowStartToReveal(250, 100, 300, 60, 20), 220);
check('next to an edge that would move: centred', windowStartToReveal(105, 100, 300, 60, 20), 75);
check('near the document top, no sentinel there: no move', windowStartToReveal(2, 0, 300, 60, 20), 0);
check('near the document end, no sentinel there: no move', windowStartToReveal(299, 240, 300, 60, 20), 240);
check('whole list fits: no move', windowStartToReveal(25, 0, 30, 60, 20), 0);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
