import assert from 'node:assert/strict';
import { HALACHA_BOOKS } from '../src/types';
import type { PluginConfig } from '../src/types';
import { secondarySourcesFor, secondarySourcesCitedIn, runLinkingParser } from '../src/utils/parserAlgorithm';
import { parseSeifKatanCitation, simanNumber, hebrewNumeral, seifKatanLine } from '../src/utils/seifKatan';
import { SEFARIA_REF_TABLE } from '../src/data/sefariaRefTable';
import { syntheticBook } from './ref-fixtures';

const config: PluginConfig = { sourceCategory: 'halacha', targetBookName: HALACHA_BOOKS[1],
  ignoreShamInShas: true, diburHamatchilDelimiter: '.', useAbbreviationExpansion: true,
  useFuzzyMatching: true, useWordWeighting: false, halachaMultiLinePieces: false };
const sources = secondarySourcesFor(config);
const shach = sources.find(s => s.id === 'shach')!;
let failures = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log('PASS', name); }
  catch (e) { failures++; console.error('FAIL', name, String(e).replace(/[^ -~\n]/g, '?')); }
}
for (const prefix of ['ש"ך ס"ק א', 'סי\' ב ש"ך ס"ק א', 'ס"ק א בש"ך', 'שם בגמרא ש"ך ס"ק א', '(ש"ך ס"ק א)', 'שם (סי\' ב ש"ך ס"ק א)']) {
  test(`preload and routing use the same citation form ${sources.length}:${prefix.length}`, () => {
    assert.deepEqual(secondarySourcesCitedIn('<h2>סימן א</h2>\n(א) ' + prefix, config).map(s => s.id), ['shach']);
  });
}
test('typography is normalized before detecting SK', () => {
  for (const text of ['ש"ך ס“ק א', 'ש"ך סַ"ק א', 'ש"ך <b>ס</b>"ק א']) {
    assert.equal(parseSeifKatanCitation(text, sources)?.seifKatan, 1);
  }
});
test('invalid or conflicting explicit simanim never mean enclosing siman', () => {
  for (const text of ['ש"ך סי\' אב ס"ק א', 'סי\' א ש"ך סי\' ב ס"ק א']) {
    assert.equal(parseSeifKatanCitation(text, sources), null);
  }
});
test('a conjunctive DH marker is not swallowed as another SK number', () => {
  assert.equal(parseSeifKatanCitation('ש"ך ס"ק ג\' וד"ה אבן גדולה', sources)?.dh, 'אבן גדולה');
  assert.equal(parseSeifKatanCitation('ש"ך ס"ק ג\' וד\' ובד"ה אבן גדולה', sources)?.dh, 'אבן גדולה');
});
test('numbers that look like words are read as numbers; non-canonical words are not', () => {
  assert.equal(simanNumber('סימן לא'), 31);
  assert.equal(simanNumber('סימן כה'), 25);
  assert.equal(simanNumber('סימן ל״א'), 31);
  for (const [word, value] of [['לא', 31], ['כה', 25], ['לו', 36]] as const) assert.equal(hebrewNumeral(word), value);
  for (const word of ['זה', 'זו', 'בו', 'בה', 'בא', 'כי', 'גב', 'יה']) assert.equal(hebrewNumeral(word), null);
  const sources = [{ id: 'shach', keywords: ['ש"ך'] }];
  for (const [sk, value] of [['כה', 25], ['לא', 31], ['לו', 36]] as const)
    assert.equal(parseSeifKatanCitation(`ש"ך ס"ק ${sk} כתב`, sources)?.seifKatan, value);
  for (const value of ['בטז', 'יטו', 'טטו']) assert.equal(hebrewNumeral(value), null);
});
const phrase = 'אבן גדולה מונחת בפתח הבית';
const other = 'מים רבים זורמים בנהר הרחב';
const lines = ['<h2>סימן א</h2>', '<h3>סעיף א</h3>', other, phrase, other, phrase,
  '<h2>סימן ב</h2>', '<h3>סעיף א</h3>', phrase];
const old = SEFARIA_REF_TABLE[shach.title];
SEFARIA_REF_TABLE[shach.title] = syntheticBook(lines, 'Shach on Shulchan Arukh, Yoreh Deah ', shach.title + ', ', false,
  { 3: [1, 1, 1], 4: [1, 2, 1], 5: [1, 3, 1], 6: [1, 3, 2], 9: [2, 1, 1] });
const base = ['<h2>סימן א</h2>', other, '<h2>סימן ב</h2>', other].join('\n');
function parse(text: string, book = lines) {
  // Mirror Setup: load only what the preload detector found.
  const input = Object.fromEntries(secondarySourcesCitedIn(text, config).map(s => [s.id, { text: book.join('\n') }]));
  return runLinkingParser(text, base, config, undefined, undefined, undefined, undefined, input);
}
function target(text: string) {
  return parse(text).links.filter(l => l.secondaryTarget).map(l => [l.secondaryTarget, l.line_index_2, l.confidence, l.status]);
}
try {
  test('SK-first is actually routed after Setup preload', () => {
    assert.deepEqual(target('<h2>סימן א</h2>\nס"ק א בש"ך כתב'), [['shach', 3, 100, 'approved']]);
  });
  test('a parenthesized citation survives marker preparation', () => {
    for (const prefix of ['(ש"ך ס"ק א)', '(א) (ש"ך ס"ק א)', 'שם (ש"ך ס"ק א)', '(א) (שם ש"ך ס"ק א)']) {
      assert.deepEqual(target('<h2>סימן א</h2>\n' + prefix + ' כתב'), [['shach', 3, 100, 'approved']]);
    }
  });
  test('an unnumbered complete citation opens its new siman instead of inheriting', () => {
    const text = '<h2>סימן א</h2>\n(א) ש"ך ס"ק א כתב\n<h2>סימן ב</h2>\n(סי\' ב ש"ך ס"ק א) כתב';
    const skConfig = { ...config, halachaMultiLinePieces: true, halachaSeifKatan: true };
    const parsed = runLinkingParser(text, base, skConfig, undefined, undefined, undefined, undefined, { shach: { text: lines.join('\n') } });
    assert.deepEqual(parsed.links.map(l => [l.line_index_1, l.line_index_2, Boolean(l.isInherited)]), [[2, 3, false], [4, 9, false]]);
  });
  test('explicit siman wins after Setup preload', () => {
    assert.deepEqual(target('<h2>סימן א</h2>\nסי\' ב ש"ך ס"ק א כתב'), [['shach', 9, 100, 'approved']]);
    assert.match(parse('<h2>סימן א</h2>\nסי\' ב ש"ך ס"ק א כתב').links[0].heRef_2, /סימן ב/);
  });
  test('a DH in the next SK cannot replace the cited SK', () => {
    assert.deepEqual(target('<h2>סימן א</h2>\nש"ך ס"ק א ד"ה ' + phrase + '. ביאור'), [['shach', 3, 60, 'pending']]);
  });
  test('a DH may use another paragraph of the SAME SK', () => {
    assert.deepEqual(target('<h2>סימן א</h2>\nש"ך ס"ק ג ד"ה ' + phrase + '. ביאור'), [['shach', 6, 100, 'approved']]);
    assert.equal(parse('<h2>סימן א</h2>\nש"ך ס"ק ג ד"ה ' + phrase + '. ביאור').dhHighlights[2].wordStart, 4);
  });
  test('a changed paragraph is not a verified SK destination', () => {
    const changed = lines.slice(); changed[5] = 'טקסט שונה שהשתנה בזמן עדכון הספר';
    assert.equal(seifKatanLine(shach.title, changed, 1, 3), null);
    assert.equal(parse('<h2>סימן א</h2>\nש"ך ס"ק ג כתב', changed).links.some(l => l.secondaryTarget), false);
  });
  test('SK paragraph selection is not limited to two physical neighbours', () => {
    const book = ['<h2>סימן א</h2>', other, other, other, other, phrase];
    SEFARIA_REF_TABLE[shach.title] = syntheticBook(book, 'Shach on Shulchan Arukh, Yoreh Deah ', shach.title + ', ', false,
      { 2: [1, 1, 1], 3: [1, 1, 2], 4: [1, 1, 3], 5: [1, 1, 4], 6: [1, 1, 5] });
    assert.deepEqual(parse('<h2>סימן א</h2>\nש"ך ס"ק א ד"ה ' + phrase + '. ביאור', book)
      .links.map(l => [l.secondaryTarget, l.line_index_2, l.status]), [['shach', 6, 'approved']]);
  });
} finally { SEFARIA_REF_TABLE[shach.title] = old; }
if (failures) process.exitCode = 1;
