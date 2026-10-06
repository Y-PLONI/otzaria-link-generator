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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
