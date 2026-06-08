add_executable(jackle-dsp wasm-bindings.cpp)
target_link_libraries(jackle-dsp PRIVATE jackle_dsp)
set_target_properties(jackle-dsp PROPERTIES OUTPUT_NAME "jackle-dsp" SUFFIX ".js")
target_link_options(jackle-dsp PRIVATE
  "-O3"
  "-sWASM=1"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=web,worker"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_jackle_prepare','_jackle_reset','_jackle_set_parameter','_jackle_get_parameter','_jackle_note_on','_jackle_note_off','_jackle_process']"
)
