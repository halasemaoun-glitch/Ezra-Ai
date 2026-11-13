#!/usr/bin/env python3
"""Apply low-memory Android optimizations to the pinned audio.cpp v0.9.4 F5 runtime.

- Q8_0 for 2-D DiT linear matrices; non-linear tensors remain F32.
- Sequential classifier-free guidance; same CFG equation, one branch graph at a time.
- Smaller single-batch CPU graph arena, paired with a 128-frame synthesis budget.
"""
from pathlib import Path
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: patch_habibi_q8.py <weights.cpp> <synthesize.cpp> <runtime.cpp>")

weights_path, synthesize_path, runtime_path = map(Path, sys.argv[1:])

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
if source.count(old) != 1:
    raise SystemExit("Unexpected F5 CFG synthesis call; refusing to patch an unknown source version.")
synthesize_path.write_text(source.replace(old, new, 1))
if new not in synthesize_path.read_text():
    raise SystemExit("Sequential CFG patch verification failed")

source = runtime_path.read_text()
old = """        const size_t ctx_bytes = std::min<size_t>(
            std::max<size_t>(1536ULL << 20, static_cast<size_t>(N) * (6ULL << 20)),
            6144ULL << 20);"""
new = """        const size_t ctx_bytes = std::min<size_t>(
            std::max<size_t>(768ULL << 20, static_cast<size_t>(N) * (6ULL << 20)),
            3072ULL << 20);"""
if source.count(old) != 1:
    raise SystemExit("Unexpected single-batch DiT arena sizing; refusing to patch an unknown source version.")
runtime_path.write_text(source.replace(old, new, 1))
if new not in runtime_path.read_text():
    raise SystemExit("Reduced DiT arena patch verification failed")

print("Applied Q8_0 DiT weights, sequential CFG, and a 768 MiB minimum single-batch graph arena.")
