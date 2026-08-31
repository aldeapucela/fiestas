let eventsPromise = null;

// Carga el catálogo de eventos desde el JSON versionado (antes iba inline en el
// HTML). La URL la publica layout.njk en el <link rel="preload" data-fiestas-events>.
export function loadEvents() {
  if (!eventsPromise) {
    eventsPromise = Array.isArray(window.__FIESTAS_2026_EVENTS__)
      ? Promise.resolve(window.__FIESTAS_2026_EVENTS__)
      : fetchEvents();
  }
  return eventsPromise;
}

async function fetchEvents() {
  const url = document.querySelector('link[data-fiestas-events]')?.href;
  if (!url) return [];
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar el catálogo de eventos (' + response.status + ')');
  return response.json();
}
