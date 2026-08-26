import assert from 'node:assert/strict';
import test from 'node:test';

import { createCalendarLinks, createIcs, createIcsFile } from '../src/scripts/plan-export.js';

const activity = {
  id: '2044',
  date: '2026-09-04',
  startTime: '19:30',
  endTime: '21:00',
  title: 'Cine de verano familiar',
  location: 'Plaza Mayor',
  description: 'Una sesión de cine al aire libre.',
  canonicalUrl: 'https://fiestas.aldeapucela.org/e/2044/cine-de-verano-familiar/'
};

test('creates a multi-event ICS for a plan with local Valladolid times', () => {
  const ics = createIcs([
    activity,
    { ...activity, id: '2045', title: 'Concierto de verano', startTime: '22:00', endTime: '23:30' }
  ], 'Plan de viernes');

  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /X-WR-CALNAME:Plan de viernes/);
  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20260904T193000/);
  assert.match(ics, /DTEND;TZID=Europe\/Madrid:20260904T210000/);
  assert.match(ics, /SUMMARY:Concierto de verano/);
});

test('keeps an activity that crosses midnight on the following date', () => {
  const ics = createIcs([{ ...activity, date: '2026-09-05', startTime: '22:15', endTime: '01:00' }]);

  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20260905T221500/);
  assert.match(ics, /DTEND;TZID=Europe\/Madrid:20260906T010000/);
});

test('creates direct Google Calendar and Outlook links for one activity', () => {
  const links = createCalendarLinks(activity, 'https://fiestas.aldeapucela.org/e/2044/cine-de-verano-familiar/');
  const google = new URL(links.google);
  const outlook = new URL(links.outlook);

  assert.equal(google.hostname, 'calendar.google.com');
  assert.equal(google.searchParams.get('action'), 'TEMPLATE');
  assert.equal(google.searchParams.get('text'), activity.title);
  assert.equal(google.searchParams.get('dates'), '20260904T173000Z/20260904T190000Z');
  assert.equal(google.searchParams.get('location'), activity.location);
  assert.equal(outlook.hostname, 'outlook.live.com');
  assert.equal(outlook.pathname, '/calendar/deeplink/compose');
  assert.equal(outlook.searchParams.get('rru'), 'addevent');
  assert.equal(outlook.searchParams.get('startdt'), '2026-09-04T17:30:00.000Z');
  assert.equal(outlook.searchParams.get('enddt'), '2026-09-04T19:00:00.000Z');
});

test('names an activity ICS file after the activity title', () => {
  const file = createIcsFile([activity], activity.title);

  assert.equal(file.name, 'cine-de-verano-familiar.ics');
  assert.equal(file.type, 'text/calendar;charset=utf-8');
});
