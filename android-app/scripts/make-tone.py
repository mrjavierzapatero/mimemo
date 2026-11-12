"""Generate Leteo's three-ring notification tone as PCM WAV."""

import math
import wave
from pathlib import Path

RATE = 44100
RING_TIMES = (0.0, 2.0, 4.0)
PULSE_DURATION = 0.44
DURATION = 5.12
output = Path(__file__).resolve().parents[1] / "assets" / "leteo_notice.wav"
output.parent.mkdir(parents=True, exist_ok=True)

frames = bytearray()
for i in range(round(RATE * DURATION)):
    t = i / RATE
    signal = 0.0
    for ring_start in RING_TIMES:
        for offset in (0.0, 0.58):
            elapsed = t - ring_start - offset
            if 0.0 <= elapsed < PULSE_DURATION:
                envelope = min(1.0, elapsed / 0.025, (PULSE_DURATION - elapsed) / 0.07)
                carrier = (
                    0.55 * math.sin(math.tau * 620 * elapsed)
                    + 0.30 * math.sin(math.tau * 820 * elapsed)
                    + 0.15 * math.sin(math.tau * 1100 * elapsed)
                )
                signal += 0.65 * envelope * carrier
    frames.extend(round(signal * 32767).to_bytes(2, "little", signed=True))

with wave.open(str(output), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(frames)

print(output)
