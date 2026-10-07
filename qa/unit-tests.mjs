import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = fs.readdirSync('qa').filter(name => /\.test\.tsx?$/.test(name)).sort();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join('qa', file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) failures++;
}
console.log(`${files.length - failures}/${files.length} test scripts passed`);
process.exitCode = failures ? 1 : 0;
