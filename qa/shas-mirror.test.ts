import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHAS_TRACTATES } from '../src/types';
import { mirrorBaseLines } from '../src/utils/shasMirror';
const dbPath = process.env.OTZARIA_DB;
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('SKIP Shas mirror DB sweep: set OTZARIA_DB');
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const book = db.prepare('SELECT id, totalLines FROM book WHERE title = ?');
  const type = db.prepare('SELECT id FROM connection_type WHERE name = ?').get('COMMENTARY') as { id: number };
  const links = db.prepare(`SELECT s.lineIndex AS base, l.targetLineIndex AS commentary FROM link l
    JOIN line s ON s.id = l.sourceLineId WHERE l.connectionTypeId = ? AND l.sourceBookId = ? AND l.targetBookId = ?`);
  let pairs = 0;
  for (const tractate of SHAS_TRACTATES) {
    const base = book.get(tractate) as { id: number };
    for (const [id, label] of [['rashi', 'רש"י'], ['tosafot', 'תוספות']]) {
      const secondary = book.get(`${label} על ${tractate}`) as { id: number; totalLines: number } | undefined;
      if (!secondary) continue;
      const expected = new Map<number, Set<number>>();
      for (const row of links.all(type.id, base.id, secondary.id) as { base: number; commentary: number }[]) {
        const line = row.commentary + 1;
        if (!expected.has(line)) expected.set(line, new Set());
        expected.get(line)!.add(row.base + 1);
      }
      for (let line = 1; line <= secondary.totalLines; line++) {
        const want = [...(expected.get(line) ?? [])].sort((a, b) => a - b);
        assert.deepEqual(mirrorBaseLines(tractate, id, line) ?? [], want, `${tractate}/${id}:${line}`);
        pairs += want.length;
      }
    }
  }
  db.close();
  console.log(`PASS Shas DB mirror sweep: ${pairs} exact line pairs, including all multiple targets`);
}
