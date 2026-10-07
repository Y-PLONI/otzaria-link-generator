import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildLinkRecords } from '../src/utils/exportLinks';
import { SEFARIA_REF_TABLE } from '../src/data/sefariaRefTable';
import { SHAS_MIRROR_TABLE } from '../src/data/shasMirrorTable';
import { MIRROR_SIGNATURES } from '../src/data/mirrorSignatures';
import { mirrorBaseLines } from '../src/utils/shasMirror';
import { parseDocumentSegments } from '../src/utils/parserAlgorithm';
import { sefariaRefFor } from '../src/utils/sefariaRefs';
import { syntheticBook } from './ref-fixtures';
import type { SessionState } from '../src/types';

const base = 'בסיס בדוי', secondary = 'רש"י על בסיס בדוי';
const config = { sourceCategory: 'shas', targetBookName: base, ignoreShamInShas: true } as const;
const originalBase = SEFARIA_REF_TABLE[base], originalSecondary = SEFARIA_REF_TABLE[secondary];
const originalMirror = SHAS_MIRROR_TABLE[base], originalBaseSignature = MIRROR_SIGNATURES[base], originalSecondarySignature = MIRROR_SIGNATURES[secondary];
const baseText = ['<h1>ברכות</h1>', '<h2>דף ב.</h2>', 'מים רבים', 'אבן גדולה'];
const secondaryText = ['<h1>רש"י על ברכות</h1>', '<h2>דף ב.</h2>', 'ביאור הדברים'];
SEFARIA_REF_TABLE[base] = syntheticBook(baseText, 'Berakhot ', `${base} `, true, { 3: [3, 1], 4: [3, 2] });
SEFARIA_REF_TABLE[secondary] = syntheticBook(secondaryText, 'Rashi on Berakhot ', `${secondary} `, true, { 3: [3, 1, 1] });
MIRROR_SIGNATURES[base] = SEFARIA_REF_TABLE[base].signature;
MIRROR_SIGNATURES[secondary] = SEFARIA_REF_TABLE[secondary].signature;
SHAS_MIRROR_TABLE[base] = { rashi: ',,3:1' }; // One commentary line with two explicit base links.
const insert = (lines: string[]) => [lines[0], '<h2>הקדמה חדשה</h2>', 'תוספת', ...lines.slice(1)];
const session = (sources: string[], commentaries: string[], line: number) => ({
  config, sourceLines: sources, rashiLines: commentaries,
  links: [{ line_index_1: 1, line_index_2: line, path_2: `${secondary}.txt`, heRef_2: 'x',
    secondaryTarget: 'rashi', secondary_line_index: line, connection_type: 'commentary' }]
} as Pick<SessionState, 'config' | 'sourceLines' | 'rashiLines' | 'links'>);
const records = (sources: string[], commentaries: string[], line: number) => buildLinkRecords(session(sources, commentaries, line));
try {
  const plain = records(baseText, secondaryText, 3);
  assert.deepEqual(plain.records.map(row => row.ref_2), ['Rashi on Berakhot 2a:1:1', 'Berakhot 2a:1', 'Berakhot 2a:2']);
  const shifted = records(insert(baseText), insert(secondaryText), 5);
  assert.deepEqual(shifted.records.map(row => row.ref_2), plain.records.map(row => row.ref_2));
  assert.deepEqual(shifted.records.map(row => row.line_index_2), [5, 5, 6]);
  assert.equal(shifted.misses.mirror, 0);
  assert.equal(records(baseText, [...secondaryText.slice(0, 2), 'דברים אחרים'], 3).records.length, 0);
  const changedBase = records([...baseText.slice(0, 2), 'אבן גדולה', 'מים רבים'], secondaryText, 3);
  assert.equal(changedBase.records.length, 1);
  assert.equal(changedBase.misses.mirror, 2);
  MIRROR_SIGNATURES[base] = 'mismatched-snapshot';
  assert.equal(records(baseText, secondaryText, 3).misses.mirror, 1);
  console.log('PASS mirror shifts, changed text, rejected citations, all targets and mixed snapshots');
} finally {
  SEFARIA_REF_TABLE[base] = originalBase; SEFARIA_REF_TABLE[secondary] = originalSecondary;
  SHAS_MIRROR_TABLE[base] = originalMirror;
  MIRROR_SIGNATURES[base] = originalBaseSignature; MIRROR_SIGNATURES[secondary] = originalSecondarySignature;
}
// Check the actual book anchors as well, when fixtures are available.
if (fs.existsSync('qa/data/rashi_berachot.txt')) {
  const source = parseDocumentSegments(fs.readFileSync('qa/data/gem_berachot.txt', 'utf8')).lines;
  const base = 'ברכות';
  const config = { sourceCategory: 'shas', targetBookName: base, ignoreShamInShas: true } as const;
  const tosTitle = 'תוספות על ברכות';
  const tos = parseDocumentSegments(fs.readFileSync('qa/data/tos_berachot.txt', 'utf8')).lines;
  const tosLine = tos.findIndex((_, index) => mirrorBaseLines(base, 'tosafot', index + 1)
    && sefariaRefFor(tosTitle, index + 1, tos)) + 1;
  const liveSession = { config, sourceLines: source, tosafotLines: tos, links: [{
    line_index_1: 1, line_index_2: tosLine, path_2: `${tosTitle}.txt`, heRef_2: 'x',
    secondaryTarget: 'tosafot', secondary_line_index: tosLine, connection_type: 'commentary'
  }] } as Pick<SessionState, 'config' | 'sourceLines' | 'tosafotLines' | 'links'>;
  const before = buildLinkRecords(liveSession);
  const after = buildLinkRecords({ ...liveSession, sourceLines: insert(source), tosafotLines: insert(tos),
    links: liveSession.links.map(link => ({ ...link, line_index_2: tosLine + 2, secondary_line_index: tosLine + 2 })) });
  assert(before.records.length >= 2);
  assert.deepEqual(after.records.map(row => row.ref_2), before.records.map(row => row.ref_2));
  assert.deepEqual(after.records.map(row => row.line_index_2), before.records.map(row => row.line_index_2 + 2));
  console.log('PASS real Berakhot/Tosafot: inserting sections preserves refs and updates both line indices');
}
