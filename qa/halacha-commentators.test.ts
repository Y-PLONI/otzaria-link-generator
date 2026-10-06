/**
 * נושאי הכלים של השו"ע כמקור משני (#9): ד"ה שנפתח בשם נושא כלים ("ש"ך ד"ה…", "במג"א…") מנותב לספר
 * שלו בחלק השו"ע שנבחר, ובייצוא הוא מקבל גם שורת מראה אל שורת השו"ע שהוא מפרש.
 *
 *   node --import tsx qa/halacha-commentators.test.ts
 *
 * חלקים 1–2 סינתטיים. חלק 3 קורא את מסד הספרייה (OTZARIA_DB) ומדלג כשאין מסד.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLinkingParser, secondarySourcesFor } from '../src/utils/parserAlgorithm';
import { buildLinkRecords } from '../src/utils/exportLinks';
import { mirrorBaseLine } from '../src/utils/shasMirror';
import { HALACHA_COMMENTATORS } from '../src/data/halachaCommentators';
import { SEFARIA_REF_TABLE } from '../src/data/sefariaRefTable';
import { HALACHA_MIRROR_TABLE } from '../src/data/halachaMirrorTable';
import { HALACHA_BOOKS } from '../src/types';
import type { OtzariaLink, PluginConfig, SessionState } from '../src/types';

let failures = 0;
const ascii = (s: unknown) => String(JSON.stringify(s) ?? 'undefined').replace(/[^ -~]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got      ${ascii(actual)}\n      expected ${ascii(expected)}`}`);
};

const config = (part: string): PluginConfig => ({
  sourceCategory: 'halacha',
  targetBookName: part,
  ignoreShamInShas: true,
  diburHamatchilDelimiter: '.',
  useAbbreviationExpansion: true,
  useFuzzyMatching: true,
  useWordWeighting: true,
  halachaMultiLinePieces: false
});

// ── 1. every part: each commentator's name routes to its own book ─────────────────────────────
const PHRASES = [
  'אבן גדולה מונחת בפתח הבית', 'מים רבים זורמים בנהר הרחב', 'עץ גבוה עומד בשדה הירוק',
  'ספר ישן מונח על המדף העליון', 'נר דולק בחלון הבית הקטן', 'כלי נחושת עומד בפינת החדר'
];
const SA_TEXT = ['<h1>שו"ע</h1>', '<h2>סימן א</h2>', 'שורה ראשונה של לשון השולחן ערוך כאן', 'שורה שנייה של הלשון'].join('\n');

for (const part of HALACHA_BOOKS) {
  const commentators = HALACHA_COMMENTATORS[part];
  const secondaries: Record<string, { text: string }> = {};
  const commentary = ['<h2>סימן א</h2>'];
  commentators.forEach((c, i) => {
    // A ש"ך-like book: the citation sits under a סעיף header inside the סימן.
    secondaries[c.id] = { text: ['<h1>x</h1>', '<h2>סימן א</h2>', '<h3>סעיף א</h3>', 'פתיחה כללית של הספר', '<h3>סעיף ב</h3>', `${PHRASES[i]} ועוד`].join('\n') };
    commentary.push(`${c.keywords[i % c.keywords.length]} ד"ה ${PHRASES[i]}. ביאור קצר`);
  });
  const res = runLinkingParser(commentary.join('\n'), SA_TEXT, config(part), undefined, undefined, undefined, undefined, secondaries);
  eq(`${ascii(part)}: each name routes to its book, past the סעיף sub-headers`,
    commentators.map((c, i) => {
      const link = res.links.find(l => l.line_index_1 === i + 2);
      return link && [link.secondaryTarget, link.line_index_2, link.path_2];
    }),
    commentators.map(c => [c.id, 6, `${c.title}.txt`]));
  eq(`${ascii(part)}: the commentators' texts come back in secondaryLines`,
    Object.keys(res.secondaryLines ?? {}).sort(), commentators.map(c => c.id).sort());
}

// ── 2. nothing changes when the commentators are not loaded ──────────────────────────────────
{
  const part = HALACHA_BOOKS[1];
  const commentary = ['<h2>סימן א</h2>', 'ש"ך ד"ה שורה שנייה של הלשון. ביאור'].join('\n');
  const res = runLinkingParser(commentary, SA_TEXT, config(part));
  eq('without the books loaded nothing is routed to them', res.links.filter(l => l.secondaryTarget).length, 0);
  eq('without the books loaded there are no secondaryLines', res.secondaryLines, undefined);
  eq('ש"ס keeps exactly רש"י and תוספות', secondarySourcesFor({ sourceCategory: 'shas', targetBookName: 'ברכות' }).map(s => s.id), ['rashi', 'tosafot']);
}

// ── 3. against the library: tables, refs and the exported mirror row ─────────────────────────
const DB_PATH = process.env.OTZARIA_DB || path.join(os.homedir(), 'AppData', 'Roaming', 'otzaria', 'books', 'seforim.db');
if (!fs.existsSync(DB_PATH)) {
  console.log(`SKIP  library: no database at ${DB_PATH}`);
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const bookId = (title: string) => (db.prepare('SELECT id FROM book WHERE title = ?').get(title) as { id: number } | undefined)?.id;
  /** Header lines from the table of contents, every other line 'x' — enough for refs and line counts. */
  const skeleton = (id: number) => {
    const rows = db.prepare('SELECT lineIndex FROM line WHERE bookId = ? ORDER BY lineIndex').all(id) as { lineIndex: number }[];
    const lines = rows.map(() => 'x');
    for (const t of db.prepare(`SELECT l.lineIndex, t.level, x.text FROM tocEntry t JOIN tocText x ON x.id = t.textId
        JOIN line l ON l.id = t.lineId WHERE t.bookId = ?`).all(id) as { lineIndex: number; level: number; text: string }[]) {
      lines[t.lineIndex] = `<h${t.level + 1}>${t.text}</h${t.level + 1}>`;
    }
    return lines;
  };
  // The baked ref table is anchored to the text: rebuild it from the extracted line signatures.
  const SIGNATURES = path.join('data', 'sefaria', 'line-signatures.json');
  const signatures: Record<string, (string | number)[]> | null =
    fs.existsSync(SIGNATURES) ? JSON.parse(fs.readFileSync(SIGNATURES, 'utf8')) : null;
  const textOf = (title: string) => signatures?.[title]?.map(sig => typeof sig === 'number'
    ? (sig ? 'א'.repeat(sig) : '-')
    : `<h${sig.slice(0, sig.indexOf(':'))}>${sig.slice(sig.indexOf(':') + 1)}</h${sig.slice(0, sig.indexOf(':'))}>`);
  if (!signatures) console.log(`SKIP  library export: no ${SIGNATURES}`);

  let checked = 0;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (const part of HALACHA_BOOKS) {
    const partId = bookId(part)!;
    const partLines = textOf(part);
    for (const c of HALACHA_COMMENTATORS[part]) {
      const id = bookId(c.title);
      if (!id) { missing.push(c.title); continue; }
      if (!SEFARIA_REF_TABLE[c.title] || !HALACHA_MIRROR_TABLE[part]?.[c.id]) missing.push(`${c.title} (table)`);

      // The mirror names one of the שו"ע lines the library links that line to, and no other line.
      const linked = new Map<number, Set<number>>();
      for (const r of db.prepare('SELECT sl.lineIndex AS s, l.targetLineIndex AS t FROM link l JOIN line sl ON sl.id = l.sourceLineId WHERE l.connectionTypeId = 1 AND l.sourceBookId = ? AND l.targetBookId = ?')
        .all(partId, id) as { s: number; t: number }[]) {
        if (!linked.has(r.t + 1)) linked.set(r.t + 1, new Set());
        linked.get(r.t + 1)!.add(r.s + 1);
      }
      const lines = skeleton(id);
      for (let line = 1; line <= lines.length; line++) {
        const mirror = mirrorBaseLine(part, c.id, line);
        const ok = linked.has(line) ? mirror !== undefined && linked.get(line)!.has(mirror) : mirror === undefined;
        if (!ok && wrong.length < 5) wrong.push(`${ascii(c.title)} line ${line}: mirror ${mirror}`);
        if (!ok) failures++;
      }

      // Export: the commentator link and its mirror both carry ref_2 — both books are Sefaria's.
      const commentatorLines = textOf(c.title);
      if (!partLines || !commentatorLines) { checked++; continue; }
      const target = [...linked.keys()][Math.floor(linked.size / 2)];
      const link: OtzariaLink = {
        line_index_1: 1, line_index_2: target, heRef_2: c.label, path_2: `${c.title}.txt`,
        connection_type: 'commentary', secondaryTarget: c.id, secondary_line_index: target
      };
      const session: Pick<SessionState, 'links' | 'config' | 'sourceLines' | 'secondaryLines'> = {
        links: [link], config: config(part), sourceLines: partLines, secondaryLines: { [c.id]: commentatorLines }
      };
      const { records, misses } = buildLinkRecords(session);
      const missingRefs = misses.header + misses.changed + misses.unaddressed + misses.mirror;
      const mirrorLine = mirrorBaseLine(part, c.id, target);
      const shape = records.map(r => [r.line_index_2, r.path_2, Boolean(r.ref_2)]);
      if (missingRefs !== 0 || JSON.stringify(shape) !== JSON.stringify([[target, `${c.title}.txt`, true], [mirrorLine, `${part}.txt`, true]])) {
        failures++;
        wrong.push(`${ascii(c.title)} export: ${ascii(shape)} missing=${missingRefs}`);
      }
      checked++;
    }
  }
  console.log(`INFO  library: ${checked} commentators checked`);
  eq('library: every commentator is in the library, the ref table and the mirror table', missing.map(ascii), []);
  eq('library: mirror rows and exported records agree with the library', wrong, []);
}

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASSED');
