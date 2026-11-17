// Gera toda a identidade visual (SVG + PNG + ICO) em web/public. Rode: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/public');
fs.mkdirSync(out, { recursive: true });

const INK = '#0e1116';
const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d9a6"/><stop offset="1" stop-color="#b98f3e"/></linearGradient></defs>`;

/** OrderFlow Lab — escudo (Aegis) com perfil de volume (order flow) dentro. */
const markInner = `
  <path d="M32 3.5 54 11v19.5C54 44.5 44.8 54.8 32 60.5 19.2 54.8 10 44.5 10 30.5V11z" fill="${INK}" stroke="url(#g)" stroke-width="2.6" stroke-linejoin="round"/>
  <g fill="url(#g)">
    <rect x="27" y="16" width="10" height="4.4" rx="2.2" opacity=".55"/>
    <rect x="21" y="23" width="22" height="4.4" rx="2.2" opacity=".8"/>
    <rect x="17" y="30" width="30" height="4.4" rx="2.2"/>
    <rect x="23" y="37" width="18" height="4.4" rx="2.2" opacity=".8"/>
    <rect x="28" y="44" width="8" height="4.4" rx="2.2" opacity=".55"/>
  </g>`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}${markInner}</svg>`;

/** Favicon: legível em 16 px (escudo cheio, 3 barras). */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}
  <rect width="64" height="64" rx="15" fill="${INK}"/>
  <path d="M32 8 51 14.5v16C51 42.5 43 51.2 32 56 21 51.2 13 42.5 13 30.5v-16z" fill="url(#g)"/>
  <g fill="${INK}"><rect x="23" y="19.5" width="18" height="5" rx="2.5"/><rect x="19" y="28" width="26" height="5" rx="2.5"/><rect x="24.5" y="36.5" width="15" height="5" rx="2.5"/></g>
</svg>`;

/** Aegis IA — emblema circular com rede neural mínima (3 nós + núcleo). */
const agent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}
  <circle cx="32" cy="32" r="29" fill="${INK}" stroke="url(#g)" stroke-width="2.4"/>
  <g stroke="url(#g)" stroke-width="2" stroke-linecap="round" fill="none"><path d="M32 17 19 40M32 17l13 23M19 40h26M32 17v15M19 40l13-8M45 40l-13-8"/></g>
  <g fill="url(#g)"><circle cx="32" cy="17" r="4"/><circle cx="19" cy="40" r="4"/><circle cx="45" cy="40" r="4"/></g>
  <circle cx="32" cy="32" r="5.5" fill="#f0d9a6"/>
</svg>`;

/** Ícone de app: fundo cheio + marca centralizada (scale = fração do lado). */
const app = (scale, radius = 0) => {
  const s = 64 * scale;
  const o = (64 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}
    <rect width="64" height="64" rx="${radius}" fill="${INK}"/>
    <g transform="translate(${o} ${o}) scale(${scale})">${markInner}</g></svg>`;
};

const write = (name, data) => fs.writeFileSync(path.join(out, name), data);
const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

write('favicon.svg', favicon);
write('mark.svg', mark);
write('agent.svg', agent);
write('apple-touch-icon.png', await png(app(0.7), 180));
write('icon-192.png', await png(app(0.7, 14), 192));
write('icon-512.png', await png(app(0.7, 14), 512));
write('icon-maskable-512.png', await png(app(0.52), 512)); // zona segura de 80% p/ Android
write('og-image.png', await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${GRAD}
  <rect width="1200" height="630" fill="${INK}"/>
  <g transform="translate(120 175) scale(4.6)">${markInner}</g>
  <text x="470" y="300" font-family="Sora, Segoe UI, sans-serif" font-size="78" font-weight="700" fill="#e8ecf2">OrderFlow Lab</text>
  <text x="472" y="365" font-family="Sora, Segoe UI, sans-serif" font-size="34" fill="#d6b36a">Aegis IA 1.1 · Alpha</text>
  <text x="472" y="425" font-family="Segoe UI, sans-serif" font-size="26" fill="#a2acbb">Sinais com matemática honesta. Em testes, sem ordens.</text>
</svg>`)).png().toBuffer());

// favicon.ico (PNG embutido em 16/32/48)
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(favicon, s)));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = Buffer.concat(
  imgs.map((img, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);
    e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
    return e;
  }),
);
write('favicon.ico', Buffer.concat([head, dir, ...imgs]));

write(
  'manifest.webmanifest',
  JSON.stringify(
    {
      name: 'OrderFlow Lab',
      short_name: 'OrderFlow',
      description: 'Sinais do Aegis IA com matemática honesta. Em fase de testes, sem envio de ordens.',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#090b0f',
      theme_color: '#090b0f',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ),
);

console.log('ok:', fs.readdirSync(out).join(', '));
