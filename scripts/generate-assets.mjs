// Genera los iconos de la PWA y la imagen para redes sociales (og-image.png)
// renderizando SVG/HTML con Chromium: `npm run assets`.
// En local se puede indicar el navegador con PW_CHROMIUM_PATH.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const RED = '#ff4d4d';
const BG = '#05070b';

// Mismo dibujo que el favicon (viewBox 32) escalado a 512.
const GLYPH = `<path d="M128 176l80 80-80 80M256 336h128" fill="none" stroke="${RED}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`;
const icon = ({ size, rounded, scale }) => `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${BG}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${GLYPH}</g>
</svg></body></html>`;

const ICONS = [
  { file: 'icons/icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icons/icon-512.png', size: 512, rounded: true, scale: 1 },
  // Maskable: fondo a sangre y dibujo dentro de la zona segura (80 % central)
  { file: 'icons/icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 },
  // iOS redondea el icono por su cuenta
  { file: 'icons/apple-touch-icon.png', size: 180, rounded: false, scale: 0.85 },
];

const data = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));
const isEJPT = c => String(c).replace(/\s*[([].*$/, '').trim() === 'eJPT';
const machines = ['hackthebox', 'vulnhub']
  .reduce((n, k) => n + (data[k] || []).filter(i => (i.certificaciones || []).some(isEJPT)).length, 0);
// Etapas del roadmap: cada una declara su id en app.js
const appJs = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const stages = (appJs.match(/^ {4}id: '[a-z0-9-]+',$/gm) || []).length;

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: ${BG}; color: #fff;
    font-family: Inter, system-ui, 'Segoe UI', Roboto, 'DejaVu Sans', sans-serif; overflow: hidden; }
  .grid { position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,77,77,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,77,77,.07) 1px, transparent 1px);
    background-size: 60px 60px; }
  .glow { position: absolute; width: 700px; height: 700px; right: -220px; top: -260px;
    background: radial-gradient(circle, rgba(255,77,77,.22), transparent 65%); }
  .wrap { position: relative; height: 100%; padding: 72px 80px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 28px; }
  .brand svg { width: 112px; height: 112px; filter: drop-shadow(0 0 24px rgba(255,77,77,.35)); }
  h1 { font-size: 64px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; line-height: 1.05; }
  h1 span { color: ${RED}; }
  .sub { margin-top: 36px; font-size: 34px; color: #cccccc; }
  .chips { margin-top: auto; display: flex; gap: 16px; }
  .chip { white-space: nowrap; padding: 12px 22px; border: 2px solid #4d0000; border-radius: 999px; font-size: 24px; color: #e6e6e6; background: rgba(255,0,0,.06); }
  .chip b { color: ${RED}; }
  .url { margin-top: 28px; font-size: 22px; color: #9aa0a8; letter-spacing: .5px; }
</style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="wrap">
    <div class="brand">
      <svg viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#11141a" stroke="#4d0000" stroke-width="8"/>${GLYPH}</svg>
      <h1>Hacking<br><span>Study Planner</span></h1>
    </div>
    <p class="sub">Roadmap eJPT con máquinas de HackTheBox y VulnHub</p>
    <div class="chips">
      <div class="chip"><b>${machines}</b> máquinas eJPT</div>
      <div class="chip">Roadmap de ${stages} etapas</div>
      <div class="chip">Progreso, notas y modo offline</div>
    </div>
    <p class="url">vklf-official.github.io/hacking-study-planner</p>
  </div>
</body></html>`;

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
try {
  for (const i of ICONS) {
    const page = await browser.newPage({ viewport: { width: i.size, height: i.size } });
    await page.setContent(icon(i));
    await page.locator('svg').screenshot({ path: root + i.file, omitBackground: true });
    await page.close();
    console.log('✔', i.file);
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(og);
  await page.screenshot({ path: root + 'og-image.png' });
  console.log('✔ og-image.png');
} finally {
  await browser.close();
}
