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
| `activity` | `save` / `remove_save` | `activityId` | Al guardar o eliminar un favorito. |
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

Los pageviews se envían mediante `trackPageView` durante la única inicialización del tracker. `enableLinkTracking` cubre enlaces simples, pero las acciones relevantes anteriores se registran explícitamente.

## Privacidad y límites

- No se envía el texto de búsqueda; solo si tuvo resultados y cuántos.
- No se envían latitud, longitud, dirección exacta ni permisos de ubicación.
- No se envían nombres, correos, teléfonos, nombres personalizados de planes ni identificadores de usuario.
- Sin cuentas, las métricas representan visitas/dispositivos y acciones observadas, no personas identificadas de forma exacta.
- La instancia de Matomo debe mantener activada la anonimización de IP y sus controles de privacidad deben revisarse en servidor.
- Este repositorio no contiene mecanismo de consentimiento de cookies; si se incorpora en el futuro, la inicialización debe conectarse a él.
- La versión actual no tiene geolocalización, botón de centrar en el usuario, panel inferior del mapa ni planes/colecciones; por eso no se generan esos eventos todavía.

Para revisar los datos, consultar en Matomo el site ID 29 y filtrar por categoría y acción según la tabla anterior.
