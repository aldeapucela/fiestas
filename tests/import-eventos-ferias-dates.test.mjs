import test from 'node:test';
import assert from 'node:assert/strict';
import { isDailySeries, occurrenceDatesFor, occurrencesFor } from '../scripts/import-eventos-ferias-dates.mjs';

const vermuTorero = {
  id: 2222,
  startsAt: '2026-09-05T13:30:00.000+02:00',
  endsAt: '2026-09-12T13:30:00.000+02:00'
};

test('no interpreta un intervalo remoto como actividad diaria sin fechas verificadas', () => {
  const result = occurrenceDatesFor(vermuTorero, {}, { maxDate: '2026-09-13' });

  assert.equal(isDailySeries(vermuTorero), true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.dates, [
    '2026-09-05',
    '2026-09-06',
    '2026-09-07',
    '2026-09-08',
    '2026-09-09',
    '2026-09-10',
    '2026-09-11',
    '2026-09-12'
  ]);
});

test('usa únicamente las fechas concretas verificadas, aunque haya huecos en el intervalo', () => {
  const result = occurrenceDatesFor(vermuTorero, {
    2222: {
      dates: ['2026-09-05', '2026-09-06', '2026-09-08', '2026-09-10', '2026-09-11', '2026-09-12'],
      source: 'Cartel verificado'
    }
  });

  assert.equal(result.verified, true);
  assert.equal(result.source, 'Cartel verificado');
  assert.deepEqual(result.dates, [
    '2026-09-05',
    '2026-09-06',
    '2026-09-08',
    '2026-09-10',
    '2026-09-11',
    '2026-09-12'
  ]);
});

test('mantiene como una sola actividad un evento que solo cruza la medianoche', () => {
  const result = occurrenceDatesFor({
    id: 99,
    startsAt: '2026-09-05T23:00:00.000+02:00',
    endsAt: '2026-09-06T01:00:00.000+02:00'
  });

  assert.equal(isDailySeries({
    startsAt: '2026-09-05T23:00:00.000+02:00',
    endsAt: '2026-09-06T01:00:00.000+02:00'
  }), false);
  assert.deepEqual(result.dates, ['2026-09-05']);
  assert.equal(result.verified, true);
});

test('rechaza una lista verificada con fechas fuera del intervalo remoto', () => {
  const result = occurrenceDatesFor(vermuTorero, {
    2222: { dates: ['2026-09-05', '2026-09-14'] }
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /fuera del intervalo remoto/);
});

test('conserva hora, fin, ubicación y actuaciones por ocurrencia', () => {
  const result = occurrencesFor(vermuTorero, {
    2222: {
      dates: ['2026-09-05', '2026-09-06'],
      source: 'Cartel verificado',
      occurrences: [
        {
          date: '2026-09-05',
          startTime: '13:30',
          endTime: '15:00',
          location: 'Bar San Pío X, Valladolid',
          performances: ['Los Lunares']
        },
        {
          date: '2026-09-06',
          startTime: '17:00',
          endTime: null,
          location: 'Bar La Blanca, Calle Esperanto 4, Valladolid',
          performances: ['Santi Borja']
        }
      ]
    }
  });

  assert.equal(result.verified, true);
  assert.deepEqual(result.occurrences, [
    {
      date: '2026-09-05',
      startTime: '13:30',
      endTime: '15:00',
      location: 'Bar San Pío X, Valladolid',
      performances: ['Los Lunares']
    },
    {
      date: '2026-09-06',
      startTime: '17:00',
      endTime: null,
      location: 'Bar La Blanca, Calle Esperanto 4, Valladolid',
      performances: ['Santi Borja']
    }
  ]);
});

test('rechaza ocurrencias que dejan una fecha verificada sin representar', () => {
  const result = occurrencesFor(vermuTorero, {
    2222: {
      dates: ['2026-09-05', '2026-09-06'],
      occurrences: [{ date: '2026-09-05', location: 'Bar San Pío X' }]
    }
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /Falta una ocurrencia/);
});

test('permite sesiones distintas el mismo día sin horario publicado', () => {
  const result = occurrencesFor(vermuTorero, {
    2222: {
      dates: ['2026-09-05', '2026-09-06'],
      occurrences: [
        {
          key: 'day-2026-09-05-afternoon',
          date: '2026-09-05',
          startTime: null,
          endTime: null,
          location: 'Feria de Valladolid',
          performances: ['Benjamín U10 y Alevín U12 M - F']
        },
        {
          key: 'day-2026-09-06-morning',
          date: '2026-09-06',
          startTime: null,
          endTime: null,
          location: 'Feria de Valladolid',
          performances: ['Infantil U14 M - F']
        },
        {
          key: 'day-2026-09-06-afternoon',
          date: '2026-09-06',
          startTime: null,
          endTime: null,
          location: 'Feria de Valladolid',
          performances: ['Junior U18 M - F']
        }
      ]
    }
  });

  assert.equal(result.verified, true);
  assert.equal(result.occurrences.length, 3);
});
