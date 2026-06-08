#include "../dsp/PluginDSP.h"

#include <algorithm>
#include <array>
#include <cstdint>

namespace {
PluginDSP dsp;
constexpr uint32_t kMaxChannels = 2;
constexpr uint32_t kMaxFrames = 2048;
std::array<std::array<float, kMaxFrames>, kMaxChannels> storage{};
std::array<float*, kMaxChannels> channels{};
}

extern "C" {

void jackle_prepare(double sampleRate, uint32_t maxBlockSize) {
  dsp.prepare(sampleRate, maxBlockSize);
}

void jackle_reset() {
  dsp.reset();
}

void jackle_set_parameter(uint32_t id, float plainValue) {
  dsp.setParameter(id, plainValue);
}

float jackle_get_parameter(uint32_t id) {
  return dsp.getParameter(id);
}

void jackle_note_on(int note, float velocity) {
  dsp.noteOn(note, velocity);
}

void jackle_note_off(int note) {
  dsp.noteOff(note);
}

void jackle_process(float* interleavedOutput, uint32_t numFrames,
                    uint32_t numChannels) {
  const uint32_t frames = std::min(numFrames, kMaxFrames);
  const uint32_t outputChannels = std::min(numChannels, kMaxChannels);
  for (uint32_t channel = 0; channel < outputChannels; ++channel) {
    channels[channel] = storage[channel].data();
  }
  dsp.process(nullptr, channels.data(), 0, outputChannels, frames);
  for (uint32_t frame = 0; frame < frames; ++frame) {
    for (uint32_t channel = 0; channel < numChannels; ++channel) {
      interleavedOutput[frame * numChannels + channel] =
        channel < outputChannels ? storage[channel][frame] : 0.0f;
    }
  }
  for (uint32_t frame = frames; frame < numFrames; ++frame) {
    for (uint32_t channel = 0; channel < numChannels; ++channel) {
      interleavedOutput[frame * numChannels + channel] = 0.0f;
    }
  }
}

}
