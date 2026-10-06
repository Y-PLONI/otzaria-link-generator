import fs from 'node:fs';
import { refSegments } from '../src/utils/refSignatures.mjs';
import { lineSignature, segmentHash, type BakedBook } from '../src/utils/sefariaRefs';

/** v2 normalized content, sufficient to reconstruct exactly the checksum input. */
export function fromSignature(sig: string): string {
  const header = sig.match(/^H([1-6]):(.*)$/);
  return header ? `<h${header[1]}>${header[2]}</h${header[1]}>` : sig.slice(1);
}
export function readSignatures(): Record<string, string[]> | null {
  const file = 'data/sefaria/line-signatures.json';
  if (!fs.existsSync(file)) return null;
  const extracted = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (extracted.version !== 2) throw new Error('Regenerate content signatures (version 2 required)');
  return extracted.books;
}

/** Small independently addressed books for resolver tests; no production table is generated here. */
export function syntheticBook(lines: string[], prefix: string, hePrefix: string, isDaf: boolean,
  addresses: Record<number, number[]>): BakedBook & { signature: string } {
  let refs = '';
  for (const { start, end, hash } of refSegments(lines.map(lineSignature))) {
    refs += '|' + hash;
    for (let line = start + 1; line <= end; line++) {
      refs += addresses[line] ? '=' + addresses[line].map(n => n.toString(36)).join(':') : '.';
    }
  }
  return { refs, signature: segmentHash(lines.map(lineSignature)), nodes: [[prefix, hePrefix, isDaf ? 1 : 0]] };
}
