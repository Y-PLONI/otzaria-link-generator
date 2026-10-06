// Builds src/data/sefariaRefTable.ts; with an input missing it keeps the committed table.
// Inputs and the encoding: docs/DOUBLE_LINKS_AND_REVERSE_EXPORT.md, section 9.1.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { segmentHash, refSegments, bookSignature } from '../src/utils/refSignatures.mjs';

const projectRoot = process.cwd();
const outFile = path.join(projectRoot, 'src', 'data', 'sefariaRefTable.ts');
const DB = process.env.OTZARIA_DB
  || path.join(os.homedir(), 'AppData', 'Roaming', 'otzaria', 'books', 'seforim.db');
const titlesFile = path.join(projectRoot, 'data', 'sefaria', 'sefaria_he_titles.txt');
const prefixesFile = path.join(projectRoot, 'data', 'sefaria', 'sefaria_ref_prefixes.tsv');
const signaturesFile = path.join(projectRoot, 'data', 'sefaria', 'line-signatures.json');

const missingInputs = [DB, titlesFile, prefixesFile, signaturesFile].filter(f => !fs.existsSync(f));
if (missingInputs.length) {
  const verb = fs.existsSync(outFile) ? 'keeping the committed table' : 'NO TABLE WILL EXIST';
  console.warn(`sefaria-refs: missing ${missingInputs.join(', ')} — ${verb}.`);
  process.exit(0);
}

const { DatabaseSync } = await import('node:sqlite');

const RASHI = 'רש"י על ';
const TOSAFOT = 'תוספות על ';

/** halacha book -> its nodes: [Hebrew node name ('' = the book itself), English ref prefix] */
const HALACHA_NODES = {
  'שולחן ערוך, אורח חיים': [['', 'Shulchan Arukh, Orach Chayim ']],
  'שולחן ערוך, יורה דעה': [['', "Shulchan Arukh, Yoreh De'ah "]],
  'שולחן ערוך, אבן העזר': [
    ['', 'Shulchan Arukh, Even HaEzer,  '],
    ['סדר הגט', 'Shulchan Arukh, Even HaEzer, Seder HaGet,  '],
    ['סדר חליצה', 'Shulchan Arukh, Even HaEzer, Seder Halitzah,  '],
  ],
  'שולחן ערוך, חושן משפט': [['', 'Shulchan Arukh, Choshen Mishpat ']],
};

/**
 * The נושאי כלים of src/data/halachaCommentators.ts -> their nodes, as above. A node whose English
 * prefix is null is not mapped to Sefaria: its lines get no ref_2, and a link to one is not exported.
 */
const COMMENTATOR_NODES = {
  'מגן אברהם': [['', 'Magen Avraham,  '], ['הקדמת בן המחבר', "Magen Avraham, An Introduction by the Author's Son,  "]],
  'טורי זהב על שולחן ערוך אורח חיים': [['', 'Turei Zahav on Shulchan Arukh, Orach Chayim ']],
  'באר היטב אורח חיים': [['', "Ba'er Hetev on Shulchan Arukh, Orach Chayim "]],
  'משנה ברורה': [
    ['', 'Mishnah Berurah,  '],
    ['הקדמה', 'Mishnah Berurah, Introduction,  '],
    ['הקדמה להלכות שבת', 'Mishnah Berurah, Introduction to the Laws of Shabbat,  '],
  ],
  'ביאור הלכה': [['', 'Biur Halacha ']],
  'שפתי כהן על שולחן ערוך יורה דעה': [
    ['', "Siftei Kohen on Shulchan Arukh, Yoreh De'ah,  "],
    ['דיני ספק ספקא בקצרה', "Siftei Kohen on Shulchan Arukh, Yoreh De'ah, S'fek S'feka Summary,  "],
  ],
  'טורי זהב על שולחן ערוך יורה דעה': [['', "Turei Zahav on Shulchan Arukh, Yoreh De'ah "]],
  'באר היטב יורה דעה': [['', "Ba'er Hetev on Shulchan Arukh, Yoreh De'ah "]],
  'פתחי תשובה על שולחן ערוך יורה דעה': [['', "Pitchei Teshuva on Shulchan Arukh, Yoreh De'ah "]],
  'חלקת מחוקק': [['', 'Chelkat Mechokek ']],
  // מדור השמות של בית שמואל: אין התאמה ודאית בין שמות הצמתים לספריא
  'בית שמואל': [
    ['', 'Beit Shmuel,  '],
    ['בית שמואל שמות אנשים ונשים הקדמה', null],
    ['בית שמואל שמות אנשים ונשים שמות אנשים', null],
    ['בית שמואל שמות אנשים ונשים שמות נשים', null],
    ['בית שמואל שמות אנשים ונשים שמות עיירות ונהרות', null],
    ['בית שמואל שמות אנשים ונשים כללים', null],
  ],
  'טורי זהב על שולחן ערוך אבן העזר': [
    ['', 'Turei Zahav on Shulchan Arukh, Even HaEzer,  '],
    ['שמות אנשים ונשים', "Turei Zahav on Shulchan Arukh, Even HaEzer, Shemot Anashim V'Nashim,  "],
    ['סדר הגט', 'Turei Zahav on Shulchan Arukh, Even HaEzer, Seder HaGet,  '],
  ],
  'באר היטב אבן העזר': [
    ['', "Ba'er Hetev on Shulchan Arukh, Even HaEzer,  "],
    ['סדר חליצה', "Ba'er Hetev on Shulchan Arukh, Even HaEzer, Seder Halitzah,  "],
  ],
  'פתחי תשובה על שולחן ערוך אבן העזר': [
    ['', 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer,  '],
    ['שמות אנשים ונשים', "Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Shemot Anashim V'Nashim,  "],
    ['סדר הגט', 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Seder HaGet,  '],
    ['סדר חליצה', 'Pitchei Teshuva on Shulchan Arukh, Even HaEzer, Seder Halitzah,  '],
  ],
  'מאירת עיניים על שולחן ערוך חושן משפט': [['', "Me'irat Einayim on Shulchan Arukh, Choshen Mishpat "]],
  'שפתי כהן על שולחן ערוך חושן משפט': [
    ['', 'Siftei Kohen on Shulchan Arukh, Choshen Mishpat,  '],
    ['דיני מיגו', 'Siftei Kohen on Shulchan Arukh, Choshen Mishpat, Dinei Migo,  '],
  ],
  'טורי זהב על שולחן ערוך חושן משפט': [['', 'Turei Zahav on Shulchan Arukh, Choshen Mishpat ']],
  'באר היטב חשן משפט': [['', "Ba'er Hetev on Shulchan Arukh, Choshen Mishpat "]],
  'פתחי תשובה על שולחן ערוך חושן משפט': [
    ['', 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat,  '],
    ['כללי תפיסה', 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat, Klalei Tefisa,  '],
    ['דיני מיגו', 'Pitchei Teshuva on Shulchan Arukh, Choshen Mishpat, Dinei Migo,  '],
  ],
  'קצות החושן על שולחן ערוך חושן משפט': [['', 'Ketzot HaChoshen on Shulchan Arukh, Choshen Mishpat ']],
};

function readArray(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!block) throw new Error(`${name} not found in ${file}`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

function readMap(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\};`));
  if (!block) throw new Error(`${name} not found in ${file}`);
  return Object.fromEntries([...block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));
}

const typesFile = path.join(projectRoot, 'src', 'types.ts');
const refsFile = path.join(projectRoot, 'src', 'utils', 'sefariaRefs.ts');
const SHAS = readArray(typesFile, 'SHAS_TRACTATES');
const TANAKH = readArray(typesFile, 'TANAKH_BOOKS');
const HALACHA = readArray(typesFile, 'HALACHA_BOOKS');
const GEMARA_EN = readMap(refsFile, 'GEMARA_EN');
const TANAKH_EN = readMap(refsFile, 'TANAKH_EN');

const heTitles = new Set(fs.readFileSync(titlesFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
const extracted = JSON.parse(fs.readFileSync(signaturesFile, 'utf8'));
if (extracted.version !== 2) throw new Error('Re-run extract-sefaria-signatures.py: content signatures v2 required');
const signatures = extracted.books;
const prefixes = new Map();
for (const line of fs.readFileSync(prefixesFile, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [prefix, offsets = ''] = line.split('\t');
  prefixes.set(prefix, offsets.trim());
}

const errors = [];
/** A prefix the validator does not know, or one with index offsets, would emit refs that resolve to nothing. */
function checkPrefix(prefix, owner) {
  if (!prefixes.has(prefix)) errors.push(`${owner}: prefix ${JSON.stringify(prefix)} is not in the Sefaria snapshot`);
  else if (prefixes.get(prefix)) errors.push(`${owner}: prefix ${JSON.stringify(prefix)} has index offsets, unsupported`);
}

for (const [map, list, label] of [[GEMARA_EN, SHAS, 'SHAS_TRACTATES'], [TANAKH_EN, TANAKH, 'TANAKH_BOOKS']]) {
  for (const title of list) if (!map[title]) errors.push(`${label}: ${title} has no English name`);
  for (const [he, en] of Object.entries(map)) {
    if (!heTitles.has(he)) errors.push(`${he}: not a Sefaria title, so links to it must not carry ref_2`);
    checkPrefix(`${en} `, he);
  }
}

const LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
function heNumber(text) {
  const letters = text.replace(/['"׳״]/g, '');
  if (!letters) return null;
  let total = 0;
  for (const ch of letters) {
    if (!LETTERS[ch]) return null;
    total += LETTERS[ch];
  }
  return total;
}

/** heRef components after the book (and node) name -> address; the first is a daf when isDaf. */
function parseAddress(parts, isDaf) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (i === 0 && isDaf) {
      const m = part.match(/^(\S+?)([.:])$/);
      const n = m && heNumber(m[1]);
      if (!n) return null;
      out.push(n * 2 - (m[2] === '.' ? 1 : 0));
    } else {
      const n = heNumber(part);
      if (!n) return null;
      out.push(n);
    }
  }
  return out;
}

const b36 = n => n.toString(36);

/** `segments`: [{ start, hash }] — each segment's tokens follow its `|hash`, and no run crosses it. */
function encode(lines, segments) {
  const out = [];
  const hashAt = new Map(segments.map(seg => [seg.start, seg.hash]));
  const ends = [...segments.slice(1).map(seg => seg.start), lines.length];
  let segment = -1;
  let prev = null;
  let node = 0;
  let i = 0;
  const isNext = (a, p) => p && a && a.node === node && a.address.length === p.length
    && a.address.slice(0, -1).every((v, j) => v === p[j]) && a.address[p.length - 1] === p[p.length - 1] + 1;
  while (i < lines.length) {
    if (hashAt.has(i)) {
      out.push('|' + hashAt.get(i));
      segment++;
    }
    const end = ends[segment];
    const cur = lines[i];
    if (!cur) {
      let j = i;
      while (j < end && !lines[j]) j++;
      out.push('.' + (j - i > 1 ? b36(j - i) : ''));
      i = j;
      continue;
    }
    if (cur.node !== node) {
      out.push('#' + b36(cur.node));
      node = cur.node;
      prev = null;
    }
    if (isNext(cur, prev)) {
      let j = i;
      let p = prev;
      while (j < end && isNext(lines[j], p)) { p = lines[j].address; j++; }
      out.push('+' + (j - i > 1 ? b36(j - i) : ''));
      prev = p;
      i = j;
      continue;
    }
    const a = cur.address;
    let token = null;
    if (prev && prev.length === a.length) {
      for (let level = 0; level < a.length - 1; level++) {
        if (a.slice(0, level).every((v, j) => v === prev[j]) && a[level] > prev[level]) {
          const lower = a.slice(level + 1);
          while (lower.length && lower[lower.length - 1] === 1) lower.pop();
          const k = a.length - 1 - level;
          const delta = a[level] - prev[level];
          token = k === 1 && !lower.length && delta <= 26
            ? String.fromCharCode(64 + delta)
            : '^'.repeat(k) + b36(delta) + lower.map(v => ':' + b36(v)).join('');
          break;
        }
      }
    }
    out.push(token ?? '=' + a.map(b36).join(':'));
    prev = a;
    i++;
  }
  return out.join('');
}

/** Mirror of decodeBaked in src/utils/sefariaRefs.ts, used only to self-check the output. */
function decode(refs) {
  const out = [];
  const segments = [];
  let node = 0;
  let prev = null;
  const emit = address => { out.push({ node, address }); prev = address; };
  for (const [, op, arg] of refs.matchAll(/([.+=#|]|\^+|[A-Z])([0-9a-z:]*)/g)) {
    if (op === '|') { segments.push({ start: out.length, hash: arg }); continue; }
    const values = arg ? arg.split(':').map(v => parseInt(v, 36)) : [];
    if (op === '.') for (let i = 0; i < (values[0] || 1); i++) out.push(null);
    else if (op === '#') { node = values[0]; prev = null; }
    else if (op === '=') emit(values);
    else if (op === '+') for (let i = 0; i < (values[0] || 1); i++) { const n = [...prev]; n[n.length - 1]++; emit(n); }
    else {
      const k = op[0] === '^' ? op.length : 1;
      const delta = op[0] === '^' ? values[0] : op.charCodeAt(0) - 64;
      const lower = op[0] === '^' ? values.slice(1) : [];
      const level = prev.length - 1 - k;
      const n = [...prev.slice(0, level), prev[level] + delta];
      while (n.length < prev.length) n.push(lower[n.length - level - 1] ?? 1);
      emit(n);
    }
  }
  return { lines: out, segments };
}

const db = new DatabaseSync(DB, { readOnly: true });
// Prepared per call: a statement held across the loop is finalized once `db` looks unused to the GC.
const findBook = { get: title => db.prepare('SELECT id, totalLines FROM book WHERE title = ?').get(title) };
const readRefs = { all: id => db.prepare('SELECT lineIndex, heRef FROM line WHERE bookId = ? ORDER BY lineIndex').all(id) };

/** title -> { nodes: [[en, he, isDaf]], isDaf } for every book that gets a table entry */
const books = [
  ...SHAS.map(title => ({ title, nodes: [['', `${GEMARA_EN[title]} `]], isDaf: true })),
  ...TANAKH.map(title => ({ title, nodes: [['', `${TANAKH_EN[title]} `]], isDaf: false })),
];
for (const t of SHAS) {
  books.push({ title: RASHI + t, nodes: [['', `Rashi on ${GEMARA_EN[t]} `]], isDaf: true });
  books.push({ title: TOSAFOT + t, nodes: [['', `Tosafot on ${GEMARA_EN[t]} `]], isDaf: true });
}
for (const t of TANAKH) books.push({ title: RASHI + t, nodes: [['', `Rashi on ${TANAKH_EN[t]} `]], isDaf: false });
for (const t of HALACHA) {
  if (!HALACHA_NODES[t]) { errors.push(`${t}: no Sefaria nodes declared in this script`); continue; }
  books.push({ title: t, nodes: HALACHA_NODES[t], isDaf: false });
}
for (const [title, nodes] of Object.entries(COMMENTATOR_NODES)) {
  // Unmapped nodes go last, so the addressed ones keep their indices in the emitted table.
  if (nodes.some(([, en], i) => !en && nodes.slice(i).some(([, later]) => later))) errors.push(`${title}: unmapped nodes must come last`);
  books.push({ title, nodes, isDaf: false });
}

const table = [];
let totalRefs = 0;
for (const book of books) {
  // A link to a book Sefaria does not own must not carry ref_2, so such a book gets no entry.
  if (!heTitles.has(book.title)) { console.log(`sefaria-refs: skip ${book.title} (not a Sefaria title)`); continue; }
  const meta = findBook.get(book.title);
  if (!meta) { console.log(`sefaria-refs: skip ${book.title} (not in the library)`); continue; }
  for (const [, en] of book.nodes) if (en) checkPrefix(en, book.title);

  const rows = readRefs.all(meta.id);
  if (rows.length !== meta.totalLines || rows.some((r, i) => r.lineIndex !== i)) {
    errors.push(`${book.title}: line rows are not 0..${meta.totalLines - 1}`);
    continue;
  }
  if (extracted.refSignatures[book.title] !== segmentHash(rows.map(row => row.heRef ?? ''))) {
    errors.push(`${book.title}: references differ from the signature snapshot; regenerate from the same database`);
    continue;
  }
  const heads = book.nodes.map(([name]) => (name ? `${book.title}, ${name}, ` : `${book.title}, `));
  const lines = rows.map(({ heRef }) => {
    if (!heRef) return null;
    const ref = heRef.replace(/״/g, '"');
    // The longest head first: a node's name follows the book's own.
    const order = heads.map((h, i) => i).sort((x, y) => heads[y].length - heads[x].length);
    const node = order.find(i => ref.startsWith(heads[i]));
    if (node !== undefined && !book.nodes[node][1]) return null;
    const address = node === undefined ? null : parseAddress(ref.slice(heads[node].length).split(','), book.isDaf);
    if (!address) { errors.push(`${book.title}: cannot parse heRef ${heRef}`); return null; }
    return { node, address };
  });
  const sigs = signatures[book.title];
  if (!sigs || sigs.length !== rows.length) {
    errors.push(`${book.title}: line-signatures.json is stale (re-run extract-sefaria-signatures.py)`);
    continue;
  }
  const segments = refSegments(sigs).map(({ start, hash }) => ({ start, hash }));
  sigs.forEach((sig, i) => {
    if (sig.startsWith('H') && lines[i]) errors.push(`${book.title}: header line ${i + 1} has a heRef`);
  });
  const depths = new Map();
  for (const l of lines) {
    if (!l) continue;
    if ((depths.get(l.node) ?? l.address.length) !== l.address.length) errors.push(`${book.title}: mixed address depths`);
    depths.set(l.node, l.address.length);
  }

  const refs = encode(lines, segments);
  const { lines: roundTrip, segments: roundSegments } = decode(refs);
  if (roundTrip.length !== lines.length || lines.some((l, i) => JSON.stringify(l) !== JSON.stringify(roundTrip[i]))
    || JSON.stringify(roundSegments) !== JSON.stringify(segments)) {
    throw new Error(`${book.title}: round-trip mismatch`);
  }
  const nodes = book.nodes.filter(([, en]) => en)
    .map(([name, en]) => [en, name ? `${book.title}, ${name} ` : `${book.title} `, book.isDaf ? 1 : 0]);
  table.push({ title: book.title, nodes, refs, signature: bookSignature(sigs, extracted.refSignatures[book.title]) });
  totalRefs += lines.filter(Boolean).length;
}

// Commentaries `<X> על <base>` that are themselves Sefaria books: their links would need ref_1.
const bases = [...SHAS, ...Object.keys(TANAKH_EN).filter(t => !SHAS.includes(t)), ...HALACHA];
const commentators = new Map();
for (const title of heTitles) {
  const at = title.lastIndexOf(' על ');
  if (at < 0) continue;
  const base = bases.indexOf(title.slice(at + 4));
  if (base < 0) continue;
  const name = title.slice(0, at);
  if (!commentators.has(name)) commentators.set(name, []);
  commentators.get(name).push(base);
}

if (errors.length) {
  console.error(errors.slice(0, 30).join('\n'));
  if (errors.length > 30) console.error(`… and ${errors.length - 30} more`);
  process.exit(1);
}

const entries = table
  .map(b => `  ${JSON.stringify(b.title)}: {\n    signature: ${JSON.stringify(b.signature)},\n    nodes: ${JSON.stringify(b.nodes)},\n    refs: ${JSON.stringify(b.refs)},\n  },`)
  .join('\n');
const commentatorEntries = [...commentators]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, list]) => `  ${JSON.stringify(name)}: ${JSON.stringify(list.sort((a, b) => a - b).map(b36).join(','))},`)
  .join('\n');

const output = `// GENERATED by scripts/generate-sefaria-refs.mjs (npm run build) — do not edit by hand.
// Decoder: src/utils/sefariaRefs.ts.
export const SEFARIA_REF_TABLE: Record<string, {
  /** per node: [English ref prefix, Hebrew heRef prefix, 1 when the first number is a daf] */
  nodes: [string, string, number][];
  signature: string;
  refs: string;
}> = {
${entries}
};

/** Base books of SEFARIA_COMMENTATORS, indexed by its base36 numbers. */
export const SEFARIA_COMMENTARY_BASES: string[] = ${JSON.stringify(bases)};

/** Commentator -> the bases (into SEFARIA_COMMENTARY_BASES) on which \`<commentator> על <base>\` is a Sefaria title. */
export const SEFARIA_COMMENTATORS: Record<string, string> = {
${commentatorEntries}
};
`;

fs.writeFileSync(outFile, output, 'utf8');
console.log(`sefaria-refs: ${table.length} books, ${totalRefs.toLocaleString('en-US')} refs, ${commentators.size} commentators`);
console.log(`sefaria-refs: wrote ${(output.length / 1024).toFixed(0)}KB to ${path.relative(projectRoot, outFile)}`);
