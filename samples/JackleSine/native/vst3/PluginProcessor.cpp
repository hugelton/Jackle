#include "PluginProcessor.h"
#include "PluginController.h"

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"

#include <algorithm>
#include <cstdlib>
#include <cstdio>
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

JackleSineProcessor::JackleSineProcessor()
: values_{ 440.0, 0.25 } {
  setControllerClass(JackleSineController::cid);
  for (std::size_t index = 0; index < values_.size(); ++index) {
    applyParameter(index, values_[index]);
  }
}

FUnknown* JackleSineProcessor::createInstance(void*) {
  return static_cast<IAudioProcessor*>(new JackleSineProcessor());
}

tresult PLUGIN_API JackleSineProcessor::initialize(FUnknown* context) {
  const tresult result = AudioEffect::initialize(context);
  if (result != kResultOk) return result;
  addAudioOutput(STR16("Audio Out"), SpeakerArr::kStereo);
  return kResultOk;
}

tresult PLUGIN_API JackleSineProcessor::setupProcessing(ProcessSetup& setup) {
  dsp_.prepare(setup.sampleRate, static_cast<uint32_t>(setup.maxSamplesPerBlock));
  return AudioEffect::setupProcessing(setup);
}

tresult PLUGIN_API JackleSineProcessor::setActive(TBool state) {
  if (state) dsp_.reset();
  return AudioEffect::setActive(state);
}

void JackleSineProcessor::applyParameter(std::size_t index, double plainValue) {
  values_[index] = ParamIds::clampPlain(index, plainValue);
  dsp_.setParameter(ParamIds::all[index].id, static_cast<float>(values_[index]));
}

tresult PLUGIN_API JackleSineProcessor::process(ProcessData& data) {
  if (data.inputParameterChanges) {
    const int32 count = data.inputParameterChanges->getParameterCount();
    for (int32 queueIndex = 0; queueIndex < count; ++queueIndex) {
      IParamValueQueue* queue = data.inputParameterChanges->getParameterData(queueIndex);
      if (!queue || queue->getPointCount() == 0) continue;
      int32 sampleOffset = 0;
      ParamValue normalized = 0.0;
      queue->getPoint(queue->getPointCount() - 1, sampleOffset, normalized);
      const int index = ParamIds::indexOf(queue->getParameterId());
      if (index >= 0) applyParameter(index, ParamIds::normalizedToPlain(index, normalized));
    }
  }
  if (data.numOutputs == 0 || !data.outputs) return kResultOk;
  auto& output = data.outputs[0];
  float** inputs = data.numInputs > 0 && data.inputs ? data.inputs[0].channelBuffers32 : nullptr;
  const uint32 inputChannels = data.numInputs > 0 && data.inputs
    ? static_cast<uint32>(data.inputs[0].numChannels) : 0;
  const uint32 outputChannels = static_cast<uint32>(output.numChannels);
  const uint32 totalFrames = static_cast<uint32>(data.numSamples);
  uint32 processed = 0;
  const int32 eventCount = data.inputEvents ? data.inputEvents->getEventCount() : 0;

  auto processFrames = [&](uint32 frames) {
    if (frames == 0) return;
    std::array<float*, 32> inputPointers{};
    std::array<float*, 32> outputPointers{};
    for (uint32 channel = 0; channel < inputChannels && channel < inputPointers.size(); ++channel) {
      inputPointers[channel] = inputs[channel] + processed;
    }
    for (uint32 channel = 0; channel < outputChannels && channel < outputPointers.size(); ++channel) {
      outputPointers[channel] = output.channelBuffers32[channel] + processed;
    }
    dsp_.process(inputPointers.data(), outputPointers.data(), inputChannels,
                 outputChannels, frames);
    processed += frames;
  };

  for (int32 eventIndex = 0; eventIndex < eventCount; ++eventIndex) {
    Event event{};
    if (data.inputEvents->getEvent(eventIndex, event) != kResultOk) continue;
    const uint32 eventOffset = static_cast<uint32>(
      std::clamp(event.sampleOffset, 0, data.numSamples));
    if (eventOffset > processed) processFrames(eventOffset - processed);
    if (event.type == Event::kNoteOnEvent) {
      dsp_.noteOn(event.noteOn.pitch, event.noteOn.velocity);
    } else if (event.type == Event::kNoteOffEvent) {
      dsp_.noteOff(event.noteOff.pitch);
    }
  }
  if (processed < totalFrames) processFrames(totalFrames - processed);
  return kResultOk;
}

tresult PLUGIN_API JackleSineProcessor::getState(IBStream* state) {
  if (!state) return kInvalidArgument;
  std::string json = "{\"version\":1,\"parameters\":{";
  for (std::size_t index = 0; index < values_.size(); ++index) {
    if (index) json += ",";
    json += "\"" + std::string(ParamIds::all[index].key) + "\":";
    if (ParamIds::all[index].type == ParamIds::Type::Bool) {
      json += values_[index] >= 0.5 ? "true" : "false";
    } else {
      char number[64];
      std::snprintf(number, sizeof(number), "%.17g", values_[index]);
      json += number;
    }
  }
  json += "}}";
  int32 written = 0;
  return state->write(json.data(), static_cast<int32>(json.size()), &written);
}

tresult PLUGIN_API JackleSineProcessor::setState(IBStream* state) {
  const std::string json = readState(state);
  if (json.find("\"version\":1") == std::string::npos) return kResultFalse;
  for (std::size_t index = 0; index < values_.size(); ++index) {
    double value = values_[index];
    if (findNumber(json, ParamIds::all[index].key, value)) applyParameter(index, value);
  }
  return kResultOk;
}
