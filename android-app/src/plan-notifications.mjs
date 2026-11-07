const zone = 'Europe/Madrid';
const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
});

function civilParts(iso) {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(iso))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { ...parts, weekday: day + 1 }; // Capacitor: Sunday = 1.
}

function notificationId(itemId, kind) {
  const key = `${itemId}:${kind}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function repeatSchedule(recurrence, at) {
  const { month, day, weekday, hour, minute } = civilParts(at);
  if (recurrence === 'daily') return { on: { hour, minute }, allowWhileIdle: true };
  if (recurrence === 'weekly') return { on: { weekday, hour, minute }, allowWhileIdle: true };
  if (recurrence === 'yearly') return { on: { month, day, hour, minute }, allowWhileIdle: true };
  return null;
}

export function planNotifications(item, now = new Date()) {
  const agenda = item?.agenda;
  if (!agenda || agenda.status === 'cancelled' || !Array.isArray(agenda.occurrences)) return [];
  const first = agenda.occurrences[0];
  if (!first || !Array.isArray(first.reminders)) return [];
  const recurring = ['daily', 'weekly', 'yearly'].includes(agenda.recurrence);
  const eventLabel = recurring
    ? (agenda.time ? `Cita a las ${agenda.time}` : 'Cita de día completo')
    : [agenda.date, agenda.time].filter(Boolean).join(' · ');
  return first.reminders.flatMap(reminder => {
    if (!reminder.at || !reminder.kind || reminder.status === 'after-event') return [];
    const schedule = recurring
      ? repeatSchedule(agenda.recurrence, reminder.at)
      : Date.parse(reminder.at) > +now
        ? { at: new Date(reminder.at), allowWhileIdle: true }
        : null;
    if (!schedule) return [];
    return [{
      id: notificationId(item.id, reminder.kind),
      title: agenda.title || item.title || 'Leteo',
      body: [reminder.label, eventLabel].filter(Boolean).join(' · '),
      schedule,
      channelId: 'leteo-alerts-v1',
      foreground: true,
      isExactNotification: true,
      isExactMandatory: true,
      extra: { leteo: true, itemId: item.id, kind: reminder.kind }
    }];
  });
}

export function notificationIds(item) {
  return ['day-before', 'same-day-morning', 'one-hour-before']
    .map(kind => ({ id: notificationId(item.id, kind) }));
}
