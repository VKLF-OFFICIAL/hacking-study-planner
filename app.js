'use strict';

// ============================================================
// Configuracion
// ============================================================
const TARGET_CERT = 'eJPT';
const SHEETS = {
  hackthebox: { label: 'HackTheBox', icon: 'target' },
  vulnhub:    { label: 'VulnHub',    icon: 'box' },
};
const SHEET_KEYS = Object.keys(SHEETS);
const TAB_KEYS = [...SHEET_KEYS, 'roadmap'];
const FILTER_KEYS = ['dificultad', 'so', 'cert'];
const DIFF_ORDER = ['Fácil', 'Media', 'Difícil', 'Insane'];
const STORAGE_STATE = 'planning_state';
const STORAGE_ROADMAP = 'roadmap_progress';
const DEFAULT_COURSE_URL = 'https://www.skool.com/trabajo-en-ciber-5817/classroom';

// ============================================================
// Estado
// ============================================================
let DATA = null;          // { hackthebox: [...], vulnhub: [...] }
let STATE = {};           // { sheet: { id: { resuelta: true } } }
let ROADMAP_PROGRESS = {}; // { stageId: true }
let activeTab = 'hackthebox';

const tabFilters = {};
const filtersOpen = {};
const searchTimers = {};
for (const k of SHEET_KEYS) {
  tabFilters[k] = { search: '', dificultad: '', so: '', cert: '' };
  filtersOpen[k] = false;
}

// ============================================================
// Utilidades
// ============================================================
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Solo se enlaza a http(s): un "javascript:" o "data:" en data.json
// no debe acabar nunca en un href.
function safeUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return '';
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

// Minusculas y sin tildes, para comparar y buscar sin que importe "fácil" o "facil".
function fold(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "eJPT (Intrusión)" -> "eJPT"
function certBase(c) {
  return String(c).replace(/\s*[([].*$/, '').trim();
}

function loadJSON(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return isPlainObject(v) ? v : {};
  } catch {
    return {};
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setWidth(el, pct) {
  if (el) el.style.width = pct + '%';
}

function setProgress(el, pct) {
  if (el) el.setAttribute('aria-valuenow', String(pct));
}

function diffClass(d) {
  switch (fold(d).replace(/\s+/g, '')) {
    case 'facil': case 'easy': case 'veryeasy': return 'diff-facil';
    case 'media': case 'medium': return 'diff-media';
    case 'dificil': case 'hard': return 'diff-dificil';
    case 'insane': return 'diff-insane';
    default: return 'diff-unknown';
  }
}

// Iconos de interfaz: SVG monocromos que heredan el color del contexto.
const _sv = (d, fill) => '<svg viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') +
  '" stroke="' + (fill ? 'none' : 'currentColor') +
  '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
const ICONS = {
  terminal: _sv('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 9l3 3-3 3M13.5 15H17"/>'),
  windows:  _sv('<path d="M3 5.6l7.2-1v7H3zM11.6 4.4L21 3v8.6h-9.4zM3 13h7.2v6.4L3 18.4zM11.6 13H21v8l-9.4-1.3z"/>', true),
  monitor:  _sv('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  target:   _sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>'),
  box:      _sv('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  route:    _sv('<circle cx="6" cy="19" r="2.6"/><circle cx="18" cy="5" r="2.6"/><path d="M8.6 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.4"/>'),
  sliders:  _sv('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  close:    _sv('<path d="M18 6L6 18M6 6l12 12"/>'),
  search:   _sv('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  link:     _sv('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>'),
  download: _sv('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  play:     _sv('<path d="M7 4.5v15l12-7.5z"/>', true),
  check:    _sv('<path d="M20 6L9 17l-5-5"/>'),
  circle:   _sv('<circle cx="12" cy="12" r="8"/>'),
  chevron:  _sv('<path d="M6 9l6 6 6-6"/>'),
  rocket:   _sv('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0"/>'),
  globe:    _sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>'),
  flask:    _sv('<path d="M9 2v6l-5.2 9.9A2 2 0 0 0 5.6 21h12.8a2 2 0 0 0 1.8-3.1L15 8V2"/><path d="M8 2h8M7.5 14h9"/>'),
  note:     _sv('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>'),
  medal:    _sv('<circle cx="12" cy="15" r="6"/><path d="M8.6 9.6L6 2h12l-2.6 7.6"/>'),
  case:     _sv('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  alert:    _sv('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
};

function osIcon(so) {
  const l = fold(so);
  if (l.includes('windows')) return ICONS.windows;
  if (l.includes('linux') || l.includes('bsd') || l.includes('solaris')) return ICONS.terminal;
  return ICONS.monitor;
}

// ============================================================
// ROADMAP eJPT — De Cero a Junior Pentester · LionXSecurity
// El campo id identifica cada etapa en el progreso guardado: no cambiarlo.
// ============================================================
const EJPT_ROADMAP = [
  // ───────── FASE 1 · FUNDAMENTOS ─────────
  {
    id: 'bienvenida',
    phase: 'FASE 1 · FUNDAMENTOS',
    icon: ICONS.rocket,
    title: 'Bienvenida al mundo de la Ciberseguridad',
    subtitle: 'Roles, principios y cómo se estructura la industria',
    desc: 'Antes de tocar una terminal, entiende el terreno. Qué hace un pentester, un analista SOC, un red teamer. Los pilares CIA (Confidencialidad · Integridad · Disponibilidad), criptografía básica y métodos de autenticación son la base de todo lo que aprenderás después.',
    objectives: [
      '¿Qué es la ciberseguridad y por qué importa hoy?',
      'Roles: Pentester · SOC Analyst · Red / Blue Team · DFIR · GRC',
      'Tríada CIA — los 3 pilares que protege todo control de seguridad',
      'Criptografía: simétrica vs asimétrica · hashing (SHA-256) · TLS',
      'Autenticación: MFA · tokens · biometría · SSO · Kerberos vs SAML',
    ],
    tools: ['Wikipedia', 'NIST Glossary'],
    resources: [
      { name: 'Blog y recursos oficiales · LionXSecurity', url: 'https://lionxsecurity.es/' },
      { name: 'CIA Triad (glosario NIST)', url: 'https://csrc.nist.gov/glossary/term/confidentiality_integrity_availability' },
    ],
  },
  {
    id: 'laboratorio',
    phase: 'FASE 1 · FUNDAMENTOS',
    icon: ICONS.monitor,
    title: 'Monta tu laboratorio · Máquina Virtual + Kali Linux',
    subtitle: 'Guía visual paso a paso — 30 minutos y listo',
    desc: 'Tu ordenador anfitrión NUNCA debe atacar directamente. Instala VirtualBox (gratis), descarga la imagen preconfigurada de Kali Linux y arráncala. Descarga también la chuleta de comandos que usarás a diario. En 30 minutos tendrás un laboratorio profesional funcionando y aislado.',
    objectives: [
      'Descargar e instalar VirtualBox (Windows / Mac / Linux)',
      'Descargar la imagen oficial VDI/OVA de Kali Linux',
      'Importar la VM y asignar 4-8 GB RAM · 2-4 vCPU',
      'Configurar red NAT + Host-Only para labs aislados',
      'Crear un snapshot inicial (siempre puedes volver atrás)',
      'Descargar las chuletas de Linux, Nmap y Redes',
    ],
    tools: ['VirtualBox', 'Kali Linux', 'VMware Player'],
    resources: [
      { name: 'Kali Linux — imágenes para VirtualBox', url: 'https://www.kali.org/get-kali/#kali-virtual-machines', download: true },
      { name: 'VirtualBox (oficial · gratis)', url: 'https://www.virtualbox.org/wiki/Downloads', download: true },
      { name: 'Cheatsheets · Redes, comandos y puertos', url: 'https://packetlife.net/library/cheat-sheets/' },
    ],
  },

  // ───────── FASE 2 · ACADEMIA LIONX ─────────
  {
    id: 'curso-redes',
    phase: 'FASE 2 · ACADEMIA LIONX',
    icon: ICONS.globe,
    cover: 'https://lionxsecurity.es/media/cursos/portadas/portadasredes.jpg',
    courseUrl: 'https://www.skool.com/trabajo-en-ciber-5817/classroom',
    title: 'Curso 1/3 · Introducción a Redes (CCNA)',
    subtitle: 'Cisco Packet Tracer · Academia LionXSecurity',
    desc: 'Sin redes, no hay hacking. Este curso oficial de LionXSecurity te lleva del modelo OSI a montar tus propias topologías en Cisco Packet Tracer. Cuando termines, entenderás qué pasa por debajo de cada nmap y cada request de Burp — y por qué un puerto abierto es una puerta.',
    objectives: [
      'Modelo OSI y pila TCP/IP · las 7 capas y sus protocolos',
      'Direccionamiento IPv4 e IPv6 · subnetting · CIDR · VLSM',
      'Protocolos clave: ARP · DHCP · DNS · HTTP/S · ICMP · FTP · SMB · SSH',
      'Routing estático y dinámico (RIP · OSPF)',
      'VLANs, switching y configuración de dispositivos Cisco',
      'Laboratorios guiados en Cisco Packet Tracer',
    ],
    tools: ['Cisco Packet Tracer', 'Wireshark', 'ipcalc'],
    resources: [
      { name: 'Ir al curso — Redes CCNA · LionXSecurity', url: 'https://www.skool.com/trabajo-en-ciber-5817/classroom' },
      { name: 'Wireshark (herramienta oficial)', url: 'https://www.wireshark.org/download.html', download: true },
    ],
  },
  {
    id: 'curso-bash',
    phase: 'FASE 2 · ACADEMIA LIONX',
    icon: ICONS.terminal,
    cover: 'https://lionxsecurity.es/media/cursos/portadas/thumb1.jpg',
    courseUrl: 'https://www.skool.com/trabajo-en-ciber-5817/classroom',
    title: 'Curso 2/3 · Bash Scripting en Linux',
    subtitle: 'Automatiza como un pro · Academia LionXSecurity',
    desc: 'El 90% del pentesting sucede en la terminal. Este curso de LionXSecurity te lleva de cero a nivel productivo con Bash: pipes, redirecciones, funciones, bucles y scripts que enumeran objetivos mientras tú tomas café. Prepara el terreno para automatizar todo tu recon en la fase eJPT.',
    objectives: [
      'Sintaxis Bash: variables · condicionales · bucles · funciones',
      'Streams: pipes · redirecciones · tee · xargs',
      'Herramientas UNIX: grep · awk · sed · cut · sort · uniq',
      'Cron, systemd timers y background jobs',
      'Escribir tus propios scripts de enumeración de objetivos',
      'Buenas prácticas: set -e · trap · parámetros posicionales',
    ],
    tools: ['bash', 'grep', 'awk', 'sed', 'jq', 'curl'],
    resources: [
      { name: 'Ir al curso — Bash Scripting Linux · LionXSecurity', url: 'https://www.skool.com/trabajo-en-ciber-5817/classroom' },
      { name: 'Bash Reference Manual (documentación GNU)', url: 'https://www.gnu.org/software/bash/manual/' },
    ],
  },
  {
    id: 'curso-bug-bounty',
    phase: 'FASE 2 · ACADEMIA LIONX',
    icon: ICONS.target,
    cover: 'https://lionxsecurity.es/media/cursos/portadas/bu.jpg',
    courseUrl: 'https://www.skool.com/trabajo-en-ciber-5817/classroom',
    title: 'Curso 3/3 · Bug Bounty (Hacking Web) — Enfoque eJPT',
    subtitle: 'Del OWASP Top 10 al examen · Academia LionXSecurity',
    desc: 'El curso que junta todo lo anterior. Aprendes a atacar aplicaciones web reales con las técnicas que exige el eJPTv2: recon, explotación web, Metasploit, pivoting y toma de notas. Enfoque 100% eJPT — sin contenido de OSCP ni otras certificaciones.',
    objectives: [
      'Recon web: gobuster · ffuf · whatweb · wappalyzer',
      'OWASP Top 10 aplicado: SQLi · XSS · LFI/RFI · IDOR · upload',
      'Burp Suite: proxy · repeater · intruder (como en el examen)',
      'Explotación con Metasploit: payloads · meterpreter · post-exp',
      'Pivoting básico (SSH tunnels · proxychains) — TEMA CLAVE eJPT',
      'Metodología de examen: gestión del tiempo en 48 h',
    ],
    tools: ['Burp Suite', 'Metasploit', 'sqlmap', 'ffuf', 'gobuster'],
    resources: [
      { name: 'Ir al curso — Bug Bounty Web · LionXSecurity', url: 'https://www.skool.com/trabajo-en-ciber-5817/classroom' },
      { name: 'Burp Suite Community (oficial)', url: 'https://portswigger.net/burp/communitydownload', download: true },
      { name: 'PayloadsAllTheThings (repo GitHub)', url: 'https://github.com/swisskyrepo/PayloadsAllTheThings' },
    ],
  },

  // ───────── FASE 3 · LABORATORIO PRÁCTICO ─────────
  {
    id: 'plataformas',
    phase: 'FASE 3 · LABORATORIO PRÁCTICO',
    icon: ICONS.flask,
    title: 'Plataformas de práctica — HTB · VulnHub · CTFs',
    subtitle: 'Rompe cosas legalmente hasta que te salga solo',
    desc: 'Ver videos NO es aprender. Necesitas ~50 máquinas resueltas ANTES del examen. Hack The Box te da entorno cloud, VulnHub máquinas descargables para tu VM local, y las plataformas CTF eventos donde compites contra otros. Empieza por las Easy de HTB filtradas por eJPT (usa la pestaña HackTheBox de esta app).',
    objectives: [
      'Crear cuenta en Hack The Box (Starting Point es gratis)',
      'Resolver 20+ máquinas Easy filtradas por eJPT',
      'Descargar y montar 5-10 máquinas de VulnHub en tu VM',
      'Participar en al menos 1 CTF (calendario en CTFtime)',
      'Reto: repetir cada máquina hasta hacerla en < 1 h sin walkthrough',
    ],
    tools: ['HTB VPN', 'VulnHub', 'CTFtime'],
    resources: [
      { name: 'Hack The Box — plataforma de máquinas', url: 'https://www.hackthebox.com/' },
      { name: 'VulnHub — máquinas descargables', url: 'https://www.vulnhub.com/' },
      { name: 'CTFtime — calendario mundial de CTFs', url: 'https://ctftime.org/' },
      { name: 'Guías y writeups · LionXSecurity', url: 'https://lionxsecurity.es/' },
    ],
  },
  {
    id: 'notas',
    phase: 'FASE 3 · LABORATORIO PRÁCTICO',
    icon: ICONS.note,
    title: 'Toma de notas + IA de apoyo',
    subtitle: 'Obsidian · Notion · Mimiro — el trío que aprueba el eJPT',
    desc: 'En el examen tienes 48 h y 35 preguntas. Sin notas ordenadas, mueres. Obsidian con Excalidraw y Templater es el estándar entre pentesters. Notion sirve si prefieres nube. Mimiro es la IA de apoyo: resume máquinas, genera diagramas automáticos y responde dudas técnicas mientras practicas.',
    objectives: [
      'Instalar Obsidian y crear vault con estructura /HTB /Web /Redes',
      'Plantilla de writeup: Enumeración → Foothold → Privesc → Loot',
      'Plugins clave: Excalidraw · Templater · Dataview',
      'Usar Mimiro para explicaciones y diagramas de ataque',
      'Sincronizar notas con Git (backup en GitHub privado)',
    ],
    tools: ['Obsidian', 'Notion', 'Mimiro AI', 'Excalidraw'],
    resources: [
      { name: 'Obsidian (gratis)', url: 'https://obsidian.md/', download: true },
      { name: 'Notion (gratis con plan personal)', url: 'https://www.notion.so/' },
      { name: 'Mimiro — IA para ciberseguridad', url: 'https://www.mimiro.ai/' },
      { name: 'Excalidraw — diagramas rápidos', url: 'https://excalidraw.com/' },
    ],
  },

  // ───────── FASE 4 · CERTIFICACIÓN & EMPLEO ─────────
  {
    id: 'examen',
    phase: 'FASE 4 · CERTIFICACIÓN & EMPLEO',
    icon: ICONS.medal,
    title: 'Certificación eJPTv2 · El examen',
    subtitle: '48 h · 35 preguntas · red real · sin walkthrough',
    desc: 'El eJPTv2 es 100% práctico: te conectas por VPN a una red corporativa simulada y respondes 35 preguntas usando lo que descubres. Se aprueba con 22/35. Si has hecho los 3 cursos de LionXSecurity + 50 máquinas HTB, apruebas a la primera. Reserva examen cuando lleves 2-3 simulacros superados.',
    objectives: [
      'Reservar voucher del examen eJPTv2',
      'Completar 2-3 simulacros antes de reservar fecha',
      'Bloquear 48 h libres sin interrupciones para el examen',
      'Estrategia: enumerar TODO antes de explotar · notas en Obsidian',
      'Contratar tutoría 1-a-1 en LionXSecurity si atascas en Pivoting o Web',
      'Añadir badge digital a LinkedIn el mismo día del aprobado',
    ],
    tools: ['Kali Linux', 'Obsidian', 'Tutoría LionXSecurity'],
    resources: [
      { name: 'Tutorías 1-a-1 y refuerzo · LionXSecurity', url: 'https://lionxsecurity.es/' },
      { name: 'Info oficial del examen eJPTv2', url: 'https://security.ine.com/certifications/ejpt-certification/' },
      { name: 'Reddit r/eJPT — dudas y experiencias', url: 'https://www.reddit.com/r/eJPT/' },
    ],
  },
  {
    id: 'portfolio',
    phase: 'FASE 4 · CERTIFICACIÓN & EMPLEO',
    icon: ICONS.case,
    title: 'Portfolio GitHub + Búsqueda de empleo',
    subtitle: 'De certificado a Junior Pentester / SOC Analyst L1',
    desc: 'La certificación abre la puerta; el portfolio te contrata. Sube tus writeups (ANONIMIZADOS — nunca flags ni credenciales activas) a un repo GitHub público, mantén un README pulido, y aplica a Junior Pentester, SOC L1 o Auditor de Ciberseguridad. En España las ofertas están en LinkedIn, InfoJobs y comunidades de Telegram/Discord.',
    objectives: [
      'Repo público "pentesting-writeups" en GitHub con README claro',
      'Subir 10-15 writeups en Markdown de máquinas HTB resueltas',
      'CV en 1 página: eJPTv2 arriba · cursos LionXSecurity · proyectos',
      'LinkedIn: título "eJPTv2 Certified · Junior Pentester"',
      'Aplicar a: Junior Pentester · SOC L1 · Consultor Ciberseguridad',
      'Comunidades ES: Hackplayers · HackMadrid · HackBCN · Discord LionXSecurity',
    ],
    tools: ['GitHub', 'LinkedIn', 'InfoJobs', 'CVMaker'],
    resources: [
      { name: 'GitHub — crea tu cuenta y repo', url: 'https://github.com/' },
      { name: 'LinkedIn — perfil profesional', url: 'https://www.linkedin.com/' },
      { name: 'InfoJobs — ofertas ciberseguridad', url: 'https://www.infojobs.net/ofertas-trabajo/ciberseguridad' },
      { name: 'Hackplayers — comunidad ES', url: 'https://www.hackplayers.com/' },
    ],
  },
];

// ============================================================
// Maquinas: estado resuelto
// ============================================================
function isResolved(sheetKey, item) {
  const sheet = STATE[sheetKey];
  const entry = isPlainObject(sheet) ? sheet[String(item.id)] : null;
  return isPlainObject(entry) && entry.resuelta === true;
}

function getItem(sheetKey, id) {
  return (DATA[sheetKey] || []).find(i => String(i.id) === String(id)) || null;
}

function cardId(sheetKey, id) {
  return `card-${sheetKey}-${id}`;
}

function resolveBtnContent(resolved) {
  return resolved ? `${ICONS.check}<span>Resuelta</span>` : `${ICONS.circle}<span>Resolver</span>`;
}

function toggleResolved(sheetKey, id) {
  const item = getItem(sheetKey, id);
  if (!item) return;
  const resolved = !isResolved(sheetKey, item);
  if (!isPlainObject(STATE[sheetKey])) STATE[sheetKey] = {};
  if (resolved) STATE[sheetKey][String(item.id)] = { resuelta: true };
  else delete STATE[sheetKey][String(item.id)];
  saveJSON(STORAGE_STATE, STATE);

  const card = document.getElementById(cardId(sheetKey, item.id));
  if (card) {
    card.classList.toggle('resolved', resolved);
    const btn = card.querySelector('.btn-resolve');
    if (btn) {
      btn.classList.toggle('done', resolved);
      btn.setAttribute('aria-pressed', String(resolved));
      btn.innerHTML = resolveBtnContent(resolved);
    }
  }
  toast(resolved ? `${item.nombre}: resuelta` : `${item.nombre}: pendiente`);
  updateStats();
}

// ============================================================
// Estadisticas
// ============================================================
function computeStats(sheetKey) {
  const items = DATA[sheetKey];
  const resolved = items.filter(i => isResolved(sheetKey, i)).length;
  return { total: items.length, resolved, pct: items.length ? Math.round(resolved / items.length * 100) : 0 };
}

function updateStats() {
  let total = 0, resolved = 0;
  for (const k of SHEET_KEYS) {
    const s = computeStats(k);
    total += s.total;
    resolved += s.resolved;
    const badge = document.getElementById(`navbadge-${k}`);
    if (badge) {
      badge.textContent = String(s.resolved);
      badge.hidden = s.resolved === 0;
    }
    setWidth(document.getElementById(`progress-${k}`), s.pct);
    setProgress(document.getElementById(`progressbar-${k}`), s.pct);
  }
  const pct = total ? Math.round(resolved / total * 100) : 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  set('gs-total', total);
  set('gs-resolved', resolved);
  set('gs-pct', pct + '%');
}

// ============================================================
// Filtros
// ============================================================
const _searchIndex = new WeakMap();
function searchIndex(item) {
  let s = _searchIndex.get(item);
  if (s === undefined) {
    s = fold([
      item.nombre, item.so, item.ip, item.dificultad,
      ...(item.tecnicas || []), ...(item.certificaciones || []),
    ].join(' '));
    _searchIndex.set(item, s);
  }
  return s;
}

// ignore: filtro que no se aplica (para calcular las opciones de ese grupo)
function matches(item, f, ignore) {
  const words = fold(f.search).split(/\s+/).filter(Boolean);
  if (words.length) {
    const idx = searchIndex(item);
    if (!words.every(w => idx.includes(w))) return false;
  }
  if (ignore !== 'dificultad' && f.dificultad && item.dificultad !== f.dificultad) return false;
  if (ignore !== 'so' && f.so && item.so !== f.so) return false;
  if (ignore !== 'cert' && f.cert && !(item.certificaciones || []).some(c => certBase(c) === f.cert)) return false;
  return true;
}

function sortEs(values) {
  return values.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

const _options = {};
function staticOptions(sheetKey) {
  if (!_options[sheetKey]) {
    const items = DATA[sheetKey];
    const diffs = [...new Set(items.map(i => i.dificultad).filter(Boolean))];
    const rank = d => { const i = DIFF_ORDER.indexOf(d); return i === -1 ? DIFF_ORDER.length : i; };
    diffs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
    const sos = sortEs([...new Set(items.map(i => i.so).filter(Boolean))]);
    _options[sheetKey] = { dificultad: diffs, so: sos };
  }
  return _options[sheetKey];
}

// Certificaciones presentes en lo que dejan ver los demas filtros. eJPT se
// omite: todas las fichas la tienen, asi que no filtraria nada. La que este
// seleccionada se mantiene siempre visible para poder desmarcarla.
function certOptions(sheetKey) {
  const f = tabFilters[sheetKey];
  const set = new Set();
  for (const item of DATA[sheetKey]) {
    if (!matches(item, f, 'cert')) continue;
    for (const c of item.certificaciones || []) set.add(certBase(c));
  }
  set.delete(TARGET_CERT);
  if (f.cert) set.add(f.cert);
  return sortEs([...set]);
}

function countActiveFilters(sheetKey) {
  const f = tabFilters[sheetKey];
  return FILTER_KEYS.filter(k => f[k]).length;
}

function chipGroup(sheetKey, key, label, values, current) {
  if (!values.length) return '';
  const labelId = `fl-${sheetKey}-${key}`;
  const chips = values.map(v => {
    const on = v === current;
    return `<button type="button" class="chip${on ? ' active' : ''}" data-action="filter" data-sheet="${esc(sheetKey)}" data-key="${esc(key)}" data-val="${esc(v)}" aria-pressed="${on}">${esc(v)}</button>`;
  }).join('');
  return `<div class="filter-row">
      <span class="filter-label" id="${esc(labelId)}">${esc(label)}</span>
      <div class="filter-group" role="group" aria-labelledby="${esc(labelId)}">${chips}</div>
    </div>`;
}

function setFilter(btn) {
  const { sheet, key, val } = btn.dataset;
  if (!SHEET_KEYS.includes(sheet) || !FILTER_KEYS.includes(key)) return;
  const f = tabFilters[sheet];
  f[key] = f[key] === val ? '' : val;
  updateResults(sheet);
}

function setSearch(sheetKey, value) {
  if (!SHEET_KEYS.includes(sheetKey)) return;
  tabFilters[sheetKey].search = value;
  clearTimeout(searchTimers[sheetKey]);
  searchTimers[sheetKey] = setTimeout(() => updateResults(sheetKey), 150);
}

function clearFilters(sheetKey) {
  if (!SHEET_KEYS.includes(sheetKey)) return;
  const f = tabFilters[sheetKey];
  for (const k of Object.keys(f)) f[k] = '';
  clearTimeout(searchTimers[sheetKey]);
  const input = document.getElementById(`search-${sheetKey}`);
  if (input) input.value = '';
  updateResults(sheetKey);
  if (input) input.focus();
}

function toggleFilters(sheetKey) {
  if (!SHEET_KEYS.includes(sheetKey)) return;
  const open = filtersOpen[sheetKey] = !filtersOpen[sheetKey];
  const panel = document.getElementById(`filters-panel-${sheetKey}`);
  const btn = document.getElementById(`filter-btn-${sheetKey}`);
  if (panel) {
    panel.classList.toggle('open', open);
    panel.inert = !open;
  }
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

function updateFilterBtn(sheetKey) {
  const btn = document.getElementById(`filter-btn-${sheetKey}`);
  if (!btn) return;
  const n = countActiveFilters(sheetKey);
  btn.classList.toggle('has-active', n > 0);
  const badge = btn.querySelector('.filter-active-count');
  if (badge) {
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }
}

// Repinta resultados, contador y estado de los chips sin tocar el campo de
// busqueda (para no perder el foco ni la posicion del cursor).
function updateResults(sheetKey) {
  const f = tabFilters[sheetKey];
  const items = DATA[sheetKey];
  const filtered = items.filter(i => matches(i, f));

  const grid = document.getElementById(`grid-${sheetKey}`);
  if (grid) {
    grid.innerHTML = filtered.length
      ? filtered.map(i => renderCard(i, sheetKey)).join('')
      : `<div class="empty-state">
          <div class="empty-state-icon">${ICONS.search}</div>
          <p class="empty-state-text">No se encontraron resultados</p>
          <button type="button" class="btn btn-writeup" data-action="clear-filters" data-sheet="${esc(sheetKey)}">${ICONS.close}<span>Limpiar filtros</span></button>
        </div>`;
  }

  const count = document.getElementById(`count-${sheetKey}`);
  if (count) count.textContent = `${filtered.length} / ${items.length}`;

  const certWrap = document.getElementById(`cert-chips-${sheetKey}`);
  if (certWrap) {
    const active = document.activeElement;
    const refocus = active && certWrap.contains(active) ? active.dataset.val : null;
    certWrap.innerHTML = chipGroup(sheetKey, 'cert', 'Certificación', certOptions(sheetKey), f.cert);
    if (refocus !== null) {
      const again = [...certWrap.querySelectorAll('.chip')].find(c => c.dataset.val === refocus);
      if (again) again.focus();
    }
  }

  const panel = document.getElementById(`filters-panel-${sheetKey}`);
  if (panel) {
    panel.querySelectorAll('.chip[data-key]').forEach(c => {
      const on = f[c.dataset.key] === c.dataset.val;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }
  updateFilterBtn(sheetKey);
}

// ============================================================
// Tarjetas
// ============================================================
function renderBadgeDiff(d) {
  if (!d) return '';
  return `<span class="badge-diff ${diffClass(d)}">${esc(d)}</span>`;
}

function renderTags(arr, cls = '') {
  return arr.map(t => `<span class="tag${cls ? ' ' + cls : ''}" title="${esc(t)}">${esc(t)}</span>`).join('');
}

function renderCard(item, sheetKey) {
  const resolved = isResolved(sheetKey, item);
  const writeup = safeUrl(item.writeup);
  const download = safeUrl(item.enlace || item.link_descarga);
  const name = esc(item.nombre);

  const techTags = Array.isArray(item.tecnicas) && item.tecnicas.length
    ? `<div class="section-divider">Técnicas</div><div class="tags">${renderTags(item.tecnicas)}</div>` : '';
  const certTags = Array.isArray(item.certificaciones) && item.certificaciones.length
    ? `<div class="section-divider">Certificaciones</div><div class="tags">${renderTags(item.certificaciones, 'cert')}</div>` : '';
  const desc = item.descripcion
    ? `<p class="card-desc" title="${esc(item.descripcion)}">${esc(item.descripcion)}</p>` : '';

  return `
  <article class="card ${diffClass(item.dificultad)}${resolved ? ' resolved' : ''}" id="${esc(cardId(sheetKey, item.id))}">
    <div class="card-header">
      <h2 class="card-title">${name}</h2>
      ${renderBadgeDiff(item.dificultad)}
    </div>
    <div class="card-meta">
      <span class="os-badge"><span class="os-icon">${osIcon(item.so)}</span>${esc(item.so || 'Desconocido')}</span>
      ${item.ip ? `<span class="card-ip">${esc(item.ip)}</span>` : ''}
    </div>
    ${desc}
    ${techTags}
    ${certTags}
    <div class="card-actions">
      <button type="button" class="btn btn-resolve${resolved ? ' done' : ''}" data-action="resolve" data-sheet="${esc(sheetKey)}" data-id="${esc(item.id)}" aria-pressed="${resolved}">${resolveBtnContent(resolved)}</button>
      ${download ? `<a class="btn btn-lab" href="${esc(download)}" target="_blank" rel="noopener noreferrer" aria-label="Descargar ${name} (se abre en otra pestaña)">${ICONS.download}<span>Descargar</span></a>` : ''}
      ${writeup ? `<a class="btn btn-writeup" href="${esc(writeup)}" target="_blank" rel="noopener noreferrer" aria-label="Writeup de ${name} (se abre en otra pestaña)">${ICONS.play}<span>Writeup</span></a>` : ''}
    </div>
  </article>`;
}

// ============================================================
// Pestañas de maquinas
// ============================================================
function renderSheet(sheetKey) {
  const f = tabFilters[sheetKey];
  const open = filtersOpen[sheetKey];
  const n = countActiveFilters(sheetKey);
  const opts = staticOptions(sheetKey);
  const label = SHEETS[sheetKey].label;

  return `
  <div class="controls">
    <div class="controls-inner">
      <div class="controls-search-row">
        <div class="search-wrap" role="search">
          <span class="search-icon">${ICONS.search}</span>
          <input class="search-input" id="search-${sheetKey}" type="search" data-action="search" data-sheet="${sheetKey}"
            placeholder="Buscar máquina, técnica, IP…" aria-label="Buscar en ${esc(label)}"
            value="${esc(f.search)}" autocomplete="off" spellcheck="false">
        </div>
        <button type="button" id="filter-btn-${sheetKey}" class="btn-filter-toggle${n ? ' has-active' : ''}"
          data-action="toggle-filters" data-sheet="${sheetKey}" aria-expanded="${open}" aria-controls="filters-panel-${sheetKey}">
          ${ICONS.sliders}<span>Filtros</span><span class="filter-active-count"${n ? '' : ' hidden'}>${n}</span>
        </button>
        <span class="results-count" id="count-${sheetKey}" aria-live="polite"></span>
      </div>
      <div class="filters-panel${open ? ' open' : ''}" id="filters-panel-${sheetKey}"${open ? '' : ' inert'}>
        <div class="filters">
          ${chipGroup(sheetKey, 'dificultad', 'Dificultad', opts.dificultad, f.dificultad)}
          ${chipGroup(sheetKey, 'so', 'Sistema', opts.so, f.so)}
          <div id="cert-chips-${sheetKey}"></div>
          <div class="filter-actions">
            <button type="button" class="chip-clear" data-action="clear-filters" data-sheet="${sheetKey}">${ICONS.close}<span>Limpiar filtros</span></button>
          </div>
        </div>
      </div>
      <div class="tab-progress" id="progressbar-${sheetKey}" role="progressbar" aria-label="Progreso en ${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="tab-progress-bar" id="progress-${sheetKey}"></div>
      </div>
    </div>
  </div>
  <div class="grid-container" id="grid-${sheetKey}"></div>`;
}

// ============================================================
// Roadmap
// ============================================================
function loadRoadmapProgress() {
  const raw = loadJSON(STORAGE_ROADMAP);
  const ids = new Set(EJPT_ROADMAP.map(s => s.id));
  const out = {};
  let changed = false;
  for (const [k, v] of Object.entries(raw)) {
    if (v !== true) { changed = true; continue; }
    if (ids.has(k)) out[k] = true;
    // Formato antiguo: la clave era la posicion de la etapa.
    else if (/^\d+$/.test(k) && EJPT_ROADMAP[Number(k)]) { out[EJPT_ROADMAP[Number(k)].id] = true; changed = true; }
    else changed = true;
  }
  if (changed) saveJSON(STORAGE_ROADMAP, out);
  return out;
}

function markBtnContent(done) {
  return done ? `${ICONS.check}<span>Completada</span>` : `${ICONS.circle}<span>Marcar como completada</span>`;
}

function toggleRoadmapStage(btn) {
  const node = btn.closest('.rm-node');
  if (!node) return;
  const expanded = !node.classList.contains('expanded');
  node.classList.toggle('expanded', expanded);
  btn.setAttribute('aria-expanded', String(expanded));
  const body = node.querySelector('.rm-card-body');
  if (body) body.inert = !expanded;
}

function markRoadmapStage(id) {
  const stage = EJPT_ROADMAP.find(s => s.id === id);
  if (!stage) return;
  const done = !ROADMAP_PROGRESS[id];
  if (done) ROADMAP_PROGRESS[id] = true; else delete ROADMAP_PROGRESS[id];
  saveJSON(STORAGE_ROADMAP, ROADMAP_PROGRESS);
  const node = document.getElementById(`rm-node-${id}`);
  if (node) {
    node.classList.toggle('completed', done);
    const btn = node.querySelector('.rm-mark-btn');
    if (btn) {
      btn.classList.toggle('done', done);
      btn.setAttribute('aria-pressed', String(done));
      btn.innerHTML = markBtnContent(done);
    }
  }
  updateRoadmapProgress();
  toast(done ? 'Etapa completada' : 'Etapa desmarcada');
}

function updateRoadmapProgress() {
  const done = EJPT_ROADMAP.filter(s => ROADMAP_PROGRESS[s.id]).length;
  const total = EJPT_ROADMAP.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  setWidth(document.getElementById('rm-progress-bar'), pct);
  setProgress(document.getElementById('rm-progress-track'), pct);
  const label = document.getElementById('rm-progress-label');
  if (label) label.textContent = `${done}/${total} etapas · ${pct}%`;
}

function renderRoadmap() {
  let lastPhase = '';
  const nodes = EJPT_ROADMAP.map((stage, idx) => {
    const done = !!ROADMAP_PROGRESS[stage.id];
    const objectives = stage.objectives.map(o => `<li>${esc(o)}</li>`).join('');
    const tools = stage.tools.map(t => `<li class="rm-tool">${esc(t)}</li>`).join('');
    const resources = stage.resources.map(r => {
      const url = safeUrl(r.url);
      if (!url) return '';
      return `<a class="rm-resource" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          <span class="rm-resource-icon">${r.download ? ICONS.download : ICONS.link}</span><span>${esc(r.name)}</span>
        </a>`;
    }).join('');
    const courseUrl = safeUrl(stage.courseUrl) || DEFAULT_COURSE_URL;
    const cover = safeUrl(stage.cover)
      ? `<a class="rm-cover" href="${esc(courseUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir el curso ${esc(stage.title)}">
           <img class="rm-cover-img" src="${esc(safeUrl(stage.cover))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
           <span class="rm-cover-badge">Abrir curso</span>
         </a>` : '';

    let phaseHeader = '';
    if (stage.phase && stage.phase !== lastPhase) {
      lastPhase = stage.phase;
      phaseHeader = `<h2 class="rm-phase-header"><span class="rm-phase-line"></span><span class="rm-phase-text">${esc(stage.phase)}</span><span class="rm-phase-line"></span></h2>`;
    }
    const id = esc(stage.id);
    return `
    ${phaseHeader}
    <div class="rm-node${done ? ' completed' : ''}" id="rm-node-${id}">
      <div class="rm-dot" aria-hidden="true">
        <span class="rm-dot-num">${idx + 1}</span>
        <span class="rm-dot-check">${ICONS.check}</span>
      </div>
      <div class="rm-card">
        <h3 class="rm-card-heading">
          <button type="button" class="rm-card-header" data-action="rm-toggle" aria-expanded="false" aria-controls="rm-body-${id}">
            <span class="rm-header-icon">${stage.icon}</span>
            <span class="rm-header-text">
              <span class="rm-header-title">${esc(stage.title)}</span>
              <span class="rm-header-sub">${esc(stage.subtitle)}</span>
            </span>
            <span class="rm-header-chevron">${ICONS.chevron}</span>
          </button>
        </h3>
        <div class="rm-card-body" id="rm-body-${id}" inert>
          ${cover}
          <p class="rm-desc">${esc(stage.desc)}</p>
          <div class="rm-section">
            <h4 class="rm-section-title">Objetivos</h4>
            <ul class="rm-objectives">${objectives}</ul>
          </div>
          <div class="rm-section">
            <h4 class="rm-section-title">Herramientas clave</h4>
            <ul class="rm-tools">${tools}</ul>
          </div>
          <div class="rm-section">
            <h4 class="rm-section-title">Recursos recomendados</h4>
            <div class="rm-resources">${resources}</div>
          </div>
          <button type="button" class="rm-mark-btn${done ? ' done' : ''}" data-action="rm-mark" data-stage="${id}" aria-pressed="${done}">${markBtnContent(done)}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="rm-wrap">
    <div class="rm-intro">
      <h2 class="rm-intro-title">De Cero a Junior Pentester</h2>
      <p class="rm-intro-sub">Ruta paso a paso · eJPTv2 · Powered by <strong>LionXSecurity</strong></p>
      <div class="rm-progress-block">
        <div class="rm-progress-track" id="rm-progress-track" role="progressbar" aria-label="Progreso del roadmap" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="rm-progress-fill" id="rm-progress-bar"></div>
        </div>
        <div class="rm-progress-label" id="rm-progress-label"></div>
      </div>
    </div>
    <div class="rm-timeline">
      <div class="rm-line" aria-hidden="true"></div>
      ${nodes}
    </div>
    <div class="rm-footer">
      <div class="rm-footer-icon">${ICONS.target}</div>
      <p>Durante la <strong>FASE 3</strong>, usa la pestaña <strong>HackTheBox</strong> de esta app y filtra por dificultad <strong>Fácil</strong> para practicar las máquinas recomendadas para el eJPT. Descuentos y tutorías 1-a-1 en <a class="rm-footer-link" href="https://lionxsecurity.es/" target="_blank" rel="noopener noreferrer">lionxsecurity.es</a>.</p>
    </div>
  </div>`;
}

// ============================================================
// App
// ============================================================
function mountTab(key) {
  const panel = document.getElementById(`panel-${key}`);
  if (!panel || panel.dataset.mounted) return;
  panel.dataset.mounted = '1';
  if (key === 'roadmap') {
    panel.innerHTML = renderRoadmap();
    updateRoadmapProgress();
  } else {
    panel.innerHTML = renderSheet(key);
    updateResults(key);
  }
  updateStats();
}

function renderApp() {
  const meta = { ...SHEETS, roadmap: { label: 'Roadmap', icon: 'route' } };
  const tabs = TAB_KEYS.map(k => {
    const on = k === activeTab;
    const badge = SHEETS[k] ? `<span class="nav-btn-badge" id="navbadge-${k}" hidden></span>` : '';
    return `<button type="button" class="tab-btn${on ? ' active' : ''}" id="navbtn-${k}" role="tab" data-action="tab" data-tab="${k}"
        aria-selected="${on}" aria-controls="panel-${k}" tabindex="${on ? 0 : -1}">${ICONS[meta[k].icon]}<span>${meta[k].label}</span>${badge}</button>`;
  }).join('');
  const panels = TAB_KEYS.map(k =>
    `<section class="tab-panel" id="panel-${k}" role="tabpanel" aria-labelledby="navbtn-${k}"${k === activeTab ? '' : ' hidden'}></section>`
  ).join('');

  document.getElementById('app').innerHTML = `
    <div class="header-wrap">
      <header class="header">
        <h1 class="logo">Hacking <span>Study Planner</span></h1>
        <div class="tabs-bar" role="tablist" aria-label="Secciones">${tabs}</div>
        <div class="header-stats" role="group" aria-label="Progreso global">
          <div class="stat-item stat-resolved" title="Máquinas resueltas">
            <span class="stat-icon">${ICONS.check}</span>
            <span class="stat-num"><span class="stat-ok" id="gs-resolved">0</span><span class="stat-of">/<span id="gs-total">0</span></span></span>
            <span class="stat-label">resueltas</span>
          </div>
          <div class="stat-item" title="Progreso global">
            <span class="stat-num" id="gs-pct">0%</span>
            <span class="stat-label">progreso</span>
          </div>
        </div>
      </header>
    </div>
    <main>${panels}</main>`;

  mountTab(activeTab);
  updateStats();
}

function switchTab(key, focus = false) {
  if (!TAB_KEYS.includes(key)) return;
  activeTab = key;
  document.querySelectorAll('.tab-btn[role="tab"]').forEach(b => {
    const on = b.dataset.tab === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== `panel-${key}`; });
  mountTab(key);
  try { history.replaceState(null, '', `#${key}`); } catch { /* file:// o sandbox */ }
  window.scrollTo(0, 0);
}

// ============================================================
// Eventos (delegados: no hay manejadores en linea, lo que permite una CSP estricta)
// ============================================================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, sheet } = el.dataset;
  switch (action) {
    case 'tab': switchTab(el.dataset.tab); break;
    case 'filter': setFilter(el); break;
    case 'toggle-filters': toggleFilters(sheet); break;
    case 'clear-filters': clearFilters(sheet); break;
    case 'resolve': toggleResolved(sheet, el.dataset.id); break;
    case 'rm-toggle': toggleRoadmapStage(el); break;
    case 'rm-mark': markRoadmapStage(el.dataset.stage); break;
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.dataset.action === 'search') setSearch(el.dataset.sheet, el.value);
});

// Teclado en la barra de pestañas (patron WAI-ARIA tabs)
document.addEventListener('keydown', e => {
  const tab = e.target.closest && e.target.closest('[role="tab"]');
  if (!tab) return;
  const i = TAB_KEYS.indexOf(tab.dataset.tab);
  let next = null;
  if (e.key === 'ArrowRight') next = TAB_KEYS[(i + 1) % TAB_KEYS.length];
  else if (e.key === 'ArrowLeft') next = TAB_KEYS[(i - 1 + TAB_KEYS.length) % TAB_KEYS.length];
  else if (e.key === 'Home') next = TAB_KEYS[0];
  else if (e.key === 'End') next = TAB_KEYS[TAB_KEYS.length - 1];
  if (!next) return;
  e.preventDefault();
  switchTab(next, true);
});

// Si una portada no carga, se oculta en vez de dejar un icono roto.
document.addEventListener('error', e => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains('rm-cover-img')) {
    const link = img.closest('.rm-cover');
    if (link) link.hidden = true;
  }
}, true);

window.addEventListener('hashchange', () => {
  const key = location.hash.slice(1);
  if (TAB_KEYS.includes(key) && key !== activeTab) switchTab(key);
});

// ── Volver arriba ──
(function () {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      btn.classList.toggle('visible', window.scrollY > 400);
      ticking = false;
    });
  }, { passive: true });
})();

// ============================================================
// Arranque
// ============================================================
function setSplashProgress(pct) {
  setWidth(document.getElementById('splash-bar'), pct);
}

function hideSplash() {
  const s = document.getElementById('splash');
  if (!s) return;
  s.classList.add('hidden');
  setTimeout(() => s.remove(), 450);
}

function prepareData(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.hackthebox)) throw new Error('la estructura de data.json no es válida');
  const isEJPT = c => certBase(c) === TARGET_CERT;
  const out = {};
  for (const k of SHEET_KEYS) {
    const list = Array.isArray(raw[k]) ? raw[k] : [];
    out[k] = list.filter(it =>
      isPlainObject(it) &&
      (typeof it.id === 'number' || typeof it.id === 'string') &&
      typeof it.nombre === 'string' && it.nombre.trim() &&
      Array.isArray(it.certificaciones) && it.certificaciones.some(isEJPT));
  }
  return out;
}

function showLoadError(err) {
  hideSplash();
  const app = document.getElementById('app');
  if (!app) return;
  const box = document.createElement('div');
  box.className = 'load-error';
  box.setAttribute('role', 'alert');
  const icon = document.createElement('div');
  icon.className = 'load-error-icon';
  icon.innerHTML = ICONS.alert;
  const title = document.createElement('h1');
  title.textContent = 'No se pudieron cargar los datos';
  const msg = document.createElement('p');
  if (location.protocol === 'file:') {
    msg.textContent = 'Los navegadores no permiten leer data.json cuando la página se abre como archivo local. ' +
      'Sírvela desde un servidor: en la carpeta del proyecto ejecuta «python3 -m http.server» y abre http://localhost:8000.';
  } else {
    msg.textContent = `Detalle: ${err && err.message ? err.message : err}.`;
  }
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-resolve';
  retry.textContent = 'Reintentar';
  retry.addEventListener('click', () => location.reload());
  box.append(icon, title, msg, retry);
  app.replaceChildren(box);
}

async function init() {
  setSplashProgress(20);
  try {
    const resp = await fetch('data.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`data.json respondió HTTP ${resp.status}`);
    setSplashProgress(60);
    DATA = prepareData(await resp.json());
  } catch (err) {
    showLoadError(err);
    return;
  }
  setSplashProgress(85);
  STATE = loadJSON(STORAGE_STATE);
  ROADMAP_PROGRESS = loadRoadmapProgress();
  const fromHash = location.hash.slice(1);
  if (TAB_KEYS.includes(fromHash)) activeTab = fromHash;
  setSplashProgress(100);
  renderApp();
  setTimeout(hideSplash, 150);
}

init();
