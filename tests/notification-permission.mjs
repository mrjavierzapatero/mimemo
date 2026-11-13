import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { build } from '../android-app/node_modules/esbuild/lib/main.js';

const calls = [];
const notifications = {
  checkPermissions: async () => ({ display: 'denied' }),
  requestPermissions: async () => ({ display: 'denied' }),
  cancel: async () => { calls.push('cancel'); },
};
const plugin = {
  name: 'mock-capacitor',
  setup(bundle) {
    bundle.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'mock' }));
    bundle.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
      contents: args.path === '@capacitor/core'
        ? 'export const Capacitor = globalThis.mockCapacitor;'
        : 'export const LocalNotifications = globalThis.mockNotifications;',
      loader: 'js'
    }));
  }
};
const result = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../android-app/src/notifications.mjs')],
  bundle: true, format: 'iife', platform: 'browser', write: false, plugins: [plugin]
});
const context = { window: {}, mockNotifications: notifications,
  mockCapacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } };
vm.runInNewContext(result.outputFiles[0].text, context);
const outcome = await context.window.LeteoNativeAlerts.scheduleItem({ id: 'existing-alarm' });
assert.equal(outcome.ok, false);
assert.equal(outcome.reason, 'notification-permission');
assert.deepEqual(calls, [], 'A denied permission must not cancel previously scheduled alarms');
notifications.checkPermissions = async () => ({ display: 'granted' });
notifications.checkExactNotificationSetting = async () => ({ exact_alarm: 'granted' });
notifications.createChannel = async () => {};
let channel = { id: 'leteo-alerts-v2', importance: 0 };
notifications.listChannels = async () => ({ channels: [channel] });
const alerts = context.window.LeteoNativeAlerts;
assert.equal((await alerts.testSound()).reason, 'channel-blocked');
channel = { ...channel, importance: 4 };
assert.equal((await alerts.testSound()).reason, 'channel-silent');
assert.deepEqual(calls, [], 'A blocked or silent channel must not claim a successful sound test');

channel.sound = 'android.resource://com.figarolab.leteo/raw/leteo_notice';
const item = { id: 'fixture', agenda: {
  title: 'Piano', recurrence: 'weekly', time: '15:45', fingerprint: 'same',
  occurrences: [{ reminders: [{ kind: 'one-hour-before', at: '2026-11-12T13:45:00.000Z' }] }]
} };
let pending = [];
notifications.getPending = async () => ({ notifications: pending });
notifications.schedule = async ({ notifications: requested }) => {
  calls.push('schedule');
  pending = requested;
  return {};
};
assert.equal((await alerts.syncAll([item])).ok, true);
assert.equal((await alerts.syncAll([item])).ok, true);
assert.deepEqual(calls, ['schedule']);
assert.equal((await alerts.activateAll([item])).ok, true);
assert.deepEqual(calls, ['schedule', 'schedule'], 'Rearm sends the alarm again even if Capacitor has a saved record');
console.log('Notification regressions: denied permission preserves existing alarms, silent channels are reported, and manual rearm replaces saved schedules.');
