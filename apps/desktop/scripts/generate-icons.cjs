const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(typeAndData), 8 + len);
  return buf;
}

function createPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Scanlines (filter byte 0 + RGBA per pixel)
  const scanlineWidth = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineWidth);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.45;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineWidth;
    rawData[rowOffset] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // ProcessForge Jade rounded icon
      if (dist <= radius) {
        if (dist > radius - (width * 0.08)) {
          // Jade border #10B981
          rawData[pxOffset] = 16;
          rawData[pxOffset + 1] = 185;
          rawData[pxOffset + 2] = 129;
          rawData[pxOffset + 3] = 255;
        } else if (dist <= radius * 0.5 && dist >= radius * 0.2) {
          // Inner jade circle / reactor symbol
          rawData[pxOffset] = 52;
          rawData[pxOffset + 1] = 211;
          rawData[pxOffset + 2] = 153;
          rawData[pxOffset + 3] = 255;
        } else {
          // Dark background #0B1120
          rawData[pxOffset] = 11;
          rawData[pxOffset + 1] = 17;
          rawData[pxOffset + 2] = 32;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIco(pngBuffers) {
  // Simple ICO container embedding PNG images
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count

  let offset = 6 + count * 16;
  const dirEntries = [];
  const imageDatas = [];

  for (const item of pngBuffers) {
    const { width, height, buf } = item;
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buf.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    imageDatas.push(buf);
    offset += buf.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

function createIcns(png256) {
  // Apple ICNS format wrapping 'ic08' (256x256 PNG)
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write('ic08', 0, 4, 'ascii');
  chunkHeader.writeUInt32BE(png256.length + 8, 4);

  const totalLength = 8 + 8 + png256.length;
  header.writeUInt32BE(totalLength, 4);

  return Buffer.concat([header, chunkHeader, png256]);
}

// Target directory
const outDir = path.resolve(__dirname, '../src-tauri/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating ProcessForge desktop icon bundle in:', outDir);

const png32 = createPng(32, 32);
const png128 = createPng(128, 128);
const png256 = createPng(256, 256);

fs.writeFileSync(path.join(outDir, '32x32.png'), png32);
fs.writeFileSync(path.join(outDir, '128x128.png'), png128);
fs.writeFileSync(path.join(outDir, '128x128@2x.png'), png256);

const ico = createIco([
  { width: 32, height: 32, buf: png32 },
  { width: 128, height: 128, buf: png128 },
  { width: 256, height: 256, buf: png256 }
]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

const icns = createIcns(png256);
fs.writeFileSync(path.join(outDir, 'icon.icns'), icns);

console.log('Successfully generated all 5 desktop icons for Tauri:');
console.log('- 32x32.png');
console.log('- 128x128.png');
console.log('- 128x128@2x.png');
console.log('- icon.ico');
console.log('- icon.icns');
