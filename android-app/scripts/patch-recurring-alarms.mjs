import { readFileSync, writeFileSync } from 'node:fs';

// Capacitor 8.3.1 respects allowWhileIdle for the first occurrence, but
// re-arms the series with RTC after delivery. Carry the same policy forward.
const receiver = new URL('../node_modules/@capacitor/local-notifications/android/src/main/kotlin/com/capacitorjs/plugins/localnotifications/TimedNotificationPublisher.kt', import.meta.url);
const original = `        if (wantsExact && canExact) {
            alarmManager.setExact(AlarmManager.RTC, trigger, pendingIntent)
        } else {
            if (wantsExact) {
                Logger.warn("Capacitor/LocalNotification", "Exact alarms not allowed in user settings.  Notification scheduled with non-exact alarm.")
            }
            alarmManager.set(AlarmManager.RTC, trigger, pendingIntent)
        }`;
const fixed = `        val allowWhileIdle = storedNotification?.getJSObject("schedule")?.getBoolean("allowWhileIdle", false) == true
        if (wantsExact && canExact) {
            if (allowWhileIdle) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pendingIntent)
            } else {
                alarmManager.setExact(AlarmManager.RTC, trigger, pendingIntent)
            }
        } else {
            if (wantsExact) {
                Logger.warn("Capacitor/LocalNotification", "Exact alarms not allowed in user settings.  Notification scheduled with non-exact alarm.")
            }
            if (allowWhileIdle) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pendingIntent)
            } else {
                alarmManager.set(AlarmManager.RTC, trigger, pendingIntent)
            }
        }`;
const source = readFileSync(receiver, 'utf8');
if (!source.includes(fixed)) {
  if (!source.includes(original)) throw new Error('Revisar la reprogramación de alarmas de la versión instalada de Capacitor.');
  writeFileSync(receiver, source.replace(original, fixed));
}
