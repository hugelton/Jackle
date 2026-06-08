#include "PluginController.h"
#include "PluginEditorView_mac.h"
#include "../../dsp/ParamIds.h"

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstplugview.h"

#include <cstdlib>
#include <cstring>
#include <string>

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
std::string readState(IBStream* stream) {
  std::string result;
  char buffer[512];
  int32 read = 0;
  while (stream && stream->read(buffer, sizeof(buffer), &read) == kResultOk && read > 0) {
    result.append(buffer, static_cast<std::size_t>(read));
  }
  return result;
}

bool findNumber(const std::string& json, const char* key, double& value) {
  const std::string token = std::string("\"") + key + "\"";
  const auto keyAt = json.find(token);
  if (keyAt == std::string::npos) return false;
  const auto colon = json.find(':', keyAt + token.size());
  if (colon == std::string::npos) return false;
  const char* start = json.c_str() + colon + 1;
  while (*start == ' ' || *start == '\t' || *start == '\n') ++start;
  if (std::strncmp(start, "true", 4) == 0) { value = 1.0; return true; }
  if (std::strncmp(start, "false", 5) == 0) { value = 0.0; return true; }
  char* end = nullptr;
  value = std::strtod(start, &end);
  return end != start;
}
}

const FUID JackleSineController::cid(0x4472BADC, 0x338E9B9A, 0x5D7A75D5, 0x8C630828);

FUnknown* JackleSineController::createInstance(void*) {
  return static_cast<IEditController*>(new JackleSineController());
}

tresult PLUGIN_API JackleSineController::initialize(FUnknown* context) {
  const tresult result = EditController::initialize(context);
  if (result != kResultOk) return result;
  parameters.addParameter(STR16("Frequency"), STR16("Hz"), 0, 0.21212121212121213, ParameterInfo::kCanAutomate, ParamIds::frequency);
  parameters.addParameter(STR16("Level"), nullptr, 0, 0.25, ParameterInfo::kCanAutomate, ParamIds::level);
  return kResultOk;
}

tresult PLUGIN_API JackleSineController::setComponentState(IBStream* state) {
  const std::string json = readState(state);
  if (json.find("\"version\":1") == std::string::npos) return kResultFalse;
  for (std::size_t index = 0; index < ParamIds::all.size(); ++index) {
    double plain = ParamIds::all[index].defaultValue;
    if (findNumber(json, ParamIds::all[index].key, plain)) {
      setParamNormalized(ParamIds::all[index].id,
                         ParamIds::plainToNormalized(index, plain));
    }
  }
  return kResultOk;
}

IPlugView* PLUGIN_API JackleSineController::createView(FIDString name) {
  return name && std::strcmp(name, ViewType::kEditor) == 0
    ? new PluginEditorView(this)
    : nullptr;
}
