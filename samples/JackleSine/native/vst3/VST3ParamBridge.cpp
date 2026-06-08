#include "VST3ParamBridge.h"
#include "../../dsp/ParamIds.h"

#include <cstdio>

using namespace Steinberg;
using namespace Steinberg::Vst;

VST3ParamBridge::VST3ParamBridge(EditController* controller)
: controller_(controller) {}

void VST3ParamBridge::setParameter(const char* key, double plainValue) {
  if (!controller_) return;
  const int index = ParamIds::indexOf(key);
  if (index < 0) return;
  const ParamID id = ParamIds::all[index].id;
  const ParamValue normalized = ParamIds::plainToNormalized(index, plainValue);
  controller_->beginEdit(id);
  controller_->performEdit(id, normalized);
  controller_->setParamNormalized(id, normalized);
  controller_->endEdit(id);
}

std::string VST3ParamBridge::stateJson() const {
  std::string json = "{\"version\":1,\"parameters\":{";
  for (std::size_t index = 0; index < ParamIds::all.size(); ++index) {
    if (index) json += ",";
    const double normalized = controller_
      ? controller_->getParamNormalized(ParamIds::all[index].id)
      : ParamIds::plainToNormalized(index, ParamIds::all[index].defaultValue);
    const double plain = ParamIds::normalizedToPlain(index, normalized);
    json += "\"" + std::string(ParamIds::all[index].key) + "\":";
    if (ParamIds::all[index].type == ParamIds::Type::Bool) {
      json += plain >= 0.5 ? "true" : "false";
    } else {
      char number[64];
      std::snprintf(number, sizeof(number), "%.17g", plain);
      json += number;
    }
  }
  json += "}}";
  return json;
}
