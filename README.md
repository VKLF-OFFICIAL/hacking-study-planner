# Hacking Study Planner

[![Licencia: CC BY-NC-SA 4.0](https://img.shields.io/badge/Licencia-CC%20BY--NC--SA%204.0-0a7bbb.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)

Planner de estudio de ciberseguridad — Roadmap eJPT · LionXSecurity

Aplicación web estática para organizar la preparación de la certificación
**eJPT**. Muestra las máquinas de Hack The Box y VulnHub recomendadas para el
eJPT, cada una con su sistema operativo, dificultad, técnicas implicadas,
certificaciones para las que resulta relevante y un enlace a su resolución,
y un roadmap paso a paso «De Cero a Junior Pentester».

`data.json` reúne la base completa de la que sale esa selección: 531 máquinas
de Hack The Box, 18 retos, 58 máquinas de VulnHub y laboratorios de
PortSwigger. La app filtra las que llevan la etiqueta eJPT.

## Funciones

- **Filtros y orden:** búsqueda sin tildes y por varias palabras, filtros por
  estado, dificultad, sistema y certificación, y orden por dificultad, nombre o
  pendientes primero. Pulsar una técnica o certificación de cualquier tarjeta
  filtra por ella.
- **Progreso y notas:** marca máquinas como resueltas (con la fecha) y añade
  notas a cada una. Todo se guarda solo en el navegador (`localStorage`): no
  sale de tu equipo.
- **Copia de seguridad:** desde el pie de página puedes exportar el progreso a
  un archivo JSON e importarlo en otro navegador o dispositivo. Al importar se
  suma a lo que ya tengas, sin borrar nada.
- **Instalable y sin conexión:** es una PWA. Se puede instalar como app y,
  tras la primera visita, funciona sin conexión.

## Uso

Versión publicada: <https://vklf-official.github.io/hacking-study-planner/>

En local hace falta un servidor estático, porque los navegadores no dejan leer
`data.json` cuando la página se abre como archivo (`file://`). Desde la carpeta
del proyecto, cualquiera de estas dos opciones:

```sh
python3 -m http.server   # sin instalar nada
npm start                # con Node.js 22 o superior
```

y abre <http://localhost:8000>.

## Estructura

| Archivo      | Contenido                                                        |
|--------------|------------------------------------------------------------------|
| `index.html` | Esqueleto de la página y política de seguridad de contenido (CSP) |
| `styles.css` | Estilos y diseño responsive                                       |
| `app.js`     | Lógica de la aplicación y datos del roadmap                       |
| `data.json`  | Fichas de máquinas, retos y laboratorios                          |
| `sw.js`, `manifest.webmanifest`, `icons/` | Modo sin conexión e instalación como app |
| `scripts/`   | Validador de datos, comprobador de enlaces, servidor y generador de iconos |
| `tests/`     | Tests unitarios (`node:test`) y de extremo a extremo (Playwright) |

La página no carga nada de terceros salvo las portadas de los cursos del
roadmap (`lionxsecurity.es`); si no cargan, se ocultan. La CSP solo permite
scripts y estilos del propio sitio, y la app se niega a funcionar dentro de un
iframe (protección contra clickjacking, ya que GitHub Pages no permite enviar
esa cabecera).

## Desarrollo

Requiere Node.js 22 o superior.

```sh
npm install          # instala Playwright (solo para los tests)
npm run validate     # comprueba data.json
npm run fix-data     # corrige lo que es seguro corregir solo y vuelve a validar
npm test             # validación + tests unitarios + tests en los navegadores
```

Para los tests de navegador, la primera vez: `npx playwright install`.

**Antes de tocar `data.json`**, ejecuta `npm run validate`. Comprueba que no
haya fichas ni IP duplicadas, que las IP sean válidas, que los enlaces sean
`https`, que las certificaciones estén en la lista conocida y que el formato
sea el canónico. `npm run fix-data` normaliza espacios, alias de
certificaciones y formato, pero nunca inventa datos: una IP estropeada, por
ejemplo, la tienes que corregir tú.

### Automatizaciones (GitHub Actions)

- **CI** (cada PR y cada push a `main`): valida los datos, ejecuta los tests
  unitarios y prueba la app en Chromium, Firefox y WebKit (el motor de
  Safari), en escritorio y en móvil.
- **Enlaces** (cada lunes): comprueba los más de 500 enlaces. Si alguno está
  roto, abre o actualiza una incidencia con la etiqueta `enlaces-rotos`. En
  YouTube detecta también los vídeos eliminados, cuya página sigue
  respondiendo con normalidad. También se puede lanzar a mano desde la
  pestaña *Actions*.

## Licencia

Este proyecto se publica bajo
**[Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)**
(CC BY-NC-SA 4.0).

Esto significa que **puedes**:

- Usarlo, copiarlo y redistribuirlo.
- Modificarlo y mejorarlo, y publicar tu versión.

Siempre que:

- **Atribución** — cites a Jesús Yeste Ramírez como autor original y enlaces a
  este repositorio.
- **NoComercial** — no lo uses con fines comerciales. No puedes vender este
  contenido, cobrar por el acceso a él, ni incluirlo en ningún producto o
  servicio de pago. Esto se aplica igualmente a las versiones modificadas: si
  lo mejoras, tampoco puedes venderlo.
- **CompartirIgual** — si lo modificas, distribuyas tu versión bajo esta misma
  licencia, para que siga siendo libre para los demás.

El texto completo está en [`LICENSE`](LICENSE).

> GitHub solo detecta automáticamente 13 licencias y ninguna Creative Commons
> salvo CC0, así que en la barra lateral del repositorio aparece como
> «Other». Es normal y no afecta a su validez: la licencia que rige es la de
> `LICENSE`.

> **Nota:** una licencia NoComercial no cumple la definición de «código
> abierto» de la OSI. Es una decisión deliberada: el contenido debe seguir
> siendo gratuito para quien estudia.

## Contenido de terceros

Las descripciones de las máquinas proceden de Hack The Box y **no están
cubiertas por esta licencia**. Los enlaces a resoluciones apuntan al contenido
original de sus autores (**S4vitar**, **Hacking Articles**), que este
repositorio enlaza pero no reproduce.

Los detalles están en [`NOTICE.md`](NOTICE.md). Léelo antes de reutilizar el
proyecto.

## Aviso

Material de estudio para laboratorios de práctica autorizados. No está
destinado a facilitar el acceso no autorizado a sistemas de terceros.
