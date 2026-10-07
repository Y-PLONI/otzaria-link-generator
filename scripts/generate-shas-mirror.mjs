/**
 * Builds src/data/shasMirrorTable.ts — the commentary→gemara line map used to emit the
 * "mirror" links in the export (a link that points at רש"י/תוספות also gets the gemara
 * line it hangs off, which the UI never shows) — and src/data/halachaMirrorTable.ts, the same
 * map from each נושא כלים to its part of the Shulchan Arukh.
 *
 *   node scripts/generate-shas-mirror.mjs
 *
 * Input is data/shas-commentary-links/, produced by scripts/extract-shas-commentary-links.mjs
 * from the local Otzaria library. That directory is ~30MB and is not committed, so when it is
 * absent this script leaves an existing generated table untouched and exits 0 — a machine
 * without the library extract can still run `npm run build`.
 *
 * ── Encoding ──────────────────────────────────────────────────────────────────────────
 * Per tractate, per commentary series, ONE string of comma-separated base36 deltas, walking
 * the commentary's lines in order from line 1. An empty slot means that commentary line has
 * no link; a non-empty slot contains signed deltas from the previous base line. Multiple
 * targets in one slot are separated by colons; every library link is preserved.
 *
 *   "3,0,,1:1,-3" → line 1→3, line 2→3, line 3 unlinked, line 4→[4,5], line 5→2
 *
 * 141k links come to ~287KB this way (30MB of source JSON), small enough to inline into the
 * single-file build. Line numbers are 1-based on BOTH sides: the database is 0-based and the
 * +1 is applied here, once, so no consumer has to know about it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { bookSignature } from '../src/utils/refSignatures.mjs';

const projectRoot = process.cwd();
const inDir = path.join(projectRoot, 'data', 'shas-commentary-links');
const outFile = path.join(projectRoot, 'src', 'data', 'shasMirrorTable.ts');
const halachaOutFile = path.join(projectRoot, 'src', 'data', 'halachaMirrorTable.ts');
const typesFile = path.join(projectRoot, 'src', 'types.ts');

/** commentary book title prefix -> key in the generated table */
const SERIES = { 'רש"י': 'rashi', 'תוספות': 'tosafot' };

if (!fs.existsSync(inDir)) {
  const verb = fs.existsSync(outFile) ? 'keeping the committed table' : 'NO TABLE WILL EXIST';
  console.warn(`shas-mirror: ${inDir} not found — ${verb}.`);
  console.warn('shas-mirror: regenerate it with `node --import tsx scripts/extract-shas-commentary-links.mjs`.');
  process.exit(0);
}

const signaturesFile = path.join(projectRoot, 'data', 'sefaria', 'line-signatures.json');
if (!fs.existsSync(signaturesFile)) throw new Error('Extract content signatures before regenerating mirror tables');
const signatures = JSON.parse(fs.readFileSync(signaturesFile, 'utf8'));
if (signatures.version !== 2) throw new Error('Re-run extract-sefaria-signatures.py: content signatures v2 required');
const fingerprints = {};
function fingerprint(title, totalLines, refSignature) {
  const lines = signatures.books[title];
  if (!lines || lines.length !== totalLines) throw new Error(`${title}: signatures do not match the link snapshot`);
  if (refSignature !== signatures.refSignatures[title]) throw new Error(`${title}: references differ between link and content snapshots`);
  fingerprints[title] = bookSignature(lines, refSignature);
}

/** a book list the app itself uses — the generated keys must match it exactly */
function readTypesArray(name) {
  const src = fs.readFileSync(typesFile, 'utf8');
  const block = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!block) throw new Error(`${name} not found in ${typesFile}`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

/** map of commentary line -> gemara line, both 1-based, to the delta string above */
function encode(map) {
  if (map.size === 0) return '';
  const maxLine = [...map.keys()].reduce((max, line) => Math.max(max, line), 0);
  const parts = [];
  let prev = 0;
  for (let line = 1; line <= maxLine; line++) {
    const gemara = map.get(line);
    if (gemara === undefined) {
      parts.push('');
      continue;
    }
    parts.push(gemara.map(base => { const delta = base - prev; prev = base; return delta.toString(36); }).join(':'));
  }
  return parts.join(',');
}

/** the decoder from src/utils/shasMirror.ts, duplicated here purely to self-check the output */
function decode(encoded) {
  const map = new Map();
  if (!encoded) return map;
  const parts = encoded.split(',');
  let prev = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    map.set(i + 1, parts[i].split(':').map(delta => { prev += parseInt(delta, 36); return prev; }));
  }
  return map;
}

let totalPairs = 0;
let multiple = 0;

/** One commentary's links, inverted to commentary line -> base line and encoded (self-checked). */
function encodeCommentary(commentary) {
  // The extract runs base(source) -> commentary(target); the mirror needs the inverse.
  const map = new Map();
  for (const link of commentary.links) {
    const commentaryLine = link.targetLineIndex + 1;
    const baseLine = link.sourceLineIndex + 1;
    if (!map.has(commentaryLine)) map.set(commentaryLine, []);
    if (!map.get(commentaryLine).includes(baseLine)) map.get(commentaryLine).push(baseLine);
  }
  for (const lines of map.values()) {
    lines.sort((a, b) => a - b);
    if (lines.length > 1) multiple++;
  }

  const encoded = encode(map);
  const roundTrip = decode(encoded);
  if (roundTrip.size !== map.size) {
    throw new Error(`${commentary.title}: round-trip size ${roundTrip.size} != ${map.size}`);
  }
  for (const [line, base] of map) {
    if (JSON.stringify(roundTrip.get(line)) !== JSON.stringify(base)) {
      throw new Error(`${commentary.title}: round-trip mismatch at line ${line}`);
    }
  }
  totalPairs += [...map.values()].reduce((total, lines) => total + lines.length, 0);
  return encoded;
}

const index = JSON.parse(fs.readFileSync(path.join(inDir, 'index.json'), 'utf8'));
const expected = readTypesArray('SHAS_TRACTATES');
const table = {};

for (const entry of index.tractates) {
  const data = JSON.parse(fs.readFileSync(path.join(inDir, entry.file), 'utf8'));
  fingerprint(data.tractate, data.totalLines, data.refSignature);
  const perTractate = {};

  for (const commentary of data.commentaries) {
    const key = SERIES[commentary.series];
    if (!key) continue;
    fingerprint(commentary.title, commentary.totalLines, commentary.refSignature);
    perTractate[key] = encodeCommentary(commentary);
  }

  table[entry.tractate] = perTractate;
}

const generated = Object.keys(table);
const missing = expected.filter(t => !generated.includes(t));
const extra = generated.filter(t => !expected.includes(t));
if (missing.length || extra.length) {
  console.error('shas-mirror: tractate keys do not match SHAS_TRACTATES in src/types.ts');
  if (missing.length) console.error(`  missing from the table: ${missing.join(', ')}`);
  if (extra.length) console.error(`  not in SHAS_TRACTATES:  ${extra.join(', ')}`);
  process.exit(1);
}

const body = expected
  .map(tractate => {
    const entry = table[tractate];
    const series = Object.entries(entry)
      .map(([key, encoded]) => `    ${key}: ${JSON.stringify(encoded)},`)
      .join('\n');
    return `  ${JSON.stringify(tractate)}: {\n${series || ''}\n  },`;
  })
  .join('\n');

const output = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`node scripts/generate-shas-mirror.mjs\` (wired into \`npm run build\`).
 *
 * Commentary line -> gemara line, for רש"י and תוספות on every tractate of the Bavli.
 * Both sides are 1-based physical line indices. See src/utils/shasMirror.ts for the decoder
 * and the generator script's header for the encoding.
 *
 * ${totalPairs.toLocaleString('en-US')} pairs. Tractates with no such commentary in the library
 * (תמיד) carry an empty object.
 */
export const SHAS_MIRROR_TABLE: Record<string, { rashi?: string; tosafot?: string }> = {
${body}
};
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });

// ── The Shulchan Arukh: נושא כלים line -> all linked lines of its part ──
// A deliberate regeneration requires a complete, consistent snapshot.
const shasPairs = totalPairs;
const halachaParts = readTypesArray('HALACHA_BOOKS');
const halachaTable = {};
for (const entry of index.halacha ?? []) {
  const data = JSON.parse(fs.readFileSync(path.join(inDir, entry.file), 'utf8'));
  fingerprint(data.base, data.totalLines, data.refSignature);
  halachaTable[entry.base] = Object.fromEntries(data.commentaries.map(c => {
    fingerprint(c.title, c.totalLines, c.refSignature);
    return [c.series, encodeCommentary(c)];
  }));
}
const missingParts = halachaParts.filter(part => !halachaTable[part]);
if (missingParts.length) {
  throw new Error(`Incomplete mirror snapshot: ${missingParts.join(', ')}; re-run extract-shas-commentary-links.mjs`);
} else {
  const halachaBody = halachaParts
    .map(part => {
      const series = Object.entries(halachaTable[part])
        .map(([key, encoded]) => `    ${key}: ${JSON.stringify(encoded)},`)
        .join('\n');
      return `  ${JSON.stringify(part)}: {\n${series}\n  },`;
    })
    .join('\n');
  const halachaOutput = `// GENERATED by scripts/generate-shas-mirror.mjs (npm run build) — do not edit by hand.
// נושא כלים line -> line of its Shulchan Arukh part; encoding as in shasMirrorTable.ts.
export const HALACHA_MIRROR_TABLE: Record<string, Record<string, string>> = {
${halachaBody}
};
`;
  fs.writeFileSync(halachaOutFile, halachaOutput, 'utf8');
  console.log(`shas-mirror: ${(totalPairs - shasPairs).toLocaleString('en-US')} Shulchan Arukh pairs, wrote ${(halachaOutput.length / 1024).toFixed(0)}KB to ${path.relative(projectRoot, halachaOutFile)}`);
}

fs.writeFileSync(outFile, output, 'utf8');
fs.writeFileSync(path.join(projectRoot, 'src/data/mirrorSignatures.ts'),
  '// GENERATED by scripts/generate-shas-mirror.mjs — do not edit.\n' +
  'export const MIRROR_SIGNATURES: Record<string, string> = ' + JSON.stringify(fingerprints, null, 2) + ';\n');

console.log(`shas-mirror: ${shasPairs.toLocaleString('en-US')} pairs, ${generated.length} tractates`);
if (multiple) console.log(`shas-mirror: preserved all base links of ${multiple} commentary lines with multiple targets`);
console.log(`shas-mirror: wrote ${(output.length / 1024).toFixed(0)}KB to ${path.relative(projectRoot, outFile)}`);
