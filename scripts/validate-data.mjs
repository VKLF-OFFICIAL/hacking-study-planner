// Valida data.json: `npm run validate`.
// Con --fix corrige lo que es seguro corregir solo (espacios, alias de
// certificaciones, duplicados dentro de una ficha y formato) y vuelve a validar.
// Sale con codigo 1 si quedan errores; los avisos no hacen fallar.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DIFFICULTIES = ['Very Easy', 'Fácil', 'Media', 'Difícil', 'Insane'];
export const SYSTEMS = ['Linux', 'Windows', 'OpenBSD', 'FreeBSD', 'Solaris', 'Android', 'Otro'];
export const CERTS = [
  'eJPT', 'eCPPTv2', 'eCPPTv3', 'eCPTXv2', 'eCPTXv3', 'eWPT', 'eWPTXv2',
  'OSCP', 'OSEP', 'OSWE', 'OSED', 'OSWP',
];
// Variantes conocidas -> nombre correcto (las usa --fix)
export const CERT_ALIASES = {
  'OSCP [Escalada]': 'OSCP (Escalada)',
  eCPPTXv2: 'eCPTXv2',
  eWPTX: 'eWPTXv2',
  eCPPT: 'eCPPTv2',
};
// Temas que no son certificaciones: --fix los mueve a tecnicas
export const TOPICS = ['Active Directory', 'Buffer Overflow', 'Mobile'];
export const SYSTEM_ALIASES = { Others: 'Otro', Other: 'Otro' };
const SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'cutt.ly', 'shorturl.at'];

// Campos por seccion: [obligatorios, opcionales]
const SCHEMA = {
  hackthebox:     [['id', 'nombre', 'ip', 'so', 'dificultad', 'tecnicas', 'certificaciones', 'writeup'], ['resuelta', 'descripcion']],
  htb_challenges: [['id', 'nombre', 'categoria', 'dificultad', 'tecnicas', 'writeup'], []],
  vulnhub:        [['id', 'nombre', 'so', 'dificultad', 'tecnicas', 'certificaciones', 'enlace', 'writeup'], ['resuelta', 'descripcion']],
  portswigger:    [['id', 'nombre', 'labs', 'certificaciones', 'tecnicas', 'writeup'], ['resuelta']],
  otros:          [['id', 'nombre', 'so', 'dificultad', 'tecnicas', 'certificaciones', 'writeup'], ['resuelta', 'descripcion', 'link_descarga', 'creadores']],
};
const URL_FIELDS = ['writeup', 'enlace', 'link_descarga'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const normName = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export function canonical(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

export function parseCert(c) {
  const m = /^(\S+)(?: \(([^()]+)\))?$/.exec(String(c));
  return m ? { base: m[1], qualifier: m[2] || '' } : null;
}

export function isIPv4(ip) {
  const parts = String(ip).split('.');
  return parts.length === 4 && parts.every(p => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function checkUrl(u, where, report) {
  if (u === '') return;
  if (typeof u !== 'string') return report.error(where, 'debe ser un texto (URL o vacío)');
  let url;
  try { url = new URL(u); } catch { return report.error(where, `URL no válida: ${u}`); }
  if (url.protocol !== 'https:') return report.error(where, `solo se admiten enlaces https: ${u}`);
  if (u !== u.trim()) report.error(where, 'la URL tiene espacios al principio o al final');
  if (SHORTENERS.includes(url.hostname)) report.warn(where, `acortador de enlaces (${url.hostname}): mejor el enlace directo`);
}

function checkText(v, where, report, { required = true } = {}) {
  if (typeof v !== 'string') return report.error(where, 'debe ser un texto');
  if (required && !v.trim()) return report.error(where, 'está vacío');
  if (v !== v.trim()) report.error(where, 'tiene espacios al principio o al final');
  if (/\s{2,}|\n/.test(v)) report.error(where, 'tiene saltos de línea o espacios dobles');
}

// Lineas de cada ficha en el texto original, para anotar los errores en CI.
function lineIndex(raw) {
  const idx = new Map();
  if (!raw) return idx;
  let sheet = null;
  raw.split('\n').forEach((line, i) => {
    const s = /^ {2}"(\w+)": \[/.exec(line);
    if (s) { sheet = s[1]; return; }
    const m = /^ {6}"id": (\d+),?$/.exec(line);
    if (m && sheet) idx.set(`${sheet}#${m[1]}`, i + 1);
  });
  return idx;
}

export function validateData(data, raw) {
  const errors = [];
  const warnings = [];
  const lines = lineIndex(raw);
  let current = null; // linea de la ficha en curso
  const report = {
    error: (where, msg) => errors.push({ where, msg, line: current }),
    warn: (where, msg) => warnings.push({ where, msg, line: current }),
  };

  if (!isObj(data)) {
    report.error('data.json', 'la raíz debe ser un objeto');
    return { errors, warnings };
  }
  for (const k of Object.keys(data)) {
    if (!SCHEMA[k]) report.error(k, `sección desconocida (válidas: ${Object.keys(SCHEMA).join(', ')})`);
  }

  for (const [sheet, [required, optional]] of Object.entries(SCHEMA)) {
    const list = data[sheet];
    current = null;
    if (!Array.isArray(list)) { report.error(sheet, 'falta la sección o no es una lista'); continue; }
    const ids = new Map();
    const names = new Map();
    const ips = new Map();
    const writeups = new Map();

    list.forEach((item, pos) => {
      current = isObj(item) && Number.isInteger(item.id) ? lines.get(`${sheet}#${item.id}`) || null : null;
      const label = isObj(item) && item.nombre ? `${item.nombre}` : `posición ${pos}`;
      const at = f => `${sheet} › ${label}${f ? ` › ${f}` : ''}`;
      if (!isObj(item)) return report.error(`${sheet}[${pos}]`, 'cada ficha debe ser un objeto');

      for (const f of required) if (!(f in item)) report.error(at(f), 'falta el campo');
      for (const f of Object.keys(item)) {
        if (!required.includes(f) && !optional.includes(f)) report.error(at(f), 'campo desconocido (¿errata?)');
      }

      if (!Number.isInteger(item.id) || item.id < 1) report.error(at('id'), 'debe ser un entero positivo');
      else if (ids.has(item.id)) report.error(at('id'), `id repetido (también en ${ids.get(item.id)})`);
      else ids.set(item.id, label);

      if ('nombre' in item) {
        checkText(item.nombre, at('nombre'), report);
        const n = normName(item.nombre);
        if (n && names.has(n)) report.error(at('nombre'), `ficha duplicada: se parece a «${names.get(n)}»`);
        else if (n) names.set(n, item.nombre);
      }

      if ('dificultad' in item && !DIFFICULTIES.includes(item.dificultad)) {
        report.error(at('dificultad'), `«${item.dificultad}» no es válida (${DIFFICULTIES.join(', ')})`);
      }
      if ('so' in item && !SYSTEMS.includes(item.so)) {
        report.error(at('so'), `«${item.so}» no es válido (${SYSTEMS.join(', ')})`);
      }
      if ('resuelta' in item && typeof item.resuelta !== 'boolean') report.error(at('resuelta'), 'debe ser true o false');
      // La descripcion es texto de HTB: solo se exige que sea texto no vacio.
      if ('descripcion' in item && (typeof item.descripcion !== 'string' || !item.descripcion.trim())) {
        report.error(at('descripcion'), 'debe ser un texto no vacío (o no incluir el campo)');
      }
      if ('categoria' in item) checkText(item.categoria, at('categoria'), report);
      if ('creadores' in item) checkText(item.creadores, at('creadores'), report);

      if ('ip' in item) {
        if (typeof item.ip !== 'string') report.error(at('ip'), 'debe ser un texto');
        else if (item.ip !== '') {
          if (!isIPv4(item.ip)) report.error(at('ip'), `IP no válida: «${item.ip}» (¿la estropeó Excel?)`);
          else if (sheet === 'hackthebox' && !item.ip.startsWith('10.')) report.error(at('ip'), `las máquinas de HTB usan 10.x.x.x: ${item.ip}`);
          else if (ips.has(item.ip)) report.error(at('ip'), `IP repetida (también en ${ips.get(item.ip)})`);
          else ips.set(item.ip, label);
        }
      }

      if ('tecnicas' in item) {
        if (!Array.isArray(item.tecnicas)) report.error(at('tecnicas'), 'debe ser una lista');
        else {
          const seen = new Set();
          item.tecnicas.forEach(t => {
            checkText(t, at('tecnicas'), report);
            if (seen.has(t)) report.error(at('tecnicas'), `técnica repetida: «${t}»`);
            seen.add(t);
          });
        }
      }

      if ('certificaciones' in item) {
        if (!Array.isArray(item.certificaciones)) report.error(at('certificaciones'), 'debe ser una lista');
        else {
          const seen = new Set();
          for (const c of item.certificaciones) {
            const p = parseCert(c);
            if (TOPICS.includes(c)) report.error(at('certificaciones'), `«${c}» es un tema, no una certificación: va en técnicas (npm run fix-data lo mueve)`);
            else if (!p) report.error(at('certificaciones'), `formato no válido: «${c}» (usa «CERT» o «CERT (Detalle)»)`);
            else if (!CERTS.includes(p.base)) {
              const hint = CERT_ALIASES[c] ? ` (¿${CERT_ALIASES[c]}? npm run fix-data lo corrige)` : '';
              report.error(at('certificaciones'), `certificación desconocida: «${c}»${hint}`);
            }
            if (seen.has(c)) report.error(at('certificaciones'), `repetida: «${c}»`);
            seen.add(c);
          }
        }
      }

      for (const f of URL_FIELDS) if (f in item) checkUrl(item[f], at(f), report);
      if (typeof item.writeup === 'string' && item.writeup) {
        if (writeups.has(item.writeup)) report.warn(at('writeup'), `mismo writeup que «${writeups.get(item.writeup)}» (¿directo con varias máquinas o error de copia?)`);
        else writeups.set(item.writeup, label);
      }

      if ('labs' in item) {
        if (!Array.isArray(item.labs)) report.error(at('labs'), 'debe ser una lista');
        else item.labs.forEach((l, i) => {
          if (!isObj(l)) return report.error(at(`labs[${i}]`), 'debe ser un objeto {nombre, url}');
          checkText(l.nombre, at(`labs[${i}].nombre`), report);
          checkUrl(l.url, at(`labs[${i}].url`), report);
        });
      }
    });
  }

  current = null;
  if (raw !== undefined && raw !== canonical(data)) {
    report.error('data.json', 'el formato no es el canónico (2 espacios, UTF-8, salto de línea final): ejecuta `npm run fix-data`');
  }
  return { errors, warnings };
}

// Correcciones seguras: no inventa datos, solo normaliza.
export function fixData(data) {
  const changes = [];
  for (const [sheet, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!isObj(item)) continue;
      const name = item.nombre;
      for (const f of ['nombre', 'categoria', 'creadores', ...URL_FIELDS]) {
        if (typeof item[f] === 'string') {
          const v = f === 'nombre' || f === 'categoria' || f === 'creadores' ? item[f].replace(/\s+/g, ' ').trim() : item[f].trim();
          if (v !== item[f]) { item[f] = v; changes.push(`${sheet} › ${name}: ${f} normalizado`); }
        }
      }
      if (typeof item.so === 'string' && SYSTEM_ALIASES[item.so]) {
        changes.push(`${sheet} › ${name}: so «${item.so}» → «${SYSTEM_ALIASES[item.so]}»`);
        item.so = SYSTEM_ALIASES[item.so];
      }
      if (Array.isArray(item.tecnicas)) {
        const clean = [...new Set(item.tecnicas.filter(t => typeof t === 'string').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))];
        if (clean.length !== item.tecnicas.length || clean.some((t, i) => t !== item.tecnicas[i])) {
          changes.push(`${sheet} › ${name}: técnicas limpiadas`);
          item.tecnicas = clean;
        }
      }
      if (Array.isArray(item.certificaciones)) {
        const out = [];
        for (let c of item.certificaciones) {
          if (typeof c !== 'string') continue;
          c = c.replace(/\s+/g, ' ').trim();
          if (CERT_ALIASES[c]) { changes.push(`${sheet} › ${name}: «${c}» → «${CERT_ALIASES[c]}»`); c = CERT_ALIASES[c]; }
          if (TOPICS.includes(c)) {
            item.tecnicas = Array.isArray(item.tecnicas) ? item.tecnicas : [];
            if (!item.tecnicas.includes(c)) item.tecnicas.push(c);
            changes.push(`${sheet} › ${name}: «${c}» movido a técnicas`);
            continue;
          }
          if (!out.includes(c)) out.push(c);
        }
        item.certificaciones = out;
      }
    }
  }
  return changes;
}

function print({ errors, warnings }) {
  const gha = process.env.GITHUB_ACTIONS === 'true';
  for (const [kind, list] of [['warning', warnings], ['error', errors]]) {
    for (const e of list) {
      if (gha) {
        const loc = e.line ? `file=data.json,line=${e.line}` : 'file=data.json';
        console.log(`::${kind} ${loc}::${e.where}: ${e.msg}`);
      } else {
        console.log(`${kind === 'error' ? '✖' : '⚠'} ${e.where}${e.line ? ` (línea ${e.line})` : ''}: ${e.msg}`);
      }
    }
  }
}

async function main() {
  const file = new URL('../data.json', import.meta.url);
  let raw = await readFile(file, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`✖ data.json no es JSON válido: ${err.message}`);
    process.exit(1);
  }
  if (process.argv.includes('--fix')) {
    const changes = fixData(data);
    const out = canonical(data);
    if (out !== raw) await writeFile(file, out, 'utf8');
    for (const c of changes) console.log(`✔ ${c}`);
    console.log(changes.length || out !== raw ? '✔ data.json corregido\n' : '✔ nada que corregir\n');
    raw = out;
  }
  const result = validateData(data, raw);
  print(result);
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
  console.log(`\n${Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(' · ')}`);
  console.log(`${result.errors.length} errores · ${result.warnings.length} avisos`);
  process.exit(result.errors.length ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
