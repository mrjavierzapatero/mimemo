"""Generate Leteo's short, soft Android notification sound as PCM WAV."""

import math
import wave
from pathlib import Path

rate = 44100
duration = 0.68
samples = int(rate * duration)
out = Path(__file__).resolve().parents[1] / "assets" / "leteo_notice.wav"
out.parent.mkdir(parents=True, exist_ok=True)

with wave.open(str(out), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    frames = bytearray()
    for i in range(samples):
        t = i / rate
        attack = min(1.0, t / 0.025)
        release = min(1.0, (duration - t) / 0.17)
        envelope = max(0.0, min(attack, release)) ** 1.7
        first = math.sin(2 * math.pi * 660 * t)
        second = math.sin(2 * math.pi * 880 * t) if t >= 0.20 else 0.0
        second_fade = min(1.0, max(0.0, (t - 0.20) / 0.08))
        value = 0.22 * envelope * (0.70 * first + 0.30 * second_fade * second)
        pcm = int(max(-1.0, min(1.0, value)) * 32767)
        frames += pcm.to_bytes(2, "little", signed=True)
    wav.writeframes(frames)

print(out)
