+# Fiestas Valladolid 2026

Agenda web independiente para las Fiestas y Ferias de Valladolid 2026, creada por vecinos voluntarios de [Aldea Pucela](https://aldeapucela.org/).

La aplicación publicada está disponible en [fiestas.aldeapucela.org](https://fiestas.aldeapucela.org/). Es una web estática con agenda por días, búsqueda, filtros, mapa, favoritos, planes personalizados, planes vecinales, calendario, compartición y soporte PWA.

![Agenda de Fiestas Valladolid 2026](docs/screenshots/01-agenda-desktop.png)

## Rutas generadas

El comando <code>npm run build</code> genera el sitio completo dentro de <code>dist/</code>. Esa carpeta es salida generada y no debe editarse a mano.

| Ruta | Contenido |
| --- | --- |
| <code>/</code> | Agenda principal por días y horas. |
| <code>/mapa/</code> | Mapa de actividades con coordenadas válidas. |
| <code>/e/&lt;id&gt;/&lt;slug&gt;/</code> | Ficha estática de cada actividad. El <code>id</code> numérico es estable y el <code>slug</code> se deriva del título. |
| <code>/plan/</code> | Favoritos y planes personalizados guardados en el navegador. |
| <code>/plan/importar/</code> | Importación de uno o varios planes <code>.fiestas-plan.json</code>. |
| <code>/planes/</code> | Catálogo público de planes vecinales. |
| <code>/planes/&lt;id&gt;/</code> | Página pública de cada plan del catálogo. |
| <code>/data/planes.json</code> | Catálogo validado de planes públicos. |
| <code>/sitemap.xml</code>, <code>/robots.txt</code> | Metadatos de rastreo. |

El sitemap incluye la agenda, el mapa, el catálogo de planes, las páginas individuales de los planes públicos y las fichas de actividades. <code>/plan/</code> y <code>/plan/importar/</code> son páginas locales y se publican con <code>noindex,follow</code>.

## Estructura del proyecto

~~~text
src/
  assets/                           Imágenes, iconos, favicon y manifest
  data/fiestas-2026/events.json    Fuente normalizada de actividades
  data/fiestas-2026/programa2026.md  Programa de referencia
  data/community-plans.json        Catálogo de planes públicos
  data/community-plans/            Archivos .fiestas-plan.json publicados
  pwa/                              Service worker y página offline
  scripts/                          Módulos ES del navegador
  styles/                           CSS base y estilos de Fiestas
  templates/                        Layouts, páginas y parciales Nunjucks
scripts/
  build.mjs                         Generador estático
  dev.mjs                           Build, watcher y servidor local
  enrich-event-locations.mjs        Auditoría y enriquecimiento de ubicaciones
  link-event-images.mjs             Enlazado opcional de imágenes desde eventos.aldeapucela.org
  capture-readme-screenshots.mjs     Capturas para esta documentación
tests/
  analytics.test.mjs                Prueba unitaria del módulo de analítica
docs/
  screenshots/                      Capturas enlazadas en este README
  matomo.md                         Configuración y taxonomía de Matomo
dist/                                Salida generada; no editar
~~~

## Requisitos

- Node.js 24, igual que en el workflow de GitHub Actions.
- npm.
- Google Chrome, solo para regenerar las capturas.
- cloudflared, solo si se quiere compartir temporalmente el servidor local.

## Instalación y comandos

~~~bash
npm install
~~~

| Comando | Uso |
| --- | --- |
| <code>npm run build</code> | Compila CSS, copia recursos, procesa datos y genera <code>dist/</code>. |
| <code>npm run dev</code> | Ejecuta un build, observa <code>src/</code> y sirve la web en <code>http://127.0.0.1:8002/</code>. |
| <code>npm test</code> | Ejecuta las pruebas de Node disponibles. |
| <code>npm run clean</code> | Elimina únicamente <code>dist/</code>. |
| <code>npm run locations:audit</code> | Audita ubicaciones localmente, sin red y sin modificar los datos. |
| <code>npm run images:link</code> | Consulta el sitio de Eventos y escribe las imágenes coincidentes en <code>events.json</code>. |
| <code>npm run screenshots</code> | Regenera las capturas del README usando Chrome. |

Para usar otro puerto:

~~~bash
PORT=8010 npm run dev
~~~

El servidor de desarrollo reconstruye la salida cuando cambia un archivo de <code>src/</code> y desactiva la caché HTTP. Para detenerlo, usa <code>Ctrl+C</code>.

## Build y despliegue

El build:

1. Limpia <code>dist/</code>.
2. Compila <code>src/styles/base.css</code> y <code>src/styles/fiestas-2026.css</code> con Tailwind, PostCSS y Autoprefixer.
3. Copia los módulos JavaScript, imágenes, iconos y demás recursos de <code>src/</code>.
4. Valida y normaliza <code>src/data/fiestas-2026/events.json</code>, incluyendo IDs, etiquetas, categorías, entradas, ubicaciones y coordenadas.
5. Genera la agenda, el mapa, las fichas de actividades y las páginas de planes.
6. Copia y valida el catálogo y los archivos de planes vecinales.
7. Genera manifest, service worker versionado, página offline, sitemap y robots.

El workflow [<code>.github/workflows/deploy-pages.yml</code>](.github/workflows/deploy-pages.yml) ejecuta <code>npm ci</code> y <code>npm run build</code> en cada push a <code>main</code> o <code>master</code>, y publica <code>dist/</code> mediante GitHub Pages.

Para probar el build y el service worker:

~~~bash
npm run build
node --check dist/sw.js
npm test
~~~

## Desarrollo con Cloudflare Tunnel

Con <code>npm run dev</code> activo:

~~~bash
cloudflared tunnel --url http://127.0.0.1:8002
~~~

El comando muestra una URL temporal de <code>trycloudflare.com</code>. La aplicación se sirve en la raíz de esa URL.

## Datos de actividades

La fuente que consume el build es:

~~~text
src/data/fiestas-2026/events.json
~~~

El programa original de referencia se conserva en <code>src/data/fiestas-2026/programa2026.md</code>, pero no se edita la salida generada para cambiar actividades.

Cada actividad debe tener un <code>id</code> entero positivo, único y estable. El build genera el slug a partir de <code>title</code> y crea una ruta como:

~~~text
/e/1/gira-de-verano-nintendo/
~~~

Campos principales:

- <code>id</code>: identificador numérico estable.
- <code>date</code>, <code>dateLabel</code>, <code>startTime</code>, <code>endTime</code>: fecha y horarios.
- <code>title</code>, <code>summary</code>, <code>description</code>: contenido visible y metadatos.
- <code>location</code>, <code>zone</code>: lugar y zona de texto.
- <code>type</code>, <code>tags</code>: categoría principal y etiquetas adicionales.
- <code>performances</code>, <code>organizers</code>, <code>collaborators</code>: listas opcionales para la ficha.
- <code>coordinates</code>: <code>{ "lat": number, "lng": number }</code> y metadatos opcionales de procedencia.
- <code>ticket</code>: estado, enlace y nota opcionales de entradas.
- <code>image</code>: imagen editorial opcional, local o remota.

Ejemplo mínimo:

~~~json
{
  "id": 1,
  "date": "2026-09-04",
  "dateLabel": "Viernes 4 de septiembre",
  "startTime": "12:00",
  "endTime": "16:00",
  "title": "GIRA DE VERANO NINTENDO",
  "location": "Paseo Central del Campo Grande junto a Colón",
  "zone": "Campo Grande",
  "type": "Otros",
  "tags": ["Otros"],
  "coordinates": {
    "lat": 41.6468,
    "lng": -4.7289,
    "source": "Manual"
  },
  "ticket": {
    "required": false,
    "status": "unknown",
    "label": "Entrada no indicada",
    "url": null,
    "note": "El programa no indica venta de entradas para este evento."
  }
}
~~~

Las coordenadas pueden incluir <code>source</code>, <code>osmType</code>, <code>osmId</code>, <code>query</code>, <code>accuracy</code> y <code>geocodedAt</code>. Si <code>lat</code> o <code>lng</code> no son números válidos, la actividad no aparece en el mapa.

El estado de entrada se normaliza en tres categorías: <code>Gratis</code>, <code>De pago</code> e <code>Inscripción</code>. Si existe <code>ticket.url</code>, la ficha lo muestra como enlace externo.

## Agenda y mapa

La agenda permite:

- seleccionar todos los días o un día concreto;
- buscar por título, lugar, zona, categoría, descripción, entradas, actuaciones y responsables;
- combinar filtros por zona, tipo y precio;
- mostrar solo actividades guardadas;
- compartir la agenda o añadir una actividad al calendario.

La vista de mapa usa Leaflet bajo demanda y muestra únicamente actividades con coordenadas válidas. Los marcadores respetan los filtros activos, enlazan a las fichas y permiten abrir indicaciones. También puede solicitar permiso para centrar el mapa en la ubicación actual del dispositivo.

![Agenda por día y hora](docs/screenshots/01-agenda-desktop.png)

![Filtro de búsqueda](docs/screenshots/02-filtro-busqueda.png)

![Filtro por tipo](docs/screenshots/03-filtro-tipos.png)

![Vista de mapa](docs/screenshots/05-mapa.png)

## Favoritos y planes

Los favoritos y planes personalizados son datos locales del navegador:

~~~text
localStorage["fiestasPucela:favorites"]
localStorage["fiestasPucela:plans"]
~~~

<code>/plan/</code> muestra los favoritos como <code>Guardados</code> y permite crear, renombrar, editar, eliminar, compartir y exportar planes. Los planes se pueden añadir al calendario y exportar como archivos <code>.fiestas-plan.json</code>.

El formato de exportación usa <code>schemaVersion: 1</code>, <code>festival: "valladolid-2026"</code> y una lista de planes con <code>name</code>, <code>icon</code> y <code>activityIds</code>. <code>/plan/importar/</code> acepta uno o varios planes, muestra una previsualización y descarta IDs de actividades que ya no existan.

![Vista de favoritos](docs/screenshots/04-favoritos.png)

## Planes vecinales públicos

El catálogo se mantiene en <code>src/data/community-plans.json</code> y actualmente incluye ocho planes. Cada entrada tiene un <code>id</code>, nombre, autor, icono y URL a un archivo <code>.fiestas-plan.json</code>:

~~~json
{
  "schemaVersion": 1,
  "festival": "valladolid-2026",
  "plans": [
    {
      "id": "cielo-y-estrellas",
      "name": "Cielo y estrellas",
      "author": "Aldea Pucela",
      "icon": "stars",
      "url": "/data/community-plans/cielo-y-estrellas.fiestas-plan.json"
    }
  ]
}
~~~

Los archivos locales se guardan en <code>src/data/community-plans/</code>. También se aceptan URLs HTTPS externas si permiten CORS. El build valida el catálogo y genera <code>/planes/&lt;id&gt;/</code> para cada entrada.

## Fichas de actividad

Cada ficha <code>/e/&lt;id&gt;/&lt;slug&gt;/</code> incluye, cuando existen:

- fecha, hora, lugar, zona o barrio y estado de entrada;
- etiquetas, descripción, actuaciones, organizadores y colaboradores;
- imagen editorial ampliable;
- mapa compacto, enlace a la vista general e indicaciones;
- guardar, compartir y añadir al calendario;
- actividades relacionadas.

El botón de volver usa el historial del mismo sitio cuando es posible; si la ficha se abre directamente, vuelve a <code>/</code>. La compartición usa Web Share API y, como alternativa, copia la URL canónica al portapapeles.

![Detalle de evento](docs/screenshots/06-detalle-evento.png)

Ejemplos de fichas con mapa, entradas y ausencia de coordenadas:

![Ficha con mapa](docs/screenshots/issue-2/event-detail-mobile-map.png)

![Ficha con varios tags y entrada de pago](docs/screenshots/issue-2/event-detail-mobile-paid-tags.png)

![Ficha sin coordenadas](docs/screenshots/issue-2/event-detail-mobile-no-coordinates.png)

## PWA, tema y suscripciones

La web incluye manifest, iconos instalables, service worker versionado y una página offline. La caché utiliza red primero para documentos HTML y datos dinámicos, y caché primero para recursos propios. Los favoritos y planes no se almacenan en la caché.

El tema claro/oscuro se guarda con la clave <code>aldeapucela_theme</code>. En navegadores compatibles, la instalación PWA aparece desde el menú <code>Más</code>; en Safari para iPhone/iPad se muestran instrucciones para usar <code>Compartir → Añadir a pantalla de inicio</code>.

El menú <code>Suscribirse</code> enlaza al calendario ICS y RSS de Aldea Pucela Eventos, además del boletín.

![Menú móvil](docs/screenshots/07-menu-movil.png)

![Filtros en móvil](docs/screenshots/08-filtros-movil.png)

![Tema oscuro](docs/screenshots/09-tema-oscuro.png)

## Analítica

La integración opcional de Matomo, su taxonomía y sus límites de privacidad están documentados en [docs/matomo.md](docs/matomo.md).

Variables disponibles durante el build:

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| <code>FIESTAS_ANALYTICS_ENABLED</code> | automático | <code>true</code> activa y <code>false</code> desactiva la analítica. En localhost queda desactivada por defecto. |
| <code>FIESTAS_MATOMO_URL</code> | <code>https://stats.aldeapucela.org/</code> | URL base de Matomo. |
| <code>FIESTAS_MATOMO_SITE_ID</code> | <code>29</code> | Site ID de Matomo. |

Para desarrollo local:

~~~bash
FIESTAS_ANALYTICS_ENABLED=false npm run dev
~~~

## Auditoría de ubicaciones

El comando recomendado para revisar actividades sin lugar, zona o coordenadas es:

~~~bash
npm run locations:audit
~~~

Por defecto ejecuta una auditoría local sin red y escribe informes en <code>.cache/fiestas/reports/</code>. La caché de geocodificación, si se usa Nominatim, está en <code>.cache/fiestas/nominatim-location-cache.json</code>; <code>.cache/</code> está ignorado por Git.

Modos disponibles:

~~~bash
# Auditoría local sin peticiones externas
node scripts/enrich-event-locations.mjs --dry-run

# Consultar Nominatim sin modificar events.json
node scripts/enrich-event-locations.mjs --dry-run --provider=nominatim

# Aplicar resultados con confianza suficiente
node scripts/enrich-event-locations.mjs --apply --provider=nominatim

# Revisar también actividades que ya tienen coordenadas
node scripts/enrich-event-locations.mjs --dry-run --provider=nominatim --repair
~~~

El script usa una cola secuencial, cachea consultas y no aplica automáticamente resultados ambiguos o de baja confianza.

## Capturas

Con la aplicación ejecutándose:

~~~bash
npm run screenshots
~~~

Por defecto usa <code>http://127.0.0.1:8002</code> y Chrome en <code>/Applications/Google Chrome.app/Contents/MacOS/Google Chrome</code>. Puedes cambiar ambos valores:

~~~bash
FIESTAS_BASE_URL=http://127.0.0.1:8010 npm run screenshots
CHROME_PATH="/ruta/a/Google Chrome" npm run screenshots
~~~

Las capturas específicas de fichas están en <code>docs/screenshots/issue-2/</code> y se pueden regenerar con Chrome y Playwright si hace falta.

## Política de URLs

Las rutas de Fiestas 2026 son locales a <code>https://fiestas.aldeapucela.org/</code>. Los enlaces al resto de Aldea Pucela Eventos deben usar la base absoluta:

~~~text
https://eventos.aldeapucela.org/
~~~

## Verificación manual

Antes de publicar:

1. Ejecuta <code>npm run build</code> y <code>npm test</code>.
2. Revisa la agenda, las fechas y la búsqueda.
3. Prueba filtros por zona, tipo, precio y guardados.
4. Cambia entre agenda y mapa; prueba una actividad con coordenadas y otra sin ellas.
5. Abre una ficha, guarda, comparte y añade la actividad al calendario.
6. Revisa <code>/plan/</code>, la exportación, <code>/plan/importar/</code> y un archivo inválido.
7. Revisa <code>/planes/</code> y al menos una página <code>/planes/&lt;id&gt;/</code>.
8. Comprueba menú y filtros en móvil.
9. Cambia entre tema claro y oscuro.
10. En DevTools → Application revisa manifest, service worker y fallback offline.

## Caché de CSS y JavaScript

El build calcula hashes cortos del CSS y JavaScript y publica copias versionadas, por ejemplo <code>fiestas-2026.&lt;hash&gt;.css</code> y <code>fiestas-2026.&lt;hash&gt;.js</code>. Las plantillas referencian automáticamente esas versiones. No hay que renombrar archivos ni incrementar versiones a mano: basta con ejecutar <code>npm run build</code> o <code>npm run dev</code>.

## Licencia

El contenido se publica bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). El código está disponible en [GitHub](https://github.com/aldeapucela/fiestas).
