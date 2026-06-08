#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

class JackleSineController final : public Steinberg::Vst::EditController {
public:
  static const Steinberg::FUID cid;
  static Steinberg::FUnknown* createInstance(void*);
  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) override;
  Steinberg::tresult PLUGIN_API setComponentState(Steinberg::IBStream* state) override;
  Steinberg::IPlugView* PLUGIN_API createView(Steinberg::FIDString name) override;
};
