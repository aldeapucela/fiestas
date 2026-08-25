# Auditoría del mapa y filtros superiores

Fecha: 2026-08-22
Viewport principal: 576 × 1024
Referencia: `Photo 1.jpg` proporcionada por el usuario.

## Capturas aceptadas

- `01-map-default.png`: mapa en estado inicial.
- `02-map-zonas-open.png`: modal de zonas abierto.
- `03-map-tipos-open.png`: modal de tipos abierto.
- `04-map-type-active.png`: filtro Música activo.

## Evidencia

- En el estado inicial solo se ve `Zonas` en la parte superior. `Tipos`, `Precio` y `Guardados` están en una fila horizontal con `scrollWidth` de 1.695 px frente a 561 px visibles.
- Cada uno de los tres menús principales mide aproximadamente 534 px, por lo que funcionan como páginas horizontales completas y no como chips compactos.
- La referencia muestra un encabezado fijo con `Mapa`, un selector de fecha compacto y un único botón flotante `Filtros`.
- La implementación actual muestra las fechas como una tira grande de tarjetas, no tiene título `Mapa` en modo mapa y no tiene un disparador global `Filtros`.
- La búsqueda queda detrás de un botón situado en la cabecera que se oculta en modo mapa; no hay una forma visible de abrirla desde el mapa.
- Al aplicar `Música`, el filtro sí actualiza la URL y el contador (`10 resultados`), pero añade una segunda fila superpuesta de chips y `Limpiar filtros`, sin una jerarquía clara respecto a la barra superior.
- El modal tiene backdrop y botón `Aceptar`, pero no tiene semántica de diálogo ni cierre por teclado visible en la implementación inspeccionada.

## Limitación

La inspección visual usa la última compilación servida correctamente. El árbol de trabajo contiene conflictos de merge sin resolver en varios archivos, incluido `scripts/build.mjs` y `src/scripts/fiestas-2026.js`; el watcher falló al intentar recompilar después de la captura.
