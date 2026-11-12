import { Capacitor, registerPlugin } from '@capacitor/core';

const Dictation = registerPlugin('LeteoDictation');
const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
let generation = 0;
let listeners = [];
let transcript = '';
let handlers = {};
let active = false;
let nativeRequested = false;
let stopping = null;
let discardResults = false;

async function removeListeners() {
  const old = listeners;
  listeners = [];
  await Promise.allSettled(old.map(listener => listener.remove()));
}
function receive(value) {
  if (discardResults) return;
  const text = String(value || '').trim();
  if (!text) return;
  transcript = text;
  handlers.onText?.(text);
}

async function start(callbacks) {
  if (!native) return { ok: false, reason: 'web' };
  if (stopping) await stopping;
  if (active) return { ok: false, reason: 'already-active' };
  const token = ++generation;
  let reported = false;
  handlers = callbacks || {};
  transcript = '';
  nativeRequested = false;
  discardResults = false;
  try {
    const permission = await Dictation.requestPermissions();
    if (token !== generation) return { ok: false, reason: 'cancelled' };
    if (permission.microphone !== 'granted') return { ok: false, reason: 'microphone-permission' };
    await removeListeners();
    if (token !== generation) return { ok: false, reason: 'cancelled' };
    const ownListeners = await Promise.all([
      Dictation.addListener('partialResults', event => {
        if (token === generation) receive(event.text);
      }),
      Dictation.addListener('audioLevel', event => {
        if (token === generation) handlers.onLevel?.(Math.max(0, Math.min(1, Number(event.level) || 0)));
      }),
      Dictation.addListener('listeningState', event => {
        if (token !== generation) return;
        active = event.status === 'started';
        handlers.onState?.(event);
      }),
      Dictation.addListener('error', event => {
        if (token !== generation) return;
        reported = true;
        handlers.onError?.(event);
      })
    ]);
    if (token !== generation) {
      await Promise.allSettled(ownListeners.map(listener => listener.remove()));
      return { ok: false, reason: 'cancelled' };
    }
    listeners = ownListeners;
    nativeRequested = true;
    const result = await Dictation.start();
    if (result?.ok === false) return result;
    if (token !== generation) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: true };
  } catch (error) {
    if (token !== generation) return { ok: false, reason: 'cancelled' };
    active = false;
    nativeRequested = false;
    await removeListeners();
    return { ok: false, reason: 'start-failed', reported, message: String(error?.message || error) };
  }
}

function stop(discard = false) {
  if (!native) return Promise.resolve();
  if (stopping) return stopping;
  discardResults = discard;
  const shouldStopNative = nativeRequested;
  // Cancelling a permission/startup wait must invalidate it immediately.
  // There is no current native transcript to fetch in that case.
  if (!shouldStopNative) ++generation;
  // Keep callbacks alive until Android closes the PCM stream and delivers
  // the final segment. Review waits for this promise before reading the text.
  stopping = (async () => {
    try {
      if (shouldStopNative) {
        const result = await Dictation.stop({ discard });
        if (!discard) receive(result?.text || transcript);
      }
    } catch (error) {
      if (!discard) handlers.onError?.({message:'No se pudo completar la última frase. Revisa el dictado antes de guardar.'});
    } finally {
      ++generation;
      active = false;
      nativeRequested = false;
      handlers.onLevel?.(0);
      await removeListeners();
      handlers = {};
      stopping = null;
    }
  })();
  return stopping;
}

window.LeteoNativeSpeech = { native, start, stop };
