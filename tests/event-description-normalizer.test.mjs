import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEventDescription } from '../scripts/event-description-normalizer.mjs';

test('elimina bloques repetidos de información ampliada y la etiqueta', () => {
  const description = [
    'XIV verbena Republicana: Hula Baby, Delameseta y Cañoneros',
    'Información ampliada: La 14ª Verbena Republicana se celebra el 9 de septiembre de 2026.',
    'Información ampliada: La 14ª Verbena Republicana se celebra el 9 de septiembre de 2026.'
  ].join('\n\n');

  assert.equal(
    normalizeEventDescription(description, { title: 'XIV verbena Republicana: Hula Baby, Delameseta y Cañoneros' }),
    'La 14ª Verbena Republicana se celebra el 9 de septiembre de 2026.'
  );
});

test('quita un párrafo corto contenido en otro y conserva los párrafos distintos', () => {
  const description = [
    'Información ampliada: Exposición ferroviaria de ASVAFER.',
    'La exposición ferroviaria de ASVAFER muestra piezas históricas y maquetas durante las fiestas.',
    'Entrada libre para todos los públicos.'
  ].join('\n\n');

  assert.equal(
    normalizeEventDescription(description),
    'La exposición ferroviaria de ASVAFER muestra piezas históricas y maquetas durante las fiestas.\n\nEntrada libre para todos los públicos.'
  );
});

test('normaliza HTML y saltos de línea sin juntar párrafos distintos', () => {
  const description = '<p>Presentación del musical.</p><p>Del 4 al 20 de septiembre.</p>';

  assert.equal(
    normalizeEventDescription(description),
    'Presentación del musical.\n\nDel 4 al 20 de septiembre.'
  );
});

test('es idempotente y mantiene un resumen que coincide con el título', () => {
  const description = 'La Historia Interminable El Musical';
  const normalized = normalizeEventDescription(description, {
    title: description,
    removeTitleOnly: false
  });

  assert.equal(normalized, description);
  assert.equal(
    normalizeEventDescription(normalized, { title: description, removeTitleOnly: false }),
    description
  );
  assert.equal(normalizeEventDescription(description, { title: description }), description);
});
