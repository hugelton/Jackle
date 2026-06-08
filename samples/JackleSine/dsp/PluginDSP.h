#pragma once

#include "ParamIds.h"

#include <array>
#include <cstdint>

class PluginDSP {
public:
  PluginDSP();
  void prepare(double sampleRate, uint32_t maxBlockSize);
  void reset();
  void setParameter(uint32_t id, float plainValue);
  float getParameter(uint32_t id) const;
  void noteOn(int note, float velocity);
  void noteOff(int note);
  void process(float** inputs, float** outputs, uint32_t numInputs,
               uint32_t numOutputs, uint32_t numFrames);

private:
  double sampleRate_ = 44100.0;
  double phase_ = 0.0;
  std::array<float, 2> values_{};
};
