'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const now = '2026-11-09T09:00:00.000Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return Date.parse(now); }
}

// Execute the production review/submit functions, with only DOM, persistence
// and native notification boundaries replaced. Parser and date validation are real.
const ui = fs.readFileSync(path.join(root, 'calendar-ui.js'), 'utf8');
const start = ui.indexOf('  function fields(i)');
const end = ui.indexOf("  $('batchForm').addEventListener('submit',saveBatch);");
assert(start >= 0 && end > start, 'Production review/submit block was not found');
const reviewSource = ui.slice(start, end);

function app(text) {
  const nodes = new Map();
  const writes = [];
  const notices = [];
  for (const id of ['bTitle0', 'bDate0', 'bTime0', 'bTimeButton0', 'bWeek0', 'bWeekWrap0', 'bPlace0', 'bRepeat0', 'bAll0', 'bIssue0', 'batchSave', 'batchReminders', 'batchStatus', 'ideaInput']) {
      const weekly = { textContent: '' };
      nodes.set(id, {
        value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
        dataset: {}, classList: { toggle() {} }, setAttribute() {},
        querySelector(selector) {
          assert.equal(selector, 'option[value="weekly"]');
          return weekly;
        }
      });
  }
  const node = id => {
    assert(nodes.has(id), 'Unexpected DOM node: ' + id);
    return nodes.get(id);
  };
  const context = vm.createContext({
    Date: FixedDate, Intl, console,
    $: node, batch: null, ideas: [], returnFocus: null,
    calendarDate: '', mode: 'month', finalTranscript: text, interimTranscript: '',
    crypto: { randomUUID: () => 'synthetic-date-review' },
    html: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    formatAgendaInstant: instant => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant)),
    nativeAlerts: () => null,
    saveIdeas: () => writes.push(JSON.parse(JSON.stringify(context.ideas))),
    closeOv() {}, closeCaptureText() {}, renderFolders() {}, renderAssistant() {}, showCalendar() {},
    toast: message => notices.push(message)
  });
  for (const file of ['agenda.js', 'calendar.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  context.C = context.LeteoCalendar;
  const parsed = context.C.parseMany(text);
  assert.equal(parsed.entries.length, 1, 'This review fixture must describe one appointment');
  context.batch = { ...parsed, editId: null };
  const entry = parsed.entries[0];
  for (const [id, value] of Object.entries({ bTitle0: entry.title, bDate0: entry.date, bTime0: entry.time, bPlace0: entry.location, bRepeat0: entry.recurrence, ideaInput: text })) node(id).value = value;
  node('bAll0').checked = entry.allDay;
  vm.runInContext(reviewSource, context, { filename: 'calendar-ui.js:review-and-submit' });
  const refresh = () => vm.runInContext('refreshBatch()', context);
  const save = () => vm.runInContext('saveBatch({preventDefault(){}})', context);
  refresh();
  return { context, node, writes, notices, refresh, save };
}

const tests = [];
async function test(name, run) {
  try { await run(); tests.push({ name, pass: true }); }
  catch (error) { tests.push({ name, pass: false, error: error.message }); }
}

(async () => {
  await test('fecha verbal y 10:15 habilitan guardar sin advertencias; solo confirmar persiste', async () => {
    const a = app('El diecinueve de noviembre a las 10:15 reunión en Proa');
    assert.equal(a.node('bDate0').value, '2026-11-19');
    assert.equal(a.node('bTime0').value, '10:15');
    assert.equal(a.node('batchSave').disabled, false);
    assert.equal(a.node('bIssue0').textContent, '19/11/2026 · 10:15 de la mañana.');
    assert.equal(a.writes.length, 0);
    await a.save();
    assert.equal(a.writes.length, 1);
    assert.equal(a.writes[0][0].agenda.date, '2026-11-19');
    assert.equal(a.writes[0][0].agenda.time, '10:15');
    assert.equal(a.writes[0][0].agenda.instant, '2026-11-19T09:15:00.000Z');
  });

  await test('diez y cuarto se muestra como 10:15 de la mañana sin advertencia de franja', () => {
    const a = app('El diecinueve de noviembre a las diez y cuarto tengo una reunión');
    assert.equal(a.node('batchSave').disabled, false);
    assert.equal(a.node('bIssue0').textContent, '19/11/2026 · 10:15 de la mañana.');
  });

  await test('sin fecha ayuda a editar y bloquea también el envío directo del formulario', async () => {
    const a = app('Enviar email a Ticare a las 10:15');
    assert.equal(a.node('batchSave').disabled, true);
    assert.match(a.node('bIssue0').textContent, /Toca el campo Fecha/);
    assert.match(a.node('bIssue0').textContent, /no hace falta repetir el dictado/);
    await a.save();
    assert.equal(a.writes.length, 0);
    assert.equal(a.context.ideas.length, 0);
  });

  await test('editar Fecha permite guardar conservando el dictado original', async () => {
    const text = 'Enviar email a Ticare a las 10:15';
    const a = app(text);
    a.node('bDate0').value = '2026-11-19';
    a.refresh();
    assert.equal(a.node('batchSave').disabled, false);
    assert.equal(a.node('bIssue0').textContent, '19/11/2026 · 10:15 de la mañana.');
    assert.equal(a.node('ideaInput').value, text);
    await a.save();
    assert.equal(a.writes.length, 1);
    assert.equal(a.writes[0][0].transcript, text);
    assert.equal(a.writes[0][0].agenda.date, '2026-11-19');
  });

  await test('fecha inexistente continúa bloqueada aunque se intente guardar', async () => {
    const a = app('El diecinueve de noviembre a las 10:15 reunión');
    a.node('bDate0').value = '2026-11-31';
    a.refresh();
    assert.equal(a.node('batchSave').disabled, true);
    await a.save();
    assert.equal(a.writes.length, 0);
  });

  await test('fecha pasada continúa bloqueada con explicación visible', async () => {
    const a = app('El diecinueve de noviembre a las 10:15 reunión');
    a.node('bDate0').value = '2026-11-08';
    a.refresh();
    assert.equal(a.node('batchSave').disabled, true);
    assert.match(a.node('bIssue0').textContent, /pasado|pasada/i);
    await a.save();
    assert.equal(a.writes.length, 0);
  });

  await test('03:45 y 15:45 distinguen madrugada y tarde en el resumen', () => {
    for (const [time, period] of [['03:45', 'madrugada'], ['15:45', 'tarde']]) {
      const a = app('El diecinueve de noviembre a las ' + time + ' reunión');
      assert.equal(a.node('batchSave').disabled, false);
      assert.equal(a.node('bIssue0').textContent, '19/11/2026 · ' + time + ' de la ' + period + '.');
    }
  });

  const result = { clock: now, environment: 'Node VM; production parser, review and submit functions; synthetic DOM/storage; no real notifications', total: tests.length, passed: tests.filter(t => t.pass).length, failed: tests.filter(t => !t.pass).length, tests };
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
})();
