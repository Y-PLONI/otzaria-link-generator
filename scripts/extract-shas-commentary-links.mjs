/**
 * Extracts every COMMENTARY link between the Babylonian Talmud tractates and their
 * Rashi / Tosafot, and between the four parts of the Shulchan Arukh and their נושאי כלים
 * (src/data/halachaCommentators.ts), from the local Otzaria library database.
 *
 *   node --import tsx scripts/extract-shas-commentary-links.mjs [outDir]
 *
 * Default outDir is data/shas-commentary-links (one JSON per tractate / part + index.json).
 * Set OTZARIA_DB to point at a database other than the default install location.
 * Requires Node 22+ for the built-in node:sqlite module.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { segmentHash } from '../src/utils/refSignatures.mjs';

const DB = process.env.OTZARIA_DB
  || path.join(os.homedir(), 'AppData', 'Roaming', 'otzaria', 'books', 'seforim.db');

const outDir = process.argv[2] || path.join(process.cwd(), 'data', 'shas-commentary-links');

const COMMENTARY_SERIES = ['רש"י', 'תוספות'];
/** connection_type.name = 'COMMENTARY' */
const COMMENTARY_TYPE_NAME = 'COMMENTARY';

if (!fs.existsSync(DB)) {
  console.error(`library database not found at ${DB}\nset OTZARIA_DB to override`);
  process.exit(1);
}

const db = new DatabaseSync(DB, { readOnly: true });
const COMMENTARY_TYPE = db.prepare('SELECT id FROM connection_type WHERE name = ?').get(COMMENTARY_TYPE_NAME)?.id;
if (COMMENTARY_TYPE === undefined) throw new Error('No COMMENTARY connection type in database');

const { SHAS_TRACTATES } = await import('../src/types.ts');
const referenceSignature = id => segmentHash(db.prepare('SELECT heRef FROM line WHERE bookId = ? ORDER BY lineIndex').all(id).map(row => row.heRef ?? ''));

const tractates = SHAS_TRACTATES.map(title => {
  const book = db.prepare('SELECT b.id, b.title, b.totalLines, c.title AS seder, b.orderIndex FROM book b JOIN category c ON c.id = b.categoryId WHERE b.title = ?').get(title);
  if (!book) throw new Error(`${title}: not in the library`);
  return book;
});
const commentariesFor = db.prepare('SELECT id, title, totalLines FROM book WHERE title = ?');

const linksFor = db.prepare(`
  SELECT l.id            AS linkId,
         sl.lineIndex    AS sourceLineIndex,
         sl.heRef        AS sourceRef,
         l.targetLineIndex,
         tl.heRef        AS targetRef,
         l.baseProvenance
    FROM link l
    JOIN line sl ON sl.id = l.sourceLineId
    JOIN line tl ON tl.id = l.targetLineId
   WHERE l.connectionTypeId = ${COMMENTARY_TYPE}
     AND l.sourceBookId = ? AND l.targetBookId = ?
   ORDER BY sl.lineIndex, l.targetLineIndex
`);

// Anchors (dibur-hamatchil offsets) and multi-line ranges are optional per link.
const anchorsFor = db.prepare(`
  SELECT a.linkId, a.side, a.charStart, a.charEnd, a.label
    FROM link_anchor a JOIN link l ON l.id = a.linkId
   WHERE l.connectionTypeId = ${COMMENTARY_TYPE}
     AND l.sourceBookId = ? AND l.targetBookId = ?
`);
const rangesFor = db.prepare(`
  SELECT r.linkId, r.side, r.endLineIndex
    FROM link_range r JOIN link l ON l.id = r.linkId
   WHERE l.connectionTypeId = ${COMMENTARY_TYPE}
     AND l.sourceBookId = ? AND l.targetBookId = ?
`);

/** file-name-safe slug for a Hebrew tractate title */
const slug = (title) => title.replace(/["'׳״]/g, '').replace(/\s+/g, '-');

fs.mkdirSync(outDir, { recursive: true });

const index = [];
let grandTotal = 0;
const bookByTitle = db.prepare('SELECT id, title, totalLines FROM book WHERE title = ?');

for (const tractate of tractates) {
  const entry = {
    tractate: tractate.title,
    seder: tractate.seder,
    bookId: tractate.id,
    totalLines: tractate.totalLines,
    refSignature: referenceSignature(tractate.id),
    commentaries: [],
  };

  for (const series of COMMENTARY_SERIES) {
    const book = commentariesFor.get(`${series} על ${tractate.title}`);
    if (!book) continue;

    const links = linksFor.all(tractate.id, book.id);

    const anchors = new Map();
    for (const a of anchorsFor.all(tractate.id, book.id)) {
      if (!anchors.has(a.linkId)) anchors.set(a.linkId, []);
      anchors.get(a.linkId).push({ side: a.side, charStart: a.charStart, charEnd: a.charEnd, label: a.label });
    }
    const ranges = new Map();
    for (const r of rangesFor.all(tractate.id, book.id)) {
      if (!ranges.has(r.linkId)) ranges.set(r.linkId, []);
      ranges.get(r.linkId).push({ side: r.side, endLineIndex: r.endLineIndex });
    }
    for (const l of links) {
      if (anchors.has(l.linkId)) l.anchors = anchors.get(l.linkId);
      if (ranges.has(l.linkId)) l.ranges = ranges.get(l.linkId);
    }

    entry.commentaries.push({
      series,
      title: book.title,
      bookId: book.id,
      totalLines: book.totalLines,
      refSignature: referenceSignature(book.id),
      linkCount: links.length,
      links,
    });
    grandTotal += links.length;
  }

  const file = `${slug(tractate.title)}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(entry, null, 1), 'utf8');

  index.push({
    tractate: tractate.title,
    seder: tractate.seder,
    bookId: tractate.id,
    file,
    commentaries: entry.commentaries.map(c => ({
      series: c.series, title: c.title, bookId: c.bookId, linkCount: c.linkCount,
    })),
  });

  const summary = entry.commentaries.map(c => `${c.series}=${c.linkCount}`).join(' ') || '(none)';
  console.log(`  ${tractate.title.padEnd(12)} ${summary}`);
}

// The Shulchan Arukh: each part with the נושאי כלים the app routes to. Anchors and ranges are
// left out: the mirror table needs only the line pairs.
const { HALACHA_COMMENTATORS } = await import('../src/data/halachaCommentators.ts');
const halacha = [];
for (const [part, commentators] of Object.entries(HALACHA_COMMENTATORS)) {
  const base = bookByTitle.get(part);
  if (!base) throw new Error(`${part}: not in the library`);
  const entry = { base: part, bookId: base.id, totalLines: base.totalLines, refSignature: referenceSignature(base.id), commentaries: [] };
  for (const commentator of commentators) {
    const book = bookByTitle.get(commentator.title);
    if (!book) throw new Error(`${commentator.title}: not in the library`);
    const links = linksFor.all(base.id, book.id).map(({ sourceLineIndex, targetLineIndex }) => ({ sourceLineIndex, targetLineIndex }));
    entry.commentaries.push({
      series: commentator.id, title: book.title, bookId: book.id, totalLines: book.totalLines, refSignature: referenceSignature(book.id), linkCount: links.length, links,
    });
    grandTotal += links.length;
  }
  const file = `halacha-${slug(part).replace(/,/g, '')}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(entry, null, 1), 'utf8');
  halacha.push({
    base: part, bookId: base.id, file,
    commentaries: entry.commentaries.map(c => ({ series: c.series, title: c.title, bookId: c.bookId, linkCount: c.linkCount })),
  });
  console.log(`  ${part}  ${entry.commentaries.map(c => `${c.series}=${c.linkCount}`).join(' ')}`);
}

fs.writeFileSync(
  path.join(outDir, 'index.json'),
  JSON.stringify({
    source: DB,
    generatedAt: new Date().toISOString(),
    connectionType: 'COMMENTARY',
    direction: 'tractate (source) -> commentary (target)',
    tractateCount: index.length,
    linkCount: grandTotal,
    tractates: index,
    halacha,
  }, null, 2),
  'utf8',
);

console.log(`\n${grandTotal} links across ${index.length} tractates and ${halacha.length} Shulchan Arukh parts -> ${outDir}`);
