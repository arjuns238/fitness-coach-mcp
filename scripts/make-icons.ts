// Renders the app icon (a 3/4 progress ring on blue) to PNGs for the PWA manifest and iOS home screen.
// Full-bleed squares: iOS and Android apply their own corner masks. Run with `npm run icons`.
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BACKGROUND = [0x2a, 0x78, 0xd6];
const INK = [0xff, 0xff, 0xff];
const SAMPLES = 4; // per axis, for anti-aliased edges

function coverage(x: number, y: number, size: number): number {
  const c = size / 2;
  const radius = size * 0.3;
  const half = size * 0.05;
  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const px = x + (sx + 0.5) / SAMPLES - c;
      const py = y + (sy + 0.5) / SAMPLES - c;
      const distance = Math.hypot(px, py);
      // Angle measured clockwise from 12 o'clock; the ring covers 0°–270°.
      const angle = (Math.atan2(px, -py) * 180) / Math.PI;
      const clockwise = angle < 0 ? angle + 360 : angle;
      const onRing = Math.abs(distance - radius) <= half && clockwise <= 270;
      // Round caps at both ends of the arc.
      const capStart = Math.hypot(px, py + radius) <= half;
      const capEnd = Math.hypot(px + radius, py) <= half;
      if (onRing || capStart || capEnd) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

function png(size: number): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size);
      for (let ch = 0; ch < 3; ch++) raw[row + 1 + x * 3 + ch] = Math.round(BACKGROUND[ch] * (1 - a) + INK[ch] * a);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
  writeFileSync(`web/public/${name}`, png(size));
  console.log(`web/public/${name}`);
}

// favicon.ico for clients that only look there (browser tabs, connector lists): an ICO wrapping a 48px PNG.
const favicon = png(48);
const directory = Buffer.alloc(22);
directory.writeUInt16LE(1, 2); // type: icon
directory.writeUInt16LE(1, 4); // one image
directory.writeUInt8(48, 6); // width
directory.writeUInt8(48, 7); // height
directory.writeUInt16LE(1, 10); // color planes
directory.writeUInt16LE(32, 12); // bits per pixel
directory.writeUInt32LE(favicon.length, 14);
directory.writeUInt32LE(directory.length, 18); // the image follows the directory
writeFileSync('web/public/favicon.ico', Buffer.concat([directory, favicon]));
console.log('web/public/favicon.ico');
