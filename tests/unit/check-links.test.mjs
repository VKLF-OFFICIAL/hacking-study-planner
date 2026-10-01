import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, collectLinks, checkUrl, checkAll, buildReport } from '../../scripts/check-links.mjs';

const respond = status => async () => ({ status, ok: status >= 200 && status < 300, body: null });

test('extrae el id de los distintos formatos de YouTube', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=hFIWuWVIDek'), 'hFIWuWVIDek');
  assert.equal(youtubeId('https://youtu.be/hFIWuWVIDek'), 'hFIWuWVIDek');
  assert.equal(youtubeId('https://youtu.be/hFIWuWVIDek?t=30'), 'hFIWuWVIDek');
  assert.equal(youtubeId('https://m.youtube.com/watch?v=abc&t=1'), 'abc');
  assert.equal(youtubeId('https://www.youtube.com/embed/xyz'), 'xyz');
  assert.equal(youtubeId('https://www.vulnhub.com/entry/x'), null);
});

test('YouTube se comprueba con oEmbed y distingue borrado de privado', async () => {
  let called = '';
  const spy = async url => { called = url; return { status: 200, ok: true, body: null }; };
  assert.equal((await checkUrl('https://youtu.be/abc', spy)).status, 'ok');
  assert.match(called, /youtube\.com\/oembed\?.*watch%3Fv%3Dabc/);
  assert.equal((await checkUrl('https://youtu.be/abc', respond(404))).status, 'broken');
  assert.equal((await checkUrl('https://youtu.be/abc', respond(401))).status, 'unknown');
});

test('otros enlaces: 404/410 rotos; 403/429/5xx sin verificar', async () => {
  assert.equal((await checkUrl('https://a.test/', respond(200))).status, 'ok');
  assert.equal((await checkUrl('https://a.test/', respond(301))).status, 'ok');
  assert.equal((await checkUrl('https://a.test/', respond(404))).status, 'broken');
  assert.equal((await checkUrl('https://a.test/', respond(410))).status, 'broken');
  for (const s of [403, 429, 500, 503]) assert.equal((await checkUrl('https://a.test/', respond(s))).status, 'unknown', String(s));
});

test('dominio inexistente cuenta como roto; otros errores de red, sin verificar', async () => {
  const dns = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  assert.equal((await checkUrl('https://no-existe.test/', dns)).status, 'broken');
  let calls = 0;
  const reset = async () => { calls++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); };
  assert.equal((await checkUrl('https://a.test/', reset)).status, 'unknown');
  assert.equal(calls, 2, 'reintenta una vez');
});

test('recoge enlaces de data.json y del roadmap sin duplicados', () => {
  const data = {
    hackthebox: [{ nombre: 'A', writeup: 'https://x.test/1' }, { nombre: 'B', writeup: 'https://x.test/1' }],
    vulnhub: [{ nombre: 'C', writeup: '', enlace: 'https://x.test/2' }],
    portswigger: [{ nombre: 'D', writeup: 'https://x.test/3', labs: [{ nombre: 'L', url: 'https://x.test/4' }] }],
  };
  const links = collectLinks(data, "      { name: 'R', url: 'https://x.test/5' },\n    cover: 'https://x.test/6',");
  assert.deepEqual([...links.keys()].sort(), ['https://x.test/1', 'https://x.test/2', 'https://x.test/3', 'https://x.test/4', 'https://x.test/5', 'https://x.test/6']);
  assert.equal(links.get('https://x.test/1').length, 2);
});

test('el informe separa rotos y sin verificar', async () => {
  const links = new Map([['https://a.test/ok', ['x']], ['https://a.test/404', ['hackthebox › A (writeup)']], ['https://a.test/403', ['y']]]);
  const fake = async url => ({ status: Number(url.split('/').pop()) || 200, ok: url.endsWith('ok'), body: null });
  const results = await checkAll(links, fake, 2);
  const md = buildReport(links, results, new Date('2026-10-01'));
  assert.match(md, /\*\*1 rotos\*\*/);
  assert.match(md, /## Enlaces rotos[\s\S]*a\.test\/404[\s\S]*hackthebox › A/);
  assert.match(md, /## Sin verificar/);
});
