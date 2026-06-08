cmake_minimum_required(VERSION 3.20)
project(jackle_sine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(jackle_dsp STATIC dsp/PluginDSP.cpp)
target_include_directories(jackle_dsp PUBLIC dsp)

if(EMSCRIPTEN)
  add_subdirectory(web)
endif()

if(APPLE AND DEFINED VST3_SDK_DIR)
  enable_language(OBJCXX)
  set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_BUILD_UNIVERSAL_BINARY OFF CACHE BOOL "" FORCE)
  set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)
  add_subdirectory("${VST3_SDK_DIR}" "${CMAKE_BINARY_DIR}/vst3-sdk")
  smtg_add_vst3plugin(jackle_sine
    native/vst3/PluginProcessor.cpp
    native/vst3/PluginController.cpp
    native/vst3/PluginFactory.cpp
    native/vst3/PluginEditorView_mac.mm
    native/vst3/VST3ParamBridge.cpp
    "${VST3_SDK_DIR}/public.sdk/source/main/macmain.cpp"
  )
  target_include_directories(jackle_sine PRIVATE dsp native/vst3)
  target_link_libraries(jackle_sine PRIVATE jackle_dsp sdk "-framework WebKit")
  smtg_target_add_plugin_resources(jackle_sine
    RESOURCES
    gui/index.html
    gui/style.css
    gui/app.js
    gui/jackle-bridge.js
  )
  set_target_properties(jackle_sine PROPERTIES
    MACOSX_BUNDLE_GUI_IDENTIFIER "com.hugelton.jackle-sine"
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "com.hugelton.jackle-sine"
  )
endif()
