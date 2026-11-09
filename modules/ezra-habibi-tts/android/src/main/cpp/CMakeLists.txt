cmake_minimum_required(VERSION 3.22.1)
project(ezra_habibi_jni LANGUAGES C CXX)

add_library(audiocpp SHARED IMPORTED)
set_target_properties(audiocpp PROPERTIES
  IMPORTED_LOCATION "\${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/arm64-v8a/libaudiocpp.so"
  INTERFACE_INCLUDE_DIRECTORIES "\${CMAKE_CURRENT_SOURCE_DIR}/include"
)

add_library(ezra_habibi_jni SHARED ezra_habibi_jni.cpp)
target_compile_features(ezra_habibi_jni PRIVATE cxx_std_17)
target_compile_options(ezra_habibi_jni PRIVATE -fexceptions -frtti -Wall -Wextra)
find_library(log-lib log)
target_link_libraries(ezra_habibi_jni PRIVATE audiocpp \${log-lib})
