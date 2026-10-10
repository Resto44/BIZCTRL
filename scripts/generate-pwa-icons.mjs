// Generate Safari, Chrome and PWA icons from the user's uploaded BizCTRL mark.
// All dimensions and PNGs are generated deterministically using Node built-ins.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, '../public/icons');
const source = resolve(assetsDir, 'bizctrl-original-source-96.png');

function decodeIndexedPNG(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid app icon source PNG');
  let pos = 8, width, height, depth, type, palette = Buffer.alloc(0);
  let transparency = Buffer.alloc(0);
  const data = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos), kind = buffer.toString('ascii', pos + 4, pos + 8);
    const chunk = buffer.subarray(pos + 8, pos + 8 + length);
    if (kind === 'IHDR') {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      depth = chunk[8]; type = chunk[9];
    } else if (kind === 'PLTE') palette = chunk;
    else if (kind === 'tRNS') transparency = chunk;
    else if (kind === 'IDAT') data.push(chunk);
    else if (kind === 'IEND') break;
    pos += length + 12;
  }
  if (depth !== 8 || type !== 3 || width !== 96 || height !== 96 || !palette.length)
    throw Error('Unsupported icon source; expected 96x96 8-bit indexed PNG');
  const pixels = Buffer.alloc(width * height * 4);
  const bytes = inflateSync(Buffer.concat(data)), stride = width, prev = Buffer.alloc(stride);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = bytes[offset++], current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const raw = bytes[offset++], left = x ? current[x - 1] : 0;
      const up = prev[x], topLeft = x ? prev[x - 1] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - topLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - topLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : topLeft;
      } else if (filter !== 0) throw Error('Unsupported PNG filter '+filter);
      current[x] = (raw + predictor) & 255;
      const index = current[x];
      const di = (y * width + x) * 4;
      pixels[di] = palette[index * 3];
      pixels[di + 1] = palette[index * 3 + 1];
      pixels[di + 2] = palette[index * 3 + 2];
      pixels[di + 3] = index < transparency.length ? transparency[index] : 255;
    }
    current.copy(prev);
  }
  return { width, height, pixels };
}

function bilinear(src, x, y, channel) {
  const X = Math.max(0, Math.min(src.width - 1, x));
  const Y = Math.max(0, Math.min(src.height - 1, y));
  const x0 = Math.floor(X), y0 = Math.floor(Y), x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const dx = X - x0, dy = Y - y0;
  const p = (ix, iy) => src.pixels[(iy * src.width + ix) * 4 + channel];
  return Math.round((p(x0, y0) * (1 - dx) + p(x1, y0) * dx) * (1 - dy)
    + (p(x0, y1) * (1 - dx) + p(x1, y1) * dx) * dy);
}
function renderSquare(sourcePixels, size, safeZone = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const inset = safeZone ? size * 0.12 : 0;
  const active = size - inset * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = (y * size + x) * 4;
      const xx = (x - inset + 0.5) * sourcePixels.width / active - 0.5;
      const yy = (y - inset + 0.5) * sourcePixels.height / active - 0.5;
      const inside = x >= inset && x < size - inset && y >= inset && y < size - inset;
      if (!inside) {
        rgba[pos] = 3; rgba[pos + 1] = 16; rgba[pos + 2] = 53; rgba[pos + 3] = 255;
      } else {
        for (let c = 0; c < 4; c++) rgba[pos + c] = bilinear(sourcePixels, xx, yy, c);
      }
    }
  }
  return rgba;
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let v = n;
  for (let k = 0; k < 8; k++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : v >>> 1;
  crcTable[n] = v >>> 0;
}
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}
function createPNG(size, rgba) {
  const rowBytes = size * 4, raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const icon = decodeIndexedPNG(readFileSync(source));
mkdirSync(assetsDir, { recursive: true });
for (const size of [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512]) {
  const image = createPNG(size, renderSquare(icon, size));
  if (size === 16 || size === 32) writeFileSync(resolve(assetsDir, 'favicon-'+size+'-v2.png'), image);
  if (size === 180) writeFileSync(resolve(assetsDir, 'apple-touch-icon-180-v2.png'), image);
  if (size === 192 || size === 512) writeFileSync(resolve(assetsDir, 'bizctrl-icon-'+size+'-v2.png'), image);
  if (![16, 32, 180].includes(size)) writeFileSync(resolve(assetsDir, 'icon-'+size+'.png'), image);
}
for (const size of [192, 512]) {
  writeFileSync(resolve(assetsDir, 'bizctrl-icon-maskable-'+size+'-v2.png'),
    createPNG(size, renderSquare(icon, size, true)));
}
console.log('Generated BizCTRL favicon, Safari touch and Chrome PWA icons from the supplied logo.');
