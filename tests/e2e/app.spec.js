import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DATA = JSON.parse(readFileSync(new URL('../../data.json', import.meta.url), 'utf8'));
const certBase = c => String(c).replace(/\s*[([].*$/, '').trim();
const isEJPT = c => certBase(c) === 'eJPT';
const EJPT = {
  hackthebox: DATA.hackthebox.filter(i => i.certificaciones.some(isEJPT)),
  vulnhub: DATA.vulnhub.filter(i => i.certificaciones.some(isEJPT)),
};
const N = EJPT.hackthebox.length;
const TOTAL = N + EJPT.vulnhub.length;
const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// `app`: abre la app y hace fallar el test si hay errores de JavaScript o de
// consola (las violaciones de la CSP aparecen ahi).
const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    // Portadas del roadmap: se sirven en local para no depender de la red
    await page.route('https://lionxsecurity.es/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
    await page.goto('/');
    await expect(page.locator('#grid-hackthebox .card').first()).toBeVisible();
    await use(page);
    expect(errors).toEqual([]);
  },
});

const cards = page => page.locator('#grid-hackthebox .card');
const count = page => page.locator('#count-hackthebox');

test('carga las máquinas eJPT y las cifras de la cabecera', async ({ app: page }) => {
  await expect(cards(page)).toHaveCount(N);
  await expect(count(page)).toHaveText(`${N} / ${N}`);
  await expect(page.locator('#gs-total')).toHaveText(String(TOTAL));
  await expect(page.locator('#gs-resolved')).toHaveText('0');
  await expect(page.locator('#gs-pct')).toHaveText('0%');
});

test('una combinación de filtros sin resultados se ve y se deshace', async ({ app: page }) => {
  const items = EJPT.hackthebox;
  const diffs = [...new Set(items.map(i => i.dificultad))];
  const certs = [...new Set(items.flatMap(i => i.certificaciones.map(certBase)))].filter(c => c !== 'eJPT');
  let combo = null;
  for (const c of certs) for (const d of diffs) {
    if (!combo && !items.some(i => i.dificultad === d && i.certificaciones.some(x => certBase(x) === c))) combo = [c, d];
  }
  test.skip(!combo, 'los datos no tienen ninguna combinación vacía');

  await page.click('#filter-btn-hackthebox');
  await page.click(`#cert-chips-hackthebox .chip[data-val="${combo[0]}"]`);
  await page.click(`#filters-panel-hackthebox .chip[data-key="dificultad"][data-val="${combo[1]}"]`);
  await expect(count(page)).toHaveText(`0 / ${N}`);
  await expect(page.locator(`#cert-chips-hackthebox .chip[data-val="${combo[0]}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filter-btn-hackthebox .filter-active-count')).toHaveText('2');
  await expect(page.locator('#active-filters-hackthebox .filter-pill')).toHaveCount(2);

  await page.click('#grid-hackthebox .empty-state [data-action="clear-filters"]');
  await expect(count(page)).toHaveText(`${N} / ${N}`);
  await expect(page.locator('#filter-btn-hackthebox .filter-active-count')).toBeHidden();
  await expect(page.locator('#search-hackthebox')).toBeFocused();
});

test('la búsqueda ignora tildes y combina palabras', async ({ app: page }) => {
  const words = ['facil', 'windows'];
  const expected = EJPT.hackthebox.filter(i => {
    const idx = fold([i.nombre, i.so, i.ip, i.dificultad, ...i.tecnicas, ...i.certificaciones].join(' '));
    return words.every(w => idx.includes(w));
  }).length;
  await page.fill('#search-hackthebox', 'FÁCIL   windows');
  await expect(count(page)).toHaveText(`${expected} / ${N}`);
});

test('pulsar una técnica filtra por ella y la píldora lo deshace', async ({ app: page }) => {
  const tag = cards(page).first().locator('.tag:not(.cert)').first();
  const tecnica = await tag.getAttribute('data-val');
  const expected = EJPT.hackthebox.filter(i => i.tecnicas.includes(tecnica)).length;
  await tag.click();
  await expect(count(page)).toHaveText(`${expected} / ${N}`);
  const pill = page.locator('#active-filters-hackthebox .filter-pill');
  await expect(pill).toHaveCount(1);
  await expect(pill).toContainText(tecnica);
  await pill.click();
  await expect(count(page)).toHaveText(`${N} / ${N}`);
  await expect(page.locator('#active-filters-hackthebox')).toBeHidden();
});

test('marcar como resuelta persiste, muestra la fecha y suma en la cabecera', async ({ app: page }) => {
  await cards(page).first().locator('.btn-resolve').click();
  await expect(cards(page).first()).toHaveClass(/resolved/);
  await expect(cards(page).first().locator('.btn-resolve')).toBeFocused();
  await expect(cards(page).first().locator('.card-date')).toContainText('Resuelta el');
  await expect(page.locator('#gs-resolved')).toHaveText('1');
  await expect(page.locator('#navbadge-hackthebox')).toHaveText('1');

  await page.reload();
  await expect(cards(page).first()).toHaveClass(/resolved/);
  await expect(page.locator('#gs-resolved')).toHaveText('1');

  await cards(page).first().locator('.btn-resolve').click();
  await expect(page.locator('#gs-resolved')).toHaveText('0');
  await expect(cards(page).first().locator('.card-date')).toHaveCount(0);
  await expect(page.locator('#navbadge-hackthebox')).toBeHidden();
});

test('filtro de estado y orden de la lista', async ({ app: page }) => {
  const firstName = await cards(page).first().locator('.card-title').textContent();
  await cards(page).first().locator('.btn-resolve').click();

  await page.selectOption('#sort-hackthebox', 'pendientes');
  await expect(cards(page).last().locator('.card-title')).toHaveText(firstName);

  await page.click('#filter-btn-hackthebox');
  await page.click('#filters-panel-hackthebox .chip[data-key="estado"][data-val="Resuelta"]');
  await expect(count(page)).toHaveText(`1 / ${N}`);
  await page.click('#filters-panel-hackthebox .chip[data-key="estado"][data-val="Pendiente"]');
  await expect(count(page)).toHaveText(`${N - 1} / ${N}`);

  // Con «Pendiente» activo, al resolver una máquina sale del listado
  await cards(page).first().locator('.btn-resolve').click();
  await expect(count(page)).toHaveText(`${N - 2} / ${N}`);

  await page.selectOption('#sort-hackthebox', 'nombre');
  const names = await cards(page).locator('.card-title').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })));
});

test('notas: se guardan, se muestran como texto y Escape cancela', async ({ app: page }) => {
  const card = () => cards(page).first();
  const dialog = page.locator('#note-dialog');
  const note = 'Puerto 80 <b>no</b> es HTML';

  await card().locator('.btn-note').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#note-text')).toBeFocused();
  await page.fill('#note-text', note);
  await expect(page.locator('#note-count')).toHaveText(`${note.length} / 5000`);
  await page.click('[data-action="note-save"]');
  await expect(dialog).toBeHidden();
  await expect(card().locator('.card-note-text')).toHaveText(note);
  await expect(card().locator('.card-note-text b')).toHaveCount(0);
  await expect(card().locator('.btn-note')).toHaveClass(/has-note/);

  await card().locator('.btn-note').click();
  await page.fill('#note-text', 'cambio descartado');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card().locator('.card-note-text')).toHaveText(note);

  await page.reload();
  await expect(card().locator('.card-note-text')).toHaveText(note);

  await card().locator('.btn-note').click();
  await page.fill('#note-text', '');
  await page.click('[data-action="note-save"]');
  await expect(card().locator('.card-note')).toHaveCount(0);
});

test('exportar e importar el progreso', async ({ app: page }) => {
  await cards(page).first().locator('.btn-resolve').click();
  await cards(page).nth(1).locator('.btn-note').click();
  await page.fill('#note-text', 'nota exportada');
  await page.click('[data-action="note-save"]');

  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export"]');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^hacking-study-planner-progreso-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(backup.app).toBe('hacking-study-planner');
  expect(backup.version).toBe(1);
  const entries = Object.values(backup.planning_state.hackthebox);
  expect(entries.filter(e => e.resuelta)).toHaveLength(1);
  expect(entries.map(e => e.nota).filter(Boolean)).toEqual(['nota exportada']);

  // Navegador "limpio": se borra todo y se importa la copia
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#gs-resolved')).toHaveText('0');
  await page.setInputFiles('#import-file', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#gs-resolved')).toHaveText('1');
  await expect(cards(page).nth(1).locator('.card-note-text')).toHaveText('nota exportada');

  // Un JSON que no es una copia no cambia nada
  await page.setInputFiles('#import-file', { name: 'otro.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
  await expect(page.locator('#toast')).toContainText('no es una copia');
  await expect(page.locator('#gs-resolved')).toHaveText('1');
});

test('roadmap: migra el progreso antiguo y se maneja con teclado', async ({ app: page }) => {
  await page.evaluate(() => localStorage.setItem('roadmap_progress', JSON.stringify({ 0: true, 2: true, 99: true })));
  await page.reload();
  await page.click('#navbtn-roadmap');
  await expect(page).toHaveURL(/#roadmap$/);
  await expect(page.locator('#rm-progress-label')).toHaveText(/^2\/\d+ etapas · \d+%$/);

  const header = page.locator('#rm-node-examen .rm-card-header');
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.focus();
  await page.keyboard.press('Enter');
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await page.click('#rm-node-examen .rm-mark-btn');
  await expect(page.locator('#rm-progress-label')).toHaveText(/^3\//);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('roadmap_progress')));
  expect(stored).toEqual({ bienvenida: true, 'curso-redes': true, examen: true });
});

test('pestañas: flechas del teclado y enlace directo con #', async ({ app: page }) => {
  await page.locator('#navbtn-hackthebox').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#navbtn-vulnhub')).toBeFocused();
  await expect(page.locator('#navbtn-vulnhub')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-vulnhub')).toBeVisible();
  await expect(page.locator('#panel-hackthebox')).toBeHidden();
  await expect(page.locator('#grid-vulnhub .card')).toHaveCount(EJPT.vulnhub.length);
  await page.keyboard.press('End');
  await expect(page.locator('#navbtn-roadmap')).toBeFocused();

  await page.goto('/#vulnhub');
  await page.reload();
  await expect(page.locator('#navbtn-vulnhub')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#grid-vulnhub .card').first()).toBeVisible();
});

for (const width of [320, 390, 768, 1280]) {
  test(`sin desplazamiento horizontal a ${width}px`, async ({ app: page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const tab of ['hackthebox', 'vulnhub', 'roadmap']) {
      await page.click(`#navbtn-${tab}`);
      if (tab === 'roadmap') {
        for (const h of await page.locator('.rm-card-header').all()) await h.click();
      } else {
        await page.click(`#filter-btn-${tab}`);
        await expect(page.locator(`#filters-panel-${tab}`)).toHaveClass(/open/);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `página en ${tab}`).toBeLessThanOrEqual(0);
      const tabs = await page.evaluate(() => { const t = document.querySelector('.tabs-bar'); return t.scrollWidth - t.clientWidth; });
      expect(tabs, `pestañas en ${tab}`).toBeLessThanOrEqual(0);
    }
  });
}

test('los datos maliciosos no ejecutan código ni crean enlaces peligrosos', async ({ page }) => {
  const evil = JSON.parse(JSON.stringify(DATA));
  const target = evil.hackthebox.find(i => i.certificaciones.some(isEJPT));
  Object.assign(target, {
    nombre: '<img src=x onerror="window.__xss=1">',
    writeup: 'javascript:window.__xss=2',
    ip: '"><script>window.__xss=3</script>',
    certificaciones: ['eJPT', 'x" onmouseover="window.__xss=4'],
    tecnicas: ['<svg onload=window.__xss=5>'],
  });
  await page.route('**/data.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(evil) }));
  await page.goto('/');
  const card = page.locator('#grid-hackthebox .card', { hasText: '<img src=x' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(card.locator('[onerror], [onload], [onmouseover], script, img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('no se deja incrustar en un iframe (clickjacking)', async ({ page, baseURL }) => {
  await page.setContent(`<iframe src="${baseURL}" width="800" height="600"></iframe>`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.load-error h1')).toHaveText('Esta página no se puede mostrar incrustada');
  await expect(frame.locator('.tabs-bar')).toHaveCount(0);
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('muestra el aviso en lugar de la pantalla de carga', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.noscript-msg')).toBeVisible();
    await expect(page.locator('.noscript-msg')).toContainText('necesita JavaScript');
  });
});

test('abierta como archivo explica cómo servirla', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'cada navegador trata file:// de forma distinta');
  await page.goto(pathToFileURL(fileURLToPath(new URL('../../index.html', import.meta.url))).href);
  await expect(page.locator('.load-error')).toContainText('python3 -m http.server');
});

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });
  test('manifest válido y funciona sin conexión', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'el modo sin conexión se comprueba en Chromium');
    await page.goto('/');
    const manifest = await (await page.request.get('manifest.webmanifest')).json();
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(cards(page).first()).toBeVisible();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(cards(page)).toHaveCount(N);
    await context.setOffline(false);
  });
});
