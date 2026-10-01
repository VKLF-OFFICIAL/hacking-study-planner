// Comprueba los enlaces de data.json y del roadmap: `npm run check-links`.
//   --report <archivo>  escribe el informe en Markdown
// Codigos de salida: 0 sin enlaces rotos, 1 hay enlaces rotos, 2 fallo del script.
//
// Un enlace solo cuenta como roto cuando la respuesta lo confirma (404/410,
// dominio inexistente o video de YouTube eliminado). Los bloqueos anti-bot
// (403/429), errores 5xx y tiempos de espera se listan como "sin verificar".
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 hacking-study-planner-linkcheck';
const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;

export function youtubeId(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
  if (host === 'youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const m = /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname);
    if (m) return m[1];
  }
  return null;
}

// url -> lista de sitios donde aparece
export function collectLinks(data, appJs = '') {
  const links = new Map();
  const add = (u, ref) => {
    if (typeof u !== 'string' || !/^https?:\/\//.test(u)) return;
    if (!links.has(u)) links.set(u, []);
    links.get(u).push(ref);
  };
  for (const [sheet, list] of Object.entries(data || {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const name = `${sheet} › ${item.nombre}`;
      for (const f of ['writeup', 'enlace', 'link_descarga']) add(item[f], `${name} (${f})`);
      for (const l of item.labs || []) add(l.url, `${name} › ${l.nombre}`);
    }
  }
  for (const m of appJs.matchAll(/\b(?:url|courseUrl|cover): '(https?:\/\/[^']+)'/g)) add(m[1], 'roadmap (app.js)');
  return links;
}

async function request(fetchImpl, url, method) {
  const res = await fetchImpl(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  try { await res.body?.cancel(); } catch { /* sin cuerpo */ }
  return res;
}

// -> { status: 'ok' | 'broken' | 'unknown', detail }
export async function checkUrl(url, fetchImpl = fetch) {
  const id = youtubeId(url);
  if (id) {
    // La pagina de un video borrado responde 200; oEmbed responde 404.
    const api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    try {
      const res = await request(fetchImpl, api, 'GET');
      if (res.ok) return { status: 'ok', detail: 'vídeo disponible' };
      if (res.status === 404 || res.status === 400) return { status: 'broken', detail: 'vídeo eliminado o inexistente' };
      if (res.status === 401 || res.status === 403) return { status: 'unknown', detail: 'vídeo privado o con inserción desactivada' };
      return { status: 'unknown', detail: `YouTube respondió HTTP ${res.status}` };
    } catch (err) {
      return { status: 'unknown', detail: `sin respuesta de YouTube (${err.name})` };
    }
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request(fetchImpl, url, 'GET');
      if (res.status < 400) return { status: 'ok', detail: `HTTP ${res.status}` };
      if (res.status === 404 || res.status === 410) return { status: 'broken', detail: `HTTP ${res.status}` };
      return { status: 'unknown', detail: `HTTP ${res.status}${res.status === 403 || res.status === 429 ? ' (posible bloqueo anti-bot)' : ''}` };
    } catch (err) {
      lastErr = err;
      const code = err.cause?.code || err.code;
      if (code === 'ENOTFOUND') return { status: 'broken', detail: 'el dominio no existe' };
    }
  }
  return { status: 'unknown', detail: `sin respuesta (${lastErr?.cause?.code || lastErr?.name || 'error'})` };
}

export async function checkAll(links, fetchImpl = fetch, concurrency = CONCURRENCY) {
  const urls = [...links.keys()];
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      results.set(url, await checkUrl(url, fetchImpl));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export function buildReport(links, results, date = new Date()) {
  const rows = status => [...results].filter(([, r]) => r.status === status);
  const broken = rows('broken');
  const unknown = rows('unknown');
  const esc = s => String(s).replace(/\|/g, '\\|');
  const table = list => [
    '| Enlace | Dónde aparece | Detalle |',
    '|---|---|---|',
    ...list.map(([u, r]) => `| ${esc(u)} | ${esc(links.get(u).join('<br>'))} | ${esc(r.detail)} |`),
  ].join('\n');
  const out = [
    '# Comprobación de enlaces',
    '',
    `Revisión del ${date.toISOString().slice(0, 10)}: ${results.size} enlaces únicos · ` +
      `**${broken.length} rotos** · ${unknown.length} sin verificar · ${rows('ok').length} correctos.`,
    '',
  ];
  if (broken.length) out.push('## Enlaces rotos', '', 'Hay que sustituirlos o quitarlos de `data.json`.', '', table(broken), '');
  if (unknown.length) {
    out.push('## Sin verificar', '',
      'No se pudo confirmar su estado (bloqueo anti-bot, error temporal o vídeo privado). Conviene revisarlos a mano si se repiten.',
      '', '<details><summary>Ver lista</summary>', '', table(unknown), '', '</details>', '');
  }
  if (!broken.length && !unknown.length) out.push('Todos los enlaces responden correctamente.', '');
  return out.join('\n');
}

async function main() {
  const i = process.argv.indexOf('--report');
  const reportPath = i !== -1 ? process.argv[i + 1] : null;
  const data = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));
  const appJs = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const links = collectLinks(data, appJs);
  console.log(`Comprobando ${links.size} enlaces…`);
  const results = await checkAll(links);
  const report = buildReport(links, results);
  if (reportPath) await writeFile(reportPath, report, 'utf8');
  console.log(report);
  const broken = [...results.values()].filter(r => r.status === 'broken').length;
  process.exit(broken ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(2); });
}
