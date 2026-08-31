# Analítica con Matomo

La aplicación usa un tracker Matomo centralizado en `https://stats.aldeapucela.org/` con site ID `29`. El módulo local se carga de forma asíncrona desde `assets/js/analytics.js`, desactiva cookies y registra una única vista de página por documento.

## Configuración

El build acepta estas variables:

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `FIESTAS_ANALYTICS_ENABLED` | automático | `true` fuerza la activación y `false` la desactiva. Sin valor, localhost queda desactivado y el dominio publicado queda activado. |
| `FIESTAS_MATOMO_URL` | `https://stats.aldeapucela.org/` | URL base del tracker. |
| `FIESTAS_MATOMO_SITE_ID` | `29` | Site ID de Matomo. |

Para desarrollo local:

```bash
FIESTAS_ANALYTICS_ENABLED=false npm run dev
```

Para una compilación habilitada:

```bash
FIESTAS_ANALYTICS_ENABLED=true npm run build
```

Un fallo o una indisponibilidad de Matomo no impide cargar la agenda, guardar actividades, compartir ni utilizar el mapa. También se omite la inicialización cuando el navegador comunica `doNotTrack`.

## Taxonomía de eventos

Los identificadores de actividad son sus `id` numéricos y estables. Los valores de filtros y enlaces se normalizan a tokens controlados.

| Categoría | Acción | Nombre / valor | Cuándo |
| --- | --- | --- | --- |
| `activity` | `view_detail` | `activityId` | Al cargar una ficha. |
| `activity` | `save` | `activityId` | La primera vez que ese navegador guarda un favorito; se deduplica con `localStorage`. |
| `activity` | `remove_save` | `activityId` | Al eliminar un favorito; no afecta al ranking de guardados. |
| `caseta` | `save` | `casetaId` normalizado (`z1_05`) | La primera vez que ese navegador guarda una caseta; se deduplica de forma independiente. |
| `caseta` | `remove_save` | `casetaId` normalizado (`z1_05`) | Al eliminar una caseta de favoritas. |
| `caseta` | `open_qr` | `casetaId` normalizado (`z1_05`) | Al abrir el cartel QR desde la ficha de una caseta. |
| `caseta` | `download_qr` | `casetaId` normalizado (`z1_05`) | Al pulsar cualquiera de los botones que descargan el cartel QR como imagen. |
| `caseta_dish` | `like` | `casetaId_dishId` normalizado (`z2_07_pincho_brocheta_pollo`) | La primera vez que ese navegador recomienda un plato; se deduplica de forma independiente. |
| `caseta_dish` | `remove_like` | `casetaId_dishId` normalizado (`z2_07_pincho_brocheta_pollo`) | Retirada de una recomendación local; se registra para análisis futuro, pero no se resta del contador público. |
| `activity` | `share` | `activityId` | Después de compartir o copiar correctamente. |
| `activity` | `open_directions` | `activityId` | Al abrir Cómo llegar. |
| `activity` | `open_tickets` | `activityId` | Al abrir el enlace de entradas. |
| `activity` | `open_external_link` | `location` u otro tipo controlado | Al abrir otros enlaces externos relevantes. |
| `agenda` | `select_date` | `YYYY-MM-DD` | Al seleccionar un día. |
| `agenda` | `select_all_dates` | `all` | Al seleccionar todos los días. |
| `agenda` | `apply_filter` | nombre: `type`, `area` o `ticket`; valor controlado | Al aplicar o quitar un filtro. |
| `agenda` | `search` | `with_results` o `without_results`; valor: recuento | Al confirmar una búsqueda, no por pulsación. |
| `agenda` | `open_activity` | `activityId` | Al abrir una ficha desde la agenda. |
| `map` | `open` | `map` | Al entrar en el mapa principal o en un mapa de ficha. |
| `map` | `select_marker` | `activityId` | Al seleccionar un marcador. |
| `map` | `select_date` / `select_all_dates` | fecha o `all` | Al cambiar la fecha dentro del mapa. |
| `map` | `apply_filter` | nombre y valor controlados | Al aplicar filtros desde el mapa. |
| `plan` | `add_community` | `communityPlanId` | La primera vez que ese navegador añade cada plan vecinal; se deduplica con `localStorage`. |
| `pwa` | `install_available` | `install` | Cuando el navegador ofrece la instalación PWA. |
| `pwa` | `install_accepted` | `install`; valor: `agenda_cta` o `menu` | Cuando la persona acepta el diálogo de instalación desde la tarjeta intercalada o el menú lateral. |
| `pwa` | `installed` | `install`; valor: `agenda_cta` o `menu` | Cuando el navegador confirma la instalación con `appinstalled`, conservando el origen de la solicitud. |
| `pwa` | `install_cancelled` | `install`; valor: `agenda_cta` o `menu` | Cuando se cancela el diálogo de instalación desde cualquiera de los dos accesos. |
| `pwa` | `ios_help_opened` | `ios` | Al abrir las instrucciones de instalación en iPhone/iPad. |

Los pageviews se envían mediante `trackPageView` durante la única inicialización del tracker. `enableLinkTracking` cubre enlaces simples, pero las acciones relevantes anteriores se registran explícitamente.

## Privacidad y límites

- No se envía el texto de búsqueda; solo si tuvo resultados y cuántos.
- No se envían latitud, longitud, dirección exacta ni permisos de ubicación.
- No se envían nombres, correos, teléfonos, nombres personalizados de planes ni identificadores de usuario.
- Sin cuentas, las métricas representan visitas/dispositivos y acciones observadas, no personas identificadas de forma exacta.
- Los eventos `activity / save` se cuentan una sola vez por actividad y navegador mediante `fiestasPucela:analytics:saved-activities` en `localStorage`. Si la persona borra los datos del sitio, usa otro navegador/dispositivo o tiene bloqueado `localStorage`, no se puede garantizar la deduplicación entre sesiones.
- Los eventos `caseta / save` se cuentan una sola vez por caseta y navegador mediante `fiestasPucela:analytics:saved-casetas` en `localStorage`. El ID local `z1-05` se envía a Matomo como el token `z1_05`; el endpoint lo devuelve de nuevo como `z1-05`. Las retiradas (`caseta / remove_save`) se registran aparte y no se restan del contador acumulado.
- Los eventos `caseta / open_qr` y `caseta / download_qr` usan el mismo ID técnico normalizado (`z1-05` local se envía como `z1_05`). Se registran por interacción; no se deduplican porque representan aperturas y descargas, no una señal acumulable de favorito. `download_qr` cubre el botón del lightbox y el botón de la página QR individual.
- Los eventos `caseta_dish / like` se cuentan una sola vez por plato y navegador mediante `fiestasPucela:analytics:liked-caseta-dishes` en `localStorage`. La interfaz permite retirar y volver a poner la reacción; cada retirada genera `caseta_dish / remove_like`, pero el endpoint público solo agrega `like`. El estado de la reacción se conserva aparte en `fiestasPucela:liked-caseta-dishes`. La clave local `z2-07/pincho-brocheta-pollo` se envía a Matomo como `z2_07_pincho_brocheta_pollo`.
- Los IDs de plato son estables y no dependen del texto visible. Cambiar el nombre, precio, sección o clasificación dietética conserva el histórico; un plato realmente nuevo debe recibir otro ID. Si se elimina del catálogo, el histórico sigue en Matomo pero deja de mostrarse en la web.
- Los eventos `plan / add_community` se cuentan una sola vez por plan vecinal y navegador mediante `fiestasPucela:analytics:added-community-plans` en `localStorage`. Si la persona borra los datos del sitio, usa otro navegador/dispositivo o tiene bloqueado `localStorage`, el evento puede volver a registrarse.
- Para los contadores públicos de guardados y recomendaciones se usa `nb_uniq_visitors` del periodo anual 2026, no `nb_events`, `nb_visits` ni la suma de únicos diarios. Así cada visitante identificado por Matomo cuenta una vez por actividad, plan, caseta o plato durante todo el año. No se envía una IP ni un identificador de usuario propio.
- Los totales públicos de actividades populares, planes vecinales, favoritas de casetas y pinchos populares son la suma de visitantes únicos por elemento. Una misma persona puede contar una vez en varios elementos distintos.
- Para el embudo PWA, usa `nb_visits` de `pwa / install_available`, `install_accepted`, `installed` e `ios_help_opened`; `nb_events` mide repeticiones, no personas. Los eventos de instalación aceptada, completada o cancelada incluyen el origen (`agenda_cta` o `menu`) como valor de Matomo. En iOS solo podemos medir la apertura de instrucciones, no confirmar técnicamente que se añadió a la pantalla de inicio.
- La instancia de Matomo debe mantener activada la anonimización de IP y sus controles de privacidad deben revisarse en servidor.
- Este repositorio no contiene mecanismo de consentimiento de cookies; si se incorpora en el futuro, la inicialización debe conectarse a él.
- La versión actual no tiene geolocalización, botón de centrar en el usuario ni panel inferior del mapa; por eso no se generan esos eventos todavía.

Para revisar los datos, consultar en Matomo el site ID 29 y filtrar por categoría y acción según la tabla anterior.

## Endpoint público de casetas

El recuento de visitantes únicos de guardados de casetas se consulta mediante `GET https://api.aldeapucela.org/fiestas/caseta-saves`. El endpoint representa el periodo anual completo de Fiestas 2026 y no acepta rangos personalizados mediante `from` o `to`.

La respuesta contiene únicamente casetas con al menos un `save`:

```json
{
  "ok": true,
  "siteId": 29,
  "event": { "category": "caseta", "action": "save" },
  "period": "year",
  "year": 2026,
  "from": "2026-01-01",
  "to": "2026-12-31",
  "casetas": [{ "id": "z1-05", "saveCount": 3 }],
  "totalSaves": 3,
  "metric": "unique_visitors_year",
  "generatedAt": "2026-08-26T00:00:00.000Z"
}
```

El endpoint cuenta visitantes únicos de guardado, no favoritas actuales exactas: la aplicación no identifica de forma persistente a cada navegador y las retiradas no se descuentan. Un borrado de cookies o un navegador/dispositivo diferente puede generar otra identidad en Matomo. Nginx publica el webhook de n8n con CORS, limitación de lectura y caché de 15 minutos; Matomo permanece únicamente en el servidor.

## Endpoint público de recomendaciones de platos

Las recomendaciones de platos se consultan mediante `GET https://api.aldeapucela.org/fiestas/caseta-dish-likes`. El endpoint representa el periodo anual completo de Fiestas 2026 y no acepta rangos personalizados mediante `from` o `to`.

La respuesta contiene los platos con al menos una recomendación:

```json
{
  "ok": true,
  "siteId": 29,
  "event": { "category": "caseta_dish", "action": "like" },
  "period": "year",
  "year": 2026,
  "from": "2026-01-01",
  "to": "2026-12-31",
  "dishes": [
    { "casetaId": "z2-07", "dishId": "pincho-brocheta-pollo", "likeCount": 4 }
  ],
  "totalLikes": 4,
  "metric": "unique_visitors_year",
  "generatedAt": "2026-08-27T00:00:00.000Z"
}
```

El workflow de n8n recibe el webhook en `tasks.nukeador.com/webhook/fiestas/caseta-dish-likes`. La ruta pública se publica en `/etc/nginx/sites-enabled/api.aldeapucela.org` del servidor `root@nukeador.com`, con el mismo proxy, CORS, rate limit, caché de 15 minutos, `X-Cache-Status` y respuestas stale que `caseta-saves`. El contador es de visitantes únicos por plato durante 2026; las retiradas no se restan.

## Endpoint público de actividades populares

Los rankings de actividades —guardados y visitas— se consultan juntos mediante el mismo endpoint:

```text
GET https://api.aldeapucela.org/fiestas/saves
```

La ruta conserva su nombre histórico para no romper los clientes existentes. La respuesta incluye el ranking de guardados (`saveCount`) y el de visitas de fichas (`visitCount`) en cada actividad, además de indicar la taxonomía de Matomo que alimenta cada métrica:

```json
{
  "ok": true,
  "siteId": 29,
  "metric": "unique_visitors_year",
  "metrics": {
    "saves": { "category": "activity", "action": "save" },
    "visits": { "category": "activity", "action": "view_detail" }
  },
  "activities": [
    {
      "id": "1",
      "saveCount": 70,
      "visitCount": 914,
      "rawSaveEventCount": 70,
      "rawViewEventCount": 1001
    }
  ],
  "totalSaves": 3333,
  "totalVisits": 16037
}
```

`event` mantiene el valor histórico `activity / save` por compatibilidad; el objeto `metrics` es la referencia explícita para consumidores nuevos. Las actividades que solo tienen visitas o solo guardados también se incluyen. El frontend de `/populares/` usa diez guardados como umbral mínimo y, para visitas, aplica un umbral adaptativo del 0,5 % del total anual, con un mínimo de tres visitas, un máximo de 30 tarjetas y un fallback de las cinco primeras cuando el volumen aún es pequeño. Ambos rankings se alternan sin volver a consultar otra URL.

Nginx cachea esta respuesta durante 15 minutos. La clave de caché solo distingue `from` y `to`, no parámetros arbitrarios como `cachebust`; cuando cambia el contrato o se publica una nueva fuente de datos hay que invalidar la entrada de `/fiestas/saves` o solicitarla con `Cache-Control: no-cache` para forzar un `MISS` puntual.

## Métrica anual y reprocesado

La instancia mantiene activado `General.enable_processing_unique_visitors_year = 1` para poder consultar visitantes únicos anuales de los informes generales. Sin embargo, Matomo 5.13 no expone `nb_uniq_visitors` por nombre de evento para `Events.getName` cuando el periodo es `year` o `range`; tampoco sirve sumar los únicos diarios porque una misma persona puede contarse otra vez cada día.

Para resolverlo sin introducir otra base de datos, el servidor instala el plugin local `ops/matomo/FiestasUniqueVisitors`. Su método de solo lectura `FiestasUniqueVisitors.getEventUniqueCounts` hace una única agregación sobre `log_link_visit_action`, agrupando por nombre de evento y calculando `COUNT(DISTINCT idvisitor)` para el intervalo completo de 2026. Usa las tablas nativas de Matomo, no almacena resultados propios y respeta el control de acceso del site solicitado. El intervalo se calcula en `Europe/Madrid` y se convierte a UTC antes de consultar `server_time`.

Los seis workflows públicos consultan ese método con `period=year` y `date=2026`, y conservan `nb_uniq_visitors` como `metric: unique_visitors_year`. `rawEventCount` y `totalEvents` son datos diagnósticos; el ranking y los contadores visibles usan exclusivamente visitantes únicos por elemento. Si el plugin o Matomo no responden, el workflow devuelve `502 matomo_unavailable` sin degradar silenciosamente a una suma diaria.

La instancia mantiene desactivado el procesamiento de únicos para rangos personalizados (`enable_processing_unique_visitors_range = 0`). Los endpoints públicos devuelven `400 unsupported_date_range` si reciben `from` o `to`, porque el contrato público representa exclusivamente el año completo 2026.
