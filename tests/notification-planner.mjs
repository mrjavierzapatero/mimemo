import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { planNotifications } from '../android-app/src/plan-notifications.mjs';

const require = createRequire(import.meta.url);
const A = require('../agenda.js');
const C = require('../calendar.js');
const now = new Date('2026-11-07T12:00:00.000Z');
const base = { title: 'Clase de piano', date: '2026-11-12', time: '15:45', location: '', recurrence: 'none' };
const item = (agenda, id = 'piano-test') => ({ id, title: agenda.title, agenda });

const single = A.prepare(base, now.toISOString());
assert(single.ok);
const once = planNotifications(item(single.agenda), now);
assert.deepEqual(once.map(n => n.schedule.at.toISOString()), [
  '2026-11-11T20:00:00.000Z',
  '2026-11-12T13:45:00.000Z',
  '2026-11-12T14:30:00.000Z'
]);
assert.equal(new Set(once.map(n => n.id)).size, 3);
assert(once.every(n => n.isExactMandatory && n.schedule.allowWhileIdle));

const weekly = A.prepare({ ...base, recurrence: 'weekly' }, now.toISOString());
assert(weekly.ok);
const repeated = planNotifications(item(weekly.agenda), now);
assert.deepEqual(repeated.map(n => n.schedule.on), [
  { weekday: 4, hour: 21, minute: 0 },
  { weekday: 5, hour: 14, minute: 45 },
  { weekday: 5, hour: 15, minute: 30 }
]);
assert(repeated.every(n => n.body.includes('Cita a las 15:45') && !n.body.includes('2026-11-12')));

const early = A.prepare({ ...base, time: '08:00' }, now.toISOString());
assert(early.ok);
assert.deepEqual(planNotifications(item(early.agenda), now).map(n => n.extra.kind), ['day-before', 'one-hour-before', 'fifteen-minutes-before']);

const allDay = C.prepare({ ...base, time: '', allDay: true }, now.toISOString());
assert(allDay.ok);
assert.deepEqual(planNotifications(item(allDay.agenda), now).map(n => n.extra.kind), ['day-before']);

const cancelled = { ...single.agenda, status: 'cancelled' };
assert.deepEqual(planNotifications(item(cancelled), now), []);

console.log(JSON.stringify({ checksPassed: 6, scope: 'Android local notifications: one-time, weekly, early, all-day, cancellation and exact scheduling', physicalAndroid: false }));
