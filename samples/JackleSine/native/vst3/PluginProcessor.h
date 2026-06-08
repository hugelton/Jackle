#pragma once

#include "public.sdk/source/vst/vstaudioeffect.h"
#include "../../dsp/PluginDSP.h"

#include <array>

class JackleSineProcessor final : public Steinberg::Vst::AudioEffect {
public:
  JackleSineProcessor();
  static Steinberg::FUnknown* createInstance(void*);
  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) override;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) override;
  Steinberg::tresult PLUGIN_API setupProcessing(
    Steinberg::Vst::ProcessSetup& setup) override;
  Steinberg::tresult PLUGIN_API process(
    Steinberg::Vst::ProcessData& data) override;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) override;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) override;

private:
  void applyParameter(std::size_t index, double plainValue);
  PluginDSP dsp_;
  std::array<double, ParamIds::count> values_{};
};
