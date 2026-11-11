#!/usr/bin/env python3
"""Apply EZRA's conservative Q8_0 weight-storage optimization to upstream Habibi F5-TTS.

Only 2-D Linear weight matrices are stored as Q8_0. Biases, embeddings, convolution
kernels, normalization parameters, and all other tensors retain upstream F32 storage.
BackendWeightStore automatically keeps tensors as F32 when a row is not block-aligned.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch_habibi_q8.py <audio.cpp>/src/community_models/f5_tts/weights.cpp")

path = Path(sys.argv[1])
source = path.read_text()
old = 'lw.weight = tensor(n + ".weight", {out_f, in_f});'
new = (
    'lw.weight = w.store->load_tensor(source, n + ".weight", '
    'assets::TensorStorageType::Q8_0, {out_f, in_f});'
)
if source.count(old) != 1:
    raise SystemExit(
        f"Expected exactly one upstream Linear weight loader in {path}; "
        f"found {source.count(old)}. Refusing to patch an unknown source version."
    )
if "assets::TensorStorageType::Q8_0" in source:
    raise SystemExit(f"Q8_0 optimization is already present in {path}")
path.write_text(source.replace(old, new, 1))
patched = path.read_text()
if new not in patched:
    raise SystemExit("Q8_0 patch verification failed")
print("Applied Q8_0 to F5-TTS Linear weight matrices; non-matrix tensors remain F32.")
