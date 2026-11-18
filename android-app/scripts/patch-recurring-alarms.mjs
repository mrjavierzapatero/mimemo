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
let source = readFileSync(receiver, 'utf8');
if (!source.includes(fixed)) {
  if (!source.includes(original)) throw new Error('Revisar la reprogramación de alarmas de la versión instalada de Capacitor.');
  source = source.replace(original, fixed);
}

// Deliver Leteo reminders through its alarm audio service, including with the
// WebView closed. Keep Capacitor's notification as a fallback if startup fails.
const delivery = '        notificationManager.notify(id, notification)';
const alarmDelivery = `        var alarmStarted = false
        if (notificationJson?.getJSObject("extra")?.getBoolean("leteo", false) == true) {
            val alarm = Intent().setClassName(context.packageName, context.packageName + ".LeteoAlarmService")
                .setAction("com.figarolab.leteo.RING")
                .putExtra("notificationId", id)
                .putExtra("title", notificationJson.getString("title"))
                .putExtra("body", notificationJson.getString("body"))
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(alarm)
                else context.startService(alarm)
                alarmStarted = true
            } catch (error: RuntimeException) {
                Logger.error(Logger.tags("LN"), "Unable to start Leteo alarm audio", error)
            }
        }
        if (!alarmStarted) notificationManager.notify(id, notification)`;
if (!source.includes(alarmDelivery)) {
  if (!source.includes(delivery)) throw new Error('Revisar la entrega de alarmas de Capacitor.');
  source = source.replace(delivery, alarmDelivery);
}
writeFileSync(receiver, source);
