#!/usr/bin/env python3
"""Apply conservative Android RAM optimizations to upstream Habibi F5-TTS.

Build revision: sequential CFG + Q8_0, validated against the pinned v0.9.4 source layout.

1) Store 2-D Linear weights as Q8_0; biases, embeddings, convolutions and norms stay F32.
2) Evaluate classifier-free guidance in two sequential single-batch passes instead of one
   batched two-branch graph. This preserves the CFG equation while avoiding the larger
   two-branch graph pool on low-memory Android devices.
"""
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: patch_habibi_q8.py <audio.cpp>/src/community_models/f5_tts/weights.cpp <audio.cpp>/src/community_models/f5_tts/synthesize.cpp")

weights_path, synthesize_path = map(Path, sys.argv[1:])

source = weights_path.read_text()
old = 'lw.weight = tensor(n + ".weight", {out_f, in_f});'
new = (
    'lw.weight = w.store->load_tensor(source, n + ".weight", '
    'assets::TensorStorageType::Q8_0, {out_f, in_f});'
)
if source.count(old) != 1 or "assets::TensorStorageType::Q8_0" in source:
    raise SystemExit("Unexpected F5 Linear loader; refusing to patch an unknown source version.")
weights_path.write_text(source.replace(old, new, 1))
if new not in weights_path.read_text():
    raise SystemExit("Q8_0 patch verification failed")

source = synthesize_path.read_text()
old = """        const auto pair = f5_dit_forward_cfg(
            model_path, y, cond, chunk_ids, t, duration, arch, &dev);
        const auto & v_cond = pair.first;
        const auto & v_null = pair.second;"""
new = """        const auto v_cond = f5_dit_forward(
            model_path, y, cond, chunk_ids, t, duration, arch,
            false, false, nullptr, &dev);
        const auto v_null = f5_dit_forward(
            model_path, y, cond, chunk_ids, t, duration, arch,
            true, true, nullptr, &dev);"""
if source.count(old) != 1 or "f5_dit_forward_cfg(" not in source:
    raise SystemExit("Unexpected F5 CFG synthesis call; refusing to patch an unknown source version.")
synthesize_path.write_text(source.replace(old, new, 1))
patched = synthesize_path.read_text()
if new not in patched or old in patched:
    raise SystemExit("Sequential CFG patch verification failed")

print("Applied Q8_0 Linear weights and sequential single-batch CFG inference.")
