import assert from 'node:assert/strict';
import test from 'node:test';
import { eventFingerprint, findLikelyDuplicateEvent, findPotentialDuplicatePairs } from '../scripts/event-duplicate-detection.mjs';

const catalogEvent = {
  id: 433,
  date: '2026-09-08',
  startTime: '19:00',
  endTime: null,
  title: "Benditos 90's Fest",
  location: 'La Pera Limonera, Playa de las Moreras',
  performances: ['Benditos 90s', 'Dany Bpm', 'Sergei Rez', 'Ruben Botas', 'Rocío Torío']
};

test('detecta una ficha generica importada como duplicado por actuaciones', () => {
  const duplicate = findLikelyDuplicateEvent({
    date: '2026-09-08',
    startTime: '19:00',
    endTime: null,
    title: 'Conciertos de Fiestas 2026 en La Pera Limonera',
    location: 'La Pera Limonera, Playa de las Moreras',
    performances: ['Benditos 90s', 'Dany BPM', 'Sergei Rez', 'Ruben Botas', 'Rocío Torío']
  }, [catalogEvent]);

  assert.equal(duplicate.event.id, 433);
  assert.match(duplicate.reason, /actuaciones coincidentes/);
});

test('no mezcla eventos con misma hora pero lugar distinto', () => {
  const duplicate = findLikelyDuplicateEvent({
    date: '2026-09-08',
    startTime: '19:00',
    title: 'Conciertos de Fiestas 2026 en otro lugar',
    location: 'Plaza Mayor',
    performances: ['Benditos 90s', 'Dany BPM']
  }, [catalogEvent]);

  assert.equal(duplicate, null);
});

test('no mezcla sesiones distintas con el mismo titulo generico', () => {
  const duplicate = findLikelyDuplicateEvent({
    date: '2026-09-05',
    startTime: '23:30',
    endTime: null,
    title: 'OrbitalClub - Sesiones fiestas 2026',
    location: 'Orbital club, Plaza de la Rinconada, Valladolid',
    performances: ['Nacho a', 'Josua']
  }, [{
    id: 611,
    date: '2026-09-05',
    startTime: '20:00',
    endTime: '23:00',
    title: 'OrbitalClub - Sesiones fiestas 2026',
    location: 'Terraza de Orbital club, Plaza de la Rinconada, Valladolid',
    performances: ['Funkforward']
  }]);

  assert.equal(duplicate, null);
});

test('no mezcla fichas distintas del mismo local con la misma hora', () => {
  const duplicate = findLikelyDuplicateEvent({
    date: '2026-09-04',
    startTime: '22:00',
    endTime: null,
    title: 'Clubbing Beluga (Sesiones de música)',
    location: 'Beluga Cantabarnas',
    performances: ['Sesión nocturna con Dani Williams']
  }, [{
    id: 864,
    date: '2026-09-04',
    startTime: '22:00',
    endTime: null,
    title: 'San Lorenzo en Beluga (Programación de fiestas)',
    location: 'Beluga Cantabarnas En la plaza',
    performances: ['Reumáticas Yeyé']
  }]);

  assert.equal(duplicate, null);
});

test('no mezcla sesiones del mismo evento sin horario publicado', () => {
  const sessions = [
    {
      id: 910,
      date: '2026-09-10',
      startTime: null,
      endTime: null,
      title: '3x3 Feria de Valladolid (Torneo de Baloncesto)',
      location: 'Feria de Valladolid',
      performances: ['Sesión de mañana: Infantil U14 M - F']
    },
    {
      id: 911,
      date: '2026-09-10',
      startTime: null,
      endTime: null,
      title: '3x3 Feria de Valladolid (Torneo de Baloncesto)',
      location: 'Feria de Valladolid',
      performances: ['Sesión de tarde: Junior U18 M - F']
    }
  ];

  assert.deepEqual(findPotentialDuplicatePairs(sessions), []);
});

test('detecta duplicados exactos por huella normalizada', () => {
  assert.equal(
    eventFingerprint({ date: '2026-09-08', startTime: '19:00', title: 'Día Íbero', location: 'Plaza España' }),
    eventFingerprint({ date: '2026-09-08', startTime: '19:00', title: 'Dia Ibero', location: 'Plaza España' })
  );
});

test('audita parejas potenciales en el catalogo', () => {
  const duplicate = {
    id: 828,
    date: '2026-09-08',
    startTime: '19:00',
    title: 'Conciertos de Fiestas 2026 en La Pera Limonera',
    location: 'La Pera Limonera, Playa de las Moreras',
    performances: ['Benditos 90s', 'Dany BPM', 'Sergei Rez', 'Ruben Botas', 'Rocío Torío']
  };

  const pairs = findPotentialDuplicatePairs([catalogEvent, duplicate]);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].left.id, 433);
  assert.equal(pairs[0].right.id, 828);
});
