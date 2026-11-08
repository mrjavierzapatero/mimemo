package com.figarolab.leteo;

import android.Manifest;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Owns the microphone until the user stops; silence only completes text segments. */
@CapacitorPlugin(name = "LeteoDictation", permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
})
public class LeteoDictationPlugin extends Plugin {
    private static final int SAMPLE_RATE = 16000;
    private static final int CHUNK_SAMPLES = 320;
    private static final long START_TIMEOUT_MS = 12000;
    private static final long FINAL_TIMEOUT_MS = 7000;
    private final Handler main = new Handler(Looper.getMainLooper());
    // All session state except explicitly volatile capture fields belongs to main.
    private Session active;
    private String lastText = "";

    private static final class Session {
        final TranscriptAccumulator transcript = new TranscriptAccumulator();
        final List<PluginCall> stops = new ArrayList<>();
        final ArrayBlockingQueue<byte[]> chunks = new ArrayBlockingQueue<>(500);
        final Object audioLock = new Object();
        PluginCall start;
        SpeechRecognizer recognizer;
        ParcelFileDescriptor readPipe;
        ParcelFileDescriptor writePipe;
        AudioRecord recorder;
        Thread captureThread;
        Thread writerThread;
        Runnable startTimeout;
        Runnable finalTimeout;
        volatile OutputStream output;
        volatile boolean captureRequested = true;
        volatile boolean captureFinished;
        volatile boolean ended;
        boolean stopRequested;
        boolean discard;
        boolean ready;
        boolean microphoneStarted;
        boolean reportedStarted;
        boolean listeningDispatched;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneGranted");
            return;
        }
        main.post(() -> createSession(call));
    }

    @PermissionCallback
    private void microphoneGranted(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Activa el permiso del micrófono para dictar.", "MICROPHONE_PERMISSION");
        } else {
            main.post(() -> createSession(call));
        }
    }

    private void createSession(PluginCall call) {
        if (active != null) {
            call.reject("Ya hay un dictado en curso.", "ALREADY_RECORDING");
            return;
        }
        if (Build.VERSION.SDK_INT < 33) {
            call.reject("El dictado continuo de esta versión necesita Android 13 o posterior.", "UNSUPPORTED_ANDROID");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("No hay un servicio de reconocimiento de voz disponible en este teléfono.", "RECOGNIZER_UNAVAILABLE");
            return;
        }
        Session session = new Session();
        session.start = call;
        active = session;
        lastText = "";
        try {
            ParcelFileDescriptor[] pipes = ParcelFileDescriptor.createPipe();
            session.readPipe = pipes[0];
            session.writePipe = pipes[1];
            session.recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            session.recognizer.setRecognitionListener(listener(session));
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, session.readPipe)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SAMPLE_RATE)
                .putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
            session.startTimeout = () -> fail(session, "START_TIMEOUT", "El servicio de voz no ha iniciado el dictado. Vuelve a intentarlo.");
            main.postDelayed(session.startTimeout, START_TIMEOUT_MS);
            session.recognizer.checkRecognitionSupport(intent, getContext().getMainExecutor(), new RecognitionSupportCallback() {
                @Override public void onSupportResult(RecognitionSupport support) { begin(session, intent); }
                @Override public void onError(int error) {
                    if (error == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT) begin(session, intent);
                    else fail(session, "UNSUPPORTED_RECOGNITION", "El servicio de voz no admite este dictado en español. Comprueba el servicio de voz del teléfono.");
                }
            });
        } catch (Exception error) {
            fail(session, "START_FAILED", "No se pudo iniciar el dictado continuo. Vuelve a intentarlo.");
        }
    }

    private void begin(Session session, Intent intent) {
        if (!current(session) || session.stopRequested || session.listeningDispatched) return;
        session.listeningDispatched = true;
        try {
            int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) throw new IllegalStateException("Audio format unavailable");
            session.recorder = new AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
                .setBufferSizeInBytes(Math.max(minimum * 2, 6400)).build();
            if (session.recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Microphone unavailable");
            session.recognizer.startListening(intent);
            session.writerThread = new Thread(() -> writeAudio(session), "leteo-speech-stream");
            session.captureThread = new Thread(() -> capture(session), "leteo-microphone");
            session.writerThread.start();
            session.captureThread.start();
        } catch (Exception error) {
            fail(session, "MICROPHONE_START_FAILED", "No se pudo abrir el micrófono. Comprueba que otra aplicación no lo esté usando.");
        }
    }

    private void capture(Session session) {
        AudioRecord recorder = session.recorder;
        short[] samples = new short[CHUNK_SAMPLES];
        long lastMeter = 0;
        try {
            synchronized (session.audioLock) {
                if (!session.captureRequested || session.ended) return;
                recorder.startRecording();
                if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("Microphone did not start");
            }
            main.post(() -> { session.microphoneStarted = true; reportStarted(session); });
            while (session.captureRequested && !session.ended) {
                int count = recorder.read(samples, 0, samples.length, AudioRecord.READ_BLOCKING);
                if (count < 0) {
                    if (session.captureRequested) throw new IOException("Audio read failed");
                    break;
                }
                if (count == 0) continue;
                byte[] pcm = new byte[count * 2];
                double energy = 0;
                for (int i = 0; i < count; i++) {
                    pcm[i * 2] = (byte) (samples[i] & 0xff);
                    pcm[i * 2 + 1] = (byte) ((samples[i] >> 8) & 0xff);
                    energy += (double) samples[i] * samples[i];
                }
                if (!session.chunks.offer(pcm)) throw new IOException("Speech service is not reading audio");
                long now = SystemClock.elapsedRealtime();
                if (now - lastMeter >= 50) {
                    lastMeter = now;
                    double db = 20 * Math.log10(Math.max(1, Math.sqrt(energy / count)) / 32768.0);
                    double level = Math.max(0, Math.min(1, (db + 50) / 40));
                    main.post(() -> { if (current(session) && !session.stopRequested) notifyListeners("audioLevel", new JSObject().put("level", level)); });
                }
            }
        } catch (Exception error) {
            if (!session.ended) main.post(() -> fail(session, "AUDIO_CAPTURE_FAILED", "El servicio de voz ha interrumpido la entrada de audio. El texto reconocido se conserva."));
        } finally {
            synchronized (session.audioLock) {
                try { if (recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) recorder.stop(); } catch (Exception ignored) {}
                try { recorder.release(); } catch (RuntimeException ignored) {}
            }
            session.captureFinished = true;
        }
    }

    private void writeAudio(Session session) {
        try (OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(session.writePipe)) {
            session.output = output;
            while (!session.ended && (!session.captureFinished || !session.chunks.isEmpty())) {
                byte[] chunk = session.chunks.poll(100, TimeUnit.MILLISECONDS);
                if (chunk != null) output.write(chunk);
            }
            // Closing the writer sends EOF; the recognizer can finalize the last segment.
        } catch (Exception error) {
            if (!session.ended) main.post(() -> fail(session, "AUDIO_STREAM_FAILED", "El servicio de voz cerró el audio antes de tiempo. El texto reconocido se conserva."));
        } finally {
            session.output = null;
        }
    }

    private RecognitionListener listener(Session session) {
        return new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { session.ready = true; reportStarted(session); }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { /* A pause is not a user stop. */ }
            @Override public void onEvent(int eventType, Bundle params) {}
            @Override public void onPartialResults(Bundle results) {
                if (!current(session)) return;
                session.ready = true;
                reportStarted(session);
                session.transcript.partial(best(results));
                emitText(session);
            }
            @Override public void onSegmentResults(Bundle results) {
                if (!current(session)) return;
                session.ready = true;
                reportStarted(session);
                session.transcript.segment(best(results));
                emitText(session);
            }
            @Override public void onResults(Bundle results) {
                if (!current(session)) return;
                session.transcript.terminal(best(results));
                emitText(session);
                if (session.stopRequested) finish(session, "user-stop", true);
                else fail(session, "SEGMENTED_MODE_UNSUPPORTED", "El servicio de voz del teléfono ha cortado el dictado. No admite la grabación continua de esta versión.");
            }
            @Override public void onEndOfSegmentedSession() {
                if (!current(session)) return;
                if (session.stopRequested) finish(session, "user-stop", true);
                else fail(session, "SEGMENTED_SESSION_ENDED", "El servicio de voz ha cerrado el dictado antes de que lo detuvieras. El texto reconocido se conserva.");
            }
            @Override public void onError(int error) {
                if (!current(session)) return;
                if (session.stopRequested && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                    // A silent last segment after an explicit stop is normal;
                    // retain every previous segment and the latest partial.
                    finish(session, "user-stop", false);
                } else {
                    String message = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                        ? "Activa el permiso del micrófono para dictar."
                        : error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                            ? "Se perdió la conexión con el servicio de voz. El texto reconocido se conserva."
                            : "El servicio de voz interrumpió el dictado (" + error + "). El texto reconocido se conserva.";
                    fail(session, "RECOGNIZER_" + error, message);
                }
            }
        };
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            Session session = active;
            if (session == null) { call.resolve(new JSObject().put("text", "").put("final", true)); return; }
            session.stops.add(call);
            if (session.ended) {
                if (Boolean.TRUE.equals(call.getBoolean("discard", false))) session.discard = true;
                return;
            }
            if (Boolean.TRUE.equals(call.getBoolean("discard", false))) {
                session.discard = true;
                finish(session, "discard", false);
                return;
            }
            if (session.stopRequested) return;
            session.stopRequested = true;
            if (session.startTimeout != null) main.removeCallbacks(session.startTimeout);
            requestCaptureStop(session);
            if (!session.listeningDispatched) { finish(session, "user-stop", true); return; }
            session.finalTimeout = () -> {
                if (!current(session)) return;
                notifyListeners("error", new JSObject().put("code", "FINAL_RESULT_TIMEOUT")
                    .put("message", "El servicio de voz no confirmó el final. Revisa las últimas palabras del dictado."));
                finish(session, "final-timeout", false);
            };
            main.postDelayed(session.finalTimeout, FINAL_TIMEOUT_MS);
        });
    }

    private void reportStarted(Session session) {
        if (!current(session) || session.stopRequested || session.reportedStarted || !session.ready || !session.microphoneStarted) return;
        session.reportedStarted = true;
        main.removeCallbacks(session.startTimeout);
        notifyListeners("listeningState", new JSObject().put("status", "started").put("reason", "user-start"));
        if (session.start != null) { session.start.resolve(new JSObject().put("ok", true)); session.start = null; }
    }

    private void emitText(Session session) {
        if (!session.discard) notifyListeners("partialResults", new JSObject().put("text", session.transcript.text()));
    }

    private static String best(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return matches == null || matches.isEmpty() ? "" : matches.get(0);
    }

    private boolean current(Session session) { return active == session && !session.ended; }

    private void fail(Session session, String code, String message) {
        if (!current(session)) return;
        notifyListeners("error", new JSObject().put("code", code).put("message", message));
        if (session.start != null) { session.start.reject(message, code); session.start = null; }
        finish(session, "error", false);
    }

    private void requestCaptureStop(Session session) {
        session.captureRequested = false;
        new Thread(() -> {
            synchronized (session.audioLock) {
                if (session.recorder != null && !session.captureFinished) {
                    try { if (session.recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) session.recorder.stop(); }
                    catch (Exception ignored) {}
                }
            }
        }, "leteo-microphone-stop").start();
    }

    private void finish(Session session, String reason, boolean finalResult) {
        if (!current(session)) return;
        session.ended = true;
        if (session.startTimeout != null) main.removeCallbacks(session.startTimeout);
        if (session.finalTimeout != null) main.removeCallbacks(session.finalTimeout);
        if (session.start != null) {
            session.start.resolve(new JSObject().put("ok", false).put("reason", "cancelled"));
            session.start = null;
        }
        requestCaptureStop(session);
        if (session.recognizer != null) {
            try { session.recognizer.cancel(); } catch (RuntimeException ignored) {}
            try { session.recognizer.destroy(); } catch (RuntimeException ignored) {}
            session.recognizer = null;
        }
        // Potentially blocking IO cleanup must not run on the UI thread.
        new Thread(() -> {
            if (session.writerThread != null) session.writerThread.interrupt();
            close(session.readPipe);
            close(session.writePipe);
            OutputStream output = session.output;
            if (output != null) { try { output.close(); } catch (IOException ignored) {} }
            if ((session.captureThread == null || !session.captureThread.isAlive()) && session.recorder != null && !session.captureFinished) {
                synchronized (session.audioLock) { session.recorder.release(); session.captureFinished = true; }
            }
            join(session.captureThread);
            join(session.writerThread);
            main.post(() -> complete(session, reason, finalResult));
        }, "leteo-speech-cleanup").start();
    }

    private void complete(Session session, String reason, boolean finalResult) {
        if (active == session) active = null;
        lastText = session.discard ? "" : session.transcript.text();
        notifyListeners("audioLevel", new JSObject().put("level", 0));
        if (!session.discard) emitText(session);
        notifyListeners("listeningState", new JSObject().put("status", "stopped").put("reason", reason));
        for (PluginCall stop : session.stops) stop.resolve(new JSObject().put("text", lastText).put("final", finalResult));
        session.stops.clear();
    }

    private static void join(Thread thread) {
        if (thread != null) try { thread.join(1000); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
    }

    private static void close(ParcelFileDescriptor descriptor) {
        if (descriptor != null) try { descriptor.close(); } catch (IOException ignored) {}
    }

    @Override protected void handleOnPause() {
        main.post(() -> { if (active != null) finish(active, "background", false); });
    }

    @Override protected void handleOnDestroy() {
        main.post(() -> { if (active != null) finish(active, "destroyed", false); });
    }
}
