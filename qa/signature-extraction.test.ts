/** Runtime normalization and the independent Python extractor must agree on real book text. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lineSignature, segmentHash } from '../src/utils/sefariaRefs';
import { readSignatures } from './ref-fixtures';
const signatures = readSignatures();
let checked = 0;
for (const [fixture, title] of [
  ['gem_berachot', 'ברכות'], ['rashi_berachot', 'רש"י על ברכות'], ['tos_berachot', 'תוספות על ברכות'],
  ['gem_shabbat', 'שבת'], ['rashi_shabbat', 'רש"י על שבת'], ['tos_shabbat', 'תוספות על שבת']
]) {
  const path = `qa/data/${fixture}.txt`;
  if (!signatures || !fs.existsSync(path)) continue;
  const actual = fs.readFileSync(path, 'utf8').split('\n').map(lineSignature);
  const expected = signatures[title];
  assert.equal(actual.length, expected.length, `${title}: line count`);
  actual.forEach((signature, index) => {
    assert(signature === expected[index], `${title}: signature mismatch on line ${index + 1}`);
    checked++;
  });
}
assert.equal(segmentHash(['H1:x', 'Lשלום 😀']), '57c0813a297161a6');
console.log(checked ? `PASS signature extraction/runtime parity: ${checked} real lines` : 'SKIP signature parity: extract fixtures and signatures first');
