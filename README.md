# Fiestas Valladolid 2026

[Fiestas Valladolid 2026](https://fiestas.aldeapucela.org/) es la agenda web de las Fiestas y Ferias de Valladolid, creada por vecinos voluntarios de [Aldea Pucela](https://aldeapucela.org/).

La web de producción concentra el programa en una experiencia sencilla para consultar qué ocurre cada día, dónde, cómo llegar y qué actividades merece la pena guardar.

## Vista rápida en móvil

Las tres pantallas principales de la aplicación:

<table>
  <tr>
    <td align="center" valign="top"><strong>Agenda</strong><br><img src="docs/screenshots/mobile-agenda-2026.jpg" alt="Agenda de Fiestas Valladolid 2026 en móvil" width="220"></td>
    <td align="center" valign="top"><strong>Mapa</strong><br><img src="docs/screenshots/mobile-map-2026.jpg" alt="Mapa de Fiestas Valladolid 2026 en móvil" width="220"></td>
    <td align="center" valign="top"><strong>Plan vecinal</strong><br><img src="docs/screenshots/mobile-community-plan-2026.jpg" alt="Plan vecinal Cielo y estrellas en móvil" width="220"></td>
  </tr>
</table>

## La aplicación

La aplicación permite:

- consultar la agenda por días y horarios;
- buscar actividades por texto;
- filtrar por tipo, zona, precio y actividades guardadas;
- cambiar entre agenda y mapa;
- abrir una ficha completa de cada actividad;
- consultar ubicación, coordenadas, entradas, organizadores y descripción;
- abrir indicaciones y añadir actividades al calendario;
- guardar favoritos y organizar planes personalizados;
- exportar, compartir e importar planes;
- explorar planes públicos preparados por la comunidad;
- compartir actividades y la agenda;
- instalar la web como PWA y consultar contenido visitado sin conexión;
- cambiar entre tema claro y oscuro;
- suscribirse al calendario y al RSS de Aldea Pucela Eventos como integración externa.

Los favoritos y planes personales se guardan localmente en el navegador. No requieren cuenta y no se sincronizan con un servidor.

## Web de producción

La web se publica en:

~~~text
https://fiestas.aldeapucela.org/
~~~

Sus principales rutas son:

| Ruta | Uso |
| --- | --- |
| <code>/</code> | Agenda principal. |
| <code>/mapa/</code> | Mapa de actividades con coordenadas. |
| <code>/e/&lt;id&gt;/&lt;slug&gt;/</code> | Ficha permanente de una actividad. |
| <code>/plan/</code> | Favoritos y planes personales del navegador. |
| <code>/plan/importar/</code> | Importación de planes compartidos. |
| <code>/planes/</code> | Planes públicos de la comunidad. |
| <code>/planes/&lt;id&gt;/</code> | Ficha de un plan público. |

La producción es una web estática: el contenido se genera en <code>dist/</code> y se publica mediante GitHub Pages. El workflow de [deploy-pages.yml](.github/workflows/deploy-pages.yml) construye el sitio en cada push a <code>main</code> o <code>master</code>.

Las rutas de Fiestas viven en la raíz de su propio dominio. Los enlaces al resto de Aldea Pucela Eventos deben usar URLs absolutas con base en:

~~~text
https://eventos.aldeapucela.org/
~~~

La app conserva integraciones externas aprobadas con Aldea Pucela Eventos: calendario/RSS globales, boletín, enlaces de comunidad del menú y Font Awesome servido desde `eventos.aldeapucela.org` para aprovechar caché compartida.

## Estructura técnica

El proyecto separa los datos, la generación de páginas y el comportamiento del navegador:

| Parte | Responsabilidad |
| --- | --- |
| <code>src/data/</code> | Programa de actividades y catálogo de planes públicos. |
| <code>src/templates/</code> | Plantillas Nunjucks para agenda, mapa, fichas y planes. |
| <code>src/styles/</code> | CSS de la aplicación, procesado con Tailwind, PostCSS y Autoprefixer. |
| <code>src/scripts/</code> | Módulos ES del navegador: agenda, filtros, mapa, favoritos, planes, PWA, tema y analítica. |
| <code>src/assets/</code> | Imágenes, iconos, manifest y recursos editoriales. |
| <code>src/pwa/</code> | Service worker y página offline. |
| <code>scripts/build.mjs</code> | Generador estático que valida datos y escribe <code>dist/</code>. |
| <code>scripts/dev.mjs</code> | Servidor local con build inicial y reconstrucción al cambiar <code>src/</code>. |
| <code>tests/</code> | Pruebas automatizadas del código JavaScript. |

El navegador recibe HTML ya generado y módulos JavaScript que añaden la interacción. El mapa carga Leaflet bajo demanda. Los recursos propios de CSS y JavaScript se publican con versiones derivadas de su contenido para evitar problemas de caché.

La fuente principal de actividades es:

~~~text
src/data/fiestas-2026/events.json
~~~

Cada actividad tiene un ID numérico estable. El build genera su slug, su URL, sus metadatos sociales y, cuando hay coordenadas, sus enlaces de mapa. Los planes públicos se definen en <code>src/data/community-plans.json</code> y sus archivos se guardan en <code>src/data/community-plans/</code>.

## Importación incremental desde Eventos

El script <code>scripts/import-eventos-ferias.mjs</code> consulta <code>https://eventos.aldeapucela.org/site-data.json</code> y procesa únicamente actividades que empiezan entre el 4 y el 13 de septiembre de 2026 en Valladolid. Detecta coincidencias con el catálogo local, enriquece las fichas y añade solo las actividades nuevas; también incorpora carteles remotos cuando faltan y geocodifica los lugares con Nominatim.

La ejecución por defecto es una simulación y deja el informe en <code>.cache/fiestas/reports/</code>:

~~~bash
npm run events:import:ferias
~~~

Para aplicar los cambios:

~~~bash
npm run events:import:ferias -- --apply
npm run build
~~~

Las ubicaciones que no se pueden resolver de forma segura no se importan automáticamente: quedan anotadas como <code>unresolved</code> en el informe para revisión manual. El script es incremental e idempotente, por lo que repetirlo no duplica actividades ya importadas.

## Desarrollo local

La instalación, el servidor local, las pruebas, el build, la auditoría de ubicaciones y las opciones de configuración están documentados en:

[Guía de desarrollo local](docs/local-development.md)

## Licencia

El código fuente se publica bajo [GNU AGPL versión 3.0](https://www.gnu.org/licenses/agpl-3.0.html); consulta el archivo [LICENSE](LICENSE).

El contenido se publica bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es); consulta [LICENSE-CONTENT](LICENSE-CONTENT).

El código está disponible en [GitHub](https://github.com/aldeapucela/fiestas).
