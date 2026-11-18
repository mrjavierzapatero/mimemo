'use strict';

const assert = require('node:assert/strict');
const C = require('../calendar.js');
const now = '2026-11-09T10:00:00.000Z';
const results = [];
const entry = text => C.parseMany(text, now).entries[0];
const hourAmbiguity = issue => /he interpretado la hora|confirma.*(?:mañana|tarde)|mañana.*tarde/i.test(issue);

function test(name, run) {
  try { run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}

test('diecinueve conserva fecha y hora explícita de 24 h', () => {
  const parsed = entry('el diecinueve de noviembre a las10:15 tengo médico');
  assert.equal(parsed.date, '2026-11-19');
  assert.equal(parsed.time, '10:15');
  assert.equal(parsed.allDay, false);
  assert.equal(parsed.issues.some(hourAmbiguity), false);
});

test('dictado completo del médico separa fecha, hora, título y lugar', () => {
  const parsed = entry('el día diecinueve de noviembre a las diez y cuarto de la mañana tengo médico en el centro de salud');
  assert.equal(parsed.date, '2026-11-19');
  assert.equal(parsed.time, '10:15');
  assert.equal(parsed.title, 'Médico en el centro de salud');
  assert.equal(parsed.location, 'el centro de salud');
  assert.equal(parsed.allDay, false);
  assert.equal(C.prepare(parsed, now).ok, true);
});

for (const date of [
  'el jueves diecinueve de noviembre',
  'el jueves, diecinueve de noviembre',
  'el jueves día diecinueve de noviembre',
  'el jueves, día diecinueve de noviembre',
  'el jueves, 19 de noviembre'
]) {
  test('el día de semana y la fecha son una sola cita: ' + date, () => {
    const text = date + ' a las diez y cuarto de la mañana tengo médico';
    const parsed = C.parseMany(text, now);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.entries[0].date, '2026-11-19');
    assert.equal(parsed.entries[0].time, '10:15');
    assert.equal(parsed.entries[0].title, 'Médico');
    assert.equal(parsed.entries[0].source, text);
    assert.equal(C.prepare(parsed.entries[0], now).ok, true);
  });
}

test('una fecha verbal contradictoria con el día semanal sigue bloqueada', () => {
  const parsed = entry('el miércoles diecinueve de noviembre a las diez y cuarto de la mañana tengo médico');
  assert.equal(parsed.date, '');
  assert.equal(C.prepare(parsed, now).ok, false);
  assert(parsed.issues.some(issue => /no coincide/.test(issue)));
});

const days = [
  'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta',
  'treinta y uno'
];
for (let index = 0; index < 30; index++) {
  test('día escrito: ' + days[index] + ' de noviembre', () => {
    const parsed = entry('el ' + days[index] + ' de noviembre a las 10:15 tengo médico');
    assert.equal(parsed.date, '2026-11-' + String(index + 1).padStart(2, '0'));
    assert.equal(parsed.time, '10:15');
  });
}

for (const date of ['19. De noviembre', '19, de noviembre', '19   de   noviembre', 'diecinueve   de   noviembre']) {
  test('fecha con puntuación o espacios: ' + date, () => {
    const parsed = entry('el día ' + date + ' a las 10:15 tengo médico');
    assert.equal(parsed.date, '2026-11-19');
    assert.equal(parsed.time, '10:15');
  });
}

for (const time of ['10 : 15', '10 y 15']) {
  test('los minutos no se pierden: ' + time, () => {
    const parsed = entry('el diecinueve de noviembre a las ' + time + ' tengo médico');
    assert.equal(parsed.date, '2026-11-19');
    assert.equal(parsed.time, '10:15');
  });
}

test('dos fechas verbales conservan el dictado y sus fragmentos originales', () => {
  const text = 'el diecinueve de noviembre a las diez y cuarto de la mañana tengo médico y el veinte de noviembre a las once y media de la mañana tengo revisión';
  const parsed = C.parseMany(text, now);
  assert.equal(parsed.text, text);
  assert.equal(parsed.entries.length, 2);
  assert.deepEqual(parsed.entries.map(item => item.date), ['2026-11-19', '2026-11-20']);
  assert.deepEqual(parsed.entries.map(item => item.time), ['10:15', '11:30']);
  for (const item of parsed.entries) {
    assert.equal(text.slice(item.sourceStart, item.sourceEnd).trim(), item.source);
  }
  assert(parsed.entries[0].sourceEnd <= parsed.entries[1].sourceStart);
});

test('los acentos de los días verbales no cambian títulos ni offsets', () => {
  const text = 'el dieciséis de noviembre a las diez y cuarto médico y el veintitrés de noviembre a las once revisión';
  const parsed = C.parseMany(text, now);
  assert.deepEqual(parsed.entries.map(item => item.date), ['2026-11-16', '2026-11-23']);
  assert.deepEqual(parsed.entries.map(item => item.title), ['Médico', 'Revisión']);
  for (const item of parsed.entries) {
    assert.equal(text.slice(item.sourceStart, item.sourceEnd).trim(), item.source);
  }
  assert.equal(parsed.text, text);
});

test('el año explícito prevalece sobre el año actual', () => {
  const parsed = entry('el diecinueve de noviembre de 2027 a las 10:15 tengo médico');
  assert.equal(parsed.date, '2027-11-19');
  assert.equal(C.prepare(parsed, now).ok, true);
});

for (const day of ['31', days[30]]) {
  test('fecha imposible sigue bloqueada: ' + day + ' de noviembre', () => {
    const parsed = entry('el ' + day + ' de noviembre a las 10:15 tengo médico');
    assert.equal(parsed.date, '');
    assert.equal(C.prepare(parsed, now).ok, false);
  });
}

test('03:45 explícito conserva la madrugada', () => {
  const parsed = entry('el diecinueve de noviembre a las 03:45 tengo médico');
  assert.equal(parsed.time, '03:45');
  assert.equal(parsed.issues.some(hourAmbiguity), false);
});

test('3:45 sin franja mantiene propuesta de tarde y confirmación', () => {
  const parsed = entry('el diecinueve de noviembre a las 3:45 tengo médico');
  assert.equal(parsed.time, '15:45');
  assert(parsed.issues.some(hourAmbiguity));
});

const report = {
  clock: now,
  total: results.length,
  passed: results.filter(result => result.pass).length,
  failed: results.filter(result => !result.pass).length,
  results,
  physicalAndroid: false
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
