/**
 * Free-text search ignores nikud, te'amim and markup, and reads a maqaf as a space — on both
 * the query and the searched text.
 *
 * Run: npx tsx qa/search-normalize.test.ts
 */

import { normalizeForSearch } from '../src/utils/searchNormalize';

let failures = 0;
const check = (name: string, cond: boolean) => {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
};

const matches = (text: string, query: string) =>
  normalizeForSearch(text).includes(normalizeForSearch(query).trim());

const pointed = 'הַיֶּ֣לֶד הָלַ֣ךְ אֶל־בֵּית־הַסֵּ֑פֶר עִם <b>תִּיק</b> חָדָ֖שׁ׃';
const plain = 'הילד הלך אל בית הספר עם תיק חדש';

check('plain query finds pointed text', matches(pointed, 'הלך אל'));
check('maqaf in the text matches a space in the query', matches(pointed, 'בית הספר'));
check('pointed query finds plain text', matches(plain, 'הַסֵּפֶר'));
check('pointed query with maqaf finds plain text', matches(plain, 'אֶל־בֵּית'));
check('markup does not split a match', matches(pointed, 'עם תיק חדש'));
check('tag names are not searchable', !matches(pointed, 'b'));
check('a different word is not found', !matches(pointed, 'כיסא'));
check('punctuation is kept (sof pasuq)', normalizeForSearch(pointed).endsWith('׃'));
check('latin text is case-insensitive', matches('Hello World', 'hello'));
check('plain text is unchanged', normalizeForSearch(plain) === plain);

console.log('markup, entities and look-alike characters');
check('a tag separates words', !matches('אב<br>גד', 'אבגד') && matches('אב<br>גד', 'אב גד'));
check('a lone < keeps the text after it', matches('a < b and c > d', 'and'));
check('&quot; reads as "', matches('ד&quot;ה', 'ד"ה'));
check('&nbsp; reads as a space, and is not searchable by name', matches('א&nbsp;ב', 'א ב') && !matches('א&nbsp;ב', 'nbsp'));
check('gershayim match an ASCII quote, both ways', matches('ד״ה', 'ד"ה') && matches('ד"ה', 'ד״ה'));
check('geresh matches an apostrophe', matches('א׳', "א'"));
check('runs of whitespace and nbsp collapse', matches('אל   בית', 'אל בית') && matches('אל בית', 'אל   בית'));
check('presentation forms decompose (U+FB2A, U+FB2B, U+FB2F)', matches('שׁם שׂר אָב', 'שם שר אב'));
check('CGJ and bidi marks are ignored', matches('יְרוּשָׁלִ͏ַם א‏ב', 'ירושלם אב'));
check('mark order does not matter (NFD)', matches('בָּ', 'בָּ'));
check('a query of only nikud or a maqaf normalizes to nothing',
  normalizeForSearch('ָ').trim() === '' && normalizeForSearch('־').trim() === '');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
