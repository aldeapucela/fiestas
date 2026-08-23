# Desarrollo local

Esta guía explica cómo ejecutar y validar Fiestas Valladolid 2026 en local. La documentación general del producto está en [README.md](../README.md).

## Requisitos

- Node.js 24.
- npm.
- Un navegador moderno para comprobar la aplicación.
- <code>cloudflared</code>, solo si se quiere compartir el servidor local mediante una URL temporal.

## Instalación

Desde la raíz del repositorio:

~~~bash
npm ci
~~~

<code>npm ci</code> instala exactamente las versiones fijadas en <code>package-lock.json</code>. Si estás desarrollando una actualización deliberada de dependencias, usa <code>npm install</code> y revisa después los cambios del lockfile.

## Servidor de desarrollo

~~~bash
npm run dev
~~~

El comando:

1. genera el sitio en <code>dist/</code>;
2. inicia un servidor HTTP local;
3. observa <code>src/</code>;
4. vuelve a generar el sitio cuando cambia un archivo.

La aplicación queda disponible en:

~~~text
http://127.0.0.1:8002/
~~~

Para usar otro puerto:

~~~bash
PORT=8010 npm run dev
~~~

El servidor de desarrollo envía <code>Cache-Control: no-store</code>, por lo que los cambios se pueden comprobar sin limpiar la caché del navegador. Detén el proceso con <code>Ctrl+C</code>.

Para desactivar explícitamente la analítica durante el desarrollo:

~~~bash
FIESTAS_ANALYTICS_ENABLED=false npm run dev
~~~

## Build manual

Para generar únicamente la salida estática:

~~~bash
npm run build
~~~

El resultado se escribe en <code>dist/</code>. El build elimina primero esa carpeta, procesa las plantillas y los estilos, copia los recursos, valida los datos y genera las rutas de agenda, mapa, fichas y planes.

Para eliminar la salida generada:

~~~bash
npm run clean
~~~

No edites <code>dist/</code> directamente. Los cambios deben hacerse en <code>src/</code>, <code>scripts/</code> o los archivos de configuración del proyecto.

## Pruebas

Ejecuta las pruebas automatizadas con:

~~~bash
npm test
~~~

También puedes comprobar que el service worker generado tiene sintaxis JavaScript válida:

~~~bash
node --check dist/sw.js
~~~

Antes de publicar, revisa al menos la agenda, filtros, mapa, una ficha con coordenadas, una ficha sin coordenadas, favoritos, planes, importación, tema claro/oscuro y la instalación PWA.

## Datos de actividades

La fuente principal es:

~~~text
src/data/fiestas-2026/events.json
~~~

El programa de referencia está en:

~~~text
src/data/fiestas-2026/programa2026.md
~~~

Cada actividad necesita un ID entero positivo, único y estable. El build deriva el slug del título y crea rutas del tipo:

~~~text
/e/<id>/<slug>/
~~~

Los planes públicos se mantienen en:

~~~text
src/data/community-plans.json
src/data/community-plans/
~~~

## Auditoría de ubicaciones

La auditoría local no hace peticiones externas ni modifica los datos:

~~~bash
npm run locations:audit
~~~

Para consultar Nominatim sin aplicar cambios:

~~~bash
node scripts/enrich-event-locations.mjs --dry-run --provider=nominatim
~~~

Para aplicar resultados con confianza suficiente:

~~~bash
node scripts/enrich-event-locations.mjs --apply --provider=nominatim
~~~

Para revisar también actividades que ya tienen coordenadas:

~~~bash
node scripts/enrich-event-locations.mjs --dry-run --provider=nominatim --repair
~~~

Los informes y la caché se guardan en <code>.cache/fiestas/</code>, una carpeta ignorada por Git.

## Enlazado de imágenes

El script compara actividades locales con las fichas públicas de Eventos de Aldea Pucela y puede escribir las imágenes coincidentes en <code>events.json</code>:

~~~bash
npm run images:link
~~~

Es una operación que modifica el archivo de datos. Revisa el diff antes de conservar sus resultados.

## Compartir temporalmente el servidor

Con <code>npm run dev</code> activo:

~~~bash
cloudflared tunnel --url http://127.0.0.1:8002
~~~

Cloudflare mostrará una URL temporal de <code>trycloudflare.com</code>. No es un despliegue permanente.

## Flujo recomendado

~~~bash
npm ci
npm test
npm run build
npm run dev
~~~

Después de modificar código o datos:

1. comprueba el comportamiento en el navegador;
2. ejecuta <code>npm test</code>;
3. vuelve a ejecutar <code>npm run build</code>;
4. revisa <code>git diff</code> y <code>git status</code>;
5. no incluyas <code>dist/</code>, <code>.cache/</code> ni archivos temporales en el commit.

## Configuración de analítica

El build admite estas variables:

| Variable | Uso |
| --- | --- |
| <code>FIESTAS_ANALYTICS_ENABLED</code> | <code>true</code> activa la analítica y <code>false</code> la desactiva. |
| <code>FIESTAS_MATOMO_URL</code> | Cambia la URL base de Matomo. |
| <code>FIESTAS_MATOMO_SITE_ID</code> | Cambia el site ID de Matomo. |

La taxonomía y los límites de privacidad están en [docs/matomo.md](matomo.md).
