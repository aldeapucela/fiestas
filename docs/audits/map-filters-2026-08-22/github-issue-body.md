## Objetivo

Corregir y completar la zona superior de la vista móvil `/mapa/` para que la cabecera, el selector de fecha y el acceso a filtros sigan la referencia visual del mapa y sean utilizables en todo el rango móvil.

Este issue es un seguimiento visual y de interacción del mapa implementado en #5. No reabre el trabajo de marcadores, clustering ni panel inferior salvo cuando sea necesario para que los controles superiores no se solapen con ellos.

## Problema observado

En una captura de 576 × 1024 px:

- No aparece una cabecera fija con el título `Mapa`.
- La fecha ocupa una tira horizontal de tarjetas grandes (`Todos`, `Vie 4`, `Sáb 5`, etc.) en lugar de un selector compacto tipo `Vie 4` con calendario y chevron.
- El botón global `Filtros` de la referencia no existe.
- Solo se ve `Zonas`; `Tipos`, `Precio` y `Guardados` quedan fuera de la pantalla porque la fila tiene aproximadamente 1.695 px de ancho desplazable dentro de 561 px visibles.
- Cada menú de filtro llega a medir aproximadamente 534 px, por lo que se comporta como una pantalla horizontal completa y no como un chip compacto.
- El buscador queda detrás de un botón de la cabecera que se oculta al entrar en modo mapa, así que no es descubrible desde el mapa.
- Cuando hay filtros activos, los chips, `Limpiar filtros` y el contador aparecen como una segunda capa sobre el mapa sin una jerarquía clara respecto al control principal.
- Los controles `Valladolid` y `Activar ubicación` aparecen abajo a la derecha; la referencia sitúa el control de ubicación arriba, debajo de filtros.

## Pasos para reproducir

1. Abrir la aplicación en `/mapa/` en un viewport móvil.
2. Observar la zona superior.
3. Intentar localizar los filtros de tipo, precio y guardados sin usar selectores del navegador.
4. Activar `Tipos` y seleccionar `Música`.
5. Comprobar la posición de la fila de filtros, el chip activo, `Limpiar filtros` y el contador.
6. Intentar acceder al buscador desde el mapa.

## Resultado esperado

La zona superior debería tener esta jerarquía:

1. Cabecera blanca fija con icono y título `Mapa`.
2. Selector de fecha compacto a la derecha con la fecha activa, icono de calendario y chevron.
3. Botón flotante `Filtros` con icono de sliders y contador de filtros activos.
4. Botón flotante de ubicación debajo de filtros.
5. El mapa debe quedar libre de tiras horizontales de controles que no sean descubribles.

## Alcance funcional

- Crear el botón global `Filtros` y un panel de filtros coherente con el patrón móvil.
- Integrar en ese panel `Zonas`, `Tipos`, `Precio`, `Guardados` y búsqueda de texto.
- Mantener la selección múltiple y la limpieza de filtros.
- Mostrar el número de filtros activos en el botón principal.
- Decidir y aplicar una única semántica de confirmación: aplicación inmediata o estado provisional con `Aplicar` y `Cancelar`. Actualmente las casillas actualizan los resultados y la URL inmediatamente, aunque existe un botón `Aceptar` que solo cierra el menú.
- Mantener la actualización de marcadores, panel inferior, contador de resultados y URL.
- Convertir la tira de fechas en un selector compacto que permita abrir todos los días, seleccionar `Todos` y conservar la fecha activa.
- Hacer accesible el buscador desde el mapa, preferiblemente dentro del panel global si no se añade un control independiente.
- Reubicar o simplificar los controles de centro/ubicación para aproximarlos a la referencia sin perder las acciones actuales.
- Reservar espacio seguro bajo la cabecera y el selector para que ningún control tape accidentalmente marcadores relevantes.

## Accesibilidad

- Los botones de fecha y filtros deben exponer estado abierto/cerrado y el elemento que controlan mediante `aria-expanded` y `aria-controls`.
- El panel de filtros debe tener semántica de diálogo, nombre accesible y foco controlado.
- Debe poder cerrarse con Escape, pulsando fuera y mediante un botón visible de cierre si el diseño lo incorpora.
- El foco debe volver al control que abrió el panel.
- Los controles icon-only, especialmente favoritos y ubicación, deben tener nombre accesible.
- No se debe depender del scroll horizontal invisible para encontrar filtros.
- Comprobar foco visible, contraste y objetivos táctiles en móvil.

## Criterios de aceptación

- [ ] `/mapa/` muestra una cabecera móvil con `Mapa` sin romper la navegación inferior.
- [ ] La fecha activa se muestra en un selector compacto y el selector permite cambiar entre todos los días y `Todos`.
- [ ] Existe un botón visible `Filtros` en la parte superior derecha.
- [ ] El botón indica cuántos filtros están activos y mantiene ese estado tras recargar o compartir la URL.
- [ ] Zonas, Tipos, Precio, Guardados y búsqueda son accesibles sin desplazamiento horizontal oculto.
- [ ] Ningún filtro principal ocupa el ancho completo de la pantalla salvo que forme parte explícita del panel abierto.
- [ ] Aplicar un filtro actualiza marcadores, panel inferior, contador y URL.
- [ ] La acción de aplicar/cancelar tiene un comportamiento único y coherente.
- [ ] `Limpiar filtros` elimina todos los filtros y devuelve el mapa al estado inicial.
- [ ] El control de ubicación queda agrupado en la zona superior sin perder `Valladolid` ni `Activar ubicación`.
- [ ] Los controles superiores no tapan la información esencial del mapa ni el panel inferior.
- [ ] Se contemplan estados sin resultados, muchos filtros activos, búsqueda activa y ubicación denegada.
- [ ] El flujo funciona a 320, 375, 390 y 576 px de ancho y en escritorio.
- [ ] El flujo es operable con teclado y lector de pantalla según los puntos de accesibilidad anteriores.
- [ ] Se añaden capturas o comprobaciones manuales del estado inicial, panel abierto y filtros activos.
- [ ] `npm run build` termina correctamente y no quedan conflictos de merge en los archivos necesarios para validar.

## Referencias de implementación

- Plantilla: `src/templates/fiestas-2026.njk`, selector de fechas, controles y controles del mapa.
- Estilos: `src/styles/fiestas-2026.css`, layout de filtros y reglas específicas de `.fiestas-app.is-map-mode`.
- Comportamiento: `src/scripts/fiestas-2026.js`, estado de filtros, URL, paneles y ubicación.
- Referencia visual original: comentario con imagen en #5.

## Fuera de alcance

- Rediseñar el panel inferior de actividades salvo ajustes de solapamiento.
- Cambiar marcadores, clustering o datos de eventos.
- Añadir login, cuentas o sincronización de guardados.
- Implementar navegación giro a giro.
