#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

#include <string>

class VST3ParamBridge {
public:
  explicit VST3ParamBridge(Steinberg::Vst::EditController* controller);
  void setParameter(const char* key, double plainValue);
  std::string stateJson() const;

private:
  Steinberg::Vst::EditController* controller_ = nullptr;
};
