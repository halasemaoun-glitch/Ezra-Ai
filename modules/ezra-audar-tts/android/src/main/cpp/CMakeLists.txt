cmake_minimum_required(VERSION 3.22.1)
project(ezra_audar_jni LANGUAGES C CXX)

include(FetchContent)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI ON CACHE BOOL "" FORCE)

FetchContent_Declare(
  llama_cpp
  GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
  GIT_TAG de32b268c4ad55d45f3b7b16c029f4e077f4ba74
)
FetchContent_MakeAvailable(llama_cpp)

add_library(ezra_audar_jni SHARED audar_jni.cpp)
target_compile_features(ezra_audar_jni PRIVATE cxx_std_17)
target_compile_options(ezra_audar_jni PRIVATE -fexceptions -frtti -Wall -Wextra)
find_library(log-lib log)
target_link_libraries(ezra_audar_jni PRIVATE llama ${log-lib})
