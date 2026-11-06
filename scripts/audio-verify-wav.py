"""Independent PCM/WAV integrity check using Python's standard decoder."""
import json
import math
from pathlib import Path
import struct
import wave

results = []
for source in sorted(Path("examples/audio").glob("*.sound.json")):
    project = json.loads(source.read_text(encoding="utf-8"))
    target = source.with_name(source.name.replace(".sound.json", ".wav"))
    raw = target.read_bytes()
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WAVE", target
    assert struct.unpack_from("<I", raw, 4)[0] == len(raw) - 8, target
    with wave.open(str(target), "rb") as decoded:
        assert decoded.getnchannels() == 1, target
        assert decoded.getsampwidth() == 2, target
        assert decoded.getframerate() == project["sampleRate"], target
        count = math.floor(project["durationMs"] * project["sampleRate"] / 1000 + 0.5)
        assert decoded.getnframes() == count, target
        assert decoded.getcomptype() == "NONE", target
        samples = struct.unpack(f"<{count}h", decoded.readframes(count))
    assert max(abs(x) for x in samples) > 0, target
    assert samples[0] == 0 and samples[-1] == 0, target
    assert len(raw) == 44 + 2 * count, target
    results.append({"file": str(target), "sampleRate": project["sampleRate"],
                    "samples": count, "bytes": len(raw),
                    "pcmMin": min(samples), "pcmMax": max(samples)})
assert len(results) == 5, "Expected five original demonstrations"
print(json.dumps({"ok": True, "decoder": "Python standard wave", "files": results}))
