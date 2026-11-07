import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let generation = 0;
let listeners = [];
let started = false;
let transcript = '';
let handlers = {};

async function removeListeners() {
  const old = listeners;
  listeners = [];
  await Promise.allSettled(old.map(listener => listener.remove()));
}

function receive(value) {
  const next = String(value || '').trim();
  if (!next) return;
  transcript = next;
  handlers.onText?.(next);
}

async function start(callbacks) {
  if (!native) return { ok: false, reason: 'web' };
  const token = ++generation;
  handlers = callbacks || {};
  transcript = '';
  try {
    const permission = await SpeechRecognition.requestPermissions();
    if (permission.speechRecognition !== 'granted') return { ok: false, reason: 'microphone-permission' };
    const availability = await SpeechRecognition.available();
    if (!availability.available) return { ok: false, reason: 'unavailable' };
    if (token !== generation) return { ok: false, reason: 'cancelled' };
    await removeListeners();
    listeners = await Promise.all([
      SpeechRecognition.addListener('partialResults', event => {
        if (token !== generation) return;
        receive(event.accumulatedText || event.matches?.[0] || event.accumulated);
      }),
      SpeechRecognition.addListener('audioLevel', event => {
        if (token === generation) handlers.onLevel?.(Math.max(0, Math.min(1, Number(event.level) || 0)));
      }),
      SpeechRecognition.addListener('listeningState', event => {
        if (token === generation) handlers.onState?.(event);
      }),
      SpeechRecognition.addListener('error', event => {
        if (token === generation) handlers.onError?.(event);
      })
    ]);
    if (token !== generation) { await removeListeners(); return { ok: false, reason: 'cancelled' }; }
    await SpeechRecognition.start({
      language: 'es-ES', maxResults: 1, popup: false, partialResults: true,
      continuousPTT: true, allowForSilence: 3000
    });
    started = true;
    if (token !== generation) {
      await SpeechRecognition.forceStop({ timeout: 1500 });
      started = false;
      await removeListeners();
      return { ok: false, reason: 'cancelled' };
    }
    await SpeechRecognition.setPTTState({ held: true });
    return { ok: true };
  } catch (error) {
    started = false;
    await removeListeners();
    return { ok: false, reason: 'start-failed', message: String(error?.message || error) };
  }
}

async function stop(discard = false) {
  ++generation;
  if (!native) return;
  try {
    if (started) {
      const latest = await SpeechRecognition.getLastPartialResult();
      // A native last-partial can contain only the final segment of a
      // continuous session. Keep the longer accumulated transcription.
      if (!discard && String(latest?.text || '').trim().length >= transcript.length)
        receive(latest.text);
      await SpeechRecognition.setPTTState({ held: false });
      await SpeechRecognition.forceStop({ timeout: 1500 });
    }
  } catch (_) {
    // The UI keeps the last visible text and always lets the user correct it.
  } finally {
    started = false;
    handlers.onLevel?.(0);
    await removeListeners();
    handlers = {};
  }
}

window.LeteoNativeSpeech = { native, start, stop };
