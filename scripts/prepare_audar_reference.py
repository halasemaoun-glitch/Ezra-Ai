#!/usr/bin/env python3
"""Prepare the approved synthetic Audar demo_male_3 Arabic reference codes."""
import json
import pathlib
import sys

import librosa
import torch
from neucodec import DistillNeuCodec

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
reference_text = "لحظة، حقاً؟ هل بنيتَ كلّ هذا بنفسك في يومين فقط؟ هذا مذهلٌ فعلاً — احكِ لي كلّ التفاصيل الآن!"

audio, _ = librosa.load(str(source), sr=16000, mono=True)
if audio.size < 80000 or audio.size > 240000:
    raise SystemExit(f"Reference duration must be 5–15 seconds; got {audio.size / 16000:.2f}s")

codec = DistillNeuCodec.from_pretrained("neuphonic/distill-neucodec")
codec.eval().to("cpu")
waveform = torch.from_numpy(audio).float().unsqueeze(0).unsqueeze(0)
with torch.inference_mode():
    encoded = codec.encode_code(waveform)
codes = encoded.squeeze().to(dtype=torch.int64).cpu().tolist()
if not codes or not all(isinstance(code, int) and 0 <= code < 65536 for code in codes):
    raise SystemExit("NeuCodec returned invalid reference codes")

destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({
    "voiceId": "demo_male_3",
    "sampleRate": 16000,
    "referenceText": reference_text,
    "codes": codes,
}, ensure_ascii=False), encoding="utf-8")
print(f"Encoded demo_male_3: {len(codes)} codes")
