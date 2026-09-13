import assert from 'node:assert/strict';
import test from 'node:test';
import { attachEventSourcePages } from '../scripts/event-source-pages.mjs';

const localEvents = [{ id: '1' }, { id: '2' }, { id: '3' }];

test('añade enlace de origen y canonical solo con destino único vinculado', () => {
  const registry = {
    remoteEvents: {
      '10': {
        urlPath: '/e/10/actividad-a/',
        occurrences: { single: { status: 'linked', localEventId: '1' } }
      },
      '11': {
        urlPath: '/e/11/actividad-b/',
        occurrences: { single: { status: 'ignored' } }
      }
    }
  };

  const [linked, ignored, unmatched] = attachEventSourcePages(localEvents, registry, { '1': 10 });
  assert.equal(linked.sourceEventUrl, 'https://eventos.aldeapucela.org/e/10/actividad-a/');
  assert.equal(linked.seoCanonicalUrl, linked.sourceEventUrl);
  assert.equal(ignored.sourceEventUrl, undefined);
  assert.equal(unmatched.sourceEventUrl, undefined);
});

test('no elige automáticamente entre varios destinos remotos', () => {
  const registry = {
    remoteEvents: {
      '10': { urlPath: '/e/10/actividad-a/', occurrences: { single: { status: 'linked', localEventId: '1' } } },
      '12': { occurrences: { single: { status: 'linked', localEventId: '1' } } }
    }
  };

  const [event] = attachEventSourcePages(localEvents, registry);
  assert.equal(event.sourceEventUrl, undefined);
  assert.throws(() => attachEventSourcePages(localEvents, registry, { '1': 10 }), /Canonical SEO inválido/);
});

test('no presenta enlace ni canonical si falta la ruta del destino', () => {
  const registry = {
    remoteEvents: {
      '10': { occurrences: { single: { status: 'linked', localEventId: '1' } } }
    }
  };

  const [event] = attachEventSourcePages(localEvents, registry);
  assert.equal(event.sourceEventUrl, undefined);
  assert.throws(() => attachEventSourcePages(localEvents, registry, { '1': 10 }), /Canonical SEO inválido/);
});
