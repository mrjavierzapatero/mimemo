package com.figarolab.leteo;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

/** Records and decodes Spanish on the phone until the user stops the dictation. */
@CapacitorPlugin(name = "LeteoDictation", permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
})
public class LeteoDictationPlugin extends Plugin {
    private static final int SAMPLE_RATE = 16000;
    private static final int CHUNK_SAMPLES = 1600;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    // The model and recognizer belong to the audio thread.
    private Model model;
    private Session active;
    private boolean destroyed;

    private static final class Session {
        final List<PluginCall> stops = new ArrayList<>();
        final TranscriptAccumulator transcript = new TranscriptAccumulator();
        PluginCall start;
        volatile boolean stopping;
        volatile boolean discard;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            main.post(() -> begin(call));
        } else {
            requestPermissionForAlias("microphone", call, "microphoneGranted");
        }
    }

    @PermissionCallback
    private void microphoneGranted(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            main.post(() -> begin(call));
        } else {
            call.reject("Activa el permiso del micrófono para dictar.", "MICROPHONE_PERMISSION");
        }
    }

    private void begin(PluginCall call) {
        if (destroyed || active != null) {
            call.reject("El micrófono aún no está disponible.", "MICROPHONE_BUSY");
            return;
        }
        Session session = new Session();
        session.start = call;
        active = session;
        worker.execute(() -> record(session));
    }

    private void record(Session session) {
        String error = null;
        try {
            if (model == null) model = OfflineSpeechModel.open(getContext());
            if (!session.stopping) {
                try (Recognizer recognizer = new Recognizer(model, SAMPLE_RATE)) {
                    capture(session, recognizer);
                }
            }
        } catch (Exception | LinkageError failure) {
            error = "El dictado se interrumpió. Conservamos el texto reconocido.";
        } finally {
            String text = session.transcript.text();
            String problem = error;
            main.post(() -> finish(session, text, problem));
        }
    }

    @android.annotation.SuppressLint("MissingPermission")
    private void capture(Session session, Recognizer recognizer) throws IOException, JSONException {
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IOException("Audio format unavailable");
        AudioRecord recorder = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum * 2, CHUNK_SAMPLES * 4));
        try {
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("Microphone unavailable");
            if (session.stopping) return;
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IOException("Microphone not started");
            main.post(() -> ready(session));
            readAudio(session, recognizer, recorder);
        } finally {
            try {
                if (recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) recorder.stop();
            } finally {
                recorder.release();
            }
        }
        if (!session.discard) session.transcript.finishUtterance(value(recognizer.getFinalResult(), "text"));
    }

    private void readAudio(Session session, Recognizer recognizer, AudioRecord recorder) throws IOException, JSONException {
        short[] samples = new short[CHUNK_SAMPLES];
        int filled = 0;
        String lastText = "";
        while (!session.stopping) {
            int count = recorder.read(samples, filled, samples.length - filled, AudioRecord.READ_NON_BLOCKING);
            if (count < 0) throw new IOException("Audio capture stopped");
            filled += count;
            if (filled < samples.length) {
                SystemClock.sleep(15);
                continue;
            }
            decode(session, recognizer, samples, filled);
            filled = 0;
            double energy = 0;
            for (short sample : samples) energy += (double) sample * sample;
            double db = 20 * Math.log10(Math.max(1, Math.sqrt(energy / samples.length)) / 32768.0);
            double level = Math.max(0, Math.min(1, (db + 50) / 40));
            String text = session.transcript.text();
            boolean changed = !text.equals(lastText);
            lastText = text;
            main.post(() -> {
                if (active != session || session.discard) return;
                notifyListeners("audioLevel", new JSObject().put("level", level));
                if (changed) emitText(text);
            });
        }
        if (!session.discard) {
            int count = recorder.read(samples, filled, samples.length - filled, AudioRecord.READ_NON_BLOCKING);
            if (count > 0) filled += count;
            if (filled > 0) decode(session, recognizer, samples, filled);
        }
    }

    private static void decode(Session session, Recognizer recognizer, short[] samples, int length) throws JSONException {
        // Vosk may finish a text segment on silence. AudioRecord keeps reading.
        if (recognizer.acceptWaveForm(samples, length)) {
            session.transcript.finishUtterance(value(recognizer.getResult(), "text"));
        } else {
            session.transcript.partial(value(recognizer.getPartialResult(), "partial"));
        }
    }

    private static String value(String json, String key) throws JSONException {
        return new JSONObject(json).optString(key);
    }

    private void ready(Session session) {
        if (active != session || session.stopping) return;
        notifyListeners("listeningState", new JSObject().put("status", "started"));
        session.start.resolve(new JSObject().put("ok", true));
        session.start = null;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            if (active == null) {
                call.resolve(new JSObject().put("text", "").put("final", true));
                return;
            }
            active.stops.add(call);
            if (Boolean.TRUE.equals(call.getBoolean("discard", false))) active.discard = true;
            active.stopping = true;
        });
    }

    private void emitText(String text) {
        notifyListeners("partialResults", new JSObject().put("text", text));
    }

    private void finish(Session session, String text, String problem) {
        if (active != session) return;
        active = null;
        if (session.discard) text = "";
        if (problem != null && !session.discard) {
            notifyListeners("error", new JSObject().put("code", "OFFLINE_DICTATION").put("message", problem));
        }
        if (session.start != null) {
            session.start.resolve(new JSObject().put("ok", false)
                .put("reason", problem == null || session.discard ? "cancelled" : "start-failed")
                .put("reported", problem != null && !session.discard));
        }
        if (!session.discard) emitText(text);
        notifyListeners("audioLevel", new JSObject().put("level", 0));
        notifyListeners("listeningState", new JSObject().put("status", "stopped"));
        for (PluginCall call : session.stops) {
            call.resolve(new JSObject().put("text", text).put("final", problem == null));
        }
    }

    @Override protected void handleOnPause() {
        main.post(() -> { if (active != null) active.stopping = true; });
    }

    @Override protected void handleOnDestroy() {
        main.post(() -> {
            if (destroyed) return;
            destroyed = true;
            if (active != null) active.stopping = true;
            worker.execute(() -> { if (model != null) model.close(); });
            worker.shutdown();
        });
    }
}
