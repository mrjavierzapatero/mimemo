const clean = value => String(value || '').trim();

// In continuous PTT, matches is only the current recognition segment.
// The Android plugin sends completed segments in accumulated.
export function textFromSpeechEvent(event = {}) {
  const complete = clean(event.accumulatedText);
  if (complete) return { text: complete, final: true };
  const previous = clean(event.accumulated);
  if (event.isRestarting && previous) return { text: previous, final: true };
  const current = clean(event.matches?.[0]);
  return { text: [previous, current].filter(Boolean).join(' '), final: false };
}

export function keepLongerPartial(previous, next) {
  const oldText = clean(previous);
  const newText = clean(next);
  return !!oldText && newText.length < oldText.length &&
    oldText.toLocaleLowerCase('es').startsWith(newText.toLocaleLowerCase('es'));
}
