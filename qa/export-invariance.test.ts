/**
 * Proves that the `findSourceMatchRange` token-space fix changes ONLY the on-screen
 * highlight and never the exported link data.
 *
 * The runner (`qa/export-invariance.run.mjs`) executes this file twice — once against
 * the fixed parser and once against a copy with the fix reverted — and diffs the two
 * dumps. This file itself just emits a deterministic dump on stdout.
 *
 * The exported payload is what TopToolbar.handleExportZip writes, built by buildLinkRecords.
 */

import { runLinkingParser } from '../src/utils/parserAlgorithm';
import type { PluginConfig } from '../src/types';
import assert from 'node:assert/strict';
import { syntheticBook } from './ref-fixtures';
import { SEFARIA_REF_TABLE } from '../src/data/sefariaRefTable';
import { buildLinkRecords } from '../src/utils/exportLinks';

/**
 * Source lines deliberately seeded with tokens that `normalizeText` deletes entirely —
 * an em dash, an ellipsis and a Latin word. Those are exactly the tokens that used to
 * shift every following highlight index.
 */
const SOURCE = [
  '<h2>דף ב.</h2>', // gives the lines a Sefaria address, so they reach the export
  'תנו רבנן שלושה דברים נאמרו בענין זה',
  'אמר — רבי יוחנן משום רבי שמעון בן יוחאי',
  'ABC אמר רבי אלעזר משום רבי חנינא תלמידי חכמים',
  'אמר ... רבי יהושע בן לוי כל העוסק בתורה',
  'ואמר רבי זירא אמר רבא בר זימונא אם ראשונים',
  'תניא אידך רבי נתן אומר גדול השלום שאף ישראל',
  'אמר רבי חייא בר אבא אמר רבי יוחנן כל הנביאים',
  'ורבי אבהו אמר אין כל בריה יכולה לעמוד במחיצתן'
].join('\n');

const COMMENTARY = [
  'תנו רבנן. פירוש שנו חכמים בברייתא ובאו ללמדנו הלכה זו',
  'רבי יוחנן משום רבי שמעון. כלומר שאמר בשם רבו והדברים עתיקים',
  'רבי אלעזר משום רבי חנינא. הוא רבי אלעזר בן פדת ששנה כן',
  'רבי יהושע בן לוי. אמורא ארץ ישראלי והלכה כמותו בכל מקום',
  'ואמר רבי זירא. מוסיף על דברי הראשונים שאמרו כן למעלה',
  'רבי נתן אומר. תנא הוא ובא לחלוק על דברי התנא הקודם',
  'רבי חייא בר אבא. תלמידו של רבי יוחנן והביא דבריו כאן',
  'ורבי אבהו אמר. פליג על מה שאמרו לעיל וסובר בענין אחר'
].join('\n');

const CONFIG: PluginConfig = {
  sourceCategory: 'shas',
  targetBookName: 'ברכות',
  ignoreShamInShas: false,
  diburHamatchilDelimiter: '.',
  useAbbreviationExpansion: true,
  useFuzzyMatching: true,
  useWordWeighting: true
};

const sourceLines = SOURCE.split('\n');
SEFARIA_REF_TABLE[CONFIG.targetBookName] = syntheticBook(sourceLines, 'Berakhot ', 'ברכות ', true,
  Object.fromEntries(sourceLines.slice(1).map((_, index) => [index + 2, [3, index + 1]])));

const parsed = runLinkingParser(COMMENTARY, SOURCE, CONFIG);

/** Exactly the records TopToolbar writes into _links.json / _links.csv. */
const exported = buildLinkRecords({ ...parsed, config: CONFIG }).records;

assert.equal(exported.length, parsed.links.length, 'the export comparison must not be vacuous');

/** Display-only field — this is what the fix is expected to change. */
const highlights = parsed.links.map(link => ({
  line_index_1: link.line_index_1,
  matchRange: link.matchRange ?? null
}));

process.stdout.write(JSON.stringify({
  linkCount: parsed.links.length,
  exported,
  highlights
}, null, 2));
