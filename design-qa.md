# Design QA — `/plan/`

## Reference

- Source: `/var/folders/8r/kmn758jj0h7cq06fx_44sb100000gp/T/codex-clipboard-23f14f66-ac10-4b0e-a12b-0d3aadf5b845.jpg`
- Reference size: 853 × 1844 px.
- Compared state: default `Guardados` virtual plan with saved activities; the repository bottom navigation is the approved replacement for the mockup bottom bar.

## Implementation capture

- Capture: `/private/tmp/plan-implementation.png`
- Viewport: 377 × 863 px, mobile browser preview.
- Route: `http://127.0.0.1:8002/plan/`.

## Review

- Header hierarchy matches: peacock mark, centered “Mi plan”, share affordance and lavender plan selector.
- Main hierarchy matches: “Tu plan de fiestas”, teal date summary, date selector with `Todos` selected by default and teal selected-day state.
- `Guardados` is the default selector value, with an “Todos” date filter and saved activities rendered through the same timeline as personal plans.
- Date chips scroll horizontally, unavailable dates are visibly disabled, and a selected date is not repeated as a redundant heading above the cards.
- Timeline matches the reference structure: time rail, pale mint event icon, rounded event card, location, category pill and heart action.
- The existing repository bottom navigation remains in place as requested.
- The decorative illustration uses the repository asset available for the plan surface; event cards and overlap notices remain data-driven.
- Desktop and dark-mode rules are included without changing the mobile composition.

## Planes vecinales

- `/planes/`: cabecera compacta, enlace de vuelta, introducción lavanda y listado editorial con separadores ligeros.
- `/planes/<id>/`: ficha estática con nombre, autor, resumen, actividades ordenadas, aviso de identificadores desconocidos y acciones de volver/añadir.
- El catálogo vacío se muestra como placeholder sin tarjetas sobredimensionadas.
- Cada colección tiene un icono propio y `Previsualizar`/`Añadir a mis planes` se presentan juntos como botones compactos con iconos discretos.
- Se revisó la salida en el navegador integrado y en modo oscuro mediante los estilos específicos de la aplicación.

Final result: passed
