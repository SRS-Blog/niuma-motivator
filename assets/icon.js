'use strict';
// 纯代码生成托盘图标（金色圆币 + ¥），不依赖任何图片资源。
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// 生成 size×size 的金币 ¥ PNG（RGBA，4x 超采样抗锯齿）
function makeIconPNG(size = 32, ss = 4) {
  const S = size * ss;
  const big = Buffer.alloc(S * S * 4);
  const cx = S / 2 - 0.5, cy = S / 2 - 0.5, R = S * 0.47;

  const segDist = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };
  const hw = S * 0.042; // ¥ 笔画半宽
  const yen = (x, y) =>
    segDist(x, y, S * 0.32, S * 0.245, S * 0.50, S * 0.455) <= hw ||
    segDist(x, y, S * 0.68, S * 0.245, S * 0.50, S * 0.455) <= hw ||
    segDist(x, y, S * 0.50, S * 0.44, S * 0.50, S * 0.78) <= hw ||
    (y >= S * 0.52 - hw && y <= S * 0.52 + hw && x >= S * 0.30 && x <= S * 0.70) ||
    (y >= S * 0.645 - hw && y <= S * 0.645 + hw && x >= S * 0.30 && x <= S * 0.70);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const inCircle = Math.hypot(x - cx, y - cy) <= R;
      const tt = y / S;
      let r = 255, g = Math.round(206 - 72 * tt), b = Math.round(84 - 40 * tt);
      if (inCircle && yen(x, y)) { r = 92; g = 58; b = 8; } // 深棕 ¥
      big[i] = r; big[i + 1] = g; big[i + 2] = b;
      big[i + 3] = inCircle ? 255 : 0;
    }
  }

  const rgba = Buffer.alloc(size * size * 4);
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = 0; yy < ss; yy++) {
        for (let xx = 0; xx < ss; xx++) {
          const i = ((y * ss + yy) * S + (x * ss + xx)) * 4;
          r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(r / n); rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n); rgba[o + 3] = Math.round(a / n);
    }
  }

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makeIconPNG };
