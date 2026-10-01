# Hacking Study Planner

[![Licencia: CC BY-NC-SA 4.0](https://img.shields.io/badge/Licencia-CC%20BY--NC--SA%204.0-0a7bbb.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)

Planner de estudio de ciberseguridad — Roadmap eJPT · LionXSecurity

Aplicación web estática para organizar la preparación de la certificación
**eJPT**. Muestra las máquinas de Hack The Box y VulnHub recomendadas para el
eJPT, cada una con su sistema operativo, dificultad, técnicas implicadas,
certificaciones para las que resulta relevante y un enlace a su resolución,
y un roadmap paso a paso «De Cero a Junior Pentester».

`data.json` reúne la base completa de la que sale esa selección: 532 máquinas
de Hack The Box, 18 retos, 58 máquinas de VulnHub y laboratorios de
PortSwigger. La app filtra las que llevan la etiqueta eJPT.

El progreso (máquinas resueltas y etapas del roadmap) se guarda solo en el
navegador, con `localStorage`: no sale de tu equipo ni se comparte entre
dispositivos.

## Uso

Versión publicada: <https://vklf-official.github.io/hacking-study-planner/>

En local hace falta un servidor estático, porque los navegadores no dejan leer
`data.json` cuando la página se abre como archivo (`file://`). Desde la carpeta
del proyecto:

```sh
python3 -m http.server
```

y abre <http://localhost:8000>.

## Estructura

| Archivo      | Contenido                                                        |
|--------------|------------------------------------------------------------------|
| `index.html` | Esqueleto de la página y política de seguridad de contenido (CSP) |
| `styles.css` | Estilos y diseño responsive                                       |
| `app.js`     | Lógica de la aplicación y datos del roadmap                       |
| `data.json`  | Fichas de máquinas, retos y laboratorios                          |

La página no carga nada de terceros salvo las portadas de los cursos del
roadmap (`lionxsecurity.es`); si no cargan, se ocultan. La CSP solo permite
scripts y estilos del propio sitio.

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
