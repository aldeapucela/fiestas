# Fiestas Valladolid 2026

Repositorio independiente para publicar la agenda de Fiestas Valladolid 2026 dentro de Aldea Pucela Eventos.

La salida generada es una web estatica para `https://fiestas.aldeapucela.org/`, con listado interactivo, filtros, favoritos en navegador, mapa y paginas de detalle por evento.

![Agenda de Fiestas Valladolid 2026](docs/screenshots/01-agenda-desktop.png)

## Que Genera

El build crea el contenido en `dist/`. Esa carpeta es salida generada y no debe editarse a mano.

- `/`: agenda principal.
- `/e/<id>/`: detalle de cada evento.
- `/assets/css/fiestas-2026.css`: estilos compilados con Tailwind, PostCSS y Autoprefixer.
- `/assets/js/fiestas-2026.js`: comportamiento de agenda, mapa, filtros y favoritos.
- `/assets/js/menu-drawer.js`, `/assets/js/subscribe.js`, `/assets/js/theme.js`: modulos compartidos de UI.
- `/sitemap.xml` y `/robots.txt`: metadatos de rastreo.

## Estructura

```text
src/
  data/fiestas-2026/events.json     Datos fuente de los eventos
  scripts/                          Modulos ES para el navegador
  styles/                           CSS base y CSS especifico de fiestas
  templates/                        Layouts, paginas y parciales Nunjucks
scripts/
  build.mjs                         Generador estatico
  dev.mjs                           Build + servidor local
  capture-readme-screenshots.mjs    Capturas para esta documentacion
dist/                               Salida generada
docs/screenshots/                   Capturas enlazadas en el README
```

## Requisitos

- Node.js 24 o compatible con ES modules.
- npm.
- Google Chrome, solo para regenerar capturas.
- `cloudflared`, solo si se quiere exponer el servidor local con Cloudflare Tunnel.

## Instalacion

```bash
npm install
```

## Desarrollo Local

```bash
npm run dev
```

El comando hace un build inicial y sirve `dist/` en:

```text
http://127.0.0.1:8002/
```

Si necesitas otro puerto:

```bash
PORT=8010 npm run dev
```

## Build

```bash
npm run build
```

El build:

1. Limpia `dist/`.
2. Compila `src/styles/base.css` y `src/styles/fiestas-2026.css`.
3. Copia los modulos JS de `src/scripts/`.
4. Lee `src/data/fiestas-2026/events.json`.
5. Normaliza, ordena y enriquece cada evento con icono, URL local y enlaces de mapa.
6. Renderiza la agenda y una pagina de detalle por evento con Nunjucks.
7. Escribe `sitemap.xml` y `robots.txt`.

Para limpiar solo la salida generada:

```bash
npm run clean
```

## Exponer Con Cloudflare

Con el servidor local activo:

```bash
cloudflared tunnel --url http://127.0.0.1:8002
```

Cloudflare devolvera una URL publica temporal de `trycloudflare.com`. La app queda disponible en la raiz del subdominio temporal, por ejemplo:

```text
https://<subdominio>.trycloudflare.com/
```

## Datos De Eventos

La fuente unica de eventos esta en:

```text
src/data/fiestas-2026/events.json
```

Cada evento debe tener un `id` lowercase y seguro para URL. Ese `id` se usa en la ruta:

```text
/e/<id>/
```

Campos principales:

- `id`: identificador estable y URL-safe.
- `date`, `dateLabel`, `startTime`, `endTime`: fecha y horarios.
- `title`, `summary`, `description`: textos visibles y metadatos.
- `location`, `zone`: ubicacion textual.
- `type`: categoria principal usada por el icono y como primera etiqueta.
- `tags`: etiquetas opcionales para eventos que encajan en mas de una categoria. Si no se indica, se usa `[type]`.
- `performances`, `organizers`, `collaborators`: listas opcionales para la ficha.
- `coordinates`: `{ "lat": number, "lng": number }` para mapa.
- `ticket`: informacion opcional de entradas.

## Agenda

La pantalla principal agrupa los eventos por dia y hora. Al cargar, el script selecciona el evento actual si coincide con la fecha/hora del navegador; si no, salta al siguiente evento futuro y mantiene activo el chip de fecha correspondiente.

![Agenda por dia y hora](docs/screenshots/01-agenda-desktop.png)

## Busqueda

El buscador filtra en cliente por texto normalizado. Busca en titulo, lugar, zona, tipo, descripcion, resumen, entradas, actuaciones, organizadores, colaboradores y etiqueta de fecha.

![Filtro de busqueda](docs/screenshots/02-filtro-busqueda.png)

## Filtros Por Tipo

El menu de tipos se genera a partir de `tags` y, si no existen, de `type`. Permite combinar varios tipos y actualiza la etiqueta del boton con el tipo elegido o con el numero de tipos activos.

![Filtro por tipo](docs/screenshots/03-filtro-tipos.png)

## Favoritos

Cada tarjeta tiene un boton de guardado. Los favoritos se almacenan en `localStorage` con la clave `fiestasPucela:favorites`, por lo que son locales al navegador del usuario. El boton `Favoritos` limita la agenda a los eventos guardados.

![Vista de favoritos](docs/screenshots/04-favoritos.png)

## Mapa

La vista `Mapa` carga Leaflet bajo demanda y solo pinta eventos con `coordinates`. Los marcadores se ajustan a los eventos filtrados y el popup enlaza con la ficha del evento.

![Vista de mapa](docs/screenshots/05-mapa.png)

## Detalle De Evento

Cada evento genera una ficha estatica con informacion, entradas si existen, actuaciones, organizacion, colaboradores y mapa si el evento tiene coordenadas. Los enlaces `Abrir mapa` y `Como llegar` salen a OpenStreetMap y Google Maps.

![Detalle de evento](docs/screenshots/06-detalle-evento.png)

## Movil

En pantallas pequenas, la navegacion principal pasa a un drawer lateral. Los filtros se pliegan detras del boton `Filtros` para mantener visible la agenda.

![Menu movil](docs/screenshots/07-menu-movil.png)

![Filtros en movil](docs/screenshots/08-filtros-movil.png)

## Tema

El tema claro/oscuro se controla desde `src/scripts/theme.js` y se guarda en `localStorage` con la clave `aldeapucela_theme`. El layout aplica el tema pronto para evitar parpadeos al cargar.

![Tema oscuro](docs/screenshots/09-tema-oscuro.png)

## Capturas

Las capturas del README se regeneran con:

```bash
npm run screenshots
```

Antes de ejecutarlo, levanta la app:

```bash
npm run dev
```

Por defecto el script captura `http://127.0.0.1:8002`. Puedes cambiar la base:

```bash
FIESTAS_BASE_URL=http://127.0.0.1:8010 npm run screenshots
```

Si Chrome esta en otra ruta:

```bash
CHROME_PATH="/ruta/a/Google Chrome" npm run screenshots
```

## Politica De URLs

Las rutas de Fiestas 2026 se publican en la raiz de `https://fiestas.aldeapucela.org/`. Los enlaces al resto de Aldea Pucela Eventos deben ser absolutos con base:

```text
https://eventos.aldeapucela.org/
```

## Verificacion Manual

Antes de publicar:

1. Ejecuta `npm run build`.
2. Revisa la agenda principal.
3. Prueba busqueda, filtro por tipo, favoritos y limpiar filtros.
4. Cambia entre agenda y mapa.
5. Abre una ficha de evento con coordenadas.
6. Revisa el drawer y los filtros en movil.
7. Cambia entre tema claro y oscuro.
