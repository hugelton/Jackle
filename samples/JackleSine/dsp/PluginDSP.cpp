#include "PluginDSP.h"

#include <cmath>

namespace {
constexpr double kTwoPi = 6.28318530717958647692;
}

PluginDSP::PluginDSP()
: values_{ 440.0f, 0.25f } {}

void PluginDSP::prepare(double sampleRate, uint32_t) {
  sampleRate_ = sampleRate > 0.0 ? sampleRate : 44100.0;
  reset();
}

void PluginDSP::reset() {
  phase_ = 0.0;
}

void PluginDSP::setParameter(uint32_t id, float plainValue) {
  const int index = ParamIds::indexOf(id);
  if (index >= 0) {
    values_[static_cast<std::size_t>(index)] =
      static_cast<float>(ParamIds::clampPlain(index, plainValue));
  }
}

float PluginDSP::getParameter(uint32_t id) const {
  const int index = ParamIds::indexOf(id);
  return index >= 0 ? values_[static_cast<std::size_t>(index)] : 0.0f;
}

void PluginDSP::noteOn(int, float) {}

void PluginDSP::noteOff(int) {}

void PluginDSP::process(float** inputs, float** outputs, uint32_t numInputs,
                        uint32_t numOutputs, uint32_t numFrames) {
  for (uint32_t frame = 0; frame < numFrames; ++frame) {
    // Sample DSP only. Parameter transport remains metadata-driven.
    const double pitch = values_[0];
    const float amplitude = values_[1];
    const float generated = static_cast<float>(std::sin(phase_)) * amplitude;
    phase_ += kTwoPi * pitch / sampleRate_;
    if (phase_ >= kTwoPi) phase_ -= kTwoPi;

    for (uint32_t channel = 0; channel < numOutputs; ++channel) {
      const float input = channel < numInputs && inputs && inputs[channel]
        ? inputs[channel][frame]
        : 0.0f;
      outputs[channel][frame] = numInputs > 0 ? input * amplitude : generated;
    }
  }
}
