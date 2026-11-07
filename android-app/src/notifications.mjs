import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { planNotifications, notificationIds } from './plan-notifications.mjs';

const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const channelId = 'leteo-alerts-v1';
let channelReady = false;

async function ensureReady(request = false) {
  if (!native) return { ok: false, reason: 'web' };
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && request)
    permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return { ok: false, reason: 'notification-permission' };
  let exact = await LocalNotifications.checkExactNotificationSetting();
  if (exact.exact_alarm !== 'granted' && request) {
    await LocalNotifications.changeExactNotificationSetting();
    exact = await LocalNotifications.checkExactNotificationSetting();
  }
  if (exact.exact_alarm !== 'granted') return { ok: false, reason: 'exact-alarm-permission' };
  if (!channelReady) {
    await LocalNotifications.createChannel({
      id: channelId,
      name: 'Avisos de Leteo',
      description: 'Recordatorios de las citas guardadas en Casa',
      importance: 4,
      sound: 'leteo_notice.wav',
      vibration: true,
      visibility: 1
    });
    channelReady = true;
  }
  return { ok: true };
}

async function cancelItem(item) {
  if (!native || !item?.id) return { ok: false, reason: 'web' };
  await LocalNotifications.cancel({ notifications: notificationIds(item) });
  return { ok: true };
}

async function scheduleItem(item, requestPermission = true) {
  if (!native) return { ok: false, reason: 'web' };
  await cancelItem(item);
  const ready = await ensureReady(requestPermission);
  if (!ready.ok) return ready;
  const planned = planNotifications(item);
  if (!planned.length) return { ok: true, count: 0 };
  const result = await LocalNotifications.schedule({ notifications: planned });
  if (result.warning) return { ok: false, reason: 'inexact', warning: result.warning.code };
  const pending = await LocalNotifications.getPending();
  const active = new Set(pending.notifications.map(n => n.id));
  const count = planned.filter(n => active.has(n.id)).length;
  return count === planned.length ? { ok: true, count } : { ok: false, reason: 'missing-pending', count };
}

async function syncAll(items) {
  const ready = await ensureReady(false);
  if (!ready.ok) return ready;
  const activeItems = (items || []).filter(item => item?.agenda && item.agenda.status !== 'cancelled');
  const planned = activeItems.flatMap(item => planNotifications(item));
  const ids = new Set(planned.map(n => n.id));
  if (ids.size !== planned.length) return { ok: false, reason: 'notification-id-collision' };
  const pending = await LocalNotifications.getPending();
  const owned = pending.notifications.filter(n => n.extra?.leteo && !n.extra?.test);
  const desired = new Map(planned.map(n => [n.id, n]));
  const stale = owned.filter(n => !desired.has(n.id) || n.extra?.fingerprint !== desired.get(n.id).extra.fingerprint);
  if (stale.length) await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) });
  const current = new Set(owned.filter(n => !stale.includes(n)).map(n => n.id));
  const missing = planned.filter(n => !current.has(n.id));
  if (missing.length) {
    const result = await LocalNotifications.schedule({ notifications: missing });
    if (result.warning) return { ok: false, reason: 'inexact', warning: result.warning.code };
  }
  if (!planned.length) return { ok: true, count: 0, itemIds: [] };
  const check = await LocalNotifications.getPending();
  const confirmed = new Set(check.notifications.map(n => n.id));
  const count = planned.filter(n => confirmed.has(n.id)).length;
  return count === planned.length ? { ok: true, count, itemIds: [...new Set(planned.map(n => n.extra.itemId))] } : { ok: false, reason: 'missing-pending', count };
}

async function testNotice() {
  const ready = await ensureReady(true);
  if (!ready.ok) return ready;
  const id = 206701107;
  const result = await LocalNotifications.schedule({ notifications: [{
    id, title: 'Prueba de Leteo', body: 'Si oyes este aviso, el sonido está activo.',
    schedule: { at: new Date(Date.now() + 60000), allowWhileIdle: true },
    channelId, foreground: true, isExactNotification: true, isExactMandatory: true,
    extra: { leteo: true, test: true }
  }] });
  return result.warning ? { ok: false, reason: 'inexact' } : { ok: true, dueInSeconds: 60 };
}

async function activateAll(items) {
  const ready = await ensureReady(true);
  if (!ready.ok) return ready;
  return syncAll(items);
}

window.LeteoNativeAlerts = { native, ensureReady, cancelItem, scheduleItem, syncAll, activateAll, testNotice };
