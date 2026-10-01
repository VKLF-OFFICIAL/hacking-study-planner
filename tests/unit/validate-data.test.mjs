import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, fixData, canonical, isIPv4, parseCert } from '../../scripts/validate-data.mjs';

const raw = await readFile(new URL('../../data.json', import.meta.url), 'utf8');
const real = () => JSON.parse(raw);

// Datos minimos validos para provocar errores de uno en uno
function sample() {
  return {
    hackthebox: [
      { id: 1, nombre: 'Alpha', ip: '10.10.10.1', so: 'Linux', dificultad: 'Fácil', tecnicas: ['SQLI'], certificaciones: ['eJPT', 'OSCP (Escalada)'], writeup: 'https://www.youtube.com/watch?v=abc' },
      { id: 2, nombre: 'Beta', ip: '', so: 'Windows', dificultad: 'Media', tecnicas: [], certificaciones: ['eJPT'], writeup: '' },
    ],
    htb_challenges: [],
    vulnhub: [],
    portswigger: [],
    otros: [],
  };
}
const errorsOf = data => validateData(data).errors.map(e => `${e.where}: ${e.msg}`);

test('data.json del repositorio es válido y tiene formato canónico', () => {
  const { errors } = validateData(real(), raw);
  assert.deepEqual(errors, []);
});

test('los datos de ejemplo son válidos', () => {
  assert.deepEqual(errorsOf(sample()), []);
});

test('detecta una IP estropeada por Excel', () => {
  const d = sample();
  d.hackthebox[0].ip = '1.0129194134E10';
  assert.match(errorsOf(d).join('\n'), /IP no válida/);
});

test('detecta IP repetidas', () => {
  const d = sample();
  d.hackthebox[1].ip = '10.10.10.1';
  assert.match(errorsOf(d).join('\n'), /IP repetida/);
});

test('detecta fichas duplicadas aunque cambien espacios o mayúsculas', () => {
  const d = sample();
  d.hackthebox[1].nombre = 'ALPHA';
  assert.match(errorsOf(d).join('\n'), /ficha duplicada/);
  d.hackthebox[1].nombre = 'Al pha';
  assert.match(errorsOf(d).join('\n'), /ficha duplicada/);
});

test('rechaza enlaces que no son https', () => {
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hola', 'no es url']) {
    const d = sample();
    d.hackthebox[0].writeup = bad;
    assert.ok(errorsOf(d).length > 0, bad);
  }
});

test('rechaza certificaciones desconocidas y temas como certificación', () => {
  const d = sample();
  d.hackthebox[0].certificaciones = ['eCPPTXv2'];
  assert.match(errorsOf(d).join('\n'), /desconocida.*eCPTXv2/);
  d.hackthebox[0].certificaciones = ['Active Directory'];
  assert.match(errorsOf(d).join('\n'), /es un tema/);
});

test('detecta campos desconocidos y obligatorios ausentes', () => {
  const d = sample();
  d.hackthebox[0].writup = 'https://x.test';
  delete d.hackthebox[0].so;
  const msgs = errorsOf(d).join('\n');
  assert.match(msgs, /writup: campo desconocido/);
  assert.match(msgs, /so: falta el campo/);
});

test('detecta ids repetidos y dificultad o sistema no válidos', () => {
  const d = sample();
  d.hackthebox[1].id = 1;
  d.hackthebox[1].dificultad = 'Facil';
  d.hackthebox[1].so = 'Others';
  const msgs = errorsOf(d).join('\n');
  assert.match(msgs, /id repetido/);
  assert.match(msgs, /Facil/);
  assert.match(msgs, /Others/);
});

test('avisa (sin fallar) de acortadores y writeups compartidos', () => {
  const d = sample();
  d.hackthebox[1].writeup = 'https://bit.ly/abc';
  d.hackthebox[1].ip = '10.10.10.2';
  const { errors, warnings } = validateData(d);
  assert.deepEqual(errors, []);
  assert.match(warnings.map(w => w.msg).join('\n'), /acortador/);
});

test('exige el formato canónico', () => {
  const d = sample();
  assert.deepEqual(validateData(d, canonical(d)).errors, []);
  assert.match(validateData(d, JSON.stringify(d)).errors[0].msg, /formato/);
});

test('--fix normaliza sin inventar datos', () => {
  const d = sample();
  d.hackthebox[0].nombre = '  Alpha   Box ';
  d.hackthebox[0].so = 'Others';
  d.hackthebox[0].tecnicas = ['SQLI ', 'SQLI', 'XSS  reflejado'];
  d.hackthebox[0].certificaciones = ['eJPT', 'eCPPTXv2', 'OSCP [Escalada]', 'Buffer Overflow', 'eJPT'];
  d.hackthebox[0].ip = '1.0129194134E10';
  fixData(d);
  const it = d.hackthebox[0];
  assert.equal(it.nombre, 'Alpha Box');
  assert.equal(it.so, 'Otro');
  assert.deepEqual(it.tecnicas, ['SQLI', 'XSS reflejado', 'Buffer Overflow']);
  assert.deepEqual(it.certificaciones, ['eJPT', 'eCPTXv2', 'OSCP (Escalada)']);
  assert.equal(it.ip, '1.0129194134E10', 'la IP no se adivina: se deja para revisión manual');
});

test('utilidades', () => {
  assert.ok(isIPv4('10.10.11.116'));
  for (const bad of ['10.10.11', '10.10.11.256', '010.1.1.1', '1.0129194134E10', '']) assert.ok(!isIPv4(bad), bad);
  assert.deepEqual(parseCert('eJPT (Intrusión)'), { base: 'eJPT', qualifier: 'Intrusión' });
  assert.equal(parseCert('OSCP [Escalada]'), null);
});
