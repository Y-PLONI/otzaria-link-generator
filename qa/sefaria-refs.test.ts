/**
 * ref_2 of exported links (src/utils/sefariaRefs.ts).
 *
 *   node --import tsx qa/sefaria-refs.test.ts
 *
 * 1. Unit checks on fixed examples — always run.
 * 2. Ground truth: every ref_2 in real links files of otzaria-library (DictaToOtzaria), re-derived
 *    from path_2 + line_index_2. Set DICTA_LINKS_DIR to a folder of *_links.json; skipped otherwise.
 * 3. Every line of every supported target in the local library, against its own heRef. Needs
 *    the library database (OTZARIA_DB overrides the default location); commentaries also need
 *    data/sefaria/line-signatures.json (scripts/extract-sefaria-signatures.py). Skipped otherwise.
 * 4. Every ref produced by 2 and 3 has the shape otzaria-library's validate_manual_links_refs.py
 *    accepts. Needs data/sefaria/sefaria_ref_prefixes.tsv (SEFARIA_PREFIXES overrides); and every
 *    supported target is in data/sefaria/sefaria_he_titles.txt (SEFARIA_HE_TITLES overrides).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sefariaRefFor, isSefariaOwnedTarget, isSefariaOwnedCommentary, titleOfPath,
  hebrewToNumber, numberToHebrew, GEMARA_EN, TANAKH_EN, resolveBakedRef, segmentHash, lineSignature
} from '../src/utils/sefariaRefs';
import type { BakedBook } from '../src/utils/sefariaRefs';
import { SEFARIA_REF_TABLE } from '../src/data/sefariaRefTable';
import { TANAKH_BOOKS } from '../src/types';

let failures = 0;
const ascii = (s: unknown) => String(JSON.stringify(s) ?? 'undefined').replace(/[^ -~]/g, c => '\\u' + `${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = ascii(actual), e = ascii(expected);
  if (a !== e) failures++;
  console.log(`${a === e ? 'PASS' : 'FAIL'}  ${name}${a === e ? '' : `\n   got ${a}\n   want ${e}`}`);
};

// ── 1. unit ──────────────────────────────────────────────────────────────────────────────────
const BERAKHOT = 'ברכות';
const GENESIS = 'בראשית';
const RASHI_BERAKHOT = 'רש"י על ברכות';
const TOSAFOT_BERAKHOT = 'תוספות על ברכות';
const SA_OC = 'שולחן ערוך, אורח חיים';

const gemaraText = [`<h1>${BERAKHOT}</h1>`, '<h2>דף ב.</h2>', 'x', 'x', '<h2>דף ב:</h2>', 'x', '<h2>דף טו.</h2>', 'x'];
eq('gemara: first line under the daf header', sefariaRefFor(BERAKHOT, 3, gemaraText)?.ref, 'Berakhot 2a:1');
eq('gemara: second line', sefariaRefFor(BERAKHOT, 4, gemaraText)?.ref, 'Berakhot 2a:2');
eq('gemara: amud b restarts the count', sefariaRefFor(BERAKHOT, 6, gemaraText)?.ref, 'Berakhot 2b:1');
eq('gemara: daf 15', sefariaRefFor(BERAKHOT, 8, gemaraText)?.ref, 'Berakhot 15a:1');
eq('gemara: heRef in the library notation', sefariaRefFor(BERAKHOT, 6, gemaraText)?.heRef, `${BERAKHOT} ב:, א`);
eq('gemara: a header line has no ref', sefariaRefFor(BERAKHOT, 2, gemaraText), undefined);
eq('gemara: no text, no ref', sefariaRefFor(BERAKHOT, 3), undefined);

const tanakhText = [`<h1>${GENESIS}</h1>`, '<h2>פרק א</h2>', 'x', 'x', '<h2>פרק ב</h2>', 'x'];
eq('tanakh: chapter and verse', sefariaRefFor(GENESIS, 4, tanakhText)?.ref, 'Genesis 1:2');
eq('tanakh: next chapter', sefariaRefFor(GENESIS, 6, tanakhText)?.ref, 'Genesis 2:1');
const ESTHER = 'אסתר';
eq('tanakh: a book of Ketuvim is a selectable target with a derived ref', [TANAKH_BOOKS.includes(ESTHER), sefariaRefFor(ESTHER, 4, tanakhText)?.ref], [true, 'Esther 1:2']);

// A synthetic baked book: segments [h1], [daf 2a + 2 lines], [daf 2b + 2 lines].
const bakedText = ['<h1>T</h1>', '<h2>\u05d3\u05e3 \u05d1.</h2>', '\u05d0\u05d1', '\u05d2\u05d3\u05d4', '<h2>\u05d3\u05e3 \u05d1:</h2>', '\u05d5', '\u05d6\u05d7'];
const hashOf = (from: number, to: number) => segmentHash(bakedText.slice(from, to).map(lineSignature));
const baked: BakedBook = {
  nodes: [['Rashi on X ', 'X ', 1]],
  refs: `|${hashOf(0, 1)}.|${hashOf(1, 4)}.=3:1:1+|${hashOf(4, 7)}.^^1:2A`
};
const refOf = (line: number, lines: string[]) => {
  const r = resolveBakedRef(baked, line, lines);
  return typeof r === 'string' ? r : r.ref;
};
eq('baked: addresses of an unchanged text', [3, 4, 6, 7].map(l => refOf(l, bakedText)),
  ['Rashi on X 2a:1:1', 'Rashi on X 2a:1:2', 'Rashi on X 2b:2:1', 'Rashi on X 2b:3:1']);
eq('baked: a header line', refOf(2, bakedText), 'header');
eq('baked: nikud, markup and a trailing newline change nothing',
  refOf(7, [...bakedText.slice(0, 6), '<b>\u05d6\u05b8\u05d7</b> ', '']), 'Rashi on X 2b:3:1');
const added = [...bakedText.slice(0, 6), '\u05d8', ...bakedText.slice(6)];
eq('baked: a line added to one segment drops only that segment', [3, 4, 6, 7, 8].map(l => refOf(l, added)),
  ['Rashi on X 2a:1:1', 'Rashi on X 2a:1:2', 'changed', 'changed', 'changed']);
const replaced = [...bakedText.slice(0, 2), '\u05d0\u05d1\u05d2', ...bakedText.slice(3)];
eq('baked: a line replaced at the same line count is detected', [3, 4, 6].map(l => refOf(l, replaced)),
  ['changed', 'changed', 'Rashi on X 2b:2:1']);
const inserted = [bakedText[0], '<h2>\u05d3\u05e3 \u05d0:</h2>', '\u05d9', ...bakedText.slice(1)];
eq('baked: a new segment shifts the rest without losing it', [3, 5, 9].map(l => refOf(l, inserted)),
  ['changed', 'Rashi on X 2a:1:1', 'Rashi on X 2b:3:1']);

eq('numerals round-trip 1..1000', Array.from({ length: 1000 }, (_, i) => i + 1).filter(n => hebrewToNumber(numberToHebrew(n)) !== n), []);
eq('15 and 16 avoid the divine name', [numberToHebrew(15), numberToHebrew(16)], ['טו', 'טז']);
eq('owned targets', [BERAKHOT, GENESIS, RASHI_BERAKHOT, SA_OC].map(isSefariaOwnedTarget), [true, true, true, true]);
eq('not owned', ['רש"י על תמיד', 'ספר בדוי'].map(isSefariaOwnedTarget), [false, false]);
eq('owned commentary', isSefariaOwnedCommentary(RASHI_BERAKHOT), true);
eq('commentary outside Sefaria', isSefariaOwnedCommentary('פירוש בדוי על ברכות'), false);
eq('title of a nested path_2', titleOfPath('א\\ב\\' + GENESIS + '.txt'), GENESIS);

// ── shared: the library database ─────────────────────────────────────────────────────────────
const DB_PATH = process.env.OTZARIA_DB || path.join(os.homedir(), 'AppData', 'Roaming', 'otzaria', 'books', 'seforim.db');
type Db = { prepare: (sql: string) => { all: (...a: unknown[]) => any[]; get: (...a: unknown[]) => any } };
let db: Db | null = null;
if (fs.existsSync(DB_PATH)) {
  const { DatabaseSync } = await import('node:sqlite');
  db = new DatabaseSync(DB_PATH, { readOnly: true }) as unknown as Db;
}

/** A target's lines as the plugin would load them, as far as ref derivation can tell: header lines
 *  come back from the table of contents (verified identical to the stored text), others are 'x';
 *  a baked book's lines are rebuilt from its extracted signatures. */
const SIGNATURES = path.join('data', 'sefaria', 'line-signatures.json');
const signatures: Record<string, (string | number)[]> | null =
  fs.existsSync(SIGNATURES) ? JSON.parse(fs.readFileSync(SIGNATURES, 'utf8')) : null;
const fromSignature = (sig: string | number) => typeof sig === 'number'
  ? (sig ? '\u05d0'.repeat(sig) : '-')
  : `<h${sig.slice(0, sig.indexOf(':'))}>${sig.slice(sig.indexOf(':') + 1)}</h${sig.slice(0, sig.indexOf(':'))}>`;
const skeletonCache = new Map<string, { lines: string[]; heRefs: (string | null)[] } | null>();
function libraryBook(title: string) {
  if (!db) return null;
  if (skeletonCache.has(title)) return skeletonCache.get(title)!;
  const book = db.prepare('SELECT id FROM book WHERE title = ?').get(title);
  let result = null;
  if (book) {
    const rows = db.prepare('SELECT lineIndex, heRef FROM line WHERE bookId = ? ORDER BY lineIndex').all(book.id);
    const baked = title in SEFARIA_REF_TABLE;
    const lines = baked ? signatures?.[title]?.map(fromSignature) : rows.map(() => 'x');
    if (!lines || lines.length !== rows.length) {
      skeletonCache.set(title, null);
      return null;
    }
    if (!baked) for (const t of db.prepare(`SELECT l.lineIndex, t.level, x.text FROM tocEntry t
        JOIN tocText x ON x.id = t.textId JOIN line l ON l.id = t.lineId WHERE t.bookId = ?`).all(book.id)) {
      lines[t.lineIndex] = `<h${t.level + 1}>${t.text}</h${t.level + 1}>`;
    }
    result = { lines, heRefs: rows.map(r => r.heRef as string | null) };
  }
  skeletonCache.set(title, result);
  return result;
}

const produced = new Set<string>();

// ── 2. ground truth from otzaria-library ─────────────────────────────────────────────────────
const dictaDir = process.env.DICTA_LINKS_DIR;
if (!dictaDir || !fs.existsSync(dictaDir)) {
  console.log('SKIP  ground truth: set DICTA_LINKS_DIR to a folder of real *_links.json');
} else {
  let compared = 0, matched = 0, noText = 0, unsupported = 0, ownedWithoutRef = 0;
  const misses: string[] = [];
  for (const file of fs.readdirSync(dictaDir).filter(f => f.endsWith('_links.json'))) {
    for (const rec of JSON.parse(fs.readFileSync(path.join(dictaDir, file), 'utf8'))) {
      const title = titleOfPath(String(rec.path_2 ?? ''));
      if (!isSefariaOwnedTarget(title)) { unsupported++; continue; }
      if (!rec.ref_2) { ownedWithoutRef++; continue; }
      const text = libraryBook(title)?.lines;
      if (!text) { noText++; continue; }
      const got = sefariaRefFor(title, Math.round(Number(rec.line_index_2)), text)?.ref;
      compared++;
      if (got === rec.ref_2) matched++;
      else if (misses.length < 10) misses.push(`${ascii(file.slice(-40))} line ${rec.line_index_2}: got ${got} want ${rec.ref_2}`);
      if (got) produced.add(got);
    }
  }
  console.log(`INFO  ground truth: ${compared} records compared, ${matched} match; ${unsupported} to other books, ` +
    `${ownedWithoutRef} without ref_2, ${noText} skipped for lack of the base text`);
  misses.forEach(m => console.log(`      ${m}`));
  eq('ground truth: every supported ref_2 re-derived exactly', compared - matched, 0);
}

// ── 3. every line of the library ─────────────────────────────────────────────────────────────
if (!db) {
  console.log(`SKIP  library sweep: no database at ${DB_PATH}`);
} else {
  const LETTERS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
  const numeric = new RegExp(`^[${LETTERS}]+[.:]?$`);
  /** heRef -> English, independently of the code under test: trailing numbers become the address. */
  const expectedRef = (heRef: string, enOf: (heHead: string) => string | undefined, isDaf: boolean) => {
    const parts = heRef.replace(/״/g, '"').split(',').map(p => p.trim());
    let cut = parts.length;
    while (cut > 1 && numeric.test(parts[cut - 1])) cut--;
    // A node name may itself read as a number (הקדמה): take the longest head the map knows.
    for (let known = parts.length - 1; known > cut; known--) {
      if (enOf(parts.slice(0, known).join(', '))) { cut = known; break; }
    }
    const en = enOf(parts.slice(0, cut).join(', '));
    if (!en) return undefined;
    const nums = parts.slice(cut).map((p, i) => {
      if (i === 0 && isDaf) return `${hebrewToNumber(p.slice(0, -1))}${p.endsWith('.') ? 'a' : 'b'}`;
      return String(hebrewToNumber(p));
    });
    return en + nums.join(':');
  };
  const EH = 'שולחן ערוך, אבן העזר';
  const HALACHA_EN: Record<string, string> = {
    [SA_OC]: 'Shulchan Arukh, Orach Chayim ',
    'שולחן ערוך, יורה דעה': "Shulchan Arukh, Yoreh De'ah ",
    [EH]: 'Shulchan Arukh, Even HaEzer,  ',
    [`${EH}, סדר הגט`]: 'Shulchan Arukh, Even HaEzer, Seder HaGet,  ',
    [`${EH}, סדר חליצה`]: 'Shulchan Arukh, Even HaEzer, Seder Halitzah,  ',
    'שולחן ערוך, חושן משפט': 'Shulchan Arukh, Choshen Mishpat ',
  };
  // נושאי הכלים, כל צומת בספר בנפרד (בית שמואל: מדור השמות אינו ממופה, ולכן אין לו ref_2)
  const SA = 'שולחן ערוך ';
  const COMMENTATOR_EN: Record<string, string> = {
    'מגן אברהם': 'Magen Avraham,  ',
    'מגן אברהם, הקדמת בן המחבר': "Magen Avraham, An Introduction by the Author's Son,  ",
    'משנה ברורה': 'Mishnah Berurah,  ',
    'משנה ברורה, הקדמה': 'Mishnah Berurah, Introduction,  ',
    'משנה ברורה, הקדמה להלכות שבת': 'Mishnah Berurah, Introduction to the Laws of Shabbat,  ',
    'ביאור הלכה': 'Biur Halacha ',
    'חלקת מחוקק': 'Chelkat Mechokek ',
    'בית שמואל': 'Beit Shmuel,  ',
    'באר היטב אורח חיים': "Ba'er Hetev on Shulchan Arukh, Orach Chayim ",
    'באר היטב יורה דעה': "Ba'er Hetev on Shulchan Arukh, Yoreh De'ah ",
    'באר היטב אבן העזר': "Ba'er Hetev on Shulchan Arukh, Even HaEzer,  ",
    'באר היטב אבן העזר, סדר חליצה': "Ba'er Hetev on Shulchan Arukh, Even HaEzer, Seder Halitzah,  ",
    'באר היטב חשן משפט': "Ba'er Hetev on Shulchan Arukh, Choshen Mishpat ",
    [`טורי זהב על ${SA}אורח חיים`]: 'Turei Zahav on Shulchan Arukh, Orach Chayim ',
    [`טורי זהב על ${SA}יורה דעה`]: "Turei Zahav on Shulchan Arukh, Yoreh De'ah ",
    [`טורי זהב על ${SA}אבן העזר`]: 'Turei Zahav on Shulchan Arukh, Even HaEzer,  ',
    [`טורי זהב על ${SA}אבן העזר, שמות אנשים ונשים`]: "Turei Zahav on Shulchan Arukh, Even HaEzer, Shemot Anashim V'Nashim,  ",
    [`טורי זהב על ${SA}אבן העזר, סדר הגט`]: 'Turei Zahav on Shulchan Arukh, Even HaEzer, Seder HaGet,  ',
    [`טורי זהב על ${SA}חושן משפט`]: 'Turei Zahav on Shulchan Arukh, Choshen Mishpat ',
    [`שפתי כהן על ${SA}יורה דעה`]: "Siftei Kohen on Shulchan Arukh, Yoreh De'ah,  ",
    [`שפתי כהן על ${SA}יורה דעה, דיני ספק ספקא בקצרה`]: "Siftei Kohen on Shulchan Arukh, Yoreh De'ah, S'fek S'feka Summary,  ",
    [`שפתי כהן על ${SA}חושן משפט`]: 'Siftei Kohen on Shulchan Arukh, Choshen Mishpat,  ',
    [`שפתי כהן על ${SA}חושן משפט, דיני מיגו`]: 'Siftei Kohen on Shulchan Arukh, Choshen Mishpat, Dinei Migo,  ',
    [`פתחי תשובה על ${SA}יורה דעה`]: "Pitchei Teshuva on Shulchan Arukh, Yoreh De'ah ",
    [`פתחי תשובה על ${SA}אבן העזר`]: 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer,  ',
    [`פתחי תשובה על ${SA}אבן העזר, שמות אנשים ונשים`]: "Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Shemot Anashim V'Nashim,  ",
    [`פתחי תשובה על ${SA}אבן העזר, סדר הגט`]: 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Seder HaGet,  ',
    [`פתחי תשובה על ${SA}אבן העזר, סדר חליצה`]: 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Seder Halitzah,  ',
    [`פתחי תשובה על ${SA}חושן משפט`]: 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat,  ',
    [`פתחי תשובה על ${SA}חושן משפט, כללי תפיסה`]: 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat, Klalei Tefisa,  ',
    [`פתחי תשובה על ${SA}חושן משפט, דיני מיגו`]: 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat, Dinei Migo,  ',
    [`מאירת עיניים על ${SA}חושן משפט`]: "Me'irat Einayim on Shulchan Arukh, Choshen Mishpat ",
    [`קצות החושן על ${SA}חושן משפט`]: 'Ketzot HaChoshen on Shulchan Arukh, Choshen Mishpat ',
  };
  const RASHI = 'רש"י על ', TOSAFOT = 'תוספות על ';
  const enOfTitle = (heHead: string): string | undefined => {
    if (GEMARA_EN[heHead]) return `${GEMARA_EN[heHead]} `;
    if (TANAKH_EN[heHead]) return `${TANAKH_EN[heHead]} `;
    if (HALACHA_EN[heHead]) return HALACHA_EN[heHead];
    if (COMMENTATOR_EN[heHead]) return COMMENTATOR_EN[heHead];
    for (const [series, en] of [[RASHI, 'Rashi on '], [TOSAFOT, 'Tosafot on ']]) {
      if (heHead.startsWith(series)) {
        const base = GEMARA_EN[heHead.slice(series.length)] || TANAKH_EN[heHead.slice(series.length)];
        return base ? `${en}${base} ` : undefined;
      }
    }
    return undefined;
  };

  const targets = [...Object.keys(GEMARA_EN), ...Object.keys(TANAKH_EN), ...Object.keys(SEFARIA_REF_TABLE)];
  let lines = 0, withRef = 0, books = 0;
  const misses: string[] = [];
  for (const title of targets) {
    const book = libraryBook(title);
    if (!book) { console.log(`INFO  library sweep: ${ascii(title)} has no text here (not in this library, or no line-signatures.json)`); continue; }
    books++;
    const isDaf = title in GEMARA_EN || Object.keys(GEMARA_EN).some(t => title === RASHI + t || title === TOSAFOT + t);
    book.heRefs.forEach((heRef, i) => {
      lines++;
      const want = heRef ? expectedRef(heRef, enOfTitle, isDaf) : undefined;
      const got = sefariaRefFor(title, i + 1, book.lines)?.ref;
      if (got) { withRef++; produced.add(got); }
      if (got !== want && misses.length < 10) misses.push(`${ascii(title)} line ${i + 1}: got ${got} want ${want}`);
      if (got !== want) failures++;
    });
  }
  console.log(`INFO  library sweep: ${books} books, ${lines} lines, ${withRef} with a ref`);
  misses.forEach(m => console.log(`      ${m}`));
  eq('library sweep: every line agrees with its heRef', misses.length, 0);
}

// ── 4. shape and ownership, as otzaria-library validates them ────────────────────────────────
const prefixesFile = process.env.SEFARIA_PREFIXES || path.join('data', 'sefaria', 'sefaria_ref_prefixes.tsv');
if (!fs.existsSync(prefixesFile)) {
  console.log(`SKIP  ref shape: no ${prefixesFile}`);
} else {
  const prefixes = new Map<string, number[]>();
  for (const line of fs.readFileSync(prefixesFile, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [prefix, offsets = ''] = line.split('\t');
    if (prefix) prefixes.set(prefix, offsets.trim() ? offsets.split(',').map(Number) : []);
  }
  const ADDRESS_RE = /^\d+[ab]?(?::\d+[ab]?)*$/;
  // check_ref_shape: the longest prefix followed by a numeric address; offsets bound the paragraph.
  const bad = [...produced].filter(ref => {
    const exact = [...prefixes.keys()].filter(p => ref.startsWith(p) && ADDRESS_RE.test(ref.slice(p.length)));
    if (!exact.length) return true;
    const prefix = exact.reduce((a, b) => (b.length > a.length ? b : a));
    const offsets = prefixes.get(prefix)!;
    const address = ref.slice(prefix.length).split(':');
    if (offsets.length && address.length === 2 && /^\d+$/.test(address[0]) && /^\d+$/.test(address[1])) {
      const [section, paragraph] = address.map(Number);
      return section > offsets.length || paragraph <= offsets[section - 1];
    }
    return false;
  });
  console.log(`INFO  ref shape: ${produced.size} distinct refs checked`);
  eq('ref shape: every produced ref has a legal prefix and address', bad.slice(0, 5), []);
}

const titlesFile = process.env.SEFARIA_HE_TITLES || path.join('data', 'sefaria', 'sefaria_he_titles.txt');
if (!fs.existsSync(titlesFile)) {
  console.log(`SKIP  ownership: no ${titlesFile}`);
} else {
  const owned = new Set(fs.readFileSync(titlesFile, 'utf8').split('\n').map(l => l.trim()));
  const targets = [...Object.keys(GEMARA_EN), ...Object.keys(TANAKH_EN), ...Object.keys(SEFARIA_REF_TABLE)];
  eq('ownership: every target that gets ref_2 is a Sefaria title', targets.filter(t => !owned.has(t)).map(ascii), []);
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exitCode = 1;
}
