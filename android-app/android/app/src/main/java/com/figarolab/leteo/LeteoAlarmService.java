package com.figarolab.leteo;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.net.Uri;
import android.os.*;
import androidx.core.app.NotificationCompat;

/** Owns alarm audio independently of the WebView and notification stream. */
public final class LeteoAlarmService extends Service {
    private static final String CHANNEL = "leteo-alerts-v2";
    private static final String STOP = "com.figarolab.leteo.STOP_ALARM";
    private static final long RING_MS = 60_000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private int activeId;
    private String title, body, token;
    private boolean ringing;
    private final Runnable timeout = () -> finishAlarm(true);

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if (STOP.equals(intent.getAction())) {
            if (ringing && token.equals(intent.getStringExtra("token"))) finishAlarm(true);
            return START_NOT_STICKY;
        }
        if (ringing) finishAlarm(false);
        activeId = intent.getIntExtra("notificationId", 710005);
        // Android reserves id zero for startForeground.
        if (activeId == 0) activeId = 710005;
        title = intent.getStringExtra("title");
        body = intent.getStringExtra("body");
        token = java.util.UUID.randomUUID().toString();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Avisos de Leteo", NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(tone(), attributes());
            manager.createNotificationChannel(channel);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
            if (channel.getImportance() == NotificationManager.IMPORTANCE_NONE || channel.getSound() == null) {
                stopSelf(); return START_NOT_STICKY;
            }
        }
        ringing = true;
        Notification notification = notification(true);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(activeId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        } else startForeground(activeId, notification);
        handler.postDelayed(timeout, RING_MS);
        audio = getSystemService(AudioManager.class);
        // USAGE_ALARM uses alarm volume, rather than the often-muted notification
        // stream. Respect focus changes (calls), system volume and Do Not Disturb.
        int granted;
        if (Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes()).setOnAudioFocusChangeListener(this::focusChanged).build();
            granted = audio.requestAudioFocus(focus);
        } else {
            granted = audio.requestAudioFocus(legacyFocus, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            finishAlarm(true); return START_NOT_STICKY;
        }
        Uri selected = tone();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
            if (channel != null && channel.getSound() != null) selected = channel.getSound();
        }
        if (!play(selected) && !play(tone())) finishAlarm(true);
        return START_NOT_STICKY;
    }

    private final AudioManager.OnAudioFocusChangeListener legacyFocus = this::focusChanged;
    private void focusChanged(int change) {
        if (change < 0) finishAlarm(true);
    }
    private AudioAttributes attributes() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    }
    private Uri tone() { return Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.leteo_notice); }
    private boolean play(Uri uri) {
        releasePlayer();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(attributes());
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.setOnErrorListener((mp, what, extra) -> { finishAlarm(true); return true; });
            player.prepare();
            player.start();
            return true;
        } catch (Exception error) { releasePlayer(); return false; }
    }
    private Notification notification(boolean active) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, activeId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title == null ? "Leteo" : title)
            .setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(content).setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(active).setAutoCancel(!active).setOnlyAlertOnce(true)
            // The service plays the sound once through the alarm stream.
            .setSilent(true);
        if (active) {
            Intent stop = new Intent(this, LeteoAlarmService.class).setAction(STOP).putExtra("token", token);
            PendingIntent action = PendingIntent.getService(this, activeId, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(android.R.drawable.ic_media_pause, "Detener sonido", action).setDeleteIntent(action);
        }
        return builder.build();
    }
    private void releasePlayer() {
        if (player != null) { player.release(); player = null; }
    }
    private void finishAlarm(boolean stop) {
        handler.removeCallbacks(timeout);
        releasePlayer();
        if (audio != null) {
            if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
            else audio.abandonAudioFocus(legacyFocus);
            focus = null;
        }
        if (ringing) {
            ringing = false;
            stopForeground(STOP_FOREGROUND_DETACH);
            getSystemService(NotificationManager.class).notify(activeId, notification(false));
        }
        if (stop) stopSelf();
    }
    @Override public void onDestroy() { finishAlarm(false); super.onDestroy(); }
}
