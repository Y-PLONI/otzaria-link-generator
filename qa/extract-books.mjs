/** Extract real QA text from plain or compressed Otzaria databases. Needs Python + zstandard. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.env.PYTHON || 'python3', [
  fileURLToPath(new URL('./extract-books.py', import.meta.url)), ...process.argv.slice(2)
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
