package com.figarolab.leteo;

import android.media.AudioManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LeteoAlarm")
public final class LeteoAlarmPlugin extends Plugin {
    @PluginMethod public void checkAudio(PluginCall call) {
        AudioManager audio = getContext().getSystemService(AudioManager.class);
        JSObject result = new JSObject();
        result.put("volume", audio.getStreamVolume(AudioManager.STREAM_ALARM));
        call.resolve(result);
    }
}
