#include <jni.h>
#include <android/log.h>
#include "audiocpp.h"
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iterator>
#include <mutex>
#include <string>
#include <vector>
#include <cmath>

#define LOG_TAG "EzraHabibiJNI"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
std::mutex g_mutex;
audiocpp_registry* g_registry = nullptr;
audiocpp_model* g_model = nullptr;
audiocpp_session* g_session = nullptr;
std::vector<float> g_reference;
int g_reference_rate = 0;
std::string g_reference_text;
std::string g_dialect = "UNK";

std::string jstringToString(JNIEnv* env, jstring value) {
  if (!value) return {};
  const char* chars = env->GetStringUTFChars(value, nullptr);
  if (!chars) return {};
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

std::string lastError(const char* operation, audiocpp_status status) {
  const char* detail = audiocpp_last_error();
  return std::string(operation) + " failed (" + audiocpp_status_string(status) + "): " +
      (detail ? detail : "unknown native error");
}

uint16_t readU16(const std::vector<uint8_t>& b, size_t p) {
  return static_cast<uint16_t>(b[p] | (static_cast<uint16_t>(b[p + 1]) << 8));
}
uint32_t readU32(const std::vector<uint8_t>& b, size_t p) {
  return static_cast<uint32_t>(b[p]) |
      (static_cast<uint32_t>(b[p + 1]) << 8) |
      (static_cast<uint32_t>(b[p + 2]) << 16) |
      (static_cast<uint32_t>(b[p + 3]) << 24);
}
void writeU16(std::ofstream& out, uint16_t v) {
  char b[2] = {static_cast<char>(v & 255), static_cast<char>((v >> 8) & 255)};
  out.write(b, 2);
}
void writeU32(std::ofstream& out, uint32_t v) {
  char b[4] = {static_cast<char>(v & 255), static_cast<char>((v >> 8) & 255),
      static_cast<char>((v >> 16) & 255), static_cast<char>((v >> 24) & 255)};
  out.write(b, 4);
}

bool loadWavMono(const std::string& path, std::vector<float>& samples, int& sampleRate) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(in)), {});
  if (bytes.size() < 44 || std::memcmp(bytes.data(), "RIFF", 4) != 0 ||
      std::memcmp(bytes.data() + 8, "WAVE", 4) != 0) return false;

  uint16_t format = 0, channels = 0, bits = 0;
  uint32_t rate = 0;
  size_t dataOffset = 0, dataBytes = 0;
  for (size_t p = 12; p + 8 <= bytes.size();) {
    uint32_t chunkSize = readU32(bytes, p + 4);
    size_t chunkStart = p + 8;
    if (chunkStart + chunkSize > bytes.size()) return false;
    if (std::memcmp(bytes.data() + p, "fmt ", 4) == 0 && chunkSize >= 16) {
      format = readU16(bytes, chunkStart);
      channels = readU16(bytes, chunkStart + 2);
      rate = readU32(bytes, chunkStart + 4);
      bits = readU16(bytes, chunkStart + 14);
    } else if (std::memcmp(bytes.data() + p, "data", 4) == 0) {
      dataOffset = chunkStart;
      dataBytes = chunkSize;
    }
    p = chunkStart + chunkSize + (chunkSize & 1);
  }
  if (!dataOffset || !channels || !rate || !dataBytes || channels > 2) return false;
  if (!((format == 1 && (bits == 16 || bits == 8)) || (format == 3 && bits == 32))) return false;
  const size_t bytesPerSample = bits / 8;
  const size_t frameBytes = bytesPerSample * channels;
  if (!frameBytes || dataBytes < frameBytes) return false;
  const size_t frames = dataBytes / frameBytes;
  samples.resize(frames);
  for (size_t i = 0; i < frames; ++i) {
    float sum = 0.0f;
    for (size_t ch = 0; ch < channels; ++ch) {
      const size_t p = dataOffset + (i * channels + ch) * bytesPerSample;
      float v = 0.0f;
      if (format == 1 && bits == 16) {
        int16_t s = static_cast<int16_t>(readU16(bytes, p));
        v = static_cast<float>(s) / 32768.0f;
      } else if (format == 1 && bits == 8) {
        v = (static_cast<float>(bytes[p]) - 128.0f) / 128.0f;
      } else {
        std::memcpy(&v, bytes.data() + p, sizeof(float));
        if (!std::isfinite(v)) v = 0.0f;
      }
      sum += v;
    }
    samples[i] = std::max(-1.0f, std::min(1.0f, sum / channels));
  }
  sampleRate = static_cast<int>(rate);
  return true;
}

bool writeWav16(const std::string& path, const float* samples, size_t frames,
                int sampleRate, int channels) {
  if (!samples || frames == 0 || sampleRate <= 0 || channels <= 0 || channels > 2) return false;
  const uint64_t dataSize64 = static_cast<uint64_t>(frames) * channels * 2;
  if (dataSize64 > 0xffffffffu - 36u) return false;
  const uint32_t dataSize = static_cast<uint32_t>(dataSize64);
  std::ofstream out(path, std::ios::binary);
  if (!out) return false;
  out.write("RIFF", 4); writeU32(out, 36 + dataSize); out.write("WAVE", 4);
  out.write("fmt ", 4); writeU32(out, 16); writeU16(out, 1);
  writeU16(out, static_cast<uint16_t>(channels)); writeU32(out, static_cast<uint32_t>(sampleRate));
  writeU32(out, static_cast<uint32_t>(sampleRate * channels * 2));
  writeU16(out, static_cast<uint16_t>(channels * 2)); writeU16(out, 16);
  out.write("data", 4); writeU32(out, dataSize);
  for (size_t i = 0; i < frames * channels; ++i) {
    float v = std::max(-1.0f, std::min(1.0f, samples[i]));
    int16_t s = static_cast<int16_t>(std::lrint(v * 32767.0f));
    writeU16(out, static_cast<uint16_t>(s));
  }
  return out.good();
}

void releaseEngine() {
  audiocpp_session_free(g_session); g_session = nullptr;
  audiocpp_model_free(g_model); g_model = nullptr;
  audiocpp_registry_free(g_registry); g_registry = nullptr;
  g_reference.clear();
}
} // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_ezrahabibitts_EzraHabibiTtsModule_nativeInitialize(
    JNIEnv* env, jobject, jstring modelPathValue, jstring referencePathValue,
    jstring transcriptValue, jstring dialectValue, jint threads) {
  std::lock_guard<std::mutex> lock(g_mutex);
  releaseEngine();
  const std::string modelPath = jstringToString(env, modelPathValue);
  const std::string referencePath = jstringToString(env, referencePathValue);
  g_reference_text = jstringToString(env, transcriptValue);
  const std::string requestedDialect = jstringToString(env, dialectValue);
  g_dialect = requestedDialect.empty() ? "UNK" : requestedDialect;
  if (modelPath.empty() || referencePath.empty() || g_reference_text.empty()) {
    return env->NewStringUTF("Model path, reference WAV, and exact reference transcript are required.");
  }
  if (!loadWavMono(referencePath, g_reference, g_reference_rate)) {
    return env->NewStringUTF("Reference audio must be a readable PCM WAV (8/16-bit) or float32 WAV, mono/stereo.");
  }
  const double referenceSeconds =
      static_cast<double>(g_reference.size()) / static_cast<double>(g_reference_rate);
  if (referenceSeconds < 0.5) {
    g_reference.clear();
    const std::string error = "Reference WAV is only " +
        std::to_string(referenceSeconds) +
        " seconds. It must contain at least 0.5 seconds of audio.";
    return env->NewStringUTF(error.c_str());
  }
  // The mobile F5 frame budget is capped at 1.3 seconds. Users often select
  // a short clip with a little leading/trailing silence; safely cap long WAVs
  // rather than rejecting an otherwise valid reference recording.
  const size_t maxReferenceFrames =
      static_cast<size_t>(g_reference_rate * 1.2);
  if (g_reference.size() > maxReferenceFrames) {
    g_reference.resize(maxReferenceFrames);
  }

  audiocpp_status status = audiocpp_registry_create(nullptr, &g_registry);
  if (status != AUDIOCPP_OK) {
    std::string error = lastError("registry creation", status); releaseEngine();
    return env->NewStringUTF(error.c_str());
  }
  audiocpp_model_config config = {"f5_tts", nullptr, nullptr, nullptr};
  status = audiocpp_model_load(g_registry, modelPath.c_str(), &config, nullptr, &g_model);
  if (status != AUDIOCPP_OK) {
    std::string error = lastError("Habibi model load", status); releaseEngine();
    return env->NewStringUTF(error.c_str());
  }
  if (!audiocpp_model_supports(g_model, "tts", "offline") ||
      !audiocpp_model_supports_speaker_reference(g_model)) {
    releaseEngine();
    return env->NewStringUTF("The selected model does not expose offline reference-conditioned TTS.");
  }
  audiocpp_backend_config backend = {"cpu", 0, std::max(1, std::min(2, static_cast<int>(threads)))};
  audiocpp_options* sessionOptions = audiocpp_options_create();
  if (!sessionOptions) {
    releaseEngine();
    return env->NewStringUTF("Could not allocate Habibi session options.");
  }
  // F5-TTS accepts mel frame budgets only in [256, 8192]. 128 makes session_create fail.
  // Keep the minimum supported budget to reduce peak memory on mid-range Android devices.
  status = audiocpp_options_set(sessionOptions, "f5_tts.frame_budget", "256");
  if (status == AUDIOCPP_OK) {
    status = audiocpp_session_create(g_model, "tts", "offline", &backend, sessionOptions, &g_session);
  }
  audiocpp_options_free(sessionOptions);
  if (status != AUDIOCPP_OK) {
    std::string error = lastError("Habibi session creation", status); releaseEngine();
    return env->NewStringUTF(error.c_str());
  }
  return env->NewStringUTF("");
}

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_ezrahabibitts_EzraHabibiTtsModule_nativeSynthesize(
    JNIEnv* env, jobject, jstring textValue, jstring outputPathValue) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (!g_session || g_reference.empty()) return env->NewStringUTF("Habibi engine is not initialized.");
  const std::string text = jstringToString(env, textValue);
  const std::string outputPath = jstringToString(env, outputPathValue);
  if (text.empty() || outputPath.empty()) return env->NewStringUTF("Text and output path are required.");

  audiocpp_request* request = audiocpp_request_create();
  if (!request) return env->NewStringUTF("Could not allocate a Habibi request.");
  audiocpp_status status = audiocpp_request_set_text(request, text.c_str(), nullptr);
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_text_language(request, "ar");
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_voice_audio(
      request, g_reference.data(), g_reference.size(), g_reference_rate, 1);
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(
      request, "reference_text", g_reference_text.c_str());
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(
      request, "dialect", g_dialect.c_str());
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(
      request, "speed", "1.0");
  if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(
      request, "strip_diacritics", "true");
  if (status != AUDIOCPP_OK) {
    std::string error = lastError("Habibi request setup", status);
    audiocpp_request_free(request);
    return env->NewStringUTF(error.c_str());
  }

  audiocpp_result* result = nullptr;
  status = audiocpp_session_run(g_session, request, &result);
  audiocpp_request_free(request);
  if (status != AUDIOCPP_OK) {
    std::string error = lastError("Habibi synthesis", status);
    audiocpp_result_free(result);
    return env->NewStringUTF(error.c_str());
  }

  const float* samples = nullptr;
  size_t frames = 0;
  int sampleRate = 0, channels = 0;
  status = audiocpp_result_audio(result, &samples, &frames, &sampleRate, &channels);
  bool written = status == AUDIOCPP_OK &&
      writeWav16(outputPath, samples, frames, sampleRate, channels);
  std::string error;
  if (!written) error = status == AUDIOCPP_OK
      ? "Could not write generated WAV audio." : lastError("Reading generated audio", status);
  audiocpp_result_free(result);
  return env->NewStringUTF(error.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_ezrahabibitts_EzraHabibiTtsModule_nativeShutdown(JNIEnv*, jobject) {
  std::lock_guard<std::mutex> lock(g_mutex);
  releaseEngine();
}
