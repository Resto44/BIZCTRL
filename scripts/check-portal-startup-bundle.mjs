import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve('dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+src="\/([^\"]+\.js)"/)?.[1];
if (!entry) throw new Error('Built application entry is missing');
const visited = new Set();
const active = new Set();
function visit(file) {
  if (active.has(file)) throw new Error(`Circular startup dependency: ${file}`);
  if (visited.has(file)) return;
  if (/vendor-(?:pdf|charts)|controlRoutes|RetailCashier|RestaurantPOS|CustomerDisplay/.test(file)) {
    throw new Error(`Optional portal feature blocks startup: ${file}`);
  }
  active.add(file);
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g)) {
    visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
  active.delete(file);
  visited.add(file);
}
visit(entry);
let bytes = 0, gzipBytes = 0;
for (const file of visited) {
  const data = fs.readFileSync(path.join(root, file));
  bytes += data.length;
  gzipBytes += gzipSync(data).length;
}
console.log(JSON.stringify({ startupFiles: [...visited], bytes, gzipBytes }, null, 2));
