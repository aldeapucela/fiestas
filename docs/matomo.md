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
- Los eventos `plan / add_community` se cuentan una sola vez por plan vecinal y navegador mediante `fiestasPucela:analytics:added-community-plans` en `localStorage`. Si la persona borra los datos del sitio, usa otro navegador/dispositivo o tiene bloqueado `localStorage`, el evento puede volver a registrarse.
- Para ordenar actividades por popularidad se debe usar el total de eventos `activity / save`, no `remove_save` ni el total de visitas. No se envía una IP ni un identificador de usuario propio.
- El contador de planes vecinales representa añadidos de navegadores estimados, no personas únicas exactas.
- Para el embudo PWA, usa `nb_visits` de `pwa / install_available`, `install_accepted`, `installed` e `ios_help_opened`; `nb_events` mide repeticiones, no personas. Los eventos de instalación aceptada, completada o cancelada incluyen el origen (`agenda_cta` o `menu`) como valor de Matomo. En iOS solo podemos medir la apertura de instrucciones, no confirmar técnicamente que se añadió a la pantalla de inicio.
- La instancia de Matomo debe mantener activada la anonimización de IP y sus controles de privacidad deben revisarse en servidor.
- Este repositorio no contiene mecanismo de consentimiento de cookies; si se incorpora en el futuro, la inicialización debe conectarse a él.
- La versión actual no tiene geolocalización, botón de centrar en el usuario ni panel inferior del mapa; por eso no se generan esos eventos todavía.

Para revisar los datos, consultar en Matomo el site ID 29 y filtrar por categoría y acción según la tabla anterior.
