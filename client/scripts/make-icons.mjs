/**
 * Íconos de la PWA sin dependencias ni paso manual de diseño.
 *
 * Chrome para Android solo ofrece «Instalar app» si el manifiesto trae 192 y
 * 512 px, y pide además una variante `maskable` con el dibujo dentro del 80%
 * central. Aquí se dibuja el bus del encabezado (azul sobre negro), se
 * supersamplea 3x3 para que los bordes no queden dentados y se codifica a PNG
 * con `zlib`, que ya viene con Node.
 *
 * Uso: npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");

const INK = [0x0b, 0x0d, 0x10];
const BLUE_TOP = [0x3b, 0x9d, 0xff];
const BLUE_BOTTOM = [0x1f, 0x6f, 0xd0];
const WHITE = [0xe6, 0xee, 0xfb];

/* ---------- PNG ---------- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- dibujo (espacio de 512) ---------- */

function roundRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x > left + width || y > top + height) return false;
  const cx = Math.min(Math.max(x, left + radius), left + width - radius);
  const cy = Math.min(Math.max(y, top + radius), top + height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function circle(x, y, cx, cy, radius) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Composición "source over" con alfa 0..1 sobre un color RGBA 0..255. */
function over(base, rgb, alpha) {
  const outAlpha = alpha + base[3] * (1 - alpha);
  if (outAlpha === 0) return [0, 0, 0, 0];
  return [
    (rgb[0] * alpha + base[0] * base[3] * (1 - alpha)) / outAlpha,
    (rgb[1] * alpha + base[1] * base[3] * (1 - alpha)) / outAlpha,
    (rgb[2] * alpha + base[2] * base[3] * (1 - alpha)) / outAlpha,
    outAlpha,
  ];
}

function sample(x, y, maskable) {
  // `maskable` necesita fondo opaco a sangre: el sistema recorta a círculo y
  // las esquinas redondeadas dejarían ver el fondo del lanzador.
  let color = [0, 0, 0, 0];
  if (maskable || roundRect(x, y, 0, 0, 512, 512, 112)) color = [...INK, 1];

  if (roundRect(x, y, 104, 120, 304, 190, 42)) {
    const t = Math.min(Math.max((y - 120) / 190, 0), 1);
    const rgb = BLUE_TOP.map((c, i) => c + (BLUE_BOTTOM[i] - c) * t);
    color = over(color, rgb, 1);
  }
  if (roundRect(x, y, 132, 152, 248, 84, 16)) color = over(color, INK, 0.6);
  if (roundRect(x, y, 132, 258, 248, 16, 8)) color = over(color, INK, 0.35);
  // Ruedas apoyadas en el borde inferior de la carrocería, no flotando debajo.
  if (circle(x, y, 178, 306, 25) || circle(x, y, 334, 306, 25)) color = over(color, WHITE, 1);

  return color;
}

function render(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const steps = 3;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < steps; sy += 1) {
        for (let sx = 0; sx < steps; sx += 1) {
          const x = ((px + (sx + 0.5) / steps) / size) * 512;
          const y = ((py + (sy + 0.5) / steps) / size) * 512;
          const [cr, cg, cb, ca] = sample(x, y, maskable);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }

      const total = steps * steps;
      const alpha = a / total;
      const offset = (py * size + px) * 4;
      pixels[offset] = alpha > 0 ? Math.round(r / total / alpha) : 0;
      pixels[offset + 1] = alpha > 0 ? Math.round(g / total / alpha) : 0;
      pixels[offset + 2] = alpha > 0 ? Math.round(b / total / alpha) : 0;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
];

for (const [name, size, options] of files) {
  const png = render(size, options);
  writeFileSync(resolve(OUT, name), png);
  console.log(`${name} — ${size}×${size}, ${(png.length / 1024).toFixed(1)} KB`);
}
