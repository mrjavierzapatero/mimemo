package com.figarolab.leteo;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
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
import java.util.ArrayList;
import java.util.List;

/** Keeps one dictation open across utterances from the device's speech service. */
@CapacitorPlugin(name = "LeteoDictation", permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
})
public class LeteoDictationPlugin extends Plugin {
    private static final long START_TIMEOUT_MS = 12000;
    private static final long FINAL_TIMEOUT_MS = 7000;
    private static final long RETRY_DELAY_MS = 180;
    private static final int MAX_EMPTY_UTTERANCES = 3;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Session active;

    private static final class Session {
        final TranscriptAccumulator transcript = new TranscriptAccumulator();
        final List<PluginCall> stops = new ArrayList<>();
        PluginCall start;
        SpeechRecognizer recognizer;
        Runnable timeout;
        boolean stopping;
        boolean ready;
        int emptyUtterances;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneGranted");
            return;
        }
        main.post(() -> startSession(call));
    }

    @PermissionCallback
    private void microphoneGranted(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            main.post(() -> startSession(call));
        } else {
            call.reject("Activa el permiso del micrófono para dictar.", "MICROPHONE_PERMISSION");
        }
    }

    private void startSession(PluginCall call) {
        if (active != null) {
            call.reject("Ya hay un dictado en curso.", "ALREADY_RECORDING");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("No hay un servicio de reconocimiento de voz disponible en este teléfono.", "RECOGNIZER_UNAVAILABLE");
            return;
        }
        Session session = new Session();
        session.start = call;
        active = session;
        listen(session);
    }

    private void listen(Session session) {
        if (active != session || session.stopping) return;
        session.ready = false;
        try {
            SpeechRecognizer recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            session.recognizer = recognizer;
            recognizer.setRecognitionListener(listener(session, recognizer));
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            setTimeout(session, START_TIMEOUT_MS, () ->
                fail(session, "START_TIMEOUT", "El servicio de voz no volvió a escuchar. Puedes continuar el dictado."));
            recognizer.startListening(intent);
        } catch (RuntimeException error) {
            fail(session, "START_FAILED", "No se pudo abrir el micrófono. Puedes volver a intentarlo.");
        }
    }

    private RecognitionListener listener(Session session, SpeechRecognizer recognizer) {
        return new RecognitionListener() {
            private boolean current() {
                return active == session && session.recognizer == recognizer;
            }

            @Override public void onReadyForSpeech(Bundle params) { ready(); }
            @Override public void onBeginningOfSpeech() { ready(); }
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int type, Bundle params) {}

            private void ready() {
                if (!current() || session.ready || session.stopping) return;
                session.ready = true;
                clearTimeout(session);
                emitState("started", "microphone-ready");
                if (session.start != null) {
                    session.start.resolve(new JSObject().put("ok", true));
                    session.start = null;
                }
            }

            @Override public void onRmsChanged(float rms) {
                if (!current() || session.stopping) return;
                double level = Math.max(0, Math.min(1, (rms + 2) / 12));
                notifyListeners("audioLevel", new JSObject().put("level", level));
            }

            @Override public void onPartialResults(Bundle results) {
                if (!current()) return;
                ready();
                String text = best(results);
                if (!text.isEmpty()) session.transcript.partial(text);
                emitText(session);
            }

            @Override public void onResults(Bundle results) {
                if (!current()) return;
                endUtterance(session, best(results));
            }

            @Override public void onError(int error) {
                if (!current()) return;
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    endUtterance(session, "");
                    return;
                }
                String message = error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                    ? "Activa el permiso del micrófono para dictar."
                    : "Se interrumpió el servicio de voz. El texto queda aquí para continuar o corregirlo.";
                fail(session, "RECOGNIZER_" + error, message);
            }
        };
    }

    private void endUtterance(Session session, String text) {
        // A provider may end an utterance with only a partial hypothesis.
        // Retain it as editable text instead of replacing the whole dictation.
        boolean hasText = session.transcript.finishUtterance(text);
        emitText(session);
        if (session.stopping) {
            finish(session, "user-stop", false, true);
            return;
        }
        session.emptyUtterances = hasText ? 0 : session.emptyUtterances + 1;
        if (session.emptyUtterances >= MAX_EMPTY_UTTERANCES) {
            fail(session, "NO_SPEECH", "El dictado se detuvo tras varios silencios. Toca el micrófono para continuar.");
            return;
        }
        releaseRecognizer(session);
        emitState("reconnecting", "utterance-ended");
        setTimeout(session, RETRY_DELAY_MS, () -> listen(session));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            Session session = active;
            if (session == null) {
                call.resolve(new JSObject().put("text", "").put("final", true));
                return;
            }
            session.stops.add(call);
            if (Boolean.TRUE.equals(call.getBoolean("discard", false))) {
                finish(session, "discard", true, false);
                return;
            }
            if (session.stopping) return;
            session.stopping = true;
            if (session.recognizer == null || !session.ready) {
                finish(session, "user-stop", false, true);
                return;
            }
            setTimeout(session, FINAL_TIMEOUT_MS, () ->
                fail(session, "FINAL_RESULT_TIMEOUT", "El servicio de voz no confirmó el final. Revisa las últimas palabras."));
            try {
                session.recognizer.stopListening();
            } catch (RuntimeException error) {
                fail(session, "STOP_FAILED", "El servicio de voz no confirmó el final. Revisa las últimas palabras.");
            }
        });
    }

    private void setTimeout(Session session, long delay, Runnable callback) {
        clearTimeout(session);
        session.timeout = callback;
        main.postDelayed(callback, delay);
    }

    private void clearTimeout(Session session) {
        if (session.timeout != null) main.removeCallbacks(session.timeout);
        session.timeout = null;
    }

    private void releaseRecognizer(Session session) {
        SpeechRecognizer recognizer = session.recognizer;
        session.recognizer = null;
        if (recognizer == null) return;
        try { recognizer.destroy(); } catch (RuntimeException ignored) {}
    }

    private void emitText(Session session) {
        notifyListeners("partialResults", new JSObject().put("text", session.transcript.text()));
    }

    private void emitState(String status, String reason) {
        notifyListeners("listeningState", new JSObject().put("status", status).put("reason", reason));
    }

    private static String best(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return matches == null || matches.isEmpty() || matches.get(0) == null ? "" : matches.get(0).trim();
    }

    private void fail(Session session, String code, String message) {
        if (active != session) return;
        notifyListeners("error", new JSObject().put("code", code).put("message", message));
        if (session.start != null) {
            session.start.reject(message, code);
            session.start = null;
        }
        finish(session, "error", false, false);
    }

    private void finish(Session session, String reason, boolean discard, boolean finalResult) {
        if (active != session) return;
        active = null;
        clearTimeout(session);
        releaseRecognizer(session);
        if (session.start != null) {
            session.start.resolve(new JSObject().put("ok", false).put("reason", "cancelled"));
            session.start = null;
        }
        String text = discard ? "" : session.transcript.text();
        if (!discard) emitText(session);
        notifyListeners("audioLevel", new JSObject().put("level", 0));
        emitState("stopped", reason);
        for (PluginCall call : session.stops) {
            call.resolve(new JSObject().put("text", text).put("final", finalResult));
        }
    }

    @Override protected void handleOnPause() {
        main.post(() -> { if (active != null) finish(active, "background", false, false); });
    }

    @Override protected void handleOnDestroy() {
        main.post(() -> { if (active != null) finish(active, "destroyed", false, false); });
    }
}
