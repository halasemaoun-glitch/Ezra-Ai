#include <jni.h>
#include <android/log.h>
#include <llama.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <regex>
#include <string>
#include <vector>

#define LOG_TAG "EzraAudarTTS"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
std::mutex g_mutex;
llama_model *g_model = nullptr;
llama_context *g_context = nullptr;
const llama_vocab *g_vocab = nullptr;

std::string jstringToUtf8(JNIEnv *env, jstring value) {
  if (!value) return {};
  const char *chars = env->GetStringUTFChars(value, nullptr);
  if (!chars) return {};
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

std::vector<llama_token> tokenize(const std::string &text, bool addSpecial, bool parseSpecial) {
  const int32_t needed = llama_tokenize(g_vocab, text.c_str(), static_cast<int32_t>(text.size()), nullptr, 0, addSpecial, parseSpecial);
  if (needed >= 0) return {};
  std::vector<llama_token> tokens(static_cast<size_t>(-needed));
  const int32_t count = llama_tokenize(g_vocab, text.c_str(), static_cast<int32_t>(text.size()), tokens.data(), static_cast<int32_t>(tokens.size()), addSpecial, parseSpecial);
  if (count < 0) return {};
  tokens.resize(static_cast<size_t>(count));
  return tokens;
}

std::string tokenPiece(llama_token token) {
  char buffer[256];
  const int32_t count = llama_token_to_piece(g_vocab, token, buffer, sizeof(buffer), 0, true);
  if (count <= 0) return {};
  return std::string(buffer, static_cast<size_t>(count));
}

void clearModel() {
  if (g_context) {
    llama_free(g_context);
    g_context = nullptr;
  }
  if (g_model) {
    llama_model_free(g_model);
    g_model = nullptr;
  }
  g_vocab = nullptr;
}
}

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_ezraaudartts_EzraAudarTtsModule_nativeInitialize(
    JNIEnv *env, jobject, jstring modelPath, jint threads) {
  std::lock_guard<std::mutex> lock(g_mutex);
  clearModel();
  const std::string path = jstringToUtf8(env, modelPath);
  if (path.empty()) return env->NewStringUTF("Audar model path is empty.");
  llama_backend_init();
  llama_model_params modelParams = llama_model_default_params();
  modelParams.load_mode = LLAMA_LOAD_MODE_MMAP;
  g_model = llama_model_load_from_file(path.c_str(), modelParams);
  if (!g_model) return env->NewStringUTF("llama.cpp could not load the Audar GGUF model.");
  g_vocab = llama_model_get_vocab(g_model);
  llama_context_params contextParams = llama_context_default_params();
  contextParams.n_ctx = 4096;
  contextParams.n_batch = 1024;
  contextParams.n_ubatch = 512;
  contextParams.n_threads = std::max(1, static_cast<int>(threads));
  contextParams.n_threads_batch = std::max(1, static_cast<int>(threads));
  g_context = llama_init_from_model(g_model, contextParams);
  if (!g_context) {
    clearModel();
    return env->NewStringUTF("llama.cpp could not allocate the Audar inference context.");
  }
  return env->NewStringUTF("");
}

extern "C" JNIEXPORT jintArray JNICALL
Java_expo_modules_ezraaudartts_EzraAudarTtsModule_nativeGenerate(
    JNIEnv *env, jobject, jstring targetText, jstring referenceText, jintArray referenceCodes) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (!g_model || !g_context || !g_vocab) return env->NewIntArray(0);

  const std::string target = jstringToUtf8(env, targetText);
  const std::string reference = jstringToUtf8(env, referenceText);
  if (target.empty() || reference.empty() || !referenceCodes) return env->NewIntArray(0);

  const jsize refCount = env->GetArrayLength(referenceCodes);
  std::vector<jint> refs(static_cast<size_t>(refCount));
  env->GetIntArrayRegion(referenceCodes, 0, refCount, refs.data());

  std::string prompt = "user: Convert the text to speech:\n";
  prompt += "<|REF_TEXT_START|>" + reference + "<|REF_TEXT_END|>\n";
  prompt += "<|REF_SPEECH_START|>";
  for (jint code : refs) prompt += "<|speech_" + std::to_string(code) + "|>";
  prompt += "<|REF_SPEECH_END|>\n";
  prompt += "<|TARGET_TEXT_START|>" + target + "<|TARGET_TEXT_END|>\n";
  prompt += "assistant:<|TARGET_CODES_START|>";

  auto promptTokens = tokenize(prompt, true, true);
  if (promptTokens.empty() || promptTokens.size() >= 4096) return env->NewIntArray(0);
  llama_memory_clear(llama_get_memory(g_context), true);
  llama_batch batch = llama_batch_get_one(promptTokens.data(), static_cast<int32_t>(promptTokens.size()));
  if (llama_decode(g_context, batch) != 0) return env->NewIntArray(0);

  auto endTokens = tokenize("<|TARGET_CODES_END|>", false, true);
  if (endTokens.size() != 1) return env->NewIntArray(0);
  const llama_token endToken = endTokens[0];

  llama_sampler_chain_params samplerParams = llama_sampler_chain_default_params();
  llama_sampler *sampler = llama_sampler_chain_init(samplerParams);
  llama_sampler_chain_add(sampler, llama_sampler_init_top_k(40));
  llama_sampler_chain_add(sampler, llama_sampler_init_top_p(0.9f, 1));
  llama_sampler_chain_add(sampler, llama_sampler_init_temp(1.0f));
  llama_sampler_chain_add(sampler, llama_sampler_init_dist(0x455A5241));

  std::vector<jint> codes;
  codes.reserve(512);
  for (int step = 0; step < 2048; ++step) {
    const llama_token token = llama_sampler_sample(sampler, g_context, -1);
    llama_sampler_accept(sampler, token);
    if (token == endToken || llama_vocab_is_eog(g_vocab, token)) break;
    const std::string piece = tokenPiece(token);
    static const std::regex codePattern(R"(<\|speech_([0-9]+)\|>)");
    std::smatch match;
    if (std::regex_search(piece, match, codePattern)) {
      try {
        codes.push_back(static_cast<jint>(std::stoi(match[1].str())));
      } catch (...) {}
    }
    llama_token next = token;
    batch = llama_batch_get_one(&next, 1);
    if (llama_decode(g_context, batch) != 0) break;
  }
  llama_sampler_free(sampler);

  jintArray output = env->NewIntArray(static_cast<jsize>(codes.size()));
  if (output && !codes.empty()) env->SetIntArrayRegion(output, 0, static_cast<jsize>(codes.size()), codes.data());
  return output;
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_ezraaudartts_EzraAudarTtsModule_nativeShutdown(JNIEnv *, jobject) {
  std::lock_guard<std::mutex> lock(g_mutex);
  clearModel();
}
